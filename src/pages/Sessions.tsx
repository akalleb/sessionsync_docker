import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Search, 
  Plus, 
  FileText, 
  Clock, 
  CheckCircle2, 
  Loader2, 
  AlertCircle,
  Calendar,
  Filter,
  LayoutGrid,
  List,
  Building2,
  Trash2
} from 'lucide-react';
import { cn, apiCall } from '@/lib/utils';
import { Session } from '@/types/transcription';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const statusConfig: Record<string, { label: string; icon: typeof Clock; color: string; animate?: boolean }> = {
  pending: { label: 'Pendente', icon: Clock, color: 'text-muted-foreground bg-muted' },
  transcribing: { label: 'Transcrevendo', icon: Loader2, color: 'text-info bg-info/10', animate: true },
  organizing: { label: 'Organizando', icon: Loader2, color: 'text-warning bg-warning/10', animate: true },
  reviewing: { label: 'Em Revisão', icon: AlertCircle, color: 'text-warning bg-warning/10' },
  completed: { label: 'Concluída', icon: CheckCircle2, color: 'text-success bg-success/10' },
};

import { Tables } from '@/integrations/supabase/types';

type SessionRow = Tables<'sessions'> & {
  camara?: { nome: string } | null;
};

export default function Sessions() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { hasRole, profile } = useAuth();
  const isSuperAdmin = hasRole('super_admin');
  const isVereador = (profile?.cargo || '').trim().toLowerCase() === 'vereador';
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);

  const confirmDelete = async () => {
    if (!sessionToDelete) return;
    
    try {
      // Use backend endpoint for full cleanup (storage, embeddings, db)
      await apiCall('/admin/delete-session', { sessionId: sessionToDelete });
      
      toast.success('Sessão excluída com sucesso');
      fetchSessions(); 
    } catch (error) {
      console.error('Erro ao excluir sessão:', error);
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      toast.error(`Erro ao excluir sessão: ${msg}`);
    } finally {
      setSessionToDelete(null);
    }
  };

  const fetchSessions = useCallback(async () => {
    try {
      setIsLoading(true);
      
      const query = supabase
        .from('sessions')
        .select('id, title, date, status, duration, audio_url, youtube_url, created_at, updated_at, camara_id, camara:camaras(nome)')
        .order('created_at', { ascending: false });

      // Filtro de Frontend/Query adicional (embora o RLS já garanta segurança)
      // Se não for super admin, filtra pela câmara do usuário atual para evitar listar dados desnecessários
      if (!isSuperAdmin) {
         // O RLS já faz isso, mas podemos ser explícitos se quisermos otimizar indexes
         // query = query.eq('camara_id', profile.camara_id)
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      // Tipagem manual devido à falta de relacionamento no types.ts
      const sessionsData = data as unknown as SessionRow[];

      const mappedSessions: Session[] = (sessionsData || []).map((item) => ({
        id: item.id,
        title: item.title,
        date: item.date,
        status: item.status as Session['status'],
        duration: item.duration,
        audioUrl: item.audio_url,
        youtubeUrl: item.youtube_url,
        blocks: [],
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        camaraId: item.camara_id,
        camaraName: item.camara?.nome,
      }));

      setSessions(mappedSessions);
    } catch (error) {
      console.error('Error fetching sessions:', error);
      toast.error('Erro ao carregar sessões');
    } finally {
      setIsLoading(false);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const filteredSessions = sessions.filter(session => {
    const matchesSearch = session.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || session.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const camaraMap: Record<string, { camaraName: string; sessions: Session[] }> = {};

  filteredSessions.forEach((session) => {
    const key = session.camaraId || 'sem_camara';
    const camaraName = session.camaraName || 'Sem câmara';
    if (!camaraMap[key]) {
      camaraMap[key] = { camaraName, sessions: [] };
    }
    camaraMap[key].sessions.push(session);
  });

  const camaraGroups = Object.values(camaraMap).sort((a, b) =>
    a.camaraName.localeCompare(b.camaraName)
  );

  return (
    <MainLayout>
      <div className="flex-1 space-y-8 p-8 pt-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 animate-fade-in bg-card/30 p-6 rounded-2xl border border-border/50 backdrop-blur-sm shadow-sm">
          <div>
            <h1 className="text-3xl font-bold text-foreground tracking-tight">Sessões</h1>
            <p className="text-muted-foreground mt-1 font-medium">
              Gerencie todas as sessões e transcrições
            </p>
          </div>
          
          {!isVereador && (
            <Link to="/upload">
              <Button variant="gradient" className="gap-2 shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all">
                <Plus className="w-5 h-5" />
                Nova Sessão
              </Button>
            </Link>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row items-center gap-4 animate-slide-up bg-card/50 p-2 rounded-xl border border-border/50 shadow-sm backdrop-blur-sm">
          <div className="relative flex-1 w-full md:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar sessões..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-background/50 border-border/50 focus:bg-background transition-all"
            />
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-[180px] bg-background/50 border-border/50 focus:bg-background transition-all">
                <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
                <SelectItem value="transcribing">Transcrevendo</SelectItem>
                <SelectItem value="organizing">Organizando</SelectItem>
                <SelectItem value="reviewing">Em Revisão</SelectItem>
                <SelectItem value="completed">Concluída</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center bg-muted/50 p-1 rounded-lg border border-border/50 ml-auto">
              <Button
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setViewMode('grid')}
              >
                <LayoutGrid className="w-4 h-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setViewMode('list')}
              >
                <List className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          isSuperAdmin ? (
            <div className="space-y-12">
              {camaraGroups.map((group, groupIndex) => (
                <div key={group.camaraName} className="animate-slide-up" style={{ animationDelay: `${groupIndex * 100}ms` }}>
                  <div className="flex items-center gap-3 mb-6 pb-2 border-b border-border">
                     <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-primary" />
                     </div>
                     <h2 className="text-2xl font-bold text-foreground">
                        {group.camaraName}
                     </h2>
                     <span className="text-sm text-muted-foreground bg-secondary px-3 py-1 rounded-full">
                        {group.sessions.length} sessões
                     </span>
                  </div>
                  
                  <div className={cn(
                    "gap-6",
                    viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3" : "flex flex-col"
                  )}>
                    {group.sessions.map((session, index) => {
                      const status = statusConfig[session.status] || statusConfig.pending;
                      const StatusIcon = status.icon;

                      return (
                        <Link
                          key={session.id}
                          to={isVereador ? `/session/${session.id}/minutes` : `/session/${session.id}/edit`}
                          className="animate-slide-up"
                          style={{ animationDelay: `${(groupIndex * group.sessions.length + index) * 50}ms` }}
                        >
                          <div className={cn(
                            "bg-card rounded-xl border border-border shadow-card hover:shadow-elevated hover:border-primary/30 transition-all duration-300",
                            viewMode === 'grid' ? "p-6" : "p-4 flex items-center gap-4"
                          )}>
                            <div className={cn(
                              "flex",
                              viewMode === 'grid' ? "items-start justify-between mb-4" : "items-center gap-4 shrink-0"
                            )}>
                              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                                <FileText className="w-6 h-6 text-primary" />
                              </div>
                              
                              {viewMode === 'grid' && (
                                <div className="flex items-center gap-2">
                                  <div className={cn(
                                    "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium",
                                    status.color
                                  )}>
                                    <StatusIcon className={cn("w-4 h-4", status.animate && "animate-spin")} />
                                    <span>{status.label}</span>
                                  </div>
                                  {isSuperAdmin && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setSessionToDelete(session.id);
                                      }}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  )}
                                </div>
                              )}
                            </div>

                            <div className={cn(
                              "flex-1 min-w-0",
                              viewMode === 'list' && "grid grid-cols-1 md:grid-cols-12 gap-4 items-center"
                            )}>
                              <h3 className={cn(
                                "font-semibold text-foreground line-clamp-2",
                                viewMode === 'grid' ? "mb-2" : "md:col-span-5 mb-0"
                              )}>
                                {session.title}
                              </h3>

                              {viewMode === 'list' && (
                                <div className="flex items-center gap-2 md:col-span-3">
                                   <div className={cn(
                                    "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium w-fit",
                                    status.color
                                  )}>
                                    <StatusIcon className={cn("w-4 h-4", status.animate && "animate-spin")} />
                                    <span>{status.label}</span>
                                  </div>
                                  {isSuperAdmin && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setSessionToDelete(session.id);
                                      }}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  )}
                                </div>
                              )}

                              <div className={cn(
                                "flex items-center text-sm text-muted-foreground",
                                viewMode === 'grid' ? "gap-4" : "gap-6 md:col-span-4 justify-end"
                              )}>
                                <div className="flex items-center gap-1.5">
                                  <Calendar className="w-4 h-4" />
                                  <span>{new Date(session.date).toLocaleDateString()}</span>
                                </div>
                                {session.duration && (
                                  <div className="flex items-center gap-1.5">
                                    <Clock className="w-4 h-4" />
                                    <span>{session.duration}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={cn(
              "gap-6",
              viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3" : "flex flex-col"
            )}>
              {filteredSessions.map((session, index) => {
                const status = statusConfig[session.status] || statusConfig.pending;
                const StatusIcon = status.icon;

                return (
                  <Link
                    key={session.id}
                    to={isVereador ? `/session/${session.id}/minutes` : `/session/${session.id}/edit`}
                    className="animate-slide-up"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <div className={cn(
                      "bg-card rounded-xl border border-border shadow-card hover:shadow-elevated hover:border-primary/30 transition-all duration-300",
                      viewMode === 'grid' ? "p-6" : "p-4 flex items-center gap-4"
                    )}>
                      <div className={cn(
                        "flex",
                        viewMode === 'grid' ? "items-start justify-between mb-4" : "items-center gap-4 shrink-0"
                      )}>
                        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                          <FileText className="w-6 h-6 text-primary" />
                        </div>
                        
                        {viewMode === 'grid' && (
                          <div className="flex items-center gap-2">
                            <div className={cn(
                              "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium",
                              status.color
                            )}>
                              <StatusIcon className={cn("w-4 h-4", status.animate && "animate-spin")} />
                              <span>{status.label}</span>
                            </div>
                            {isSuperAdmin && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setSessionToDelete(session.id);
                                }}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        )}
                      </div>

                      <div className={cn(
                        "flex-1 min-w-0",
                        viewMode === 'list' && "grid grid-cols-1 md:grid-cols-12 gap-4 items-center"
                      )}>
                        <h3 className={cn(
                          "font-semibold text-foreground line-clamp-2",
                          viewMode === 'grid' ? "mb-2" : "md:col-span-5 mb-0"
                        )}>
                          {session.title}
                        </h3>

                        {viewMode === 'list' && (
                          <div className="flex items-center gap-2 md:col-span-3">
                             <div className={cn(
                              "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium w-fit",
                              status.color
                            )}>
                              <StatusIcon className={cn("w-4 h-4", status.animate && "animate-spin")} />
                              <span>{status.label}</span>
                            </div>
                            {isSuperAdmin && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setSessionToDelete(session.id);
                                }}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        )}

                        <div className={cn(
                          "flex items-center text-sm text-muted-foreground",
                          viewMode === 'grid' ? "gap-4" : "gap-6 md:col-span-4 justify-end"
                        )}>
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-4 h-4" />
                            <span>{new Date(session.date).toLocaleDateString()}</span>
                          </div>
                          {session.duration && (
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-4 h-4" />
                              <span>{session.duration}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )
        )}

        {!isLoading && filteredSessions.length === 0 && (
          <div className="text-center py-16">
            <FileText className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              Nenhuma sessão encontrada
            </h3>
            <p className="text-muted-foreground mb-6">
              {searchQuery 
                ? 'Tente ajustar os filtros de busca'
                : 'Comece criando sua primeira sessão'
              }
            </p>
            {!isVereador && (
              <Link to="/upload">
                <Button variant="default" className="gap-2">
                  <Plus className="w-5 h-5" />
                  Nova Sessão
                </Button>
              </Link>
            )}
          </div>
        )}
        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!sessionToDelete} onOpenChange={(open) => !open && setSessionToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir Sessão</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir esta sessão permanentemente? 
                Esta ação não pode ser desfeita e removerá todas as transcrições, áudios e atas associadas.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction 
                onClick={confirmDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </MainLayout>
  );
}

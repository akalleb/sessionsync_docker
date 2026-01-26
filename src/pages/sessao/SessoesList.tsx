import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Calendar, PlayCircle, Clock, CheckCircle2, Pause, Search } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Sessao, TIPOS_SESSAO } from '@/types/sessao';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';

export default function SessoesList() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { hasRole, vereador, profile } = useAuth();
  const [sessoes, setSessoes] = useState<Sessao[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [showNovaSessao, setShowNovaSessao] = useState(false);
  const [novaSessao, setNovaSessao] = useState({
    titulo: '',
    tipo: 'ordinaria',
    data_sessao: new Date().toISOString().split('T')[0],
  });

  const fetchSessoes = useCallback(async () => {
    const { data, error } = await supabase
      .from('sessoes')
      .select('*')
      .order('data_sessao', { ascending: false });

    if (error) {
      toast({ title: 'Erro ao carregar sessões', variant: 'destructive' });
      return;
    }

    setSessoes(data as Sessao[]);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchSessoes();
  }, [fetchSessoes]);

  const handleCriarSessao = async () => {
    if (!novaSessao.titulo) {
      toast({ title: 'Informe o título da sessão', variant: 'destructive' });
      return;
    }

    const payload = {
      ...novaSessao,
      camara_id: profile?.camara_id ?? null,
    };

    const { data, error } = await supabase
      .from('sessoes')
      .insert(payload)
      .select()
      .single();

    if (error) {
      toast({ title: 'Erro ao criar sessão', variant: 'destructive' });
      return;
    }

    toast({ title: 'Sessão criada com sucesso' });
    setShowNovaSessao(false);
    setNovaSessao({
      titulo: '',
      tipo: 'ordinaria',
      data_sessao: new Date().toISOString().split('T')[0],
    });
    navigate(`/sessao/${(data as Sessao).id}/controle`);
  };

  const filteredSessoes = sessoes.filter((sessao) => {
    const matchesSearch = sessao.titulo.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'todos' || sessao.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'em_andamento':
        return {
          label: 'Em andamento',
          icon: PlayCircle,
          variant: 'default' as const,
          className: 'bg-green-500',
        };
      case 'pausada':
        return { label: 'Pausada', icon: Pause, variant: 'secondary' as const, className: '' };
      case 'encerrada':
        return {
          label: 'Encerrada',
          icon: CheckCircle2,
          variant: 'outline' as const,
          className: '',
        };
      default:
        return { label: 'Agendada', icon: Clock, variant: 'outline' as const, className: '' };
    }
  };

  const handleEnterSession = (sessaoId: string) => {
    const isMesaDiretora = vereador?.cargo_mesa && ['Presidente', '1º Secretário', 'Secretário', 'Secretario'].includes(vereador.cargo_mesa);
    
    if (hasRole('admin') || hasRole('super_admin') || isMesaDiretora) {
      navigate(`/sessao/${sessaoId}/controle`);
    } else {
      navigate(`/sessao/${sessaoId}/vereador`);
    }
  };

  const isMesaDiretora = vereador?.cargo_mesa && ['Presidente', '1º Secretário', 'Secretário', 'Secretario'].includes(vereador.cargo_mesa);
  const canCreateSession = hasRole('admin') || hasRole('super_admin') || isMesaDiretora;

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Sessões ao Vivo</h1>
            <p className="text-muted-foreground">Gerencie sessões parlamentares em tempo real</p>
          </div>
          {canCreateSession && (
            <Dialog open={showNovaSessao} onOpenChange={setShowNovaSessao}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Nova Sessão
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nova Sessão</DialogTitle>
                  <DialogDescription>Preencha os dados abaixo para criar uma nova sessão.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Título</Label>
                    <Input
                      value={novaSessao.titulo}
                      onChange={(e) =>
                        setNovaSessao({ ...novaSessao, titulo: e.target.value })
                      }
                      placeholder="Ex: 15ª Sessão Ordinária"
                    />
                  </div>
                  <div>
                    <Label>Tipo</Label>
                    <Select
                      value={novaSessao.tipo}
                      onValueChange={(v) => setNovaSessao({ ...novaSessao, tipo: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIPOS_SESSAO.map((tipo) => (
                          <SelectItem key={tipo.id} value={tipo.id}>
                            {tipo.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Data</Label>
                    <Input
                      type="date"
                      value={novaSessao.data_sessao}
                      onChange={(e) =>
                        setNovaSessao({ ...novaSessao, data_sessao: e.target.value })
                      }
                    />
                  </div>
                  <Button className="w-full" onClick={handleCriarSessao}>
                    Criar Sessão
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <div className="flex gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar sessões..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="agendada">Agendadas</SelectItem>
              <SelectItem value="em_andamento">Em andamento</SelectItem>
              <SelectItem value="pausada">Pausadas</SelectItem>
              <SelectItem value="encerrada">Encerradas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : filteredSessoes.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Nenhuma sessão encontrada</h3>
              <p className="text-muted-foreground mb-4">
                {canCreateSession
                  ? 'Crie uma nova sessão para começar'
                  : 'Aguarde o início de uma nova sessão'}
              </p>
              {canCreateSession && (
                <Button onClick={() => setShowNovaSessao(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Nova Sessão
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSessoes.map((sessao) => {
              const statusInfo = getStatusInfo(sessao.status);
              const StatusIcon = statusInfo.icon;

              return (
                <Card
                  key={sessao.id}
                  className={cn(
                    'cursor-pointer transition-all hover:shadow-md hover:border-primary/50',
                    sessao.status === 'em_andamento' && 'border-green-500/50'
                  )}
                  onClick={() => handleEnterSession(sessao.id)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-lg line-clamp-2">
                          {sessao.titulo}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">
                          {new Date(sessao.data_sessao).toLocaleDateString('pt-BR', {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short',
                          })}
                        </p>
                      </div>
                      <Badge
                        variant={statusInfo.variant}
                        className={statusInfo.className}
                      >
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {statusInfo.label}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span className="capitalize">
                        {TIPOS_SESSAO.find((t) => t.id === sessao.tipo)?.nome ||
                          sessao.tipo}
                      </span>
                      {sessao.hora_inicio && (
                        <span>
                          {sessao.hora_inicio.slice(0, 5)}
                          {sessao.hora_fim &&
                            ` - ${sessao.hora_fim.slice(0, 5)}`}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </MainLayout>
  );
}

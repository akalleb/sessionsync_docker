import { useState, useEffect, useCallback } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Users, RefreshCw, Pencil, Trash2, Search, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';

interface Partido {
  id: string;
  sigla: string;
  cor?: string | null;
}

interface Vereador {
  id: string;
  nome: string;
  nome_parlamentar: string;
  camara_id: string;
  ativo: boolean;
  cargo_mesa: 'Presidente' | 'Vice-Presidente' | '1º Secretário' | '2º Secretário' | null;
  partido_id?: string | null;
  foto_url?: string | null;
  user_id?: string | null;
  partido?: {
    sigla: string;
    cor?: string | null;
  } | null;
}

const Vereadores = () => {
  const { profile } = useAuth();
  const [vereadores, setVereadores] = useState<Vereador[]>([]);
  const [partidos, setPartidos] = useState<Partido[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingVereador, setEditingVereador] = useState<Vereador | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    nome: '',
    nome_parlamentar: '',
    cargo_mesa: 'null',
    ativo: true,
    foto_url: '',
    partido_sigla: '',
  });

  const fetchVereadores = useCallback(async () => {
    setLoading(true);
    if (!profile?.camara_id) return;

    const { data, error } = await supabase
      .from('vereadores')
      .select(`
        *,
        partido:partidos(sigla, cor)
      `)
      .eq('camara_id', profile.camara_id)
      .order('nome');

    if (error) {
      toast.error('Erro ao carregar vereadores');
      console.error(error);
    } else {
      setVereadores(data as unknown as Vereador[]);
    }
    setLoading(false);
  }, [profile?.camara_id]);

  const fetchPartidos = useCallback(async () => {
    const { data, error } = await supabase
      .from('partidos')
      .select('id, sigla, cor')
      .order('sigla');

    if (error) {
      console.error('Erro ao carregar partidos', error);
      return;
    }

    setPartidos(data as Partido[]);
  }, []);

  useEffect(() => {
    if (profile?.camara_id) {
      fetchVereadores();
    }
  }, [profile?.camara_id, fetchVereadores]);

  useEffect(() => {
    fetchPartidos();
  }, [fetchPartidos]);

  const handleSyncProfiles = async () => {
    if (!profile?.camara_id) return;
    setSyncing(true);

    try {
      const { data: profiles, error: errProfiles } = await supabase
        .from('profiles')
        .select('*')
        .eq('camara_id', profile.camara_id)
        .ilike('cargo', '%Vereador%');

      if (errProfiles) throw errProfiles;

      if (!profiles || profiles.length === 0) {
        toast.info('Nenhum perfil de vereador encontrado para sincronizar.');
        setSyncing(false);
        return;
      }

      let partidosMap = new Map<string, string>();

      if (partidos.length > 0) {
        partidosMap = new Map(
          partidos.map((p) => [p.sigla.trim().toUpperCase(), p.id])
        );
      } else {
        const { data: partidosData } = await supabase
          .from('partidos')
          .select('id, sigla')
          .order('sigla');

        if (partidosData) {
          setPartidos(partidosData as Partido[]);
          partidosMap = new Map(
            (partidosData as { id: string; sigla: string }[]).map((p) => [
              p.sigla.trim().toUpperCase(),
              p.id,
            ])
          );
        }
      }

      type ProfileWithPrefs = {
        nome: string;
        ativo?: boolean | null;
        avatar_url?: string | null;
        user_id: string;
        preferences?: {
          vereador?: {
            partido?: string | null;
            apelido?: string | null;
          } | null;
        } | null;
      };

      let added = 0;
      let updated = 0;

      const createdPartidos = new Map<string, string>();

      const getOrCreatePartidoId = async (siglaTexto: string | null | undefined) => {
        if (!siglaTexto) return null;
        const key = siglaTexto.trim().toUpperCase();
        if (!key) return null;

        const existingId = partidosMap.get(key);
        if (existingId) return existingId;

        const createdId = createdPartidos.get(key);
        if (createdId) return createdId;

        const { data, error } = await supabase
          .from('partidos')
          .insert({ sigla: key })
          .select('id, sigla')
          .single();

        if (error || !data) {
          console.error('Erro ao criar partido a partir do perfil', error);
          return null;
        }

        partidosMap.set(key, data.id as string);
        createdPartidos.set(key, data.id as string);
        return data.id as string;
      };

      for (const p of profiles as ProfileWithPrefs[]) {
        const existing = vereadores.find(v => 
          (v.user_id && v.user_id === p.user_id) || 
          v.nome.toLowerCase() === p.nome.toLowerCase()
        );

        const partidoTexto = p.preferences?.vereador?.partido || null;
        const apelido = p.preferences?.vereador?.apelido || null;
        const nomeParlamentar =
          apelido && apelido.trim().length > 0
            ? apelido
            : p.nome.split(' ')[0];

        const partidoId = await getOrCreatePartidoId(partidoTexto);

        const vereadorData = {
          nome: p.nome,
          nome_parlamentar: nomeParlamentar,
          camara_id: profile.camara_id,
          ativo: p.ativo !== false,
          foto_url: p.avatar_url,
          partido_id: partidoId,
        };

        if (existing) {
          const updateData: Partial<Vereador> = {};

          if (existing.foto_url !== p.avatar_url) {
            updateData.foto_url = p.avatar_url || null;
          }

          if (partidoId && existing.partido_id !== partidoId) {
            updateData.partido_id = partidoId;
          }

          if (Object.keys(updateData).length > 0) {
            await supabase
              .from('vereadores')
              .update(updateData)
              .eq('id', existing.id);
            updated++;
          }
        } else {
          const { error: errInsert } = await supabase
            .from('vereadores')
            .insert(vereadorData);
          
          if (errInsert) {
             console.error('Erro ao inserir:', errInsert);
          } else {
             added++;
          }
        }
      }

      toast.success(`Sincronização concluída: ${added} adicionados, ${updated} verificados.`);
      fetchVereadores();

    } catch (error) {
      console.error(error);
      toast.error('Erro ao sincronizar vereadores');
    } finally {
      setSyncing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.camara_id) return;
    setSubmitting(true);

    let partidoId: string | null = null;
    const siglaRaw = formData.partido_sigla.trim();

    if (siglaRaw) {
      const key = siglaRaw.toUpperCase();
      const existingPartido = partidos.find(
        (p) => p.sigla.trim().toUpperCase() === key
      );

      if (existingPartido) {
        partidoId = existingPartido.id;
      } else {
        const { data: created, error: createError } = await supabase
          .from('partidos')
          .insert({ sigla: key })
          .select('id, sigla, cor')
          .single();

        if (createError || !created) {
          toast.error('Erro ao salvar partido do vereador');
          setSubmitting(false);
          return;
        }

        partidoId = created.id as string;
        setPartidos((prev) => [...prev, created as unknown as Partido]);
      }
    }

    const dataToSubmit = {
      nome: formData.nome,
      nome_parlamentar: formData.nome_parlamentar,
      cargo_mesa: formData.cargo_mesa === 'null' ? null : formData.cargo_mesa,
      ativo: formData.ativo,
      camara_id: profile.camara_id,
      foto_url: formData.foto_url || null,
      partido_id: partidoId,
    };

    if (editingVereador) {
      const { error } = await supabase
        .from('vereadores')
        .update(dataToSubmit)
        .eq('id', editingVereador.id);

      if (error) {
        toast.error('Erro ao atualizar vereador');
      } else {
        toast.success('Vereador atualizado com sucesso!');
        setIsDialogOpen(false);
        fetchVereadores();
      }
    } else {
      const { error } = await supabase
        .from('vereadores')
        .insert(dataToSubmit);

      if (error) {
        toast.error('Erro ao criar vereador');
      } else {
        toast.success('Vereador criado com sucesso!');
        setIsDialogOpen(false);
        fetchVereadores();
      }
    }

    setSubmitting(false);
    resetForm();
  };

  const handleEdit = (vereador: Vereador) => {
    setEditingVereador(vereador);
    setFormData({
      nome: vereador.nome,
      nome_parlamentar: vereador.nome_parlamentar,
      cargo_mesa: vereador.cargo_mesa || 'null',
      ativo: vereador.ativo,
      foto_url: vereador.foto_url || '',
      partido_sigla: vereador.partido?.sigla || '',
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza? Isso pode afetar históricos de votação.')) return;

    const { error } = await supabase
      .from('vereadores')
      .delete()
      .eq('id', id);

    if (error) {
      toast.error('Erro ao excluir vereador');
    } else {
      toast.success('Vereador excluído');
      setVereadores(prev => prev.filter(v => v.id !== id));
    }
  };

  const resetForm = () => {
    setFormData({
      nome: '',
      nome_parlamentar: '',
      cargo_mesa: 'null',
      ativo: true,
      foto_url: '',
      partido_sigla: '',
    });
    setEditingVereador(null);
  };

  const filteredVereadores = vereadores.filter(v => 
    v.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.nome_parlamentar.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Users className="w-7 h-7 text-primary" />
              Gestão de Vereadores
            </h1>
            <p className="text-muted-foreground">
              Gerencie o cadastro e os cargos da Mesa Diretora
            </p>
          </div>
          
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleSyncProfiles} disabled={syncing}>
              {syncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Sincronizar com Perfis
            </Button>

            <Dialog open={isDialogOpen} onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) resetForm();
            }}>
              <DialogTrigger asChild>
                <Button variant="gradient">Novo Vereador</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingVereador ? 'Editar Vereador' : 'Novo Vereador'}</DialogTitle>
                  <DialogDescription>Preencha os dados do vereador.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Nome Completo</Label>
                    <Input 
                      value={formData.nome} 
                      onChange={e => setFormData({...formData, nome: e.target.value})}
                      required 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Nome Parlamentar</Label>
                    <Input 
                      value={formData.nome_parlamentar} 
                      onChange={e => setFormData({...formData, nome_parlamentar: e.target.value})}
                      required 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Cargo na Mesa Diretora</Label>
                    <Select 
                      value={formData.cargo_mesa} 
                      onValueChange={v => setFormData({...formData, cargo_mesa: v})}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="null">Nenhum (Plenário)</SelectItem>
                        <SelectItem value="Presidente">Presidente</SelectItem>
                        <SelectItem value="Vice-Presidente">Vice-Presidente</SelectItem>
                        <SelectItem value="1º Secretário">1º Secretário</SelectItem>
                        <SelectItem value="2º Secretário">2º Secretário</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Partido</Label>
                    <Input
                      value={formData.partido_sigla}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          partido_sigla: e.target.value,
                        })
                      }
                      placeholder="Ex: MDB, PT, PL..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>URL da Foto</Label>
                    <Input 
                      value={formData.foto_url} 
                      onChange={e => setFormData({...formData, foto_url: e.target.value})}
                      placeholder="https://..."
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      id="ativo"
                      checked={formData.ativo}
                      onChange={e => setFormData({...formData, ativo: e.target.checked})}
                      className="h-4 w-4"
                    />
                    <Label htmlFor="ativo">Cadastro Ativo</Label>
                  </div>
                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting ? 'Salvando...' : 'Salvar'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar vereador..."
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
             <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome Parlamentar</TableHead>
                    <TableHead>Nome Completo</TableHead>
                    <TableHead>Cargo Mesa</TableHead>
                    <TableHead>Partido</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredVereadores.map((vereador) => (
                    <TableRow key={vereador.id}>
                      <TableCell className="font-medium">{vereador.nome_parlamentar}</TableCell>
                      <TableCell className="text-muted-foreground">{vereador.nome}</TableCell>
                      <TableCell>
                        {vereador.cargo_mesa ? (
                          <Badge variant="outline" className="bg-primary/5 border-primary/20 text-primary">
                            {vereador.cargo_mesa}
                          </Badge>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        {vereador.partido?.sigla ? (
                          <Badge variant="outline" className="bg-muted text-foreground">
                            {vereador.partido.sigla}
                          </Badge>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={vereador.ativo ? 'default' : 'secondary'}>
                          {vereador.ativo ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(vereador)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(vereador.id)} className="text-destructive">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredVereadores.length === 0 && !loading && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        Nenhum vereador encontrado. Tente sincronizar.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
};

export default Vereadores;

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Play,
  Pause,
  Square,
  Users,
  Vote,
  Clock,
  FileText,
  Maximize2,
  Plus,
  Megaphone,
} from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SessionPhaseIndicator } from '@/components/sessao/SessionPhaseIndicator';
import { AttendancePanel } from '@/components/sessao/AttendancePanel';
import { VotingPanel } from '@/components/sessao/VotingPanel';
import { SpeakerTimer } from '@/components/sessao/SpeakerTimer';
import { AgendaManagement } from '@/components/sessao/AgendaManagement';
import { HeadlinesManagement } from '@/components/sessao/HeadlinesManagement';
import { useSessaoRealtime } from '@/hooks/useSessaoRealtime';
import { useFasesSessao } from '@/hooks/useFasesSessao';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { SessaoPresenca, Votacao, SessaoPauta, SolicitacaoFala } from '@/types/sessao';

export default function SessaoControl() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { sessao, presencas, votacaoAtual, votos, pauta, tempoFalaAtual, solicitacoesFala, manchetes, loading, refetch } =
    useSessaoRealtime(id || null);
  const { fases } = useFasesSessao();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const [novaVotacao, setNovaVotacao] = useState({
    titulo: '',
    descricao: '',
    tipo: 'simples',
  });
  const [showNovaVotacao, setShowNovaVotacao] = useState(false);
  const [votacoesPendentes, setVotacoesPendentes] = useState<Votacao[]>([]);

  // Carregar votações pendentes
  useEffect(() => {
    if (!sessao?.id) return;

    const fetchPendentes = async () => {
      const { data } = await supabase
        .from('votacoes')
        .select('*')
        .eq('sessao_id', sessao.id)
        .eq('status', 'aguardando')
        .order('created_at', { ascending: true });
      setVotacoesPendentes(data as Votacao[] || []);
    };

    fetchPendentes();

    const channel = supabase
      .channel(`votacoes-pendentes-${sessao.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'votacoes', filter: `sessao_id=eq.${sessao.id}` },
        () => fetchPendentes()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [sessao?.id]);

  const handleCriarVotacao = async () => {
    if (!sessao || !novaVotacao.titulo) return;

    try {
      const { error } = await supabase.from('votacoes').insert({
        sessao_id: sessao.id,
        titulo: novaVotacao.titulo,
        descricao: novaVotacao.descricao,
        tipo: novaVotacao.tipo,
        status: 'aguardando', // Criar como aguardando por padrão
      });

      if (error) throw error;

      setNovaVotacao({ titulo: '', descricao: '', tipo: 'simples' });
      setShowNovaVotacao(false);
      toast({ title: 'Votação criada e aguardando início.' });
    } catch (error) {
      console.error(error);
      toast({ title: 'Erro ao criar votação', variant: 'destructive' });
    }
  };

  const handleIniciarVotacaoPendente = async (votacaoId: string) => {
    if (!sessao) return;

    try {
      if (sessao.status !== 'em_andamento') {
        toast({ title: 'Inicie a sessão para começar a votação', variant: 'destructive' });
        return;
      }

      if (votacaoAtual) {
        toast({ title: 'Já existe uma votação em andamento!', variant: 'destructive' });
        return;
      }

      const { error } = await supabase
        .from('votacoes')
        .update({ status: 'em_andamento' })
        .eq('id', votacaoId);

      if (error) throw error;

      toast({ title: 'Votação iniciada!' });
    } catch (error) {
      console.error(error);
      toast({ title: 'Erro ao iniciar votação', variant: 'destructive' });
    }
  };
  const [vereadorFala, setVereadorFala] = useState<string | null>(null);
  const [tipoFala, setTipoFala] = useState<string>('discussao');
  const [tempoFalaMinutos, setTempoFalaMinutos] = useState(5);
  const initializingRef = useRef(false);

  const [activeTab, setActiveTab] = useState('presenca');

  // Auto-switch tabs based on session phase
  useEffect(() => {
    if (!sessao?.fase_atual) return;

    const phaseMap: Record<string, string> = {
      abertura: 'presenca',
      leitura_ata: 'presenca',
      pequeno_expediente: 'pauta',
      grande_expediente: 'pauta',
      ordem_do_dia: 'pauta',
      tribuna_livre: 'tempo',
      votacao: 'votacao',
      explicacoes_pessoais: 'tempo',
      tribuna_livre_2: 'tempo',
      encerramento: 'presenca'
    };

    const targetTab = phaseMap[sessao.fase_atual];
    if (targetTab) {
      setActiveTab(targetTab);
    }
  }, [sessao?.fase_atual]);

  const handleAceitarSolicitacao = async (solicitacao: SolicitacaoFala) => {
    // 1. Marcar solicitação como atendida
    await supabase
      .from('solicitacoes_fala')
      .update({ status: 'atendida' })
      .eq('id', solicitacao.id);

    // 2. Configurar o formulário de concessão de palavra
    setVereadorFala(solicitacao.vereador_id);
    setTipoFala(solicitacao.tipo);
    // Definir tempo padrão baseado no tipo
    if (solicitacao.tipo === 'tribuna') {
      setTempoFalaMinutos(15);
    } else if (solicitacao.tipo === 'aparte' || solicitacao.tipo === 'ordem') {
      setTempoFalaMinutos(3);
    } else {
      setTempoFalaMinutos(5);
    }

    toast({ title: 'Solicitação aceita. Tempo configurado, clique em Conceder Palavra.' });
  };

  const handleRejeitarSolicitacao = async (solicitacaoId: string) => {
    await supabase
      .from('solicitacoes_fala')
      .update({ status: 'cancelada' })
      .eq('id', solicitacaoId);

    toast({ title: 'Solicitação removida da fila' });
  };

  const initializePresencas = useCallback(async () => {
    if (!sessao) return;

    let query = supabase.from('vereadores').select('id').eq('ativo', true);

    if (sessao.camara_id) {
      query = query.eq('camara_id', sessao.camara_id);
    }

    const { data: initialVereadores, error } = await query;
    let vereadores = initialVereadores;

    if (error) {
      console.error('Erro ao buscar vereadores:', error);
      toast({ title: 'Erro ao carregar vereadores', variant: 'destructive' });
      return;
    }

    // Fallback: Se não encontrar vereadores na câmara específica, tenta buscar todos os ativos
    // Isso resolve problemas onde a sessão ou vereadores podem estar com IDs inconsistentes
    if (!vereadores || vereadores.length === 0) {
      console.warn('Nenhum vereador encontrado na câmara. Tentando buscar todos os ativos...');
      const { data: allVereadores, error: allError } = await supabase
        .from('vereadores')
        .select('id')
        .eq('ativo', true);

      if (!allError && allVereadores && allVereadores.length > 0) {
        vereadores = allVereadores;
        toast({
          title: 'Aviso: Vereadores carregados sem filtro de câmara',
          description: 'Verifique se a sessão e os vereadores pertencem à mesma câmara.',
          variant: 'default',
        });
      }
    }

    if (!vereadores || vereadores.length === 0) {
      console.warn('Nenhum vereador encontrado para inicializar presença.');
      toast({
        title: 'Nenhum vereador encontrado',
        description: 'Cadastre vereadores ativos para esta câmara.',
        variant: 'destructive',
      });
      return;
    }

    const presencasData = vereadores.map((v) => ({
      sessao_id: sessao.id,
      vereador_id: v.id,
      presente: false,
    }));

    const { error: insertError } = await supabase
      .from('sessao_presencas')
      .upsert(presencasData, { onConflict: 'sessao_id,vereador_id' });

    if (insertError) {
      console.error('Erro ao criar lista de presença:', insertError);
      toast({ title: 'Erro ao criar lista de presença', variant: 'destructive' });
    } else {
      refetch.presencas();
    }
  }, [sessao, refetch, toast]);

  useEffect(() => {
    if (sessao && presencas.length === 0) {
      initializePresencas();
    }
  }, [sessao, presencas.length, initializePresencas]);

  const handleForceReloadPresenca = useCallback(() => {
    toast({ title: 'Tentando recarregar vereadores...' });
    initializePresencas();
  }, [initializePresencas, toast]);

  const handleTogglePresenca = async (vereadorId: string, presente: boolean) => {
    if (!sessao) return;

    const { error } = await supabase
      .from('sessao_presencas')
      .update({
        presente,
      })
      .eq('sessao_id', sessao.id)
      .eq('vereador_id', vereadorId);

    if (error) {
      toast({ title: 'Erro ao atualizar presença', variant: 'destructive' });
      return;
    }

    if (refetch?.presencas) {
      await refetch.presencas();
    }
  };

  const handleUpdateFase = async (fase: string) => {
    if (!sessao) return;

    await supabase.from('sessoes').update({ fase_atual: fase }).eq('id', sessao.id);
  };

  const handleUpdateStatus = async (status: 'em_andamento' | 'pausada' | 'encerrada') => {
    if (!sessao) return;

    const updates: Record<string, unknown> = { status };
    if (status === 'em_andamento' && !sessao.hora_inicio) {
      updates.hora_inicio = new Date().toISOString();
    }
    if (status === 'encerrada') {
      updates.hora_fim = new Date().toISOString();
    }

    await supabase.from('sessoes').update(updates).eq('id', sessao.id);

    toast({
      title:
        status === 'em_andamento'
          ? 'Sessão iniciada'
          : status === 'pausada'
            ? 'Sessão pausada'
            : 'Sessão encerrada',
    });
  };

  const handleDeleteSessao = async () => {
    if (!sessao) return;

    try {
      await supabase.from('tempo_fala').delete().eq('sessao_id', sessao.id);
      await supabase.from('votos').delete().in(
        'votacao_id',
        (await supabase.from('votacoes').select('id').eq('sessao_id', sessao.id)).data?.map(
          (v: { id: string }) => v.id
        ) || []
      );
      await supabase.from('votacoes').delete().eq('sessao_id', sessao.id);
      await supabase.from('sessao_pauta').delete().eq('sessao_id', sessao.id);
      await supabase.from('sessao_presencas').delete().eq('sessao_id', sessao.id);
      await supabase.from('sessoes').delete().eq('id', sessao.id);

      toast({
        title: 'Sessão excluída com sucesso',
      });

      navigate('/sessoes');
    } catch (error) {
      console.error('Erro ao excluir sessão:', error);
      toast({
        title: 'Erro ao excluir sessão',
        variant: 'destructive',
      });
    } finally {
      setConfirmDeleteOpen(false);
    }
  };

  // ... (rest of the code)

  const handleRegistrarVoto = async (
    vereadorId: string,
    voto: 'favor' | 'contra' | 'abstencao'
  ) => {
    if (!votacaoAtual) return;

    await supabase.from('votos').insert({
      votacao_id: votacaoAtual.id,
      vereador_id: vereadorId,
      voto,
    });

    const field =
      voto === 'favor' ? 'votos_favor' : voto === 'contra' ? 'votos_contra' : 'abstencoes';
    await supabase
      .from('votacoes')
      .update({ [field]: (votacaoAtual[field as keyof Votacao] as number) + 1 })
      .eq('id', votacaoAtual.id);
  };

  const handleEncerrarVotacao = async () => {
    if (!votacaoAtual) return;

    const votosFavor = votos.filter((v) => v.voto === 'favor').length;
    const votosContra = votos.filter((v) => v.voto === 'contra').length;
    const votosAbstencao = votos.filter((v) => v.voto === 'abstencao').length;

    const resultado =
      votosFavor > votosContra
        ? 'aprovada'
        : votosFavor < votosContra
          ? 'rejeitada'
          : 'empate';

    await supabase
      .from('votacoes')
      .update({
        status: 'encerrada',
        resultado,
        votos_favor: votosFavor,
        votos_contra: votosContra,
        abstencoes: votosAbstencao,
        encerrada_at: new Date().toISOString(),
      })
      .eq('id', votacaoAtual.id);

    toast({
      title: 'Votação encerrada',
      description: `Resultado: ${resultado.toUpperCase()}`,
    });
  };

  const handleIniciarFala = async () => {
    if (!sessao || !vereadorFala) return;

    try {
      const { error } = await supabase.from('tempo_fala').insert({
        sessao_id: sessao.id,
        vereador_id: vereadorFala,
        tipo: tipoFala,
        tempo_concedido: tempoFalaMinutos * 60,
        inicio: new Date().toISOString(),
      });

      if (error) {
        throw error;
      }

      // Garante que o painel Tempo de Fala Atual seja atualizado imediatamente
      if (refetch?.tempoFala) {
        await refetch.tempoFala();
      }
      setActiveTab('tempo');

      setVereadorFala(null);
      toast({ title: 'Tempo de fala iniciado com sucesso!' });
    } catch (error) {
      console.error('Erro ao iniciar fala:', error);
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      toast({
        title: 'Erro ao iniciar tempo de fala',
        description: 'Verifique se você tem permissão. Detalhes: ' + msg,
        variant: 'destructive',
      });
    }
  };

  const handleEncerrarFala = async () => {
    if (!tempoFalaAtual) return;

    try {
      const tempoUtilizado = tempoFalaAtual.inicio
        ? Math.floor((Date.now() - new Date(tempoFalaAtual.inicio).getTime()) / 1000)
        : 0;

      const { error } = await supabase
        .from('tempo_fala')
        .update({
          fim: new Date().toISOString(),
          tempo_utilizado: tempoUtilizado,
        })
        .eq('id', tempoFalaAtual.id);

      if (error) throw error;

      toast({ title: 'Tempo de fala encerrado.' });
    } catch (error) {
      console.error('Erro ao encerrar fala:', error);
      toast({ title: 'Erro ao encerrar fala', variant: 'destructive' });
    }
  };

  const handleAjustarTempoFala = async (deltaSegundos: number) => {
    if (!tempoFalaAtual) return;

    const novoTempo = tempoFalaAtual.tempo_concedido + deltaSegundos;
    if (novoTempo <= 0) {
      toast({
        title: 'Tempo mínimo atingido',
        description: 'Não é possível reduzir abaixo de 1 minuto.',
        variant: 'destructive',
      });
      return;
    }

    const { error } = await supabase
      .from('tempo_fala')
      .update({ tempo_concedido: novoTempo })
      .eq('id', tempoFalaAtual.id);

    if (error) {
      console.error('Erro ao ajustar tempo de fala:', error);
      toast({ title: 'Erro ao ajustar tempo de fala', variant: 'destructive' });
      return;
    }

    if (refetch?.tempoFala) {
      await refetch.tempoFala();
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-full">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </MainLayout>
    );
  }

  if (!sessao) {
    return (
      <MainLayout>
        <div className="p-8 text-center">
          <p>Sessão não encontrada</p>
          <Button onClick={() => navigate('/sessoes')} className="mt-4">
            Voltar para Sessões
          </Button>
        </div>
      </MainLayout>
    );
  }

  const getStatusBadge = () => {
    switch (sessao.status) {
      case 'em_andamento':
        return <Badge className="bg-green-500">Em andamento</Badge>;
      case 'pausada':
        return <Badge variant="secondary">Pausada</Badge>;
      case 'encerrada':
        return <Badge variant="outline">Encerrada</Badge>;
      default:
        return <Badge variant="outline">Agendada</Badge>;
    }
  };

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/sessoes')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold">{sessao.titulo}</h1>
                {getStatusBadge()}
              </div>
              <p className="text-muted-foreground">
                {new Date(sessao.data_sessao).toLocaleDateString('pt-BR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleForceReloadPresenca}
              title="Forçar recarregamento da lista"
            >
              <Users className="h-4 w-4 mr-2" />
              Recarregar Lista
            </Button>
            <Button
              variant="outline"
              onClick={() => window.open(`/plenario/${sessao.id}`, '_blank')}
            >
              <Maximize2 className="h-4 w-4 mr-2" />
              Display Plenário
            </Button>
            {sessao.status === 'agendada' && (
              <Button onClick={() => handleUpdateStatus('em_andamento')}>
                <Play className="h-4 w-4 mr-2" />
                Iniciar Sessão
              </Button>
            )}
            {sessao.status === 'em_andamento' && (
              <>
                <Button variant="secondary" onClick={() => handleUpdateStatus('pausada')}>
                  <Pause className="h-4 w-4 mr-2" />
                  Pausar
                </Button>
                <Button variant="destructive" onClick={() => handleUpdateStatus('encerrada')}>
                  <Square className="h-4 w-4 mr-2" />
                  Encerrar
                </Button>
              </>
            )}
            {sessao.status === 'pausada' && (
              <Button onClick={() => handleUpdateStatus('em_andamento')}>
                <Play className="h-4 w-4 mr-2" />
                Retomar
              </Button>
            )}
            <Button
              variant="destructive"
              onClick={() => setConfirmDeleteOpen(true)}
            >
              Excluir Sessão
            </Button>
          </div>
        </div>

        <SessionPhaseIndicator
          faseAtual={sessao.fase_atual}
          fases={fases}
          onFaseClick={handleUpdateFase}
          readonly={false} // Presidente sempre pode mudar fase, mesmo pausado
        />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="presenca" className="gap-2">
              <Users className="h-4 w-4" />
              Presença
            </TabsTrigger>
            <TabsTrigger value="pauta" className="gap-2">
              <FileText className="h-4 w-4" />
              Pauta
            </TabsTrigger>
            <TabsTrigger value="votacao" className="gap-2">
              <Vote className="h-4 w-4" />
              Votação
            </TabsTrigger>
            <TabsTrigger value="tempo" className="gap-2">
              <Clock className="h-4 w-4" />
              Tempo de Fala
            </TabsTrigger>
            <TabsTrigger value="manchetes" className="gap-2">
              <Megaphone className="h-4 w-4" />
              Manchetes
            </TabsTrigger>
          </TabsList>

          <TabsContent value="presenca">
            <AttendancePanel
              presencas={presencas as SessaoPresenca[]}
              onTogglePresenca={handleTogglePresenca}
              readonly={sessao.status === 'encerrada'}
            />
          </TabsContent>

          <TabsContent value="pauta">
            <AgendaManagement
              sessaoId={sessao.id}
              pauta={pauta as SessaoPauta[]}
              faseAtual={sessao.fase_atual}
              fases={fases}
              onRefetch={refetch.pauta}
              readonly={sessao.status === 'encerrada'}
            />
          </TabsContent>

          <TabsContent value="votacao">
            <div className="space-y-6">
              {/* Lista de Votações Pendentes */}
              {votacoesPendentes.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Votações Cadastradas (Aguardando Início)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {votacoesPendentes.map((v) => (
                        <div key={v.id} className="flex items-center justify-between p-4 border rounded-lg">
                          <div>
                            <h4 className="font-semibold">{v.titulo}</h4>
                            {v.descricao && <p className="text-sm text-muted-foreground">{v.descricao}</p>}
                            <Badge variant="outline" className="mt-2">{v.tipo}</Badge>
                          </div>
                          <Button
                            onClick={() => handleIniciarVotacaoPendente(v.id)}
                            disabled={!!votacaoAtual}
                          >
                            <Play className="h-4 w-4 mr-2" />
                            Iniciar Agora
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {votacaoAtual ? (
                <VotingPanel
                  votacao={votacaoAtual}
                  votos={votos}
                  presencas={presencas}
                  onRegistrarVoto={handleRegistrarVoto}
                  onEncerrarVotacao={handleEncerrarVotacao}
                  readonly={sessao.status !== 'em_andamento'}
                />
              ) : (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Vote className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">Nenhuma votação em andamento</h3>
                    <p className="text-muted-foreground mb-4">
                      Cadastre uma nova votação para iniciar
                    </p>
                    <Dialog open={showNovaVotacao} onOpenChange={setShowNovaVotacao}>
                      <DialogTrigger asChild>
                        <Button disabled={sessao.status === 'encerrada'}>
                          <Plus className="h-4 w-4 mr-2" />
                          Nova Votação
                        </Button>
                      </DialogTrigger>
                      <DialogContent aria-describedby="dialog-description">
                        <DialogHeader>
                          <DialogTitle>Nova Votação</DialogTitle>
                          <p id="dialog-description" className="text-sm text-muted-foreground">Preencha os dados abaixo para cadastrar uma nova votação.</p>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div>
                            <Label>Título</Label>
                            <Input
                              value={novaVotacao.titulo}
                              onChange={(e) =>
                                setNovaVotacao({ ...novaVotacao, titulo: e.target.value })
                              }
                              placeholder="Ex: Projeto de Lei nº 123/2024"
                            />
                          </div>
                          <div>
                            <Label>Descrição (opcional)</Label>
                            <Textarea
                              value={novaVotacao.descricao}
                              onChange={(e) =>
                                setNovaVotacao({ ...novaVotacao, descricao: e.target.value })
                              }
                              placeholder="Breve descrição da matéria"
                            />
                          </div>
                          <div>
                            <Label>Tipo de Votação</Label>
                            <Select
                              value={novaVotacao.tipo}
                              onValueChange={(v) =>
                                setNovaVotacao({ ...novaVotacao, tipo: v })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="simples">Simples</SelectItem>
                                <SelectItem value="nominal">Nominal</SelectItem>
                                <SelectItem value="secreta">Secreta</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <Button className="w-full" onClick={handleCriarVotacao}>
                            Cadastrar Votação
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="tempo">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle>Fila de Inscrições</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {solicitacoesFala.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>Nenhuma solicitação pendente</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {solicitacoesFala.map((solicitacao) => (
                        <div key={solicitacao.id} className="flex items-center justify-between p-3 border rounded-lg bg-card shadow-sm">
                          <div>
                            <p className="font-medium text-sm">
                              {solicitacao.vereador?.nome_parlamentar || solicitacao.vereador?.nome}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant={solicitacao.tipo === 'tribuna' ? 'default' : 'secondary'} className="text-xs">
                                {solicitacao.tipo === 'discussao' && 'Discussão'}
                                {solicitacao.tipo === 'aparte' && 'Aparte'}
                                {solicitacao.tipo === 'ordem' && 'Questão de Ordem'}
                                {solicitacao.tipo === 'tribuna' && 'Tribuna'}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {new Date(solicitacao.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => handleAceitarSolicitacao(solicitacao)}>
                              <Play className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleRejeitarSolicitacao(solicitacao.id)}>
                              <Square className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle>Tempo de Fala Atual</CardTitle>
                </CardHeader>
                <CardContent>
                  {tempoFalaAtual ? (
                    <div className="space-y-4">
                      <SpeakerTimer
                        tempoInicial={tempoFalaAtual.tempo_concedido}
                        inicio={tempoFalaAtual.inicio}
                        vereadorNome={
                          tempoFalaAtual.vereador?.nome_parlamentar ||
                          tempoFalaAtual.vereador?.nome
                        }
                        tipo={tempoFalaAtual.tipo}
                        onTempoEsgotado={() =>
                          toast({ title: 'Tempo esgotado!', variant: 'destructive' })
                        }
                        readonly
                      />
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() => handleAjustarTempoFala(-60)}
                          disabled={tempoFalaAtual.tempo_concedido <= 60}
                        >
                          -1 min
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() => handleAjustarTempoFala(60)}
                        >
                          +1 min
                        </Button>
                      </div>
                      <Button
                        className="w-full"
                        variant="destructive"
                        onClick={handleEncerrarFala}
                      >
                        Encerrar Fala
                      </Button>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>Nenhum vereador com a palavra</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle>Conceder Palavra</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Vereador</Label>
                    <Select value={vereadorFala || ''} onValueChange={setVereadorFala}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o vereador" />
                      </SelectTrigger>
                      <SelectContent>
                        {presencas
                          .filter((p) => p.presente)
                          .map((p) => (
                            <SelectItem key={p.vereador_id} value={p.vereador_id}>
                              {p.vereador?.nome_parlamentar || p.vereador?.nome}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Tipo</Label>
                    <Select value={tipoFala} onValueChange={setTipoFala}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="discussao">Discussão</SelectItem>
                        <SelectItem value="aparte">Aparteamento</SelectItem>
                        <SelectItem value="ordem">Questão de Ordem</SelectItem>
                        <SelectItem value="tribuna">Tribuna Livre</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Tempo (minutos)</Label>
                    <div className="flex gap-2 mb-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setTempoFalaMinutos(5)}
                        className={tempoFalaMinutos === 5 ? 'bg-primary/10' : ''}
                      >
                        5 min
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setTempoFalaMinutos(15)}
                        className={tempoFalaMinutos === 15 ? 'bg-primary/10' : ''}
                      >
                        15 min
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setTempoFalaMinutos((prev) => prev + 1)}
                      >
                        +1 min
                      </Button>
                    </div>
                    <Input
                      type="number"
                      value={tempoFalaMinutos}
                      onChange={(e) => setTempoFalaMinutos(Number(e.target.value))}
                      min={1}
                      step={1}
                    />
                  </div>
                  <Button
                    className="w-full"
                    onClick={handleIniciarFala}
                    disabled={
                      !vereadorFala || !!tempoFalaAtual || sessao.status !== 'em_andamento'
                    }
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Conceder Palavra
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="manchetes">
            <HeadlinesManagement
              sessaoId={sessao.id}
              manchetes={manchetes}
              readonly={sessao.status === 'encerrada'}
              onChange={refetch.manchetes}
            />
          </TabsContent>
        </Tabs>

        <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir Sessão</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir esta sessão ao vivo? Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteSessao}
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

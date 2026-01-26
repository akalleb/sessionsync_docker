import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Users,
  Vote,
  Clock,
  FileText,
  Mic,
  AlertCircle,
  Play,
  Hand,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SessionPhaseIndicator } from '@/components/sessao/SessionPhaseIndicator';
import { AgendaManagement } from '@/components/sessao/AgendaManagement';
import { useSessaoRealtime } from '@/hooks/useSessaoRealtime';
import { useFasesSessao } from '@/hooks/useFasesSessao';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { SessaoPauta, SolicitacaoFala } from '@/types/sessao';

export default function SessaoVereador() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile } = useAuth();
  const { sessao, presencas, votacaoAtual, votos, pauta, tempoFalaAtual, loading, refetch } =
    useSessaoRealtime(id || null);
  const { fases } = useFasesSessao();
  
  const [vereadorAtual, setVereadorAtual] = useState<{ id: string; nome: string; nome_parlamentar?: string | null } | null>(null);
  const [solicitacaoAtiva, setSolicitacaoAtiva] = useState<SolicitacaoFala | null>(null);
  const [submittingVote, setSubmittingVote] = useState(false);
  const [activeTab, setActiveTab] = useState('pauta');

  // Identificar vereador logado
  useEffect(() => {
    const identificarVereador = async () => {
      if (!profile?.user_id) return;
      
      const { data, error } = await supabase
        .from('vereadores')
        .select('id, nome, nome_parlamentar')
        .eq('user_id', profile.user_id)
        .single();

      if (data) {
        setVereadorAtual(data);
      } else {
        console.warn('Usuário logado não vinculado a um vereador:', profile.user_id);
      }
    };
    
    identificarVereador();
  }, [profile?.user_id]);

  // Monitorar solicitações de fala do vereador e marcar presença automática
  useEffect(() => {
    if (!id || !vereadorAtual) return;

    // Marcar presença automaticamente ao entrar na sessão
    const marcarPresenca = async () => {
      // Verifica se a lista de presenças já foi carregada
      if (!presencas || presencas.length === 0) {
        console.log('Aguardando lista de presenças...');
        return;
      }

      const presencaAtual = presencas.find(p => p.vereador_id === vereadorAtual.id);
      
      console.log('Verificando presença:', { 
        vereador: vereadorAtual.nome, 
        status: presencaAtual ? (presencaAtual.presente ? 'Presente' : 'Ausente') : 'Não encontrado na lista' 
      });

      // Se a presença existe mas está como ausente, atualiza para presente
      if (presencaAtual && !presencaAtual.presente) {
        const { error } = await supabase
          .from('sessao_presencas')
          .update({
            presente: true,
            hora_chegada: new Date().toTimeString().split(' ')[0],
          })
          .eq('sessao_id', id)
          .eq('vereador_id', vereadorAtual.id);
          
        if (error) {
          console.error('Erro ao marcar presença:', error);
          toast({ title: 'Erro ao confirmar presença', description: error.message, variant: 'destructive' });
        } else {
          toast({ title: 'Presença confirmada automaticamente!' });
        }
      }
    };

    if (presencas.length > 0) {
      marcarPresenca();
    }

    const fetchSolicitacao = async () => {
      const { data } = await supabase
        .from('solicitacoes_fala')
        .select('*')
        .eq('sessao_id', id)
        .eq('vereador_id', vereadorAtual.id)
        .eq('status', 'pendente')
        .maybeSingle();
      
      setSolicitacaoAtiva(data as SolicitacaoFala | null);
    };

    fetchSolicitacao();

    const channel = supabase
      .channel(`solicitacoes-${id}-${vereadorAtual.id}`)
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'solicitacoes_fala', 
          filter: `sessao_id=eq.${id} AND vereador_id=eq.${vereadorAtual.id}` 
        },
        () => fetchSolicitacao()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, vereadorAtual, presencas, toast]);

  const handleSolicitarFala = async (tipo: 'discussao' | 'aparte' | 'ordem' | 'tribuna') => {
    if (!sessao || !vereadorAtual) return;

    if (solicitacaoAtiva) {
      toast({ title: 'Você já tem uma solicitação pendente', variant: 'destructive' });
      return;
    }

    const { error } = await supabase.from('solicitacoes_fala').insert({
      sessao_id: sessao.id,
      vereador_id: vereadorAtual.id,
      tipo,
      status: 'pendente'
    });

    if (error) {
      toast({ title: 'Erro ao solicitar fala', variant: 'destructive' });
    } else {
      toast({ title: 'Solicitação enviada à Mesa' });
    }
  };

  const handleCancelarSolicitacao = async () => {
    if (!solicitacaoAtiva) return;

    await supabase
      .from('solicitacoes_fala')
      .update({ status: 'cancelada' })
      .eq('id', solicitacaoAtiva.id);
      
    toast({ title: 'Solicitação cancelada' });
  };

  const handleVotar = async (voto: 'favor' | 'contra' | 'abstencao') => {
    if (!votacaoAtual || !vereadorAtual) return;
    setSubmittingVote(true);

    try {
      // Verificar se já votou
      const { data: votoExistente } = await supabase
        .from('votos')
        .select('id')
        .eq('votacao_id', votacaoAtual.id)
        .eq('vereador_id', vereadorAtual.id)
        .maybeSingle();

      if (votoExistente) {
        toast({ title: 'Você já registrou seu voto!', variant: 'destructive' });
        return;
      }

      const { error } = await supabase.from('votos').insert({
        votacao_id: votacaoAtual.id,
        vereador_id: vereadorAtual.id,
        voto,
      });

      if (error) throw error;

      // Atualizar contagem na votação (trigger faz isso? se não, manual)
      // O código original fazia update manual, vamos manter consistência
      const field = voto === 'favor' ? 'votos_favor' : voto === 'contra' ? 'votos_contra' : 'abstencoes';
      const { error: rpcError } = await supabase.rpc('increment_vote', { 
        row_id: votacaoAtual.id, 
        field_name: field 
      });

      if (rpcError) {
        const { data: current } = await supabase
          .from('votacoes')
          .select(field)
          .eq('id', votacaoAtual.id)
          .single();

        if (current) {
          await supabase
            .from('votacoes')
            .update({ [field]: (current[field as keyof typeof current] as number) + 1 })
            .eq('id', votacaoAtual.id);
        }
      }

      toast({ title: 'Voto registrado com sucesso!' });
    } catch (error) {
      console.error(error);
      toast({ title: 'Erro ao registrar voto', variant: 'destructive' });
    } finally {
      setSubmittingVote(false);
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
            Voltar
          </Button>
        </div>
      </MainLayout>
    );
  }

  // Verifica se o usuário é realmente um vereador desta câmara
  if (!vereadorAtual) {
    return (
      <MainLayout>
        <div className="p-8 text-center">
          <Alert variant="destructive" className="max-w-md mx-auto">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Acesso Restrito</AlertTitle>
            <AlertDescription>
              Seu usuário não está vinculado a um cadastro de vereador. Entre em contato com a administração.
            </AlertDescription>
          </Alert>
          <Button onClick={() => navigate('/sessoes')} className="mt-4">
            Voltar
          </Button>
        </div>
      </MainLayout>
    );
  }

  const meuVoto = votos.find(v => v.vereador_id === vereadorAtual.id);

  return (
    <MainLayout>
      <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
        {/* Cabeçalho Simplificado */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">{sessao.titulo}</h1>
            <Badge className={sessao.status === 'em_andamento' ? 'bg-green-500' : ''}>
              {sessao.status === 'em_andamento' ? 'AO VIVO' : sessao.status.replace('_', ' ').toUpperCase()}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            Bem-vindo, Vereador {vereadorAtual.nome_parlamentar || vereadorAtual.nome}
          </p>
        </div>

        <SessionPhaseIndicator
          faseAtual={sessao.fase_atual}
          fases={fases}
          readonly={true}
        />

        {/* ALERTA DE VOTAÇÃO - Se houver votação ativa, aparece em destaque */}
        {votacaoAtual && (
          <Card className="border-2 border-primary animate-pulse-border shadow-lg">
            <CardHeader className="bg-primary/5">
              <CardTitle className="flex items-center gap-2 text-primary">
                <Vote className="h-6 w-6" />
                VOTAÇÃO EM ANDAMENTO
              </CardTitle>
              <CardDescription className="text-lg font-medium text-foreground">
                {votacaoAtual.titulo}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              {votacaoAtual.descricao && (
                <p className="mb-6 text-muted-foreground">{votacaoAtual.descricao}</p>
              )}

              {meuVoto ? (
                <div className="flex flex-col items-center justify-center py-4 gap-2">
                  <CheckCircle2 className="h-12 w-12 text-green-500" />
                  <p className="text-lg font-medium">Voto Registrado: {meuVoto.voto.toUpperCase()}</p>
                  <p className="text-sm text-muted-foreground">Aguarde o encerramento da votação.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Button 
                    className="h-20 text-lg bg-green-600 hover:bg-green-700" 
                    onClick={() => handleVotar('favor')}
                    disabled={submittingVote}
                  >
                    FAVORÁVEL
                  </Button>
                  <Button 
                    className="h-20 text-lg bg-red-600 hover:bg-red-700" 
                    onClick={() => handleVotar('contra')}
                    disabled={submittingVote}
                  >
                    CONTRÁRIO
                  </Button>
                  <Button 
                    className="h-20 text-lg bg-gray-500 hover:bg-gray-600" 
                    onClick={() => handleVotar('abstencao')}
                    disabled={submittingVote}
                  >
                    ABSTENÇÃO
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Se o vereador estiver falando agora */}
        {tempoFalaAtual?.vereador_id === vereadorAtual.id && (
           <Card className="bg-green-50 border-green-200">
             <CardContent className="flex items-center justify-between p-6">
               <div className="flex items-center gap-4">
                 <Mic className="h-8 w-8 text-green-600 animate-pulse" />
                 <div>
                   <h3 className="text-xl font-bold text-green-800">PALAVRA CONCEDIDA</h3>
                   <p className="text-green-700">Você está com a palavra ({tempoFalaAtual.tipo})</p>
                 </div>
               </div>
               <div className="text-3xl font-mono font-bold text-green-900">
                 {/* Aqui poderia ter um timer local sincronizado */}
                 AO VIVO
               </div>
             </CardContent>
           </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Painel Principal */}
          <div className="md:col-span-2 space-y-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="w-full">
                <TabsTrigger value="pauta" className="flex-1">Pauta / Rito</TabsTrigger>
                <TabsTrigger value="ata" className="flex-1">Ata Anterior</TabsTrigger>
              </TabsList>
              
              <TabsContent value="pauta">
                <AgendaManagement
                  sessaoId={sessao.id}
                  pauta={pauta as SessaoPauta[]}
                  faseAtual={sessao.fase_atual}
                  fases={fases}
                  onRefetch={refetch.pauta}
                  readonly={true}
                />
              </TabsContent>
              
              <TabsContent value="ata">
                <Card>
                  <CardHeader>
                    <CardTitle>Ata da Sessão Anterior</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">Visualização da ata não disponível neste MVP.</p>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Painel Lateral - Ações Rápidas */}
          <div className="space-y-6">
            {/* Solicitação de Fala */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Hand className="h-5 w-5" />
                  Pedir a Palavra
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {solicitacaoAtiva ? (
                  <div className="bg-secondary p-4 rounded-lg text-center space-y-3">
                    <p className="font-medium">Solicitação Enviada</p>
                    <Badge variant="outline" className="text-sm">
                      {solicitacaoAtiva.tipo.toUpperCase()}
                    </Badge>
                    <p className="text-xs text-muted-foreground">Aguarde a Mesa conceder a palavra.</p>
                    <Button variant="outline" size="sm" onClick={handleCancelarSolicitacao} className="w-full">
                      Cancelar
                    </Button>
                  </div>
                ) : (
                  <>
                    <Button 
                      variant="outline" 
                      className="w-full justify-start gap-2" 
                      onClick={() => handleSolicitarFala('discussao')}
                      disabled={tempoFalaAtual?.vereador_id === vereadorAtual.id}
                    >
                      <Users className="h-4 w-4" />
                      Pela Ordem / Discussão
                    </Button>
                    <Button 
                      variant="outline" 
                      className="w-full justify-start gap-2" 
                      onClick={() => handleSolicitarFala('aparte')}
                      disabled={tempoFalaAtual?.vereador_id === vereadorAtual.id}
                    >
                      <Mic className="h-4 w-4" />
                      Solicitar Aparte
                    </Button>
                    <Button 
                      variant="outline" 
                      className="w-full justify-start gap-2" 
                      onClick={() => handleSolicitarFala('ordem')}
                      disabled={tempoFalaAtual?.vereador_id === vereadorAtual.id}
                    >
                      <AlertCircle className="h-4 w-4" />
                      Questão de Ordem
                    </Button>
                    
                    <div className="pt-2 border-t mt-2">
                      <Button
                        variant="ghost"
                        className="w-full justify-start gap-2 text-primary hover:text-primary hover:bg-primary/10 font-medium"
                        onClick={() => handleSolicitarFala('tribuna')}
                        disabled={tempoFalaAtual?.vereador_id === vereadorAtual.id}
                      >
                        <FileText className="h-4 w-4" />
                        Inscrever-se na Tribuna
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Status de Presença */}
            <Card>
              <CardHeader>
                <CardTitle>Sua Presença</CardTitle>
              </CardHeader>
              <CardContent>
                {presencas.find(p => p.vereador_id === vereadorAtual.id)?.presente ? (
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle2 className="h-5 w-5" />
                    <span className="font-medium">Presença Confirmada</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <XCircle className="h-5 w-5" />
                    <span>Ausente</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}

import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Sessao, SessaoPresenca, Votacao, Voto, SessaoPauta, TempoFala, SolicitacaoFala, SessaoManchete } from '@/types/sessao';
import { useToast } from '@/hooks/use-toast';

interface SessaoRealtimeOptions {
  enablePolling?: boolean;
  pollingIntervalMs?: number;
}

export function useSessaoRealtime(sessaoId: string | null, options?: SessaoRealtimeOptions) {
  const { toast } = useToast();
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [presencas, setPresencas] = useState<SessaoPresenca[]>([]);
  const [votacaoAtual, setVotacaoAtual] = useState<Votacao | null>(null);
  const [votos, setVotos] = useState<Voto[]>([]);
  const [pauta, setPauta] = useState<SessaoPauta[]>([]);
  const [tempoFalaAtual, setTempoFalaAtual] = useState<TempoFala | null>(null);
  const [solicitacoesFala, setSolicitacoesFala] = useState<SolicitacaoFala[]>([]);
  const [manchetes, setManchetes] = useState<SessaoManchete[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSessao = useCallback(async () => {
    if (!sessaoId) return;

    const { data, error } = await supabase
      .from('sessoes')
      .select(`
        *,
        camara:camaras (
          nome,
          logo_url
        )
      `)
      .eq('id', sessaoId)
      .single();

    if (error) {
      console.error('Erro ao buscar sessão:', error);
      return;
    }

    console.log('Sessao Data:', data); // Debug log

    if (data.camara && Array.isArray(data.camara)) {
      data.camara = data.camara[0];
    }

    // Fallback: If join failed but we have camara_id, fetch camara details
    if (data && !data.camara && data.camara_id) {
      console.log('Fetching camara fallback for:', data.camara_id); // Debug log
      const { data: camaraData, error: camaraError } = await supabase
        .from('camaras')
        .select('*') // Select all to be safe
        .eq('id', data.camara_id)
        .single();
      
      if (camaraError) {
        console.error('Erro no fallback camara:', camaraError); // Debug log
      }

      if (camaraData) {
        console.log('Fallback camara data:', camaraData); // Debug log
        data.camara = camaraData;
      }
    }

    setSessao(data as Sessao);
  }, [sessaoId]);

  const fetchPresencas = useCallback(async () => {
    if (!sessaoId) return;

    const { data, error } = await supabase
      .from('sessao_presencas')
      .select(`
        *,
        vereador:vereadores(
          id, nome, nome_parlamentar, foto_url, cargo_mesa,
          partido:partidos(sigla, cor)
        )
      `)
      .eq('sessao_id', sessaoId);

    if (error) {
      console.error('Erro ao buscar presenças:', error);
      return;
    }

    setPresencas(data as unknown as SessaoPresenca[]);
  }, [sessaoId]);

  const fetchVotacaoAtual = useCallback(async () => {
    if (!sessaoId) return;

    const { data, error } = await supabase
      .from('votacoes')
      .select('*')
      .eq('sessao_id', sessaoId)
      .eq('status', 'em_andamento')
      .maybeSingle();

    if (error) {
      console.error('Erro ao buscar votação:', error);
      return;
    }

    setVotacaoAtual(data as Votacao | null);

    if (data) {
      const { data: votosData } = await supabase
        .from('votos')
        .select(`
          *,
          vereador:vereadores(
            id, nome, nome_parlamentar, foto_url,
            partido:partidos(sigla, cor)
          )
        `)
        .eq('votacao_id', (data as Votacao).id);

      setVotos((votosData as unknown as Voto[]) || []);
    }
  }, [sessaoId]);

  const fetchPauta = useCallback(async () => {
    if (!sessaoId) return;

    const { data, error } = await supabase
      .from('sessao_pauta')
      .select('*')
      .eq('sessao_id', sessaoId)
      .order('fase')
      .order('ordem');

    if (error) {
      console.error('Erro ao buscar pauta:', error);
      return;
    }

    setPauta(data as SessaoPauta[]);
  }, [sessaoId]);

  const fetchTempoFalaAtual = useCallback(async () => {
    if (!sessaoId) return;

    const { data, error } = await supabase
      .from('tempo_fala')
      .select(`
        *,
        vereador:vereadores(
          id, nome, nome_parlamentar, foto_url,
          partido:partidos(sigla, cor)
        )
      `)
      .eq('sessao_id', sessaoId)
      .is('fim', null)
      .not('inicio', 'is', null)
      .maybeSingle();

    if (error) {
      console.error('Erro ao buscar tempo de fala:', error);
      return;
    }

    setTempoFalaAtual(data as unknown as TempoFala | null);
  }, [sessaoId]);

  const fetchSolicitacoesFala = useCallback(async () => {
    if (!sessaoId) return;

    const { data, error } = await supabase
      .from('solicitacoes_fala')
      .select(`
        *,
        vereador:vereadores(id, nome, nome_parlamentar, partido:partidos(sigla))
      `)
      .eq('sessao_id', sessaoId)
      .eq('status', 'pendente')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Erro ao buscar solicitações de fala:', error);
      return;
    }
    
    setSolicitacoesFala(data as SolicitacaoFala[] || []);
  }, [sessaoId]);

  const fetchManchetes = useCallback(async () => {
    if (!sessaoId) return;

    const { data, error } = await supabase
      .from('sessao_manchetes')
      .select('*')
      .eq('sessao_id', sessaoId)
      .order('ordem', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      // Ignorar erro 404 (tabela ainda não criada) para não sujar o console
      if (error.code !== '404' && error.code !== 'PGRST301') {
         console.warn('Erro ao buscar manchetes (pode ser que a tabela não exista):', error);
      }
      return;
    }

    setManchetes(data as SessaoManchete[] || []);
  }, [sessaoId]);

  useEffect(() => {
    if (!sessaoId) {
      setLoading(false);
      return;
    }

    const loadData = async () => {
      setLoading(true);
      await Promise.all([
        fetchSessao(),
        fetchPresencas(),
        fetchVotacaoAtual(),
        fetchPauta(),
        fetchTempoFalaAtual(),
        fetchSolicitacoesFala(),
        fetchManchetes(),
      ]);
      setLoading(false);
    };

    loadData();
  }, [sessaoId, fetchSessao, fetchPresencas, fetchVotacaoAtual, fetchPauta, fetchTempoFalaAtual, fetchSolicitacoesFala, fetchManchetes]);

  useEffect(() => {
    if (!sessaoId || !options?.enablePolling) return;

    const interval = setInterval(() => {
      fetchSessao();
      fetchPresencas();
      fetchVotacaoAtual();
      fetchPauta();
      fetchTempoFalaAtual();
      fetchSolicitacoesFala();
      fetchManchetes();
    }, options.pollingIntervalMs ?? 3000);

    return () => clearInterval(interval);
  }, [
    sessaoId,
    options?.enablePolling,
    options?.pollingIntervalMs,
    fetchSessao,
    fetchPresencas,
    fetchVotacaoAtual,
    fetchPauta,
    fetchTempoFalaAtual,
    fetchSolicitacoesFala,
    fetchManchetes,
  ]);

  useEffect(() => {
    if (!sessaoId) return;

    const channel = supabase
      .channel(`sessao-${sessaoId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sessoes', filter: `id=eq.${sessaoId}` },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            // Refetch to get joined data (camara, etc)
            fetchSessao();
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sessao_presencas', filter: `sessao_id=eq.${sessaoId}` },
        () => fetchPresencas()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'votacoes', filter: `sessao_id=eq.${sessaoId}` },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const votacao = payload.new as Votacao;
            if (votacao.status === 'em_andamento') {
              setVotacaoAtual(votacao);
              toast({
                title: 'Nova votação iniciada',
                description: votacao.titulo,
              });
            } else if (votacao.status === 'encerrada') {
              setVotacaoAtual(null);
              toast({
                title: 'Votação encerrada',
                description: `Resultado: ${votacao.resultado?.toUpperCase()}`,
              });
            }
          }
          fetchVotacaoAtual();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'votos' },
        () => fetchVotacaoAtual()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sessao_pauta', filter: `sessao_id=eq.${sessaoId}` },
        () => fetchPauta()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tempo_fala', filter: `sessao_id=eq.${sessaoId}` },
        () => fetchTempoFalaAtual()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'solicitacoes_fala', filter: `sessao_id=eq.${sessaoId}` },
        (payload) => {
            if (payload.eventType === 'INSERT') {
                toast({ title: 'Nova solicitação de fala recebida' });
            }
            fetchSolicitacoesFala();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sessao_manchetes', filter: `sessao_id=eq.${sessaoId}` },
        () => fetchManchetes()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessaoId, fetchSessao, fetchPresencas, fetchVotacaoAtual, fetchPauta, fetchTempoFalaAtual, fetchSolicitacoesFala, fetchManchetes, toast]);

  const refetch = useMemo(() => ({
    sessao: fetchSessao,
    presencas: fetchPresencas,
    votacao: fetchVotacaoAtual,
    pauta: fetchPauta,
    tempoFala: fetchTempoFalaAtual,
    solicitacoesFala: fetchSolicitacoesFala,
    manchetes: fetchManchetes,
  }), [fetchSessao, fetchPresencas, fetchVotacaoAtual, fetchPauta, fetchTempoFalaAtual, fetchSolicitacoesFala, fetchManchetes]);

  return {
    sessao,
    presencas,
    votacaoAtual,
    votos,
    pauta,
    tempoFalaAtual,
    solicitacoesFala,
    manchetes,
    loading,
    refetch,
  };
}

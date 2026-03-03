import { useState, useEffect, useCallback } from 'react';
import { TranscriptionBlock } from '@/types/transcription';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ProfileWithPreferences {
    nome: string | null;
    cargo: string | null;
    preferences: {
        vereador?: {
            apelido?: string | null;
        };
    } | null;
}

interface CamaraInfo {
    nome: string;
    logo_url: string | null;
}

export interface SessionData {
    sessionTitle: string;
    setSessionTitle: (title: string) => void;
    sessionDate: string;
    audioUrl: string | null;
    setAudioUrl: (url: string | null) => void;
    youtubeUrl: string | null;
    blocks: TranscriptionBlock[];
    setBlocks: (blocks: TranscriptionBlock[]) => void;
    minutesContent: string;
    setMinutesContent: (content: string) => void;
    fullTranscript: string;
    nameHints: string;
    nameMap: Array<{ official: string; aliases: string[] }>;
    camaraInfo: CamaraInfo | null;
    isLoading: boolean;
    refetch: () => void;
}

export function useSessionData(id: string | undefined): SessionData {
    const [blocks, setBlocks] = useState<TranscriptionBlock[]>([]);
    const [minutesContent, setMinutesContent] = useState('');
    const [fullTranscript, setFullTranscript] = useState('');
    const [sessionTitle, setSessionTitle] = useState('');
    const [sessionDate, setSessionDate] = useState('');
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [youtubeUrl, setYoutubeUrl] = useState<string | null>(null);
    const [nameHints, setNameHints] = useState('');
    const [nameMap, setNameMap] = useState<Array<{ official: string; aliases: string[] }>>([]);
    const [camaraInfo, setCamaraInfo] = useState<CamaraInfo | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const fetchNameHintsForCamara = useCallback(async (camaraId: string) => {
        const { data, error } = await supabase
            .from('profiles')
            .select('nome, cargo, preferences')
            .eq('camara_id', camaraId)
            .ilike('cargo', 'Vereador%')
            .eq('ativo', true)
            .order('nome');

        if (error) throw error;

        const lines: string[] = [];
        const nextNameMap: Array<{ official: string; aliases: string[] }> = [];
        const rows = (data || []) as ProfileWithPreferences[];
        for (const row of rows) {
            const prefs = row.preferences || {};
            const vereador = prefs.vereador || {};
            const apelido = typeof vereador.apelido === 'string' ? vereador.apelido.trim() : '';
            const nome = row.nome ? row.nome.trim() : '';
            if (!nome) continue;
            if (apelido) lines.push(`- ${nome} (apelido: ${apelido})`);
            else lines.push(`- ${nome}`);
            if (apelido) nextNameMap.push({ official: nome, aliases: [apelido] });
        }

        setNameHints(lines.join('\n'));
        setNameMap(nextNameMap);
    }, []);

    const fetchCamaraInfo = useCallback(async (camaraId: string) => {
        const { data, error } = await supabase
            .from('camaras')
            .select('nome, logo_url')
            .eq('id', camaraId)
            .single();

        if (error) throw error;
        setCamaraInfo(data);
    }, []);

    const fetchSessionData = useCallback(async (sessionId: string) => {
        try {
            setIsLoading(true);
            const { data, error } = await supabase
                .from('sessions')
                .select('*')
                .eq('id', sessionId)
                .maybeSingle();

            if (error) throw error;

            if (!data) {
                toast.error('Sessão não encontrada ou acesso negado.');
                return;
            }

            setSessionTitle(data.title);
            setSessionDate(data.date);
            setAudioUrl(data.audio_url);
            setYoutubeUrl(data.youtube_url);
            setFullTranscript(data.transcript || '');
            setNameHints('');
            setNameMap([]);

            if (data.blocks && Array.isArray(data.blocks) && data.blocks.length > 0) {
                const rawBlocks = data.blocks as unknown as TranscriptionBlock[];
                const normalizedBlocks = rawBlocks.map((b) => {
                    const summary =
                        typeof b.summary === 'string' || typeof b.summary === 'undefined' || b.summary === null
                            ? b.summary
                            : JSON.stringify(b.summary);
                    return { ...b, summary };
                });
                setBlocks(normalizedBlocks);
            } else {
                setBlocks([]);
            }

            if (data.final_minutes) {
                setMinutesContent(data.final_minutes);
            }

            if (data.camara_id) {
                fetchNameHintsForCamara(data.camara_id).catch((err) => {
                    console.error('Erro ao carregar lista de vereadores:', err);
                    toast.warning('Não foi possível carregar lista de vereadores para padronizar nomes.');
                });
                fetchCamaraInfo(data.camara_id).catch((err) => {
                    console.error('Erro ao carregar dados da câmara:', err);
                });
            } else {
                setCamaraInfo(null);
            }
        } catch (error) {
            console.error('Error fetching session:', error);
            toast.error('Erro ao carregar dados da sessão');
        } finally {
            setIsLoading(false);
        }
    }, [fetchNameHintsForCamara, fetchCamaraInfo]);

    useEffect(() => {
        if (id) {
            fetchSessionData(id);
        }
    }, [id, fetchSessionData]);

    const refetch = useCallback(() => {
        if (id) fetchSessionData(id);
    }, [id, fetchSessionData]);

    return {
        sessionTitle,
        setSessionTitle,
        sessionDate,
        audioUrl,
        setAudioUrl,
        youtubeUrl,
        blocks,
        setBlocks,
        minutesContent,
        setMinutesContent,
        fullTranscript,
        nameHints,
        nameMap,
        camaraInfo,
        isLoading,
        refetch,
    };
}

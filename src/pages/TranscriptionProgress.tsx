import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { TranscriptionProgress as ProgressComponent } from '@/components/transcription/TranscriptionProgress';
import { Button } from '@/components/ui/button';
import { ArrowRight, XCircle } from 'lucide-react';
import { apiCall } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { TranscriptionBlock, blockTypeLabels } from '@/types/transcription';
import { useAuth } from '@/hooks/use-auth';

interface AssemblyChapter {
  headline: string;
  summary?: string;
  gist?: string;
  start: number;
  end: number;
}

interface MappedUtterance {
  start?: number;
  end?: number;
  vereadorApelido?: string | null;
  vereadorNome?: string | null;
  speaker?: string | null;
  text?: string;
}

function formatTimestamp(ms: number): string {
  if (typeof ms !== 'number' || isNaN(ms)) return "00:00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function mapChaptersToBlocks(
  chapters: AssemblyChapter[],
  mappedUtterances?: MappedUtterance[] | null
): TranscriptionBlock[] {
  return chapters.map((chapter, index) => {
    let speaker: string | undefined;
    let timestamp_ms: number = chapter.start;
    let timestamp_estimated = false;

    if (Array.isArray(mappedUtterances) && mappedUtterances.length > 0) {
      // Find utterances that overlap with the chapter time range
      const overlaps = mappedUtterances.filter((u) => {
        const us = typeof u.start === 'number' ? u.start : undefined;
        const ue = typeof u.end === 'number' ? u.end : undefined;
        if (us === undefined || ue === undefined) return false;
        // Check for intersection
        return us < chapter.end && ue > chapter.start;
      });

      if (overlaps.length > 0) {
        // Use the start time of the first utterance in the block as the accurate timestamp
        const minStart = Math.min(...overlaps.map(u => u.start as number));
        timestamp_ms = minStart;

        // Determine predominant speaker based on duration overlap
        const scores = new Map<string, number>();

        for (const u of overlaps) {
          const apelido = typeof u.vereadorApelido === 'string' && u.vereadorApelido.trim().length > 0
              ? u.vereadorApelido.trim() : '';
          const nome = typeof u.vereadorNome === 'string' && u.vereadorNome.trim().length > 0
              ? u.vereadorNome.trim() : '';
          const speakerLabel = typeof u.speaker === 'string' && u.speaker.trim().length > 0
              ? u.speaker.trim() : '';

          const name = apelido || nome || speakerLabel;
          if (!name) continue;

          // Calculate intersection duration
          const overlapStart = Math.max(u.start!, chapter.start);
          const overlapEnd = Math.min(u.end!, chapter.end);
          const dur = Math.max(0, overlapEnd - overlapStart);

          scores.set(name, (scores.get(name) ?? 0) + dur);
        }

        let bestName: string | undefined;
        let bestScore = -1;

        scores.forEach((score, name) => {
          if (score > bestScore) {
            bestScore = score;
            bestName = name;
          }
        });

        speaker = bestName;
      } else {
        timestamp_estimated = true;
      }
    } else {
        timestamp_estimated = true;
    }

    return {
      id: `block-${Date.now()}-${index}`,
      type: 'outros',
      title: chapter.headline || blockTypeLabels.outros,
      content: chapter.summary || chapter.gist || '',
      timestamp: formatTimestamp(timestamp_ms),
      timestamp_ms: timestamp_ms,
      timestamp_estimated: timestamp_estimated,
      order: index,
      speaker,
    };
  });
}

export default function TranscriptionProgressPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { profile } = useAuth();
  
  const [currentStep, setCurrentStep] = useState(1);
  const [progress, setProgress] = useState(10);
  const [status, setStatus] = useState<string>('queued');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [estimatedTime, setEstimatedTime] = useState<string>('Iniciando...');
  const [savedSessionId, setSavedSessionId] = useState<string | null>(null);
  
  const [sessionTitle, setSessionTitle] = useState('');
  const [sessionDate, setSessionDate] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    const savedTitle = localStorage.getItem('pending_session_title');
    const savedDate = localStorage.getItem('pending_session_date');
    const savedYoutube = localStorage.getItem('pending_youtube_url');
    const savedAudio = localStorage.getItem('pending_audio_url');

    if (savedTitle) setSessionTitle(savedTitle);
    if (savedDate) setSessionDate(savedDate);
    if (savedYoutube) setYoutubeUrl(savedYoutube);
    if (savedAudio) setAudioUrl(savedAudio);
  }, []);

  const saveSession = useCallback(
    async (transcriptText: string, blocks: TranscriptionBlock[] = []) => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData.user?.id;

        if (!userId) {
            toast.error("Usuário não autenticado");
            return null;
        }

        const title = sessionTitle || 'Sessão Sem Título';
        const dateValue = sessionDate || new Date().toISOString();

        let query = supabase
          .from('sessions')
          .select('id')
          .eq('title', title)
          .eq('date', dateValue)
          .eq('user_id', userId)
          .limit(1);

        if (profile?.camara_id) {
          query = query.eq('camara_id', profile.camara_id);
        }

        const { data: existingList, error: existingError } = await query;

        if (existingError) {
          console.error('Error checking existing session:', existingError);
        }

        const payload = {
            userId: userId,
            title,
            date: dateValue,
            status: 'completed',
            duration: null,
            audio_url: audioUrl,
            youtube_url: youtubeUrl || null,
            transcript: transcriptText,
            blocks: (blocks.length > 0 ? blocks : []),
            camara_id: profile?.camara_id || null
        };

        const result = await apiCall('/save-session', payload);

        if (!result || !result.success || !result.data) {
          const msg = result?.error || 'Erro desconhecido ao salvar sessão.';
          console.error("Error saving session via backend:", msg);
          toast.error(`Falha ao salvar: ${msg}`);
          return { error: msg };
        }

        const sessionData = result.data;

        if (sessionData) {
          try {
             apiCall('/ingest-session', { sessionId: sessionData.id });
             toast.info('Ingerindo dados para o Assistente...', { duration: 3000 });
          } catch(e) { console.error('Auto-ingest error', e); }

          localStorage.removeItem('pending_transcript_id');
          localStorage.removeItem('pending_session_title');
          localStorage.removeItem('pending_session_date');
          localStorage.removeItem('pending_youtube_url');
          localStorage.removeItem('pending_audio_url');

          setCurrentStep(4); 
          setProgress(100);
          setEstimatedTime('Concluído!');
          
          return { id: sessionData.id };
        }
      } catch (err: any) {
        console.error(err);
        const msg = err.message || 'Erro inesperado.';
        toast.error(`Erro ao salvar: ${msg}`);
        return { error: msg };
      }
    },
    [audioUrl, sessionDate, sessionTitle, youtubeUrl, profile]
  );

  useEffect(() => {
    if (!id) return;

    const interval = window.setInterval(async () => {
      try {
        const data = await apiCall('/assembly-status', { id });

        if (!data) return;

        const newStatus = data.status as string;
        setStatus(newStatus);

        if (newStatus === 'queued') {
            setProgress(15);
            setEstimatedTime('Na fila de processamento...');
        } else if (newStatus === 'processing') {
            setProgress(prev => {
                if (prev < 90) return prev + Math.random() * 2;
                return prev;
            });
            setEstimatedTime('Processando áudio...');
        } else if (newStatus === 'completed') {
            window.clearInterval(interval);
            setProgress(95);
            setEstimatedTime('Finalizando...');
            
            setCurrentStep(2);
            await new Promise(r => setTimeout(r, 1500)); 
            
             if (data.text) {
                 setCurrentStep(3); // Organize
                 
                 let normalizedText = data.text as string;
                 let mappedUtterances: MappedUtterance[] | null = null;

                 try {
                     if (profile?.camara_id) {
                         const norm = await apiCall('/normalize-transcript-text', {
                             text: normalizedText,
                             camaraId: profile.camara_id,
                         });
                         if (norm?.text && typeof norm.text === 'string') {
                             normalizedText = norm.text;
                         }
                     }
                 } catch (e) {
                     console.error('Error normalizing transcript text:', e);
                 }

                 try {
                     // Try to map speakers even if not mapped to Vereadores yet, to get speaker labels
                     if (Array.isArray(data.utterances) && data.utterances.length > 0 && profile?.camara_id) {
                         const mappingResult = await apiCall('/map-utterances-speakers', {
                             audioUrl: audioUrl || 'youtube-audio', // Fallback for youtube
                             camaraId: profile.camara_id,
                             utterances: data.utterances,
                         });
                         if (mappingResult && Array.isArray(mappingResult.utterances)) {
                             mappedUtterances = mappingResult.utterances;
                         }
                     }
                 } catch (e) {
                     console.error('Error mapping speakers:', e);
                 }

                 let blocksToSave = data.chapters ? mapChaptersToBlocks(data.chapters, mappedUtterances) : [];

                 if (blocksToSave.length === 0) {
                    toast.info('Organizando transcrição com IA...', { duration: 4000 });
                    try {
                      const gptData = await apiCall('/process-transcript', {
                        transcript: normalizedText
                      });

                      if (gptData?.blocks) {
                        blocksToSave = gptData.blocks;
                      }
                    } catch (e) {
                      console.error('Error calling process-transcript:', e);
                    }
                 }

                 const result = await saveSession(normalizedText, blocksToSave);
                 
                 if (result && result.id) {
                     setSavedSessionId(result.id);
                 } else if (result && result.error) {
                     window.clearInterval(interval);
                     setStatus('error');
                     setErrorMessage(result.error);
                     toast.error('Erro crítico ao salvar. O processo foi interrompido.');
                 }
             } else {
                 toast.error("Transcrição vazia recebida.");
                 setStatus('error');
                 setErrorMessage("Transcrição vazia recebida do servidor.");
             }
        } else if (newStatus === 'error') {
            window.clearInterval(interval);
            const errMsg = data.error || 'Erro desconhecido durante transcrição.';
            toast.error(`Erro: ${errMsg}`);
            setStatus('error');
            setErrorMessage(errMsg);
        }
      } catch (err: any) {
          console.error("Polling error", err);
      }
    }, 5000);

    return () => window.clearInterval(interval);
  }, [id, saveSession, profile, audioUrl]);

  const handleCancel = () => {
    localStorage.removeItem('pending_transcript_id');
    localStorage.removeItem('pending_session_title');
    localStorage.removeItem('pending_session_date');
    localStorage.removeItem('pending_youtube_url');
    localStorage.removeItem('pending_audio_url');
    
    toast.info('Processo cancelado.');
    navigate('/upload');
  };

  const isComplete = currentStep === 4 && progress >= 100;

  return (
    <MainLayout>
      <div className="p-8 max-w-4xl mx-auto">
        <div className="mb-8 animate-fade-in">
          <h1 className="text-3xl font-bold text-foreground">
            {isComplete ? 'Transcrição Concluída!' : status === 'error' ? 'Erro na Transcrição' : 'Processando Transcrição...'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isComplete 
              ? 'Sua sessão está pronta para organização e edição'
              : status === 'error' 
                ? 'Ocorreu um problema durante o processamento.'
                : 'Aguarde enquanto processamos o áudio da sessão'
            }
          </p>
        </div>

        {errorMessage && (
            <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-600 dark:text-red-400">
                <p className="font-semibold">Erro Detalhado:</p>
                <p>{errorMessage}</p>
            </div>
        )}

        <div className="bg-card rounded-xl border border-border shadow-card p-8 mb-8 animate-slide-up">
          <div className="mb-8">
            <h2 className="font-semibold text-foreground mb-2">
              {sessionTitle || 'Nova Sessão'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {sessionDate ? new Date(sessionDate).toLocaleDateString('pt-BR') : 'Data não informada'} • Status: {status === 'queued' ? 'Na fila' : status === 'processing' ? 'Processando' : status === 'completed' ? 'Concluído' : status}
            </p>
          </div>

          <ProgressComponent
            currentStep={currentStep}
            progress={progress}
            estimatedTime={isComplete ? undefined : estimatedTime}
          />
        </div>

        <div className="flex items-center gap-4 animate-slide-up" style={{ animationDelay: '100ms' }}>
          {isComplete && savedSessionId ? (
            <Button
              variant="gradient"
              size="xl"
              className="flex-1 gap-3"
              onClick={() => navigate(`/session/${savedSessionId}/edit`)}
            >
              Organizar Blocos
              <ArrowRight className="w-5 h-5" />
            </Button>
          ) : (
            <>
              {(progress < 90 || status === 'error') && (
                  <Button
                    variant="destructive"
                    size="lg"
                    className="gap-2"
                    onClick={handleCancel}
                  >
                    <XCircle className="w-5 h-5" />
                    {status === 'error' ? 'Sair / Tentar Novamente' : 'Cancelar'}
                  </Button>
              )}
              <div className="flex-1" />
              <p className="text-sm text-muted-foreground">
                Se sair, a transcrição continuará em segundo plano.
              </p>
            </>
          )}
        </div>
      </div>
    </MainLayout>
  );
}

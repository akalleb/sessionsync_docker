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
import { Json } from '@/integrations/supabase/types';
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
}

function formatTimestamp(ms: number): string {
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

    if (Array.isArray(mappedUtterances) && mappedUtterances.length > 0) {
      const overlaps = mappedUtterances.filter((u) => {
        const us = typeof u.start === 'number' ? u.start : undefined;
        const ue = typeof u.end === 'number' ? u.end : undefined;
        if (us === undefined || ue === undefined) return false;
        return us < chapter.end && ue > chapter.start;
      });

      if (overlaps.length > 0) {
        const scores = new Map<string, number>();

        for (const u of overlaps) {
          const apelido =
            typeof u.vereadorApelido === 'string' && u.vereadorApelido.trim().length > 0
              ? u.vereadorApelido.trim()
              : '';
          const nome =
            typeof u.vereadorNome === 'string' && u.vereadorNome.trim().length > 0
              ? u.vereadorNome.trim()
              : '';
          const speakerLabel =
            typeof u.speaker === 'string' && u.speaker.trim().length > 0
              ? u.speaker.trim()
              : '';

          const name = apelido || nome || speakerLabel;
          if (!name) continue;

          const dur =
            typeof u.end === 'number' &&
            typeof u.start === 'number' &&
            u.end > u.start
              ? u.end - u.start
              : 1;

          scores.set(name, (scores.get(name) ?? 0) + dur);
        }

        let bestName: string | undefined;
        let bestScore = 0;

        scores.forEach((score, name) => {
          if (score > bestScore) {
            bestScore = score;
            bestName = name;
          }
        });

        speaker = bestName;
      }
    }

    return {
      id: `block-${Date.now()}-${index}`,
      type: 'outros',
      title: chapter.headline || blockTypeLabels.outros,
      content: chapter.summary || chapter.gist || '',
      timestamp: formatTimestamp(chapter.start),
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
            user_id: userId,
            title,
            date: dateValue,
            status: 'completed',
            duration: null,
            audio_url: audioUrl,
            youtube_url: youtubeUrl || null,
            transcript: transcriptText,
            blocks: (blocks.length > 0 ? blocks : []) as unknown as Json,
            camara_id: profile?.camara_id || null
          };

        let sessionData;
        let error;

        if (existingList && existingList.length > 0) {
          const existingId = (existingList[0] as { id: string }).id;
          const updateResult = await supabase
            .from('sessions')
            .update(payload)
            .eq('id', existingId)
            .select()
            .single();
          sessionData = updateResult.data;
          error = updateResult.error;
        } else {
          const insertResult = await supabase
            .from('sessions')
            .insert(payload)
            .select()
            .single();
          sessionData = insertResult.data;
          error = insertResult.error;
        }

        if (error) {
          console.error("Error saving session:", error);
          toast.error('Não foi possível salvar a sessão transcrita.');
          return null;
        } else if (sessionData) {
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
          
          return sessionData.id;
        }
      } catch (err) {
        console.error(err);
        toast.error('Erro inesperado ao salvar a sessão transcrita.');
        return null;
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
                     if (audioUrl && profile?.camara_id && Array.isArray(data.utterances) && data.utterances.length > 0) {
                         const mappingResult = await apiCall('/map-utterances-speakers', {
                             audioUrl,
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

                 const sid = await saveSession(normalizedText, blocksToSave);
                 if (sid) {
                     setSavedSessionId(sid);
                 }
             } else {
                 toast.error("Transcrição vazia recebida.");
                 setStatus('error');
             }
        } else if (newStatus === 'error') {
            window.clearInterval(interval);
            toast.error('Erro na transcrição do áudio');
            setStatus('error');
        }
      } catch (err) {
          console.error("Polling error", err);
      }
    }, 5000);

    return () => window.clearInterval(interval);
  }, [id, saveSession, profile, audioUrl]);

  const isComplete = currentStep === 4 && progress >= 100;

  return (
    <MainLayout>
      <div className="p-8 max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8 animate-fade-in">
          <h1 className="text-3xl font-bold text-foreground">
            {isComplete ? 'Transcrição Concluída!' : 'Processando Transcrição...'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isComplete 
              ? 'Sua sessão está pronta para organização e edição'
              : 'Aguarde enquanto processamos o áudio da sessão'
            }
          </p>
        </div>

        {/* Progress Card */}
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

        {/* Actions */}
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
              {/* Only show cancel if not almost done */}
              {progress < 90 && (
                  <Button
                    variant="outline"
                    size="lg"
                    className="gap-2"
                    onClick={() => navigate('/upload')}
                  >
                    <XCircle className="w-5 h-5" />
                    Voltar
                  </Button>
              )}
              <div className="flex-1" />
              <p className="text-sm text-muted-foreground">
                Você pode sair desta página. A transcrição continuará em segundo plano.
              </p>
            </>
          )}
        </div>
      </div>
    </MainLayout>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent } from '@/components/ui/card';
import { UploadZone } from '@/components/upload/UploadZone';
import { YoutubeInput } from '@/components/upload/YoutubeInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileAudio, Youtube, ArrowRight, Calendar, Loader2, Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { apiCall } from '@/lib/utils';
import { TranscriptionBlock } from '@/types/transcription';
import { Json } from '@/integrations/supabase/types';

export default function Upload() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialMethod = (searchParams.get('method') === 'youtube' ? 'youtube' : 'file') as 'file' | 'youtube';
  const { profile } = useAuth();
  
  const [sessionTitle, setSessionTitle] = useState('');
  const [sessionDate, setSessionDate] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [currentMethod, setCurrentMethod] = useState<'file' | 'youtube'>(initialMethod);

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    if (!sessionTitle) {
      // Auto-fill title from filename
      const name = file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ');
      setSessionTitle(name);
    }
  };

  const handleYoutubeSubmit = (url: string) => {
    setYoutubeUrl(url);
  };

  const [touched, setTouched] = useState(false);

  const createSessionFromTranscript = async (transcriptText: string, blocks: TranscriptionBlock[] = []) => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;

      if (!userId) {
        toast.error('Usuário não autenticado');
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
        camara_id: profile?.camara_id || null,
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
        console.error('Error saving session:', error);
        toast.error('Não foi possível salvar a sessão transcrita.');
        return null;
      } else if (sessionData) {
        try {
          apiCall('/ingest-session', { sessionId: sessionData.id });
          toast.info('Ingerindo dados para o Assistente...', { duration: 3000 });
        } catch (e) {
          console.error('Auto-ingest error', e);
        }

        localStorage.removeItem('pending_transcript_id');
        localStorage.removeItem('pending_session_title');
        localStorage.removeItem('pending_session_date');
        localStorage.removeItem('pending_youtube_url');
        localStorage.removeItem('pending_audio_url');

        return sessionData.id as string;
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro inesperado ao salvar a sessão transcrita.');
      return null;
    }
  };

  useEffect(() => {
    // Check for pending transcription in localStorage
    const savedTranscriptId = localStorage.getItem('pending_transcript_id');
    
    if (savedTranscriptId) {
        toast.info('Retomando monitoramento da transcrição...');
        navigate(`/transcription/${savedTranscriptId}`);
    } else {
        // Restore other fields if available (optional, but good UX if user went back)
        const savedSessionTitle = localStorage.getItem('pending_session_title');
        const savedSessionDate = localStorage.getItem('pending_session_date');
        const savedYoutubeUrl = localStorage.getItem('pending_youtube_url');
        
        if (savedSessionTitle) setSessionTitle(savedSessionTitle);
        if (savedSessionDate) setSessionDate(savedSessionDate);
        if (savedYoutubeUrl) setYoutubeUrl(savedYoutubeUrl);
    }
  }, [navigate]);

  const handleStartTranscription = async () => {
    setTouched(true);
    
    if (!sessionTitle || !sessionDate) {
      toast.error('Preencha o título e a data da sessão.');
      return;
    }

    if (!selectedFile && !youtubeUrl) {
      toast.error('Selecione um arquivo ou forneça um link do YouTube.');
      return;
    }

    const maxBytes = 2 * 1024 * 1024 * 1024; 
    if (selectedFile && selectedFile.size > maxBytes) {
      toast.error('Arquivo muito grande. O limite é de 2GB.');
      return;
    }

    const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/x-m4a', 'audio/webm'];
    if (selectedFile && !allowedTypes.includes(selectedFile.type)) {
      toast.error('Formato de áudio não suportado. Use MP3, WAV, M4A ou WebM.');
      return;
    }

    try {
      setIsUploading(true);

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        toast.error('Sessão expirada. Por favor, faça login novamente.');
        setIsUploading(false);
        return;
      }

      let finalAudioUrl = '';

      if (youtubeUrl) {
        toast.info('Processando áudio do YouTube...');
        
        try {
            const ytData = await apiCall('/process-youtube', { youtubeUrl });

            if (
              ytData &&
              ytData.mode === 'captions' &&
              typeof ytData.transcript_text === 'string' &&
              ytData.transcript_text.trim().length > 0
            ) {
              let normalizedText = ytData.transcript_text as string;

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
                console.error('Error normalizing transcript text (captions fallback):', e);
              }

              let blocksToSave: TranscriptionBlock[] = [];

              try {
                toast.info('Organizando transcrição com IA...', { duration: 4000 });
                const gptData = await apiCall('/process-transcript', {
                  transcript: normalizedText,
                });

                if (gptData?.blocks && Array.isArray(gptData.blocks)) {
                  blocksToSave = gptData.blocks as TranscriptionBlock[];
                }
              } catch (e) {
                console.error('Error calling process-transcript for captions:', e);
              }

              const sid = await createSessionFromTranscript(normalizedText, blocksToSave);
              if (sid) {
                navigate(`/session/${sid}/edit`);
                return;
              }
            }

            finalAudioUrl = ytData.upload_url;
        } catch (err: unknown) {
            console.error('YouTube Processing Error:', err);
            const message = err instanceof Error ? err.message : 'Falha ao processar vídeo no backend.';
            throw new Error(message);
        }

      } else if (selectedFile) {
        try {
          const fileExt = selectedFile.name.split('.').pop();
          const sanitizedName = selectedFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
          const fileName = `session_audio/${profile?.id || 'anon'}/${Date.now()}-${sanitizedName}`;

          console.log('Solicitando URL de upload para:', fileName);

          const { uploadUrl, publicUrl } = await apiCall('/generate-upload-url', {
            filename: fileName,
            contentType: selectedFile.type,
          });

          if (!uploadUrl) {
            throw new Error('Falha ao obter URL de upload assinada.');
          }

          console.log('Realizando upload direto para R2...');

          try {
            const uploadResponse = await fetch(uploadUrl, {
              method: 'PUT',
              headers: {
                'Content-Type': selectedFile.type,
              },
              body: selectedFile,
            });

            if (!uploadResponse.ok) {
              throw new Error(`Falha no upload para o R2 (Direto): ${uploadResponse.statusText}`);
            }

            finalAudioUrl = publicUrl;
            console.log('Arquivo enviado para o R2 com sucesso:', finalAudioUrl);
          } catch (directError) {
            console.warn('Erro no upload direto para R2, tentando via backend...', directError);

            const formData = new FormData();
            formData.append('file', selectedFile);
            formData.append('key', fileName);

            const { data: sessionDataUpload } = await supabase.auth.getSession();
            const tokenUpload = sessionDataUpload.session?.access_token;

            if (!tokenUpload) {
              throw new Error('Sessão expirada. Faça login novamente.');
            }

            const rawBackendUrl = import.meta.env.VITE_BACKEND_URL as string | undefined;
            const BASE_URL =
              rawBackendUrl && !rawBackendUrl.startsWith(':')
                ? rawBackendUrl.replace(/\/$/, '')
                : (import.meta.env.DEV ? 'http://localhost:3001' : '');
            
            console.log(`Tentando upload via backend: ${BASE_URL}/upload-to-r2`);

            const backendResponse = await fetch(`${BASE_URL}/upload-to-r2`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${tokenUpload}`,
              },
              body: formData,
            });

            if (!backendResponse.ok) {
              const err = await backendResponse.json().catch(() => null);
              const message = err?.error || `Falha no upload via backend (${backendResponse.status})`;
              throw new Error(message);
            }

            const result = await backendResponse.json();
            if (!result?.publicUrl) {
              throw new Error('Upload concluído, mas URL pública não foi retornada.');
            }

            finalAudioUrl = result.publicUrl;
            console.log('Arquivo enviado para o R2 via backend com sucesso:', finalAudioUrl);
          }
        } catch (storageError) {
          console.error('Erro no fluxo de upload para R2:', storageError);
          toast.error(
            storageError instanceof Error
              ? storageError.message
              : 'Falha no upload do arquivo. Verifique sua conexão e tente novamente.',
          );
          throw storageError;
        }
      }

      setAudioUrl(finalAudioUrl);

      // Store in localStorage BEFORE starting transcription
      if (finalAudioUrl) {
          localStorage.setItem('pending_session_title', sessionTitle);
          localStorage.setItem('pending_session_date', sessionDate);
          if (youtubeUrl) localStorage.setItem('pending_youtube_url', youtubeUrl);
          localStorage.setItem('pending_audio_url', finalAudioUrl);
      }

      // Fetch configuration
      interface TranscriptionConfig {
        language_code: string;
        speaker_labels: boolean;
        punctuate: boolean;
      }

      const transcriptionConfig: TranscriptionConfig = {
          language_code: 'pt',
          speaker_labels: true,
          punctuate: true
      };
      
      try {
        if (profile?.camara_id) {
            const { data } = await supabase
                .from('camaras')
                .select('configuration')
                .eq('id', profile.camara_id)
                .single();
            
            if (data?.configuration) {
                const config = data.configuration as { transcriptionLanguage?: string; autoDetectSpeakers?: boolean; enablePunctuation?: boolean; };
                if (config.transcriptionLanguage) {
                    const langMap:Record<string, string> = {
                        'pt-BR': 'pt',
                        'pt-PT': 'pt',
                        'es': 'es',
                        'en': 'en'
                    };
                    transcriptionConfig.language_code = langMap[config.transcriptionLanguage] || 'pt';
                }
                if (config.autoDetectSpeakers !== undefined) transcriptionConfig.speaker_labels = config.autoDetectSpeakers;
                if (config.enablePunctuation !== undefined) transcriptionConfig.punctuate = config.enablePunctuation;
            }
        }
      } catch (err) {
        console.error("Error fetching camara config:", err);
      }

      // 3. Start Transcription
      console.log('Starting transcription with URL:', finalAudioUrl);
      
      const data = await apiCall('/assembly-transcribe', {
          audioUrl: finalAudioUrl,
          ...transcriptionConfig
      });

      if (data && typeof data.id === 'string') {
        // Save ID to persist across reloads
        localStorage.setItem('pending_transcript_id', data.id);
        toast.success('Transcrição iniciada com sucesso');
        
        // Redirect to progress page immediately
        navigate(`/transcription/${data.id}`);
      }
    } catch (error) {
      console.error(error);
      let errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      
      if (errorMessage === 'Failed to fetch') {
        errorMessage = 'Não foi possível conectar ao servidor local. Verifique se o backend está rodando na porta 3001.';
      }
      
      toast.error(errorMessage);
    } finally {
      setIsUploading(false);
    }
  };

  const canStart = (sessionTitle && sessionDate && (selectedFile || youtubeUrl) && !isUploading) || (touched && (!sessionTitle || !sessionDate));

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="mb-8 animate-fade-in">
          <h1 className="text-3xl font-bold text-foreground">Nova Sessão</h1>
          <p className="text-muted-foreground mt-1">
            Envie um áudio ou link do YouTube para transcrição
          </p>
        </div>

        {/* Session Info */}
        <Card className="bg-card/50 backdrop-blur-sm border-border/50 shadow-lg mb-8 animate-slide-up">
          <CardContent className="p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">
            Informações da Sessão
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="title" className={touched && !sessionTitle ? "text-destructive" : ""}>
                Título da Sessão *
              </Label>
              <Input
                id="title"
                placeholder="Ex: Sessão Ordinária - 15ª Sessão"
                value={sessionTitle}
                onChange={(e) => setSessionTitle(e.target.value)}
                className={touched && !sessionTitle ? "border-destructive bg-background/50" : "bg-background/50"}
              />
              {touched && !sessionTitle && (
                <p className="text-xs text-destructive">O título é obrigatório</p>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="date" className={touched && !sessionDate ? "text-destructive" : ""}>
                Data da Sessão *
              </Label>
              <div className="relative">
                <Calendar className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 ${touched && !sessionDate ? "text-destructive" : "text-muted-foreground"}`} />
                <Input
                  id="date"
                  type="date"
                  className={`pl-10 ${touched && !sessionDate ? "border-destructive bg-background/50" : "bg-background/50"}`}
                  value={sessionDate}
                  onChange={(e) => setSessionDate(e.target.value)}
                />
              </div>
              {touched && !sessionDate && (
                <p className="text-xs text-destructive">A data é obrigatória</p>
              )}
            </div>
          </div>
          </CardContent>
        </Card>

        {/* Upload Tabs */}
        <div className="animate-slide-up" style={{ animationDelay: '100ms' }}>
          <div className="mb-4 flex items-center justify-between text-xs md:text-sm">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                1
              </span>
              <span className="font-medium text-foreground">Informações da Sessão</span>
            </div>
            <div className="mx-2 md:mx-4 h-px flex-1 bg-border" />
            <div className="flex items-center gap-2">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                  currentMethod
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-muted-foreground'
                }`}
              >
                2
              </span>
              <span className="font-medium text-foreground">
                {currentMethod === 'file' ? 'Upload de Arquivo' : 'Link do YouTube'}
              </span>
            </div>
            <div className="mx-2 md:mx-4 h-px flex-1 bg-border" />
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-muted-foreground text-xs font-semibold">
                3
              </span>
              <span className="font-medium text-muted-foreground">Transcrição</span>
            </div>
          </div>

          <Tabs
            value={currentMethod}
            onValueChange={(value) => setCurrentMethod((value === 'youtube' ? 'youtube' : 'file'))}
            className="space-y-6"
          >
            <TabsList className="grid w-full grid-cols-2 h-14 bg-muted/50 backdrop-blur-sm border border-border/50">
              <TabsTrigger value="file" className="gap-2 h-12">
                <FileAudio className="w-5 h-5" />
                Upload de Arquivo
              </TabsTrigger>
              <TabsTrigger value="youtube" className="gap-2 h-12">
                <Youtube className="w-5 h-5" />
                Link do YouTube
              </TabsTrigger>
            </TabsList>

            <TabsContent value="file" className="space-y-6">
              <UploadZone onFileSelect={handleFileSelect} maxSize={2048} />
              <Alert className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
                <Info className="h-4 w-4 text-blue-600 dark:text-blue-500" />
                <AlertTitle className="text-blue-800 dark:text-blue-400">Armazenamento Permanente</AlertTitle>
                <AlertDescription className="text-blue-700 dark:text-blue-500 text-xs mt-1">
                  Seu arquivo de áudio será salvo com segurança em nosso servidor para reprodução futura na página da sessão.
                </AlertDescription>
              </Alert>
            </TabsContent>

            <TabsContent value="youtube" className="space-y-6">
              <YoutubeInput onSubmit={handleYoutubeSubmit} />
            </TabsContent>
          </Tabs>
        </div>

        <div className="mt-8 animate-slide-up" style={{ animationDelay: '200ms' }}>
          <Button
            variant="gradient"
            size="xl"
            className="w-full gap-3"
            disabled={(!sessionTitle || !sessionDate || (!selectedFile && !youtubeUrl)) && !touched ? true : isUploading}
            onClick={handleStartTranscription}
          >
            {isUploading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Processando áudio
              </>
            ) : (
              <>
                Iniciar Transcrição
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </Button>
          
          {(!sessionTitle || !sessionDate || (!selectedFile && !youtubeUrl)) && (
            <p className="text-sm text-muted-foreground text-center mt-3">
              Preencha todos os campos obrigatórios para continuar
            </p>
          )}
        </div>
      </div>
    </MainLayout>
  );
}

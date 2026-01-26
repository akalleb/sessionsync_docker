import { useState } from 'react';
import { Youtube, Link2, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface YoutubeInputProps {
  onSubmit: (url: string) => void;
}

export function YoutubeInput({ onSubmit }: YoutubeInputProps) {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');
  const [videoInfo, setVideoInfo] = useState<{ title: string; duration: string } | null>(null);

  const validateYoutubeUrl = (url: string) => {
    const regex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|live\/)|youtu\.be\/)[\w-]+/;
    return regex.test(url);
  };

  const handleUrlChange = (value: string) => {
    setUrl(value);
    setStatus('idle');
    setVideoInfo(null);
    onSubmit(''); // Reset parent state when input changes
  };

  const handleValidate = async () => {
    if (!validateYoutubeUrl(url)) {
      setStatus('invalid');
      onSubmit('');
      return;
    }

    setStatus('validating');
    onSubmit(''); // Ensure parent state is clear while validating
    
    // Simulate API validation
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    setStatus('valid');
    setVideoInfo({
      title: 'Sessão Ordinária - Câmara Municipal',
      duration: '2h 45min',
    });
    onSubmit(url); // Set parent state on success
  };

  // Removed internal handleSubmit and button since parent handles it
  
  return (
    <div className="space-y-6">
      <div className="border border-border rounded-2xl p-8 bg-card">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center">
            <Youtube className="w-6 h-6 text-destructive" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Link do YouTube</h3>
            <p className="text-sm text-muted-foreground">Cole o link de uma live ou vídeo</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="relative">
            <Link2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              type="url"
              placeholder="https://youtube.com/watch?v=... ou youtube.com/live/..."
              value={url}
              onChange={(e) => handleUrlChange(e.target.value)}
              className={cn(
                "pl-12 h-12 text-base",
                status === 'valid' && "border-success",
                status === 'invalid' && "border-destructive"
              )}
            />
            {status === 'valid' && (
              <CheckCircle2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-success" />
            )}
          </div>

          <Button
            onClick={handleValidate}
            disabled={!url || status === 'validating'}
            className="w-full h-12"
            variant={status === 'valid' ? 'success' : 'default'}
          >
            {status === 'validating' ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Verificando...
              </>
            ) : status === 'valid' ? (
              <>
                <CheckCircle2 className="w-5 h-5" />
                Link Válido
              </>
            ) : (
              'Verificar Link'
            )}
          </Button>
        </div>

        {status === 'invalid' && (
          <div className="flex items-center gap-3 mt-4 p-4 rounded-xl bg-destructive/10 text-destructive">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p className="text-sm font-medium">
              Link inválido. Verifique se é um link do YouTube válido.
            </p>
          </div>
        )}

        {videoInfo && status === 'valid' && (
          <div className="mt-6 p-4 rounded-xl bg-success/10 border border-success/20">
            <h4 className="font-medium text-foreground">{videoInfo.title}</h4>
            <p className="text-sm text-muted-foreground mt-1">
              Duração estimada: {videoInfo.duration}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { Play, Pause, RotateCcw, Plus, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const formatTime = (segundos: number) => {
  const mins = Math.floor(Math.abs(segundos) / 60);
  const secs = Math.abs(segundos) % 60;
  const sign = segundos < 0 ? '-' : '';
  return `${sign}${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

interface SpeakerTimerProps {
  tempoInicial: number;
  inicio?: string | null;
  onTempoAtualizado?: (tempoUtilizado: number) => void;
  onTempoEsgotado?: () => void;
  vereadorNome?: string;
  tipo?: string;
  readonly?: boolean;
}

export function SpeakerTimer({
  tempoInicial,
  inicio,
  onTempoAtualizado,
  onTempoEsgotado,
  vereadorNome,
  tipo,
  readonly = false,
}: SpeakerTimerProps) {
  const calculateInitialRemaining = useCallback(() => {
    if (!inicio) return tempoInicial;
    const now = new Date().getTime();
    const startTime = new Date(inicio).getTime();
    const elapsedSeconds = Math.floor((now - startTime) / 1000);
    return Math.max(tempoInicial - elapsedSeconds, -9999);
  }, [inicio, tempoInicial]);

  const [tempoTotal, setTempoTotal] = useState(tempoInicial);
  const [tempoRestante, setTempoRestante] = useState(calculateInitialRemaining());
  const [isRunning, setIsRunning] = useState(!!inicio);

  useEffect(() => {
    setTempoTotal(tempoInicial);
  }, [tempoInicial]);

  useEffect(() => {
    setTempoRestante(calculateInitialRemaining());
    setIsRunning(!!inicio);
  }, [inicio, calculateInitialRemaining]);

  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      setTempoRestante((prev) => {
        const novo = prev - 1;
        onTempoAtualizado?.(tempoTotal - novo);
        if (novo === 0) onTempoEsgotado?.();
        return novo;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, tempoTotal, onTempoAtualizado, onTempoEsgotado]);

  const tempoUtilizado = tempoTotal - tempoRestante;
  const percentual = (tempoRestante / tempoTotal) * 100;

  const handleReset = useCallback(() => {
    setTempoRestante(tempoTotal);
    setIsRunning(false);
  }, [tempoTotal]);

  const handleAddTime = useCallback((segundos: number) => {
    setTempoTotal((prev) => prev + segundos);
    setTempoRestante((prev) => prev + segundos);
  }, []);

  const getTimerColor = () => {
    if (tempoRestante < 0) return 'text-destructive';
    if (tempoRestante <= 30) return 'text-amber-500';
    return 'text-primary';
  };

  const getProgressColor = () => {
    if (tempoRestante < 0) return 'bg-destructive';
    if (tempoRestante <= 30) return 'bg-amber-500';
    return 'bg-primary';
  };

  return (
    <div className="flex flex-col items-center gap-4 p-6 bg-card rounded-xl border">
      {vereadorNome && (
        <div className="text-center">
          <p className="text-lg font-semibold text-foreground">{vereadorNome}</p>
          {tipo && <p className="text-sm text-muted-foreground capitalize">{tipo}</p>}
        </div>
      )}

      <div className={cn('text-6xl font-mono font-bold tabular-nums', getTimerColor())}>
        {formatTime(tempoRestante)}
      </div>

      <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
        <div
          className={cn('h-full transition-all duration-1000', getProgressColor())}
          style={{ width: `${Math.max(0, percentual)}%` }}
        />
      </div>

      <div className="flex gap-4 text-sm text-muted-foreground">
        <span>Tempo total: {formatTime(tempoTotal)}</span>
        <span>Utilizado: {formatTime(tempoUtilizado)}</span>
      </div>

      {!readonly && (
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => handleAddTime(-30)}
            disabled={tempoTotal <= 30}
          >
            <Minus className="h-4 w-4" />
          </Button>

          <Button
            variant={isRunning ? 'secondary' : 'default'}
            size="lg"
            onClick={() => setIsRunning(!isRunning)}
            className="w-24"
          >
            {isRunning ? (
              <>
                <Pause className="h-4 w-4 mr-2" />
                Pausar
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Iniciar
              </>
            )}
          </Button>

          <Button variant="outline" size="icon" onClick={handleReset}>
            <RotateCcw className="h-4 w-4" />
          </Button>

          <Button variant="outline" size="icon" onClick={() => handleAddTime(30)}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

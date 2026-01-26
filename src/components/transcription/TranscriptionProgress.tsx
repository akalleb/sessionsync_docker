import { useState, useEffect } from 'react';
import { Mic, FileAudio, Brain, FileText, CheckCircle2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface Step {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
}

const steps: Step[] = [
  { id: 'upload', title: 'Upload', description: 'Enviando arquivo...', icon: FileAudio },
  { id: 'transcribe', title: 'Transcrição', description: 'Processando áudio...', icon: Mic },
  { id: 'analyze', title: 'Análise', description: 'Identificando estrutura...', icon: Brain },
  { id: 'organize', title: 'Organização', description: 'Criando blocos...', icon: FileText },
  { id: 'complete', title: 'Concluído', description: 'Pronto para edição!', icon: CheckCircle2 },
];

interface TranscriptionProgressProps {
  currentStep: number;
  progress: number;
  estimatedTime?: string;
}

export function TranscriptionProgress({ currentStep, progress, estimatedTime }: TranscriptionProgressProps) {
  return (
    <div className="space-y-8">
      <div className="relative pt-2">
        <div className="absolute left-0 right-0 top-8 h-0.5 bg-border" />
        <div className="relative flex items-center justify-between">
          {steps.map((step, index) => {
            const isCompleted = index < currentStep;
            const isCurrent = index === currentStep;
            const Icon = step.icon;

            return (
              <div key={step.id} className="flex flex-col items-center flex-1">
                <div
                  className={cn(
                    "relative z-10 w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300",
                    isCompleted && "bg-success text-success-foreground",
                    isCurrent && "bg-primary text-primary-foreground shadow-glow animate-pulse-soft",
                    !isCompleted && !isCurrent && "bg-secondary text-muted-foreground"
                  )}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div className="mt-3 text-center">
                  <p
                    className={cn(
                      "text-sm font-medium transition-colors",
                      (isCompleted || isCurrent) ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {step.title}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-foreground">
            {steps[currentStep]?.description}
          </span>
          <span className="text-muted-foreground">
            {Math.round(progress)}%
          </span>
        </div>
        <Progress value={progress} className="h-3" />
        {estimatedTime && (
          <p className="text-sm text-muted-foreground text-center">
            Tempo estimado: {estimatedTime}
          </p>
        )}
      </div>
    </div>
  );
}

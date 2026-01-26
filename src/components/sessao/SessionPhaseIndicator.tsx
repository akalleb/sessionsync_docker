import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import * as LucideIcons from 'lucide-react';

export interface FaseIndicator {
  id?: string;
  codigo: string;
  nome: string;
  icone: string;
  ordem: number;
}

interface SessionPhaseIndicatorProps {
  faseAtual: string;
  fases: FaseIndicator[];
  onFaseClick?: (fase: string) => void;
  readonly?: boolean;
}

export function SessionPhaseIndicator({
  faseAtual,
  fases,
  onFaseClick,
  readonly = false,
}: SessionPhaseIndicatorProps) {
  const sortedFases = [...fases].sort((a, b) => a.ordem - b.ordem);
  const faseIndex = sortedFases.findIndex((f) => f.codigo === faseAtual);

  const getIconComponent = (iconName: string) => {
    const icons = LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>;
    const IconComponent = icons[iconName];
    return IconComponent || icons.Circle;
  };

  return (
    <div className="flex items-center justify-between p-4 bg-card rounded-xl border">
      {sortedFases.map((fase, index) => {
        const Icon = getIconComponent(fase.icone);
        const isActive = fase.codigo === faseAtual;
        const isCompleted = index < faseIndex;
        const isClickable = !readonly && onFaseClick;

        return (
          <div key={fase.codigo} className="flex items-center flex-1">
            <button
              onClick={() => isClickable && onFaseClick(fase.codigo)}
              disabled={readonly}
              className={cn(
                'flex flex-col items-center gap-2 flex-1 py-2 rounded-lg transition-all',
                isClickable && 'hover:bg-muted cursor-pointer',
                isActive && 'text-primary',
                isCompleted && 'text-green-600',
                !isActive && !isCompleted && 'text-muted-foreground'
              )}
            >
              <div
                className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center transition-all',
                  isActive && 'bg-primary text-primary-foreground',
                  isCompleted && 'bg-green-100 dark:bg-green-900',
                  !isActive && !isCompleted && 'bg-muted'
                )}
              >
                {isCompleted ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <Icon className="h-5 w-5" />
                )}
              </div>
              <span className="text-xs font-medium text-center">{fase.nome}</span>
            </button>
            {index < sortedFases.length - 1 && (
              <div
                className={cn(
                  'h-0.5 w-full max-w-8 mx-1',
                  index < faseIndex ? 'bg-green-500' : 'bg-muted'
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}


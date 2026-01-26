import { Link } from 'react-router-dom';
import { FileText, Clock, ArrowRight, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Session } from '@/types/transcription';

const statusConfig: Record<string, { label: string; icon: typeof Clock; color: string; animate?: boolean }> = {
  pending: { label: 'Pendente', icon: Clock, color: 'text-muted-foreground bg-muted' },
  transcribing: { label: 'Transcrevendo', icon: Loader2, color: 'text-info bg-info/10', animate: true },
  organizing: { label: 'Organizando', icon: Loader2, color: 'text-warning bg-warning/10', animate: true },
  reviewing: { label: 'Em Revisão', icon: AlertCircle, color: 'text-warning bg-warning/10' },
  completed: { label: 'Concluída', icon: CheckCircle2, color: 'text-success bg-success/10' },
};

interface RecentSessionsProps {
  sessions: Session[];
}

export function RecentSessions({ sessions }: RecentSessionsProps) {
  return (
    <div className="bg-card rounded-xl shadow-card border border-border/50 overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Sessões Recentes</h2>
        <Link to="/sessions">
          <Button variant="ghost" size="sm" className="gap-2">
            Ver todas
            <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
      </div>
      
      <div className="divide-y divide-border">
        {sessions.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <FileText className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
            <p className="text-muted-foreground">Nenhuma sessão encontrada</p>
            <Link to="/upload">
              <Button variant="default" size="sm" className="mt-4">
                Criar primeira sessão
              </Button>
            </Link>
          </div>
        ) : (
          sessions.map((session) => {
            const status = statusConfig[session.status];
            const StatusIcon = status.icon;
            
            return (
              <Link
                key={session.id}
                to={`/session/${session.id}`}
                className="flex items-center gap-4 px-6 py-4 hover:bg-secondary/50 transition-colors duration-200"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-foreground truncate">{session.title}</h3>
                  <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                    <span>{session.date}</span>
                    {session.duration && (
                      <>
                        <span>•</span>
                        <span>{session.duration}</span>
                      </>
                    )}
                  </div>
                </div>
                
                <div className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium",
                  status.color
                )}>
                  <StatusIcon className={cn("w-4 h-4", status.animate && "animate-spin")} />
                  <span>{status.label}</span>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}

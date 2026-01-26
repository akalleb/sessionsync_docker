import { FileText, Clock, CheckCircle2, PlayCircle, Pause } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SessaoPauta } from '@/types/sessao';
import { FaseSessao } from '@/hooks/useFasesSessao';

interface AgendaPanelProps {
  pauta: SessaoPauta[];
  faseAtual: string;
  fases: FaseSessao[];
  onItemClick?: (item: SessaoPauta) => void;
  onIniciarItem?: (item: SessaoPauta) => void;
  readonly?: boolean;
}

export function AgendaPanel({
  pauta,
  faseAtual,
  fases,
  onItemClick,
  onIniciarItem,
  readonly = false,
}: AgendaPanelProps) {
  const sortedFases = [...fases].sort((a, b) => a.ordem - b.ordem);

  const pautaPorFase = sortedFases.reduce(
    (acc, fase) => {
      acc[fase.codigo] = pauta
        .filter((item) => item.fase === fase.codigo)
        .sort((a, b) => a.ordem - b.ordem);
      return acc;
    },
    {} as Record<string, SessaoPauta[]>
  );

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'concluido':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'em_andamento':
        return <PlayCircle className="h-4 w-4 text-primary" />;
      case 'adiado':
        return <Pause className="h-4 w-4 text-amber-500" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'concluido':
        return (
          <Badge variant="outline" className="border-green-500 text-green-600">
            Concluído
          </Badge>
        );
      case 'em_andamento':
        return <Badge>Em andamento</Badge>;
      case 'adiado':
        return <Badge variant="secondary">Adiado</Badge>;
      default:
        return <Badge variant="outline">Pendente</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Pauta da Sessão
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {sortedFases
          .filter((fase) => pautaPorFase[fase.codigo]?.length > 0)
          .map((fase) => (
            <div key={fase.codigo} className="space-y-2">
              <h3
                className={cn(
                  'text-sm font-semibold uppercase tracking-wide',
                  fase.codigo === faseAtual ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                {fase.nome}
              </h3>
              <div className="space-y-2">
                {pautaPorFase[fase.codigo].map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-lg border transition-all',
                      item.status === 'em_andamento' && 'bg-primary/5 border-primary',
                      item.status === 'concluido' && 'opacity-75',
                      !readonly && 'hover:border-primary/50 cursor-pointer'
                    )}
                    onClick={() => !readonly && onItemClick?.(item)}
                  >
                    {getStatusIcon(item.status)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{item.titulo}</p>
                      {item.descricao && (
                        <p className="text-xs text-muted-foreground truncate">{item.descricao}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {item.tempo_previsto && (
                        <span className="text-xs text-muted-foreground">
                          {item.tempo_previsto}min
                        </span>
                      )}
                      {getStatusBadge(item.status)}
                      {!readonly &&
                        item.status === 'pendente' &&
                        fase.codigo === faseAtual && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              onIniciarItem?.(item);
                            }}
                          >
                            <PlayCircle className="h-4 w-4" />
                          </Button>
                        )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

        {pauta.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Nenhum item na pauta</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


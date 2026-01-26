import { Check, X, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { SessaoPresenca } from '@/types/sessao';

interface AttendancePanelProps {
  presencas: SessaoPresenca[];
  onTogglePresenca?: (vereadorId: string, presente: boolean) => void;
  readonly?: boolean;
}

export function AttendancePanel({
  presencas,
  onTogglePresenca,
  readonly = false,
}: AttendancePanelProps) {
  const totalPresentes = presencas.filter((p) => p.presente).length;
  const totalAusentes = presencas.filter((p) => !p.presente).length;
  const quorum = Math.ceil(presencas.length / 2) + 1;
  const temQuorum = totalPresentes >= quorum;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Verificação de Quórum</CardTitle>
          <Badge variant={temQuorum ? 'default' : 'destructive'}>
            {temQuorum ? 'Quórum atingido' : 'Sem quórum'}
          </Badge>
        </div>
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Check className="h-4 w-4 text-green-500" />
            Presentes: {totalPresentes}
          </span>
          <span className="flex items-center gap-1">
            <X className="h-4 w-4 text-red-500" />
            Ausentes: {totalAusentes}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            Quórum mínimo: {quorum}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {presencas.map((presenca) => (
            <button
              key={presenca.id}
              onClick={() =>
                !readonly && onTogglePresenca?.(presenca.vereador_id, !presenca.presente)
              }
              disabled={readonly}
              className={cn(
                'flex items-center gap-3 p-3 rounded-lg border transition-all text-left',
                presenca.presente
                  ? 'border-green-500/50 bg-green-50 dark:bg-green-950/20'
                  : 'border-red-500/50 bg-red-50 dark:bg-red-950/20',
                !readonly && 'hover:opacity-80 cursor-pointer'
              )}
            >
              <div className="relative">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={presenca.vereador?.foto_url || undefined} />
                  <AvatarFallback>
                    {presenca.vereador?.nome_parlamentar?.[0] || presenca.vereador?.nome?.[0]}
                  </AvatarFallback>
                </Avatar>
                <div
                  className={cn(
                    'absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center',
                    presenca.presente ? 'bg-green-500' : 'bg-red-500'
                  )}
                >
                  {presenca.presente ? (
                    <Check className="h-3 w-3 text-white" />
                  ) : (
                    <X className="h-3 w-3 text-white" />
                  )}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {presenca.vereador?.nome_parlamentar || presenca.vereador?.nome}
                </p>
                {presenca.vereador?.cargo_mesa && (
                  <p className="text-xs font-semibold text-primary truncate">
                    {presenca.vereador.cargo_mesa}
                  </p>
                )}
                {presenca.vereador?.partido && (
                  <p className="text-xs text-muted-foreground">
                    {presenca.vereador.partido.sigla}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}


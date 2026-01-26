import { useState } from 'react';
import { Check, X, Minus, Vote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { Votacao, Voto, SessaoPresenca } from '@/types/sessao';

interface VotingPanelProps {
  votacao: Votacao;
  votos: Voto[];
  presencas: SessaoPresenca[];
  onRegistrarVoto?: (vereadorId: string, voto: 'favor' | 'contra' | 'abstencao') => void;
  onEncerrarVotacao?: () => void;
  readonly?: boolean;
}

export function VotingPanel({
  votacao,
  votos,
  presencas,
  onRegistrarVoto,
  onEncerrarVotacao,
  readonly = false,
}: VotingPanelProps) {
  const [selectedVereador, setSelectedVereador] = useState<string | null>(null);

  const vereadoresPresentes = presencas.filter((p) => p.presente);
  const votosPorVereador = new Map(votos.map((v) => [v.vereador_id, v]));

  const favorCount = votos.filter((v) => v.voto === 'favor').length;
  const contraCount = votos.filter((v) => v.voto === 'contra').length;
  const abstencaoCount = votos.filter((v) => v.voto === 'abstencao').length;

  const totalVotos = favorCount + contraCount + abstencaoCount;
  const totalPresentes = vereadoresPresentes.length;
  const faltamVotar = totalPresentes - totalVotos;

  const handleVoto = (voto: 'favor' | 'contra' | 'abstencao') => {
    if (selectedVereador && onRegistrarVoto) {
      onRegistrarVoto(selectedVereador, voto);
      setSelectedVereador(null);
    }
  };

  const getVotoIcon = (voto?: string) => {
    switch (voto) {
      case 'favor':
        return <Check className="h-5 w-5 text-green-500" />;
      case 'contra':
        return <X className="h-5 w-5 text-red-500" />;
      case 'abstencao':
        return <Minus className="h-5 w-5 text-amber-500" />;
      default:
        return null;
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Vote className="h-5 w-5" />
                {votacao.titulo}
              </CardTitle>
              {votacao.descricao && (
                <p className="text-sm text-muted-foreground mt-1">{votacao.descricao}</p>
              )}
            </div>
            <Badge variant={votacao.status === 'em_andamento' ? 'default' : 'secondary'}>
              {votacao.status === 'em_andamento' ? 'Em votação' : votacao.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {vereadoresPresentes.map((presenca) => {
              const voto = votosPorVereador.get(presenca.vereador_id);
              const isSelected = selectedVereador === presenca.vereador_id;

              return (
                <button
                  key={presenca.vereador_id}
                  onClick={() => !readonly && !voto && setSelectedVereador(presenca.vereador_id)}
                  disabled={readonly || !!voto}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-lg border transition-all text-left',
                    isSelected && 'ring-2 ring-primary border-primary',
                    voto && 'opacity-75',
                    !readonly && !voto && 'hover:border-primary/50 cursor-pointer'
                  )}
                >
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={presenca.vereador?.foto_url || undefined} />
                    <AvatarFallback>
                      {presenca.vereador?.nome_parlamentar?.[0] || presenca.vereador?.nome?.[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {presenca.vereador?.nome_parlamentar || presenca.vereador?.nome}
                    </p>
                    {presenca.vereador?.partido && (
                      <p className="text-xs text-muted-foreground">
                        {presenca.vereador.partido.sigla}
                      </p>
                    )}
                  </div>
                  {voto && getVotoIcon(voto.voto)}
                </button>
              );
            })}
          </div>

          {!readonly && selectedVereador && (
            <div className="mt-6 p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground mb-3 text-center">
                Registrar voto para:{' '}
                <strong>
                  {vereadoresPresentes.find((p) => p.vereador_id === selectedVereador)?.vereador
                    ?.nome_parlamentar}
                </strong>
              </p>
              <div className="flex justify-center gap-3">
                <Button
                  variant="outline"
                  className="flex-1 max-w-32 border-green-500 text-green-600 hover:bg-green-50"
                  onClick={() => handleVoto('favor')}
                >
                  <Check className="h-4 w-4 mr-2" />
                  Favor
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 max-w-32 border-red-500 text-red-600 hover:bg-red-50"
                  onClick={() => handleVoto('contra')}
                >
                  <X className="h-4 w-4 mr-2" />
                  Contra
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 max-w-32 border-amber-500 text-amber-600 hover:bg-amber-50"
                  onClick={() => handleVoto('abstencao')}
                >
                  <Minus className="h-4 w-4 mr-2" />
                  Abstenção
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Resultado Parcial</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span>A Favor</span>
              </div>
              <span className="text-2xl font-bold text-green-600">
                {favorCount}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span>Contra</span>
              </div>
              <span className="text-2xl font-bold text-red-600">
                {contraCount}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-amber-500" />
                <span>Abstenções</span>
              </div>
              <span className="text-2xl font-bold text-amber-600">
                {abstencaoCount}
              </span>
            </div>
          </div>

          <div className="border-t pt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Votos registrados:</span>
              <span className="font-medium">{totalVotos}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Presentes:</span>
              <span className="font-medium">{totalPresentes}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Faltam votar:</span>
              <span className="font-medium">{faltamVotar}</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex h-4 rounded-full overflow-hidden bg-muted">
              <div
                className="bg-green-500 transition-all"
                style={{
                  width: `${(favorCount / Math.max(totalVotos, 1)) * 100}%`,
                }}
              />
              <div
                className="bg-red-500 transition-all"
                style={{
                  width: `${(contraCount / Math.max(totalVotos, 1)) * 100}%`,
                }}
              />
              <div
                className="bg-amber-500 transition-all"
                style={{
                  width: `${(abstencaoCount / Math.max(totalVotos, 1)) * 100}%`,
                }}
              />
            </div>
          </div>

          {!readonly && faltamVotar === 0 && (
            <Button className="w-full" onClick={onEncerrarVotacao}>
              Encerrar Votação
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

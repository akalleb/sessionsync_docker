import { useParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Check, X, Minus, Clock, Vote, Users, QrCode } from 'lucide-react';
import { useSessaoRealtime } from '@/hooks/useSessaoRealtime';
import { useFasesSessao } from '@/hooks/useFasesSessao';
import { useAuth } from '@/hooks/use-auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const formatTime = (segundos: number) => {
  const mins = Math.floor(Math.abs(segundos) / 60);
  const secs = Math.abs(segundos) % 60;
  const sign = segundos < 0 ? '-' : '';
  return `${sign}${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export default function PlenarioDisplay() {
  const { id } = useParams<{ id: string }>();
  const { sessao, presencas, votacaoAtual, votos, tempoFalaAtual, manchetes } = useSessaoRealtime(
    id || null,
    { enablePolling: true, pollingIntervalMs: 3000 }
  );
  const { profile } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());

  // Headlines rotation state
  const [currentHeadlineIndex, setCurrentHeadlineIndex] = useState(0);

  const activeHeadlines = manchetes?.filter(m => m.ativa) || [];

  useEffect(() => {
    const count = activeHeadlines.length;
    if (count === 0) return;

    setCurrentHeadlineIndex(0);

    const interval = setInterval(() => {
      setCurrentHeadlineIndex((prev) => (prev + 1) % count);
    }, 10000); // 10 seconds per headline

    return () => clearInterval(interval);
  }, [activeHeadlines.length]);

  // Timer logic state
  const [tempoRestante, setTempoRestante] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Update timer based on tempoFalaAtual
  useEffect(() => {
    if (tempoFalaAtual?.inicio) {
      const update = () => {
        const now = new Date().getTime();
        const startTime = new Date(tempoFalaAtual.inicio!).getTime();
        const elapsedSeconds = Math.floor((now - startTime) / 1000);
        const remaining = tempoFalaAtual.tempo_concedido - elapsedSeconds;
        setTempoRestante(remaining);
      };
      update();
      const interval = setInterval(update, 1000);
      return () => clearInterval(interval);
    } else {
        setTempoRestante(0);
    }
  }, [tempoFalaAtual]);


  if (!sessao) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-foreground">
        <p className="text-muted-foreground animate-pulse">Carregando sessão...</p>
      </div>
    );
  }

  const votosPorVereador = new Map(votos.map((v) => [v.vereador_id, v]));
  const favorCount = votos.filter((v) => v.voto === 'favor').length;
  const contraCount = votos.filter((v) => v.voto === 'contra').length;
  const abstencaoCount = votos.filter((v) => v.voto === 'abstencao').length;

  const camaraLogoUrl =
    sessao.camara?.logo_url ||
    // @ts-expect-error perfil já traz a relação da câmara com logo_url via Supabase
    profile?.camara?.logo_url ||
    null;

  return (
    <div className="h-screen w-screen bg-background text-foreground flex flex-col overflow-hidden font-sans">
      {/* Header */}
      <header className="h-20 bg-primary backdrop-blur-sm border-b flex items-center justify-between px-8 shrink-0 text-white">
        <div className="flex items-center gap-4">
           {camaraLogoUrl ? (
             <img src={camaraLogoUrl} className="h-12 w-auto object-contain" alt="Brasão" />
           ) : (
             <img src="/iconsessionsync_black.svg" className="h-8 w-8 opacity-80" alt="Logo" />
           )}
           <div>
             <h1 className="text-2xl font-bold uppercase tracking-wide text-white">{sessao.titulo}</h1>
             <p className="text-sm text-blue-100 uppercase tracking-widest font-medium">
               {new Date(sessao.data_sessao).toLocaleDateString('pt-BR', {
                 weekday: 'long',
                 year: 'numeric',
                 month: 'long',
                 day: 'numeric'
               })}
             </p>
           </div>
        </div>
        
        <div className="text-right">
             <div className="text-3xl font-mono font-bold text-white tabular-nums">
               {currentTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
             </div>
             <p className="text-xs text-blue-100 uppercase tracking-wider font-semibold">Horário Local</p>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col p-6 gap-6 min-h-0 relative z-10">
        
        {/* Active Area (Speaker or Vote) */}
        <div className="flex-1 bg-card/40 rounded-3xl border shadow-2xl backdrop-blur-sm overflow-hidden relative">
          {/* Background Elements */}
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/3 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-primary/5 rounded-full blur-[80px] translate-y-1/3 -translate-x-1/3 pointer-events-none" />

          {tempoFalaAtual ? (
            <div className="h-full flex flex-col items-center justify-center relative">
              
              {/* Central Content: Photo + Timer */}
              <div className="flex items-center justify-center gap-12 z-10">
                {/* Photo Card */}
                <div className="relative group">
                   <div className="absolute inset-0 bg-primary blur-3xl opacity-20 rounded-full group-hover:opacity-30 transition-opacity duration-1000"></div>
                   <div className="relative h-96 w-80 rounded-2xl p-1.5 bg-gradient-to-tr from-primary via-primary/50 to-primary/10 shadow-2xl shadow-primary/20 transform transition-transform duration-500 hover:scale-[1.02]">
                     <Avatar className="h-full w-full border-4 border-background rounded-xl">
                       <AvatarImage src={tempoFalaAtual.vereador?.foto_url || undefined} className="object-cover rounded-xl" />
                       <AvatarFallback className="text-6xl bg-muted rounded-xl text-muted-foreground">{tempoFalaAtual.vereador?.nome?.[0]}</AvatarFallback>
                     </Avatar>
                     
                     {/* Party Badge Overlay */}
                     <div className="absolute -bottom-6 left-1/2 -translate-x-1/2">
                       <Badge className="text-2xl px-8 py-2 bg-primary text-primary-foreground border-4 border-background shadow-lg uppercase tracking-widest font-bold">
                          {tempoFalaAtual.vereador?.partido?.sigla || 'PARTIDO'}
                       </Badge>
                     </div>
                   </div>
                </div>

                {/* Divider */}
                <div className="h-64 w-px bg-gradient-to-b from-transparent via-border to-transparent opacity-50" />

                {/* Timer Section */}
                <div className="flex flex-col items-center justify-center min-w-[400px]">
                   <p className="text-xl text-blue-500/80 dark:text-blue-300/80 uppercase tracking-[0.3em] font-medium mb-4">
                     Tempo Restante
                   </p>
                   <div
                     className={cn(
                       "text-[14rem] leading-none font-mono font-bold tabular-nums tracking-tighter drop-shadow-2xl transition-colors duration-300",
                       tempoRestante <= 60
                         ? "text-destructive"
                         : tempoRestante <= 120
                         ? "text-amber-400"
                         : "text-blue-600 dark:text-blue-400"
                     )}
                   >
                     {formatTime(tempoRestante)}
                   </div>
                   
                   {/* Name & Phase Info */}
                   <div className="mt-8 text-center space-y-2">
                      <h2 className="text-4xl font-black text-primary uppercase tracking-tight leading-none">
                        {tempoFalaAtual.vereador?.nome_parlamentar || tempoFalaAtual.vereador?.nome}
                      </h2>
                      <p className="text-2xl text-muted-foreground font-light tracking-wide">
                         {tempoFalaAtual.tipo === 'pequeno_expediente' ? 'Pequeno Expediente' : 
                          tempoFalaAtual.tipo === 'grande_expediente' ? 'Grande Expediente' :
                          tempoFalaAtual.tipo.replace(/_/g, ' ')}
                      </p>
                   </div>
                </div>
              </div>
            </div>
          ) : votacaoAtual ? (
             <div className="h-full flex flex-col items-center justify-center p-12">
                <div className="flex items-center gap-4 mb-8">
                  <Badge className="text-2xl px-6 py-2 bg-amber-500/20 text-amber-600 border-amber-500/50 uppercase tracking-widest">
                    Votação em Andamento
                  </Badge>
                </div>
                <h2 className="text-5xl font-bold text-center max-w-5xl leading-tight mb-12 text-foreground">
                   {votacaoAtual.titulo}
                </h2>
                
                <div className="grid grid-cols-3 gap-16 w-full max-w-6xl">
                  <div className="bg-green-500/10 border border-green-500/30 rounded-3xl p-8 text-center backdrop-blur-sm">
                    <span className="text-8xl font-bold text-green-600 block mb-2">{favorCount}</span>
                    <span className="text-xl text-green-700 dark:text-green-400 uppercase tracking-widest font-bold">A Favor</span>
                  </div>
                  <div className="bg-destructive/10 border border-destructive/30 rounded-3xl p-8 text-center backdrop-blur-sm">
                    <span className="text-8xl font-bold text-destructive block mb-2">{contraCount}</span>
                    <span className="text-xl text-destructive dark:text-red-400 uppercase tracking-widest font-bold">Contra</span>
                  </div>
                  <div className="bg-muted/50 border border-border rounded-3xl p-8 text-center backdrop-blur-sm">
                    <span className="text-8xl font-bold text-muted-foreground block mb-2">{abstencaoCount}</span>
                    <span className="text-xl text-muted-foreground uppercase tracking-widest font-bold">Abstenções</span>
                  </div>
                </div>
             </div>
          ) : (
            <div className="h-full flex flex-col items-center text-center p-12">
               <div className="mb-4">
                  {camaraLogoUrl ? (
                    <img src={camaraLogoUrl} className="h-[22rem] w-auto object-contain" alt="Brasão" />
                  ) : (
                    <img src="/iconsessionsync_black.svg" className="h-32 w-32 opacity-50" alt="Logo" />
                  )}
               </div>
               {activeHeadlines.length > 0 ? (
                 <div className="flex-1 flex items-center justify-center">
                    <p
                      key={activeHeadlines[currentHeadlineIndex]?.id}
                      className="text-3xl text-foreground max-w-4xl font-light animate-fade-in text-center leading-snug"
                    >
                      {activeHeadlines[currentHeadlineIndex]?.texto}
                    </p>
                 </div>
               ) : null}
            </div>
          )}
        </div>

        {/* Attendance Grid (Footer Area) */}
        <div className="shrink-0">
          <div className="flex w-full gap-4 justify-between pb-2 px-4">
             {presencas.map((presenca) => {
               const voto = votosPorVereador.get(presenca.vereador_id);
               const statusColor = votacaoAtual && voto
                  ? (voto.voto === 'favor' ? 'border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.4)]' : 
                     voto.voto === 'contra' ? 'border-destructive shadow-[0_0_15px_rgba(239,68,68,0.4)]' : 
                     'border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.4)]')
                  : (presenca.presente ? 'border-green-500 shadow-[0_0_10px_rgba(34,197,94,0.3)]' : 'border-muted opacity-50 grayscale');
               
               return (
                 <div
                   key={presenca.id}
                   className="flex flex-1 flex-col items-center gap-1 p-2 rounded-lg bg-card/30 border border-border relative group"
                 >
                   <div
                     className={cn(
                       "h-20 w-16 rounded-md border-2 overflow-hidden transition-all duration-500 relative",
                       statusColor
                     )}
                   >
                     <Avatar className="h-full w-full rounded-none">
                       <AvatarImage
                         src={presenca.vereador?.foto_url || undefined}
                         className="h-full w-full object-cover"
                       />
                       <AvatarFallback className="h-full w-full bg-muted text-[10px] flex items-center justify-center">
                         {presenca.vereador?.nome?.[0]}
                       </AvatarFallback>
                     </Avatar>

                     {/* Vote Overlay */}
                     {votacaoAtual && voto && (
                        <div className={cn(
                          "absolute inset-0 flex items-center justify-center backdrop-blur-sm bg-black/40 animate-in fade-in zoom-in duration-300",
                          voto.voto === 'favor' ? 'bg-green-900/40' :
                          voto.voto === 'contra' ? 'bg-red-900/40' :
                          'bg-amber-900/40'
                        )}>
                           <span className={cn(
                             "font-bold text-xs uppercase tracking-wider px-1 py-0.5 rounded shadow-sm border",
                             voto.voto === 'favor' ? 'bg-green-500 text-white border-green-400' :
                             voto.voto === 'contra' ? 'bg-destructive text-white border-red-400' :
                             'bg-amber-500 text-white border-amber-400'
                           )}>
                             {voto.voto === 'favor' ? 'SIM' :
                              voto.voto === 'contra' ? 'NÃO' : 'ABST'}
                           </span>
                        </div>
                     )}
                   </div>
                   <p className="text-xs font-bold text-foreground text-center truncate w-full">
                     {presenca.vereador?.nome_parlamentar || presenca.vereador?.nome}
                   </p>
                   <p className="text-[10px] text-muted-foreground font-medium uppercase text-center truncate w-full">
                     {presenca.vereador?.partido?.sigla}
                   </p>
                 </div>
               );
             })}
          </div>
        </div>
      </main>

      {/* Footer Info Bar */}
      <footer className="h-10 bg-card/40 backdrop-blur border-t flex items-center justify-between px-8 text-[10px] text-muted-foreground uppercase tracking-widest font-medium shrink-0">
         <div className="flex items-center gap-6">
            <span>Transmissão ao vivo via YouTube</span>
            <span className="w-1 h-1 bg-primary rounded-full"></span>
            <span>Sistema SessionSync</span>
         </div>
         <div className="flex items-center gap-2">
            <span>Aponte a câmera para o QR Code</span>
            <QrCode className="h-4 w-4 text-foreground" />
         </div>
      </footer>
    </div>
  );
}

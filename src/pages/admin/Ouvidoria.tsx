import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { apiCall } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { MessageCircle, QrCode, Search, Send, User, Bot, Clock, CheckCircle2, AlertCircle, RefreshCw, PowerOff } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Ticket {
  id: string;
  whatsapp_number: string;
  nome: string | null;
  assunto: string | null;
  status: 'novo' | 'em_atendimento' | 'triagem' | 'coleta' | 'concluido';
  handled_by: 'ia' | 'humano';
  last_message_at: string;
  protocolo?: string;
  tipo_manifestacao?: string;
  resumo_ia?: string;
  unread_count?: number;
}

interface Message {
  id: string;
  from_type: 'cidadao' | 'ia' | 'humano' | 'admin';
  body: string;
  created_at: string;
}

interface WhatsAppStatus {
  ready: boolean;
  hasQr: boolean;
  qr: string | null;
}

export default function Ouvidoria() {
  const { toast } = useToast();
  const { profile } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [waStatus, setWaStatus] = useState<WhatsAppStatus>({ ready: false, hasQr: false, qr: null });
  const [view, setView] = useState<'chat' | 'settings'>('chat');
  const [searchTerm, setSearchTerm] = useState('');
  const [isStarting, setIsStarting] = useState(false);

  // API baseURL for the isolated worker
  // In production, the worker is proxied through Nginx at /worker-api/whatsapp
  // In development, it runs on localhost:3005
  const WORKER_API_URL = import.meta.env.VITE_WORKER_URL
    ? `${(import.meta.env.VITE_WORKER_URL as string).replace(/\/$/, '')}/api/whatsapp`
    : (import.meta.env.DEV ? 'http://localhost:3005/api/whatsapp' : '/worker-api/whatsapp');

  // 1. Carregar status do WhatsApp
  const fetchWaStatus = async () => {
    if (!profile?.camara_id) return;
    try {
      const response = await fetch(`${WORKER_API_URL}/status?camara_id=${profile.camara_id}`);
      const resp = await response.json();

      if (resp) {
        setWaStatus(resp);
        if (resp.qr || resp.ready) {
          setIsStarting(false);
        }
      }
    } catch (error) {
      console.error('Erro ao buscar status WA do Worker:', error);
    }
  };

  const startWhatsApp = async () => {
    if (!profile?.camara_id) return;

    setIsStarting(true);
    try {
      await fetch(`${WORKER_API_URL}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ camara_id: profile.camara_id })
      });

      toast({
        title: 'Iniciando conexão...',
        description: 'Isso pode levar alguns minutos na primeira vez enquanto baixamos os recursos.'
      });

      // Retry logic for QR code
      let attempts = 0;
      const checkInterval = setInterval(async () => {
        attempts++;
        try {
          const response = await fetch(`${WORKER_API_URL}/status?camara_id=${profile.camara_id}`);
          const resp = await response.json();

          if (resp && (resp.qr || resp.ready)) {
            setWaStatus(resp);
            setIsStarting(false);
            clearInterval(checkInterval);
          }
        } catch (e) { console.error(e); }

        if (attempts > 30) { // Timeout after 60s
          clearInterval(checkInterval);
          setIsStarting(false);
          if (!waStatus.ready && !waStatus.qr) {
            toast({
              variant: 'destructive',
              title: 'Tempo excedido',
              description: 'Não foi possível gerar o QR Code a tempo. Tente novamente.'
            });
          }
        }
      }, 2000);

    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro ao iniciar',
        description: 'Não foi possível se comunicar com o motor WhatsApp.'
      });
      setIsStarting(false);
    }
  };

  const logoutWhatsApp = async () => {
    if (!profile?.camara_id) return;
    try {
      await fetch(`${WORKER_API_URL}/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ camara_id: profile.camara_id })
      });
      setWaStatus({ ready: false, hasQr: false, qr: null });
      toast({ title: 'Desconectado com sucesso' });
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchWaStatus();
  }, [profile?.camara_id]);

  // 2. Carregar tickets via Worker (Bypass RLS local)
  const fetchTickets = async () => {
    try {
      if (!profile?.camara_id) return;

      const response = await fetch(`${WORKER_API_URL}/tickets?camara_id=${profile.camara_id}`);
      const result = await response.json();

      if (result.success && result.data) {
        // Mapeia para o formato correto
        const mapped = result.data.map((d: any) => ({
          ...d,
          last_message_at: d.updated_at
        }));
        setTickets(mapped as Ticket[]);
      }
    } catch (error) {
      console.error('Error fetching tickets via API', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar atendimentos',
        description: 'Não foi possível buscar a lista de conversas.'
      });
    } finally {
      setLoading(false);
    }
  };

  // 3. Carregar mensagens de um ticket via Worker (Bypass RLS local)
  const fetchMessages = async (ticketId: string) => {
    try {
      const response = await fetch(`${WORKER_API_URL}/messages?ticket_id=${ticketId}`);
      const result = await response.json();

      if (result.success && result.data) {
        setMessages(result.data as Message[]);
      }
    } catch (error) {
      console.error('Erro ao buscar mensagens:', error);
    }
  };

  // 4. Enviar mensagem
  const handleSendMessage = async () => {
    if (!selectedTicket || !newMessage.trim()) return;

    const tempMsg: Message = {
      id: 'temp-' + Date.now(),
      from_type: 'admin', // Mudado de humano para admin para refletir o schema
      body: newMessage,
      created_at: new Date().toISOString()
    };

    setMessages(prev => [...prev, tempMsg]);
    setNewMessage('');

    try {
      const { error } = await supabase
        .from('ouvidoria_messages')
        .insert({
          ticket_id: selectedTicket.id,
          camara_id: profile?.camara_id,
          from_type: 'admin',
          direction: 'outbound',
          body: tempMsg.body
        });

      if (error) throw error;

      // Atualiza o ticket para refletir que um humano tocou nele (opcional depende da regra, por hora só atualiza data)
      await supabase
        .from('ouvidoria_tickets')
        .update({
          updated_at: new Date().toISOString(),
          status: 'em_atendimento',
          ia_session_active: false // Pausa a IA quando o admin responde
        })
        .eq('id', selectedTicket.id);

    } catch (error) {
      console.error("Erro COMPLETO:", JSON.stringify(error, null, 2));
      toast({
        variant: 'destructive',
        title: 'Erro ao enviar',
        description: 'Sua mensagem não pôde ser enviada.'
      });
    }
  };

  useEffect(() => {
    fetchWaStatus();
    fetchTickets();

    // Polling simples para status e tickets (ideal seria realtime)
    const interval = setInterval(() => {
      fetchWaStatus();
      if (!selectedTicket) fetchTickets(); // Só atualiza lista se não estiver focado
    }, 10000);

    return () => clearInterval(interval);
  }, [selectedTicket]);

  useEffect(() => {
    if (selectedTicket) {
      fetchMessages(selectedTicket.id);

      // Supabase Real-time messages for this ticket
      const channel = supabase
        .channel(`messages-${selectedTicket.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'ouvidoria_messages', filter: `ticket_id=eq.${selectedTicket.id}` },
          () => {
            fetchMessages(selectedTicket.id);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [selectedTicket]);

  // Real-time listener for new tickets overall
  useEffect(() => {
    if (!profile?.camara_id) return;

    const ticketChannel = supabase
      .channel('public:ouvidoria_tickets')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ouvidoria_tickets', filter: `camara_id=eq.${profile.camara_id}` },
        () => {
          fetchTickets();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ticketChannel);
    };
  }, [profile?.camara_id]);

  const filteredTickets = tickets.filter(t =>
    (t.nome && t.nome.toLowerCase().includes(searchTerm.toLowerCase())) ||
    t.whatsapp_number.includes(searchTerm)
  );

  return (
    <MainLayout>
      <div className="h-[calc(100vh-100px)] flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <MessageCircle className="w-6 h-6 text-primary" />
              Ouvidoria Digital
            </h1>
            <p className="text-muted-foreground">
              Atendimento via WhatsApp integrado com IA
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={view === 'chat' ? 'default' : 'outline'}
              onClick={() => setView('chat')}
            >
              Atendimentos
            </Button>
            <Button
              variant={view === 'settings' ? 'default' : 'outline'}
              onClick={() => setView('settings')}
            >
              <QrCode className="w-4 h-4 mr-2" />
              Conexão WhatsApp
            </Button>
          </div>
        </div>

        {view === 'settings' ? (
          <Card className="max-w-2xl mx-auto mt-8">
            <CardHeader>
              <CardTitle>Conexão com WhatsApp</CardTitle>
              <CardDescription>
                Escaneie o QR Code com o celular de atendimento da sua Câmara para ativar a Ouvidoria.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-6 py-8">
              {waStatus.ready ? (
                <div className="flex flex-col items-center gap-4 text-green-600">
                  <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
                    <CheckCircle2 className="w-10 h-10" />
                  </div>
                  <h3 className="text-xl font-semibold">WhatsApp Conectado!</h3>
                  <p className="text-muted-foreground text-center">
                    O sistema está pronto para receber e responder mensagens da sua Câmara.
                  </p>
                  <Button variant="outline" onClick={logoutWhatsApp}>
                    Desconectar Aparelho
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  {waStatus.qr ? (
                    <div className="flex flex-col items-center gap-4">
                      <div className="p-4 bg-white rounded-lg shadow-sm border">
                        <img src={waStatus.qr} alt="QR Code WhatsApp" className="w-64 h-64" />
                      </div>
                      <p className="text-sm text-muted-foreground text-center max-w-sm mt-2">
                        Abra o WhatsApp no celular Oficial da Câmara, vá em "Aparelhos Conectados" e escaneie este código.
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-64 h-64 bg-muted/30 flex items-center justify-center rounded-lg border-2 border-dashed">
                        <div className="flex flex-col items-center text-muted-foreground">
                          {isStarting ? (
                            <>
                              <RefreshCw className="w-8 h-8 animate-spin mb-2" />
                              <span>Iniciando motor da Câmara...</span>
                            </>
                          ) : (
                            <>
                              <QrCode className="w-8 h-8 mb-2 opacity-50" />
                              <span>Sessão Offline</span>
                            </>
                          )}
                        </div>
                      </div>

                      {!isStarting && (
                        <Button onClick={startWhatsApp} className="w-full max-w-xs">
                          Gerar QR Code de Conexão
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-1 gap-4 overflow-hidden">
            {/* Lista de Tickets */}
            <Card className="w-1/3 flex flex-col">
              <div className="p-4 border-b">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar conversa..."
                    className="pl-9"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
              <ScrollArea className="flex-1">
                <div className="divide-y">
                  {loading ? (
                    <div className="p-4 text-center text-muted-foreground">Carregando...</div>
                  ) : filteredTickets.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground flex flex-col items-center">
                      <MessageCircle className="w-10 h-10 mb-2 opacity-20" />
                      <p>Nenhum atendimento encontrado.</p>
                    </div>
                  ) : (
                    filteredTickets.map(ticket => (
                      <button
                        key={ticket.id}
                        onClick={() => setSelectedTicket(ticket)}
                        className={`w-full text-left p-4 hover:bg-muted/50 transition-colors flex gap-3 border-b border-muted/30 ${selectedTicket?.id === ticket.id ? 'bg-muted/80 border-l-4 border-l-primary' : ''}`}
                      >
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold shrink-0">
                          {ticket.nome ? ticket.nome.charAt(0).toUpperCase() : <User className="w-5 h-5" />}
                        </div>
                        <div className="flex-1 overflow-hidden">
                          <div className="flex justify-between items-start mb-1">
                            <span className="font-semibold truncate">
                              {ticket.nome || ticket.whatsapp_number}
                            </span>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {format(new Date(ticket.last_message_at), 'HH:mm', { locale: ptBR })}
                            </span>
                          </div>

                          <div className="flex justify-between items-center mb-1">
                            <p className="text-xs font-mono text-muted-foreground">
                              {ticket.protocolo}
                            </p>
                            <span className="text-xs font-medium text-muted-foreground">
                              {ticket.assunto || 'Atendimento Inicial'}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <Badge variant={ticket.status === 'novo' ? 'default' : ticket.status === 'concluido' ? 'outline' : 'secondary'} className="text-[10px] h-5">
                              {ticket.status === 'novo' ? 'Aguardando' : (ticket.status as string) === 'em_atendimento' || (ticket.status as string) === 'triagem' || (ticket.status as string) === 'coleta' ? 'Em Andamento' : 'Concluído'}
                            </Badge>
                            {ticket.tipo_manifestacao && (
                              <Badge variant="outline" className="text-[10px] h-5 border-purple-200 text-purple-600 bg-purple-50">
                                {ticket.tipo_manifestacao}
                              </Badge>
                            )}
                            {ticket.handled_by === 'ia' && (
                              <Badge variant="outline" className="text-[10px] h-5 border-blue-200 text-blue-600 bg-blue-50">
                                <Bot className="w-3 h-3 mr-1" /> IA
                              </Badge>
                            )}
                          </div>

                          {ticket.resumo_ia && (
                            <div className="mt-3 bg-muted/30 p-2 rounded-md border text-xs">
                              <span className="font-semibold text-primary/80 mb-1 block">Resumo IA:</span>
                              <p className="text-muted-foreground leading-relaxed line-clamp-3">
                                {ticket.resumo_ia}
                              </p>
                            </div>
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>
            </Card>

            {/* Área de Chat */}
            <Card className="flex-1 flex flex-col">
              {selectedTicket ? (
                <>
                  <CardHeader className="py-3 px-4 border-b flex flex-row items-center justify-between space-y-0">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                        {selectedTicket.nome ? selectedTicket.nome.charAt(0).toUpperCase() : <User className="w-5 h-5" />}
                      </div>
                      <div>
                        <CardTitle className="text-base">
                          {selectedTicket.nome || selectedTicket.whatsapp_number}
                        </CardTitle>
                        <CardDescription className="text-xs flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                          WhatsApp • {selectedTicket.whatsapp_number}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {selectedTicket.protocolo && (
                        <Badge variant="secondary" className="font-mono text-xs">
                          {selectedTicket.protocolo}
                        </Badge>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          await supabase.from('ouvidoria_tickets').update({ status: 'concluido' }).eq('id', selectedTicket.id);
                          setSelectedTicket(null);
                          toast({ title: 'Atendimento encerrado' });
                        }}
                      >
                        Encerrar
                      </Button>
                    </div>
                  </CardHeader>

                  {/* Banner de Informações da Ouvidoria */}
                  <div className="px-4 py-3 bg-muted/40 border-b flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={selectedTicket.status === 'novo' ? 'default' : selectedTicket.status === 'concluido' ? 'outline' : 'secondary'} className="text-xs">
                        {selectedTicket.status === 'novo' ? 'Aguardando' : selectedTicket.status === 'concluido' ? 'Concluído' : 'Em Andamento'}
                      </Badge>
                      {selectedTicket.tipo_manifestacao && (
                        <Badge variant="outline" className="text-xs border-purple-200 text-purple-700 bg-purple-50">
                          {selectedTicket.tipo_manifestacao}
                        </Badge>
                      )}
                      {selectedTicket.handled_by === 'ia' && (
                        <Badge variant="outline" className="text-xs border-blue-200 text-blue-700 bg-blue-50">
                          <Bot className="w-3 h-3 mr-1" /> Inteligência Artificial
                        </Badge>
                      )}
                    </div>
                    {selectedTicket.resumo_ia && (
                      <div className="mt-1 flex flex-col gap-1">
                        <span className="text-xs font-semibold text-primary/80 uppercase tracking-wider">Resumo Gerado Pela IA</span>
                        <p className="text-sm bg-white p-3 rounded-md border text-slate-700 shadow-sm">
                          {selectedTicket.resumo_ia}
                        </p>
                      </div>
                    )}
                  </div>

                  <ScrollArea className="flex-1 p-4 bg-muted/20">
                    <div className="flex flex-col gap-4">
                      {messages.map((msg) => {
                        const isMe = msg.from_type !== 'cidadao';
                        return (
                          <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                            <div
                              className={`
                                max-w-[80%] rounded-2xl px-4 py-2 text-sm shadow-sm
                                ${isMe
                                  ? 'bg-primary text-primary-foreground rounded-br-none'
                                  : 'bg-white border rounded-bl-none'
                                }
                              `}
                            >
                              {msg.from_type === 'ia' && (
                                <div className="text-[10px] uppercase font-bold opacity-70 mb-1 flex items-center gap-1">
                                  <Bot className="w-3 h-3" /> Resposta Automática
                                </div>
                              )}
                              {(() => {
                                const mediaRegex = /\[MEDIA:(.+?)\]\s+(https?:\/\/[^\s]+)/g;
                                if (!mediaRegex.test(msg.body)) {
                                  return <p className="whitespace-pre-wrap">{msg.body}</p>;
                                }

                                const parts = msg.body.split(mediaRegex);
                                const elements = [];

                                for (let i = 0; i < parts.length; i++) {
                                  // As regex split with 2 capture groups returns: [textBefore, group1, group2, textAfter...]
                                  // So every 3rd index (0, 3, 6...) is normal text
                                  if (i % 3 === 0) {
                                    if (parts[i] && parts[i].trim() !== '') {
                                      elements.push(<span key={`text-${i}`} className="whitespace-pre-wrap block mb-2">{parts[i]}</span>);
                                    }
                                  } else if (i % 3 === 1) {
                                    // This is the MIME type (group 1)
                                    const mime = parts[i];
                                    const url = parts[i + 1]; // The URL is always the next item (group 2)

                                    if (mime.startsWith('image/')) {
                                      elements.push(
                                        <a href={url} target="_blank" rel="noreferrer" key={`media-${i}`}>
                                          <img src={url} alt="Mídia Anexada" className="max-w-full rounded-lg mt-2 mb-2 max-h-[300px] object-cover cursor-pointer hover:opacity-90 transition-opacity" />
                                        </a>
                                      );
                                    } else if (mime.startsWith('video/')) {
                                      elements.push(
                                        <video src={url} controls className="max-w-full rounded-lg mt-2 mb-2 max-h-[300px]" key={`media-${i}`} />
                                      );
                                    } else if (mime.startsWith('audio/') || mime === 'ogg') {
                                      elements.push(
                                        <audio src={url} controls className="max-w-full mt-2 mb-2" key={`media-${i}`} />
                                      );
                                    } else {
                                      elements.push(
                                        <a href={url} target="_blank" rel="noreferrer" key={`media-${i}`} className="flex items-center gap-2 underline mt-2 mb-2 p-2 rounded bg-black/5 dark:bg-white/10">
                                          📎 Visualizar Anexo ({mime})
                                        </a>
                                      );
                                    }
                                    i++; // Skip the url part manually so it doesn't get processed in the next iteration
                                  }
                                }
                                return <div className="flex flex-col">{elements}</div>;
                              })()}
                              <p className={`text-[10px] mt-1 text-right ${isMe ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                                {format(new Date(msg.created_at), 'HH:mm')}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>

                  <div className="p-4 border-t bg-background">
                    <div className="flex gap-2">
                      <Textarea
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Digite sua resposta..."
                        className="min-h-[50px] max-h-[150px] resize-none"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendMessage();
                          }
                        }}
                      />
                      <Button
                        onClick={handleSendMessage}
                        disabled={!newMessage.trim()}
                        className="h-auto w-14"
                      >
                        <Send className="w-5 h-5" />
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-2 text-center">
                      Ao responder, o modo IA será pausado temporariamente para este atendimento.
                    </p>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                    <MessageCircle className="w-8 h-8 opacity-50" />
                  </div>
                  <h3 className="text-lg font-semibold mb-1">Nenhuma conversa selecionada</h3>
                  <p className="text-sm max-w-xs text-center">
                    Selecione um atendimento na lista ao lado para ver o histórico e responder.
                  </p>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </MainLayout>
  );
}

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
import { MessageCircle, QrCode, Search, Send, User, Bot, Clock, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Ticket {
  id: string;
  whatsapp_number: string;
  nome: string | null;
  assunto: string | null;
  status: 'novo' | 'em_atendimento' | 'concluido';
  handled_by: 'ia' | 'humano';
  last_message_at: string;
  unread_count?: number;
}

interface Message {
  id: string;
  from_type: 'cidadao' | 'ia' | 'humano';
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
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [waStatus, setWaStatus] = useState<WhatsAppStatus>({ ready: false, hasQr: false, qr: null });
  const [view, setView] = useState<'chat' | 'settings'>('chat');
  const [searchTerm, setSearchTerm] = useState('');
  const [isStarting, setIsStarting] = useState(false);

  // 1. Carregar status do WhatsApp
  const fetchWaStatus = async () => {
    try {
      const resp = await apiCall('/ouvidoria/whatsapp/qr', undefined, 'GET');
      if (resp) {
        setWaStatus(resp);
        // Se receber QR code ou estiver pronto, parar o spinner
        if (resp.qr || resp.ready) {
            setIsStarting(false);
        }
      }
    } catch (error) {
      console.error('Erro ao buscar status WA:', error);
    }
  };

  const startWhatsApp = async () => {
    setIsStarting(true);
    try {
      await apiCall('/ouvidoria/whatsapp/start', {}, 'POST');
      toast({
        title: 'Iniciando conexão...',
        description: 'Isso pode levar alguns minutos na primeira vez enquanto baixamos os recursos.'
      });
      
      // Retry logic for QR code
      let attempts = 0;
      const checkInterval = setInterval(async () => {
          attempts++;
          try {
              const resp = await apiCall('/ouvidoria/whatsapp/qr', undefined, 'GET');
              if (resp && (resp.qr || resp.ready)) {
                  setWaStatus(resp);
                  setIsStarting(false);
                  clearInterval(checkInterval);
              }
          } catch (e) { console.error(e); }
          
          if (attempts > 90) { // Timeout after 180s (90 * 2s)
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
        description: 'Não foi possível iniciar o cliente WhatsApp.'
      });
      setIsStarting(false);
    }
  };

  // 2. Carregar tickets
  const fetchTickets = async () => {
    try {
      const resp = await apiCall('/ouvidoria/tickets', undefined, 'GET');
      if (resp && resp.tickets) {
        setTickets(resp.tickets);
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar atendimentos',
        description: 'Não foi possível buscar a lista de conversas.'
      });
    } finally {
      setLoading(false);
    }
  };

  // 3. Carregar mensagens de um ticket
  const fetchMessages = async (ticketId: string) => {
    try {
      const resp = await apiCall(`/ouvidoria/tickets/${ticketId}`, undefined, 'GET');
      if (resp && resp.messages) {
        setMessages(resp.messages);
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
      from_type: 'humano',
      body: newMessage,
      created_at: new Date().toISOString()
    };

    setMessages(prev => [...prev, tempMsg]);
    setNewMessage('');

    try {
      const resp = await apiCall(`/ouvidoria/tickets/${selectedTicket.id}/reply`, {
        message: tempMsg.body
      });

      if (resp && resp.success) {
        // Recarrega para pegar ID real
        fetchMessages(selectedTicket.id);
      } else {
        throw new Error('Falha no envio');
      }
    } catch (error) {
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
      // Polling de mensagens
      const msgInterval = setInterval(() => {
        fetchMessages(selectedTicket.id);
      }, 5000);
      return () => clearInterval(msgInterval);
    }
  }, [selectedTicket]);

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
                Escaneie o QR Code com o celular da Câmara para ativar a Ouvidoria.
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
                    O sistema está pronto para receber e responder mensagens.
                  </p>
                  <Button variant="outline" onClick={() => apiCall('/ouvidoria/whatsapp/logout')}>
                    Desconectar
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  {waStatus.qr ? (
                    <div className="p-4 bg-white rounded-lg shadow-sm border">
                      <img src={waStatus.qr} alt="QR Code WhatsApp" className="w-64 h-64" />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-4">
                        <div className="w-64 h-64 bg-muted/30 flex items-center justify-center rounded-lg border-2 border-dashed">
                          <div className="flex flex-col items-center text-muted-foreground">
                            {isStarting ? (
                                <>
                                    <RefreshCw className="w-8 h-8 animate-spin mb-2" />
                                    <span>Iniciando sessão...</span>
                                </>
                            ) : (
                                <>
                                    <QrCode className="w-8 h-8 mb-2 opacity-50" />
                                    <span>Aguardando conexão</span>
                                </>
                            )}
                          </div>
                        </div>
                        
                        {!isStarting && (
                            <Button onClick={startWhatsApp} className="w-full max-w-xs">
                                Conectar Dispositivo
                            </Button>
                        )}
                    </div>
                  )}
                  <p className="text-sm text-muted-foreground max-w-sm text-center">
                    Clique em "Conectar Dispositivo" e escaneie o QR Code com o celular da Câmara.
                  </p>
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
                        className={`w-full text-left p-4 hover:bg-muted/50 transition-colors flex gap-3 ${selectedTicket?.id === ticket.id ? 'bg-muted' : ''}`}
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
                          <p className="text-sm text-muted-foreground truncate">
                            {ticket.assunto || 'Novo contato'}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <Badge variant={ticket.status === 'novo' ? 'default' : 'secondary'} className="text-[10px] h-5">
                              {ticket.status}
                            </Badge>
                            {ticket.handled_by === 'ia' && (
                              <Badge variant="outline" className="text-[10px] h-5 border-blue-200 text-blue-600 bg-blue-50">
                                <Bot className="w-3 h-3 mr-1" /> IA
                              </Badge>
                            )}
                          </div>
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
                       {/* Ações do ticket aqui (Encerrar, Assumir, etc) */}
                       <Button variant="outline" size="sm">
                         Encerrar Atendimento
                       </Button>
                    </div>
                  </CardHeader>

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
                              <p className="whitespace-pre-wrap">{msg.body}</p>
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

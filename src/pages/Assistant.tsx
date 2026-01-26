import { useState, useRef, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { Toggle } from '@/components/ui/toggle';
import { 
  Send, 
  Bot, 
  User, 
  Sparkles,
  FileText,
  Search,
  BarChart3,
  Loader2,
  RefreshCw,
  Scale
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { apiCall } from '@/lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sources?: { document_title?: string; metadata?: { session_title?: string; title?: string }; similarity?: number }[];
  mode?: 'session' | 'legal';
}

const suggestedQuestions = [
  { icon: FileText, text: "Resuma a última sessão ordinária" },
  { icon: Search, text: "Quais projetos foram votados este mês?" },
  { icon: BarChart3, text: "Qual vereador mais discursou?" },
  { icon: Sparkles, text: "Gere uma análise das sessões recentes" },
];

export default function Assistant() {
  const { profile, session, loading } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [hasSynced, setHasSynced] = useState(false);
  const [legalMode, setLegalMode] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [openSources, setOpenSources] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Auto-sync on mount (silent)
  useEffect(() => {
    if (profile?.camara_id && !hasSynced) {
      apiCall('/trigger-sync', {})
        .then(() => console.log('Background sync triggered'))
        .catch(e => console.error('Background sync failed', e));
      setHasSynced(true);
    }
  }, [profile, hasSynced]);

  const handleSend = async (messageText?: string) => {
    const text = messageText || input.trim();
    if (!text || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date(),
      mode: legalMode ? 'legal' : 'session'
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      let data;
      
      if (legalMode) {
        // Legal Analysis Mode
        data = await apiCall('/analyze-proposal', {
            proposal: text,
            camaraId: profile?.camara_id
        });
        // Normalize response structure
        data = { answer: data.analysis, sources: data.sources };
      } else {
        // Standard Session RAG Mode
        data = await apiCall('/ask', { 
            query: text,
            camaraId: profile?.camara_id,
            history: messages // Send previous messages
        });
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.answer,
        timestamp: new Date(),
        sources: data.sources || [],
        mode: legalMode ? 'legal' : 'session'
      };
      setMessages(prev => [...prev, assistantMessage]);

    } catch (error: unknown) {
      console.error('Assistant Error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      toast.error(errorMessage);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "Desculpe, encontrei um erro ao processar sua solicitação. Se você acabou de adicionar sessões, tente clicar em 'Sincronizar Conhecimento' abaixo.",
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <MainLayout>
      <div className="h-[calc(100vh-5rem)] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 px-4 pt-2 shrink-0">
           <div className="flex items-center gap-2">
              <Toggle 
                pressed={legalMode} 
                onPressedChange={setLegalMode}
                variant="outline"
                className={cn(
                    "gap-2 border-primary/20 data-[state=on]:bg-blue-50 data-[state=on]:text-blue-700 data-[state=on]:border-blue-200 transition-all",
                    legalMode ? "bg-blue-50 shadow-sm" : "hover:bg-muted"
                )}
              >
                <Scale className="w-4 h-4" />
                {legalMode ? "Modo: Guardião da Legalidade" : "Ativar Análise Legal"}
              </Toggle>
           </div>
        </div>

        {/* Chat Container */}
        <Card className={cn("flex-1 flex flex-col overflow-hidden border-border/50 transition-colors duration-500 mx-4 mb-4 shadow-lg backdrop-blur-sm bg-card/80", legalMode ? "border-blue-200/50 bg-blue-50/10" : "")}>
          {messages.length === 0 ? (
            /* Empty State */
            <div className="flex-1 flex flex-col items-center justify-center p-8 overflow-y-auto">
              <img 
                src="/iconsessionsync_black.svg" 
                alt="Assistant Logo" 
                className="w-20 h-20 mb-6 opacity-80" 
              />
              <h2 className="text-xl font-semibold text-foreground mb-2">
                {legalMode ? "Guardião da Legalidade" : "Como posso ajudar?"}
              </h2>
              <p className="text-muted-foreground text-center max-w-md mb-8 leading-relaxed">
                {legalMode 
                  ? "Envie uma proposta para eu analisar a constitucionalidade com base na Lei Orgânica e Regimento."
                  : "Sou seu assistente especializado em sessões parlamentares. Posso buscar informações, gerar resumos e análises."
                }
              </p>
              
              <div className="flex flex-col items-center w-full max-w-2xl gap-6">
                {!legalMode && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                    {suggestedQuestions.map((question, index) => (
                        <button
                        key={index}
                        onClick={() => handleSend(question.text)}
                        className="flex items-center gap-3 p-4 rounded-xl border border-border/50 bg-card hover:bg-secondary/50 hover:border-primary/20 hover:shadow-md transition-all text-left group"
                        >
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                            <question.icon className="w-5 h-5 text-primary" />
                        </div>
                        <span className="text-sm text-foreground/80 group-hover:text-foreground">{question.text}</span>
                        </button>
                    ))}
                    </div>
                )}

                {legalMode && (
                    <div className="w-full max-w-lg p-4 bg-blue-50/50 border border-blue-100 rounded-xl text-sm text-blue-800">
                        <p className="font-semibold mb-2">Exemplos de propostas para análise:</p>
                        <ul className="list-disc list-inside space-y-1 opacity-90">
                            <li>"Quero obrigar o comércio a pintar fachadas de amarelo."</li>
                            <li>"Criar um cargo de assessor na prefeitura."</li>
                            <li>"Instituir o dia do combate à dengue."</li>
                        </ul>
                    </div>
                )}


              </div>
            </div>
          ) : (
            /* Messages */
            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
              <div className="space-y-6 max-w-3xl mx-auto pb-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "flex gap-3 animate-in slide-in-from-bottom-2 fade-in duration-300",
                      message.role === 'user' ? "justify-end" : "justify-start"
                    )}
                  >
                    {message.role === 'assistant' && (
                      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm", message.mode === 'legal' ? "bg-blue-600" : "gradient-primary")}>
                        {message.mode === 'legal' ? <Scale className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-white" />}
                      </div>
                    )}
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-5 py-3.5 shadow-sm",
                        message.role === 'user'
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary/50 text-foreground border border-border/50"
                      )}
                    >
                      <div className="text-sm leading-relaxed prose prose-invert max-w-none whitespace-pre-wrap">
                        {message.content}
                      </div>
                      
                      {message.sources && message.sources.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-white/10">
                          <p 
                            className="font-semibold mb-1 text-xs opacity-80 cursor-pointer hover:underline flex items-center gap-1"
                            onClick={() => setOpenSources(prev => ({ ...prev, [message.id]: !prev[message.id] }))}
                            aria-expanded={openSources[message.id] ? 'true' : 'false'}
                          >
                            <Search className="w-3 h-3" />
                            {message.mode === 'legal' ? "Fundamentação Legal" : "Fontes Encontradas"}
                          </p>
                          {openSources[message.id] && (
                            <div className="mt-2 text-xs opacity-80 bg-black/10 rounded-md p-2">
                              <ul className="list-disc list-inside space-y-1">
                                {message.sources.map((source, idx) => (
                                  <li key={idx} className="truncate" title={message.mode === 'legal' ? source.document_title : source.metadata?.title}>
                                    {message.mode === 'legal' 
                                        ? `${source.document_title} (Similaridade: ${((source.similarity || 0) * 100).toFixed(0)}%)`
                                        : `${source.metadata?.session_title} - ${source.metadata?.title}`
                                    }
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}

                      <div className={cn(
                        "text-[10px] mt-1 opacity-60 font-mono",
                        message.role === 'user' ? "text-right" : "text-left"
                      )}>
                        {message.timestamp.toLocaleTimeString('pt-BR', { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </div>
                    </div>
                    {message.role === 'user' && (
                      <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center shrink-0 border border-accent/10">
                        <User className="w-4 h-4 text-accent" />
                      </div>
                    )}
                  </div>
                ))}
                
                {isLoading && (
                  <div className="flex gap-3 justify-start animate-in fade-in duration-300">
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm", legalMode ? "bg-blue-600" : "gradient-primary")}>
                       {legalMode ? <Scale className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-white" />}
                    </div>
                    <div className="bg-secondary/50 rounded-2xl px-5 py-3.5 border border-border/50">
                      <div className="flex items-center gap-3 text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        <span className="text-sm font-medium">
                            {legalMode ? "Analisando juridicamente..." : "Analisando sessões..."}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}

          {/* Input Area */}
          <div className="p-4 border-t border-border/50 bg-card/30 backdrop-blur-md">
            <div className="max-w-4xl mx-auto flex gap-3 items-end">
              <div className="relative flex-1 group">
                  <Textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={legalMode 
                        ? "Descreva a proposta para análise de constitucionalidade..." 
                        : "Pergunte sobre sessões, projetos, votações..."}
                    className={cn(
                        "min-h-[60px] max-h-40 resize-none bg-background/50 border-border/60 focus:bg-background transition-all shadow-sm rounded-xl py-3 px-4", 
                        legalMode ? "border-blue-200 focus-visible:ring-blue-400" : "focus-visible:ring-primary/30"
                    )}
                    rows={1}
                  />
                  <div className="absolute right-3 bottom-3 text-xs text-muted-foreground/50 pointer-events-none group-hover:text-muted-foreground/80 transition-colors">
                      Enter para enviar
                  </div>
              </div>
              <Button
                onClick={() => handleSend()}
                disabled={!input.trim() || isLoading}
                className={cn("h-[60px] w-[60px] shrink-0 rounded-xl shadow-md hover:scale-105 transition-all active:scale-95", legalMode ? "bg-blue-600 hover:bg-blue-700" : "gradient-primary")}
                variant={legalMode ? "default" : "default"}
              >
                <Send className="w-6 h-6" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground text-center mt-3 opacity-80">
              {legalMode 
                ? "O Guardião da Legalidade verifica conflitos com a Lei Orgânica e Regimento Interno."
                : "O assistente tem acesso a todas as sessões transcritas e pode gerar análises detalhadas."
              }
            </p>
          </div>
        </Card>
      </div>
    </MainLayout>
  );
}

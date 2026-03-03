import { useState, useMemo, useRef, useCallback } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { BlockEditor } from '@/components/editor/BlockEditor';
import { MinutesEditor } from '@/components/editor/MinutesEditor';
import { SpeakersPanel } from '@/components/editor/SpeakersPanel';
import { ReviewPanel } from '@/components/editor/ReviewPanel';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Save, Sparkles, FileText, Blocks, Copy, Search, ChevronUp, ChevronDown, PlayCircle, Video, RefreshCw, HelpCircle, Users, PanelRightClose, PanelRightOpen, Loader2, ClipboardCheck } from 'lucide-react';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn, apiCall } from '@/lib/utils';
import { Link, useParams } from 'react-router-dom';
import { TranscriptionBlock, SessionType, sessionTypeLabels } from '@/types/transcription';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Json } from '@/integrations/supabase/types';
import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useSessionData } from '@/hooks/useSessionData';
import { useTranscriptSearch } from '@/hooks/useTranscriptSearch';
import { handleExport as doExport } from '@/lib/exportSession';
import { Skeleton } from '@/components/ui/skeleton';

// Helper to extract YouTube ID
const getYouTubeID = (url: string) => {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
};

// Helper to format date safely
const formatDate = (dateStr: string): string => {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
};

// Concurrency-limited parallel execution
async function parallelMap<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency = 3
): Promise<(R | null)[]> {
  const results: (R | null)[] = new Array(items.length).fill(null);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      try { results[i] = await fn(items[i], i); } catch { results[i] = null; }
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// --- Minutes Templates by Session Type ---
function buildMinutesTemplate(
  sessionType: SessionType,
  sessionTitle: string,
  blocks: TranscriptionBlock[]
): string {
  const getContent = (type: string) => {
    const block = blocks.find(b => b.type === type);
    return block?.summary || block?.content || '';
  };
  // Also check legacy type names
  const getContentMulti = (...types: string[]) => {
    for (const t of types) {
      const c = getContent(t);
      if (c) return c;
    }
    return '';
  };

  const abertura = getContentMulti('abertura', 'cabecalho');
  const peqExpediente = getContentMulti('pequeno_expediente', 'expediente');
  const gdeExpediente = getContentMulti('grande_expediente', 'explicacoes_pessoais', 'comunicacoes');
  const ordemDia = getContentMulti('ordem_dia', 'discussao');
  const votacoes = getContent('votacao');
  const encerramento = getContent('encerramento');

  if (sessionType === 'extraordinaria') {
    return `**ATA DA ${sessionTitle.toUpperCase()}**\n\n# ABERTURA\n${abertura}\n\n# ORDEM DO DIA\n${ordemDia}\n\n# VOTAÇÕES\n${votacoes}\n\n# ENCERRAMENTO\n${encerramento}`;
  }

  if (sessionType === 'solene') {
    return `**ATA DA ${sessionTitle.toUpperCase()}**\n\n# ABERTURA\n${abertura}\n\n# HOMENAGEM / MOTIVO\n${ordemDia}\n\n# PRONUNCIAMENTOS\n${gdeExpediente}\n\n# ENCERRAMENTO\n${encerramento}`;
  }

  // ordinaria (default — full template)
  return `**ATA DA ${sessionTitle.toUpperCase()}**\n\n# ABERTURA\n${abertura}\n\n# PEQUENO EXPEDIENTE\n${peqExpediente}\n\n# GRANDE EXPEDIENTE\n${gdeExpediente}\n\n# ORDEM DO DIA\n${ordemDia}\n\n# VOTAÇÕES\n${votacoes}\n\n# ENCERRAMENTO\n${encerramento}`;
}

export default function SessionEditor() {
  const { id } = useParams<{ id: string }>();

  // --- Custom Hooks ---
  const session = useSessionData(id);
  const search = useTranscriptSearch(session.fullTranscript);

  // --- Local UI state ---
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [processingBlockId, setProcessingBlockId] = useState<string | null>(null);
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('transcript');
  const [isMinutesPanelOpen, setIsMinutesPanelOpen] = useState(false); // collapsed by default
  const [sessionType, setSessionType] = useState<SessionType>('ordinaria');

  // Minutes Generation State
  const [isMinutesModalOpen, setIsMinutesModalOpen] = useState(false);

  // Audio upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);

  // --- Dirty tracking ---
  const [isDirty, setIsDirty] = useState(false);
  const markDirty = useCallback(() => setIsDirty(true), []);

  const setBlocks = useCallback((newBlocks: TranscriptionBlock[]) => {
    session.setBlocks(newBlocks);
    markDirty();
  }, [session, markDirty]);

  const setMinutesContent = useCallback((content: string) => {
    session.setMinutesContent(content);
    markDirty();
  }, [session, markDirty]);

  const setSessionTitle = useCallback((title: string) => {
    session.setSessionTitle(title);
    markDirty();
  }, [session, markDirty]);

  // --- Derived state ---
  const hasUnsummarizedBlocks = useMemo(() => {
    return session.blocks.some(b => !b.summary && b.content.length > 0);
  }, [session.blocks]);

  // --- Block highlight ---
  const highlightBlock = useCallback((blockId: string) => {
    setActiveTab('blocks');
    setTimeout(() => {
      const el = document.getElementById(blockId);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }, []);

  // --- Audio upload ---
  const handleAudioUpdateClick = () => fileInputRef.current?.click();

  const handleAudioFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !id) return;
    try {
      setIsUploadingAudio(true);
      toast.info('Iniciando upload do novo áudio...');
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const fileName = `session_audio/${id}/${Date.now()}-${sanitizedName}`;
      const { uploadUrl, publicUrl } = await apiCall('/generate-upload-url', { filename: fileName, contentType: file.type });
      if (!uploadUrl) throw new Error('Falha ao gerar URL de upload.');
      await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      const { error: dbError } = await supabase.from('sessions').update({ audio_url: publicUrl }).eq('id', id);
      if (dbError) throw dbError;
      session.setAudioUrl(publicUrl);
      toast.success('Áudio atualizado com sucesso!');
    } catch (error) {
      console.error('Erro ao atualizar áudio:', error);
      toast.error(error instanceof Error ? error.message : 'Erro desconhecido ao atualizar áudio.');
    } finally {
      setIsUploadingAudio(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const [selectionStartMarker, setSelectionStartMarker] = useState('');
  const [selectionEndMarker, setSelectionEndMarker] = useState('');
  const [selectionText, setSelectionText] = useState<string | null>(null);

  // --- Knowledge Base Sync ---
  const syncKnowledgeBase = useCallback(() => {
    apiCall('/ingest-session', { sessionId: id }).catch(err => console.error('Background sync failed:', err));
  }, [id]);

  // --- Block operations ---
  const handleBlocksChange = useCallback((newBlocks: TranscriptionBlock[]) => {
    setBlocks(newBlocks);
  }, [setBlocks]);

  const handleBlockUpdate = useCallback((updatedBlock: TranscriptionBlock) => {
    const newBlocks = session.blocks.map(b => b.id === updatedBlock.id ? updatedBlock : b);
    setBlocks(newBlocks);
  }, [session.blocks, setBlocks]);

  const handleOrganizeBlocks = async () => {
    if (!session.fullTranscript) { toast.error('Não há transcrição disponível para organizar.'); return; }
    toast.info('Organizando blocos', { duration: 4000 });
    try {
      const gptData = await apiCall('/process-transcript', { transcript: session.fullTranscript });
      if (gptData?.blocks) {
        setBlocks(gptData.blocks);
        toast.success('Blocos organizados com sucesso!');
        await supabase.from('sessions').update({ blocks: gptData.blocks as unknown as Json }).eq('id', id);
        syncKnowledgeBase();
      } else {
        toast.warning('A IA não retornou blocos válidos.');
      }
    } catch (error) {
      console.error('Error organizing blocks:', error);
      toast.error('Erro ao organizar blocos. Tente novamente.');
    }
  };

  // --- Regenerate minutes from current blocks ---
  const regenerateMinutes = useCallback((currentBlocks: TranscriptionBlock[]) => {
    const newMinutes = buildMinutesTemplate(sessionType, session.sessionTitle, currentBlocks);
    setMinutesContent(newMinutes);
  }, [sessionType, session.sessionTitle, setMinutesContent]);

  // --- AI Summarize ---
  const handleSummarizeBlock = async (blockId: string, customPrompt?: string) => {
    const block = session.blocks.find(b => b.id === blockId);
    if (!block || !id) return;
    setProcessingBlockId(blockId);
    toast.info('Gerando resumo do bloco...', { duration: 2000 });
    try {
      const aiData = await apiCall('/summarize-content', {
        content: block.content,
        prompt: customPrompt,
        blockType: block.type,
        nameHints: session.nameHints || undefined,
        nameMap: session.nameMap.length > 0 ? session.nameMap : undefined,
      });
      if (aiData?.summary) {
        const updatedBlocks = session.blocks.map(b => b.id === blockId ? { ...b, summary: aiData.summary } : b);
        setBlocks(updatedBlocks);
        const newMinutes = buildMinutesTemplate(sessionType, session.sessionTitle, updatedBlocks);
        setMinutesContent(newMinutes);
        const { error } = await supabase.from('sessions').update({ blocks: updatedBlocks as unknown as Json, final_minutes: newMinutes }).eq('id', id);
        if (error) throw error;
        toast.success('Resumo gerado e salvo!');
      }
    } catch (error) {
      console.error('Error summarizing block:', error);
      toast.error('Erro ao gerar resumo.');
    } finally {
      setProcessingBlockId(null);
    }
  };

  const handleGenerateSummaries = async () => {
    if (session.blocks.length === 0) { toast.warning('Não há blocos para resumir.'); return; }
    setIsGenerating(true);
    toast.info('Iniciando geração de resumos em paralelo...', { duration: 4000 });
    try {
      const blocksToProcess = session.blocks.filter(b => b.content && !b.summary);
      const newBlocks = [...session.blocks];
      const results = await parallelMap(blocksToProcess, async (block) => {
        setProcessingBlockId(block.id);
        const aiData = await apiCall('/summarize-content', {
          content: block.content,
          blockType: block.type,
          nameHints: session.nameHints || undefined,
          nameMap: session.nameMap.length > 0 ? session.nameMap : undefined,
        });
        return { blockId: block.id, summary: aiData?.summary };
      }, 3);
      let successCount = 0;
      for (const result of results) {
        if (result?.summary) {
          const idx = newBlocks.findIndex(b => b.id === result.blockId);
          if (idx !== -1) { newBlocks[idx] = { ...newBlocks[idx], summary: result.summary }; successCount++; }
        }
      }
      setProcessingBlockId(null);
      setBlocks(newBlocks);
      if (successCount > 0) {
        toast.success(`${successCount} resumos gerados com sucesso!`);
        const newMinutes = buildMinutesTemplate(sessionType, session.sessionTitle, newBlocks);
        setMinutesContent(newMinutes);
        const { error } = await supabase.from('sessions').update({ blocks: newBlocks as unknown as Json, final_minutes: newMinutes }).eq('id', id);
        if (error) throw error;
      } else { toast.warning('Não foi possível gerar os resumos.'); }
    } catch (error) {
      console.error('Error in batch summary:', error);
      toast.error('Erro ao processar resumos em lote.');
    } finally { setIsGenerating(false); setProcessingBlockId(null); }
  };

  const confirmGenerateMinutes = async () => {
    if (!id) return;
    setIsMinutesModalOpen(false);
    setIsGenerating(true);
    const steps = [
      "🔍 Analisando estrutura da sessão...",
      sessionType === 'solene' ? "📚 Buscando contexto legal e histórico..." : null,
      `✍️ Gerando ata ${sessionTypeLabels[sessionType]}...`,
    ].filter(Boolean) as string[];
    let stepIndex = 0;
    const interval = setInterval(() => { if (stepIndex < steps.length) { toast.info(steps[stepIndex], { duration: 2000 }); stepIndex++; } }, 2500);
    try {
      const result = await apiCall('/generate-minutes-mcp', { sessionId: id, minutesType: sessionType });
      clearInterval(interval);
      if (result?.minutes_text) {
        setMinutesContent(result.minutes_text);
        toast.success('✅ Ata gerada com sucesso!');
        if (result.used_sources?.length > 0) { toast('Fontes utilizadas:', { description: result.used_sources.join(', '), duration: 5000 }); }
        syncKnowledgeBase();
      } else { throw new Error('Falha ao gerar ata (resposta vazia)'); }
    } catch (error) {
      clearInterval(interval);
      console.error('Error generating minutes via MCP:', error);
      toast.error('Erro ao gerar ata. Tente novamente.');
    } finally { setIsGenerating(false); }
  };

  // --- Export ---
  const handleExport = async (format: 'pdf' | 'docx') => {
    await doExport(format, {
      minutesContent: session.minutesContent,
      sessionTitle: session.sessionTitle,
      camaraName: session.camaraInfo?.nome,
      camaraLogoUrl: session.camaraInfo?.logo_url,
    });
  };

  // --- Save ---
  const handleSave = async () => {
    if (!id) return;
    setIsSaving(true);
    try {
      const { error } = await supabase.from('sessions').update({
        title: session.sessionTitle,
        blocks: session.blocks as unknown as Json,
        final_minutes: session.minutesContent,
      }).eq('id', id);
      if (error) throw error;
      await apiCall('/sync-session', { sessionId: id });
      toast.success('Alterações salvas!');
      setIsDirty(false);
      syncKnowledgeBase();
    } catch (error) {
      console.error('Error saving session:', error);
      toast.error('Erro ao salvar alterações');
    } finally { setIsSaving(false); }
  };

  const handleCopyTranscript = () => {
    if (selectionText && selectionText.trim().length > 0) {
      navigator.clipboard.writeText(selectionText);
      toast.success('Seleção copiada!');
      return;
    }
    if (session.fullTranscript) {
      navigator.clipboard.writeText(session.fullTranscript);
      toast.success('Transcrição copiada!');
    }
  };

  const computeSelectionFromMarkers = () => {
    if (!session.fullTranscript) {
      toast.error('Não há transcrição carregada.');
      return;
    }
    const full = session.fullTranscript;
    const lower = full.toLowerCase();
    const startRaw = selectionStartMarker.trim();
    const endRaw = selectionEndMarker.trim();

    if (!startRaw || !endRaw) {
      toast.error('Preencha o início e o fim da seleção.');
      setSelectionText(null);
      return;
    }

    const start = startRaw.toLowerCase();
    const end = endRaw.toLowerCase();

    const startIndex = lower.indexOf(start);
    if (startIndex === -1) {
      toast.error('Início da seleção não encontrado na transcrição.');
      setSelectionText(null);
      return;
    }

    const searchFrom = startIndex + start.length;
    const endIndex = lower.indexOf(end, searchFrom);
    if (endIndex === -1) {
      toast.error('Fim da seleção não foi encontrado após o início.');
      setSelectionText(null);
      return;
    }

    const extracted = full.slice(startIndex, endIndex + endRaw.length);
    setSelectionText(extracted);
    toast.success('Seleção marcada com sucesso.');
  };

  const handleCreateBlockFromSelection = (targetBlockId?: string) => {
    const text = selectionText?.trim();
    if (!text) {
      toast.warning('Defina uma seleção usando início e fim antes de usar esta ação.');
      return;
    }
    if (targetBlockId) {
      const updatedBlocks = session.blocks.map(b => b.id === targetBlockId ? { ...b, content: text } : b);
      setBlocks(updatedBlocks);
      highlightBlock(targetBlockId);
      toast.success('Conteúdo do bloco atualizado!');
    } else {
      const newBlock: TranscriptionBlock = {
        id: `block-${Date.now()}`, type: 'outros', title: 'Novo Bloco Selecionado', content: text, timestamp: '00:00:00', order: session.blocks.length,
      };
      setBlocks([...session.blocks, newBlock]);
      setActiveTab('blocks');
      toast.success('Bloco criado a partir da seleção!');
      setTimeout(() => { const element = document.getElementById(newBlock.id); if (element) element.scrollIntoView({ behavior: 'smooth' }); }, 100);
    }
  };

  // --- Loading State ---
  if (session.isLoading) {
    return (
      <MainLayout>
        <div className="h-[calc(100vh-4rem)] flex flex-col -m-4">
          <div className="px-6 py-3 border-b border-border/40 bg-background/60 backdrop-blur-md flex items-center justify-between shrink-0">
            <div className="flex items-center gap-4"><Skeleton className="w-10 h-10 rounded-md" /><div className="space-y-2"><Skeleton className="w-64 h-6 rounded" /><Skeleton className="w-40 h-3 rounded" /></div></div>
            <div className="flex items-center gap-3"><Skeleton className="w-32 h-9 rounded-md" /><Skeleton className="w-28 h-9 rounded-md" /><Skeleton className="w-24 h-9 rounded-md" /></div>
          </div>
          <div className="flex-1 flex overflow-hidden">
            <div className="flex-1 p-6 space-y-4"><Skeleton className="w-full h-10 rounded-md" />{Array.from({ length: 4 }).map((_, i) => (<div key={i} className="border border-border/40 rounded-xl p-4 space-y-3"><div className="flex items-center gap-3"><Skeleton className="w-6 h-6 rounded" /><Skeleton className="w-40 h-6 rounded" /><div className="flex-1" /><Skeleton className="w-20 h-6 rounded" /></div><Skeleton className="w-full h-24 rounded" /></div>))}</div>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <TooltipProvider>
      <MainLayout>
        <div className="h-[calc(100vh-4rem)] flex flex-col overflow-hidden -m-4">
          {/* Header */}
          <div className="px-6 py-3 border-b border-border/40 bg-background/60 backdrop-blur-md sticky top-0 z-20 flex items-center justify-between shrink-0 shadow-sm">
            <div className="flex items-center gap-4">
              <Tooltip><TooltipTrigger asChild><Link to="/sessions"><Button variant="ghost" size="icon" className="hover:bg-accent/50"><ArrowLeft className="w-5 h-5 text-muted-foreground hover:text-foreground" /></Button></Link></TooltipTrigger><TooltipContent><p>Voltar</p></TooltipContent></Tooltip>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-semibold text-foreground tracking-tight">{session.sessionTitle}</h1>
                  {/* Session Type Badge + Dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider cursor-pointer hover:opacity-80 transition-opacity border",
                        sessionType === 'ordinaria' && "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
                        sessionType === 'extraordinaria' && "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
                        sessionType === 'solene' && "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
                      )}>
                        {sessionTypeLabels[sessionType]}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuLabel className="text-xs text-muted-foreground">Tipo de Sessão</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {(Object.entries(sessionTypeLabels) as [SessionType, string][]).map(([key, label]) => (
                        <DropdownMenuItem key={key} onClick={() => setSessionType(key)} className={cn("cursor-pointer", sessionType === key && "font-bold")}>
                          {label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {isDirty && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-medium uppercase tracking-wider animate-in fade-in">Não salvo</span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{formatDate(session.sessionDate)}</span><span>•</span><span>{session.camaraInfo?.nome || 'Câmara Municipal'}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsMinutesPanelOpen(!isMinutesPanelOpen)}
                    className="text-muted-foreground hover:text-foreground h-10 w-10 md:h-11 md:w-11 rounded-lg"
                  >
                    {isMinutesPanelOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="z-50">
                  <p>{isMinutesPanelOpen ? 'Ocultar ata' : 'Mostrar ata'}</p>
                </TooltipContent>
              </Tooltip>

              <Button variant="outline" onClick={handleOrganizeBlocks} className="gap-2 bg-background/50 backdrop-blur-sm hover:bg-accent/50 border-primary/20 hover:border-primary/40 transition-all duration-300">
                <Blocks className="w-4 h-4 text-blue-500" /><span className="hidden sm:inline">Organizar Blocos</span>
              </Button>

              <Dialog open={isMinutesModalOpen} onOpenChange={setIsMinutesModalOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="gap-2 bg-background/50 backdrop-blur-sm hover:bg-accent/50 border-purple-500/20 hover:border-purple-500/40 transition-all duration-300">
                    <Sparkles className="w-4 h-4 text-purple-500" /><span className="hidden sm:inline">Gerar Ata</span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                  <DialogHeader><DialogTitle>Gerar Ata com IA</DialogTitle><DialogDescription>Selecione o tipo de sessão para gerar uma ata adequada.</DialogDescription></DialogHeader>
                  <div className="py-4">
                    <RadioGroup value={sessionType} onValueChange={(v: string) => setSessionType(v as SessionType)}>
                      <div className="flex items-center space-x-2 border p-3 rounded-lg hover:bg-accent/50 transition-colors cursor-pointer"><RadioGroupItem value="ordinaria" id="r1" /><Label htmlFor="r1" className="cursor-pointer flex-1"><div className="font-semibold">Ordinária</div><div className="text-xs text-muted-foreground">Sessão comum, com expediente e ordem do dia.</div></Label></div>
                      <div className="flex items-center space-x-2 border p-3 rounded-lg hover:bg-accent/50 transition-colors cursor-pointer"><RadioGroupItem value="extraordinaria" id="r2" /><Label htmlFor="r2" className="cursor-pointer flex-1"><div className="font-semibold">Extraordinária</div><div className="text-xs text-muted-foreground">Pauta específica, sem expediente comum.</div></Label></div>
                      <div className="flex items-center space-x-2 border p-3 rounded-lg hover:bg-accent/50 transition-colors cursor-pointer"><RadioGroupItem value="solene" id="r3" /><Label htmlFor="r3" className="cursor-pointer flex-1"><div className="font-semibold">Solene</div><div className="text-xs text-muted-foreground">Homenagens, datas comemorativas, protocolo formal.</div></Label></div>
                    </RadioGroup>
                  </div>
                  <DialogFooter><Button variant="outline" onClick={() => setIsMinutesModalOpen(false)}>Cancelar</Button><Button onClick={confirmGenerateMinutes} className="gap-2"><Sparkles className="w-4 h-4" />Gerar Agora</Button></DialogFooter>
                </DialogContent>
              </Dialog>

              <Button variant="default" onClick={handleSave} disabled={isSaving || isGenerating || processingBlockId !== null} className="gap-2 shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all duration-300 min-w-[100px]">
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {isSaving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>

          {/* Media Player Bar */}
          {(session.audioUrl || session.youtubeUrl) && (
            <div className="border-b border-border/40 bg-muted/30 backdrop-blur-sm shrink-0 transition-all duration-300">
              <div className="max-w-5xl mx-auto py-2 px-6">
                <Collapsible open={isPlayerOpen} onOpenChange={setIsPlayerOpen} className="w-full space-y-2">
                  <div className="flex items-center justify-between">
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-all select-none group py-1">
                        <div className={cn("p-1.5 rounded-full transition-colors", session.youtubeUrl ? "bg-red-500/10 text-red-500" : "bg-blue-500/10 text-blue-500")}>{session.youtubeUrl ? <Video className="w-4 h-4" /> : <PlayCircle className="w-4 h-4" />}</div>
                        <div className="flex flex-col"><h3 className="text-sm font-medium leading-none group-hover:text-primary transition-colors">Mídia da Sessão</h3><span className="text-[10px] text-muted-foreground mt-0.5">Clique para {isPlayerOpen ? 'ocultar' : 'visualizar'} o player</span></div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleTrigger asChild><Button variant="ghost" size="sm" className="w-8 h-8 p-0 rounded-full hover:bg-background/80">{isPlayerOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</Button></CollapsibleTrigger>
                  </div>
                  <CollapsibleContent className="space-y-4 animate-slide-down">
                    {session.youtubeUrl ? (
                      <div className="rounded-xl overflow-hidden shadow-2xl border border-border/50 bg-black max-w-2xl mx-auto ring-1 ring-white/10"><AspectRatio ratio={16 / 9}><iframe src={`https://www.youtube.com/embed/${getYouTubeID(session.youtubeUrl)}`} title="YouTube video player" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen className="w-full h-full" /></AspectRatio></div>
                    ) : (
                      <div className="flex flex-col gap-3 items-center bg-card/50 backdrop-blur p-4 rounded-xl border border-border/50 shadow-lg max-w-2xl mx-auto"><audio controls className="w-full h-10 focus:outline-none accent-primary" src={session.audioUrl!} /></div>
                    )}
                    {!session.youtubeUrl && (
                      <div className="flex justify-center pb-2"><Button variant="ghost" size="sm" onClick={handleAudioUpdateClick} disabled={isUploadingAudio} className="gap-2 text-xs text-muted-foreground hover:text-foreground"><RefreshCw className={cn("w-3 h-3", isUploadingAudio && "animate-spin")} />{isUploadingAudio ? 'Enviando...' : 'Substituir áudio'}</Button><input type="file" ref={fileInputRef} className="hidden" accept="audio/*" onChange={handleAudioFileSelect} /></div>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </div>
          )}

          {/* Editor — Main Panes */}
          <div className="flex-1 flex overflow-hidden">
            {/* Main Content Area (Tabs) — New order: Transcrição → Por Orador → Blocos → Revisão */}
            <div className="flex-1 p-4 md:p-6 overflow-hidden flex flex-col">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between mb-4 shrink-0">
                  <TabsList className="bg-muted/50 p-1 border border-border/40">
                    <TabsTrigger value="transcript" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"><FileText className="w-4 h-4" />Transcrição</TabsTrigger>
                    <TabsTrigger value="speakers" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"><Users className="w-4 h-4" />Oradores</TabsTrigger>
                    <TabsTrigger value="blocks" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"><Blocks className="w-4 h-4" />Blocos</TabsTrigger>
                    <TabsTrigger value="review" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"><ClipboardCheck className="w-4 h-4" />Revisão</TabsTrigger>
                  </TabsList>
                </div>

                {/* Tab: Transcrição Completa */}
                <TabsContent value="transcript" className="flex-1 overflow-hidden mt-0 data-[state=active]:animate-in data-[state=active]:fade-in-50 duration-300">
                  <div className="h-full flex flex-col bg-card/80 backdrop-blur-sm rounded-xl border border-border/50 shadow-sm overflow-hidden">
                    <div className="p-3 border-b border-border/50 flex items-center justify-between bg-muted/20 gap-4">
                      <div className="flex items-center gap-4 flex-1">
                        <div className="flex items-center gap-2 text-muted-foreground"><FileText className="w-4 h-4" /><h3 className="font-medium text-sm shrink-0">Texto Original</h3></div>
                        <div className="h-4 w-px bg-border/60" />
                        <div className="flex items-center gap-2 max-w-md w-full">
                          <div className="relative flex-1 group">
                            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-hover:text-primary transition-colors" />
                            <Input
                              placeholder="Buscar na transcrição..."
                              value={search.transcriptSearch}
                              onChange={(e) => search.setTranscriptSearch(e.target.value)}
                              className="pl-9 h-8 bg-background/50 border-border/50 focus:bg-background transition-all"
                            />
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                                  <HelpCircle className="w-3 h-3 text-muted-foreground/50 cursor-help" />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Digite para destacar termos</p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                          {search.transcriptSearch && (
                            <div className="flex items-center gap-1 bg-background border border-border/50 rounded-md h-8 px-1.5 shrink-0 shadow-sm animate-in fade-in slide-in-from-left-2">
                              <span className="text-[10px] text-muted-foreground min-w-[3rem] text-center font-mono">
                                {search.searchResult.count > 0 ? `${search.currentMatchIndex + 1}/${search.searchResult.count}` : '0/0'}
                              </span>
                              <div className="flex gap-0.5 border-l border-border/50 pl-1 ml-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 hover:bg-muted"
                                  onClick={search.handlePrevMatch}
                                  disabled={search.searchResult.count === 0}
                                >
                                  <ChevronUp className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 hover:bg-muted"
                                  onClick={search.handleNextMatch}
                                  disabled={search.searchResult.count === 0}
                                >
                                  <ChevronDown className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="hidden lg:flex items-center gap-2">
                          <Input
                            placeholder="Início"
                            value={selectionStartMarker}
                            onChange={(e) => setSelectionStartMarker(e.target.value)}
                            className="h-8 w-32 text-xs bg-background/40"
                          />
                          <Input
                            placeholder="Fim"
                            value={selectionEndMarker}
                            onChange={(e) => setSelectionEndMarker(e.target.value)}
                            className="h-8 w-32 text-xs bg-background/40"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={computeSelectionFromMarkers}
                            className="h-8 text-xs gap-1"
                          >
                            <Search className="w-3 h-3" />
                            Selecionar
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={!selectionText}
                                className="gap-2 h-8 shadow-sm border border-border/50"
                              >
                                <Blocks className="w-3.5 h-3.5 text-primary" />
                                <span className="text-xs font-medium">
                                  {selectionText ? 'Usar seleção' : 'Defina início e fim'}
                                </span>
                                <ChevronDown className="w-3 h-3 opacity-50" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-64 max-h-[300px] overflow-y-auto">
                              <DropdownMenuItem
                                onClick={() => handleCreateBlockFromSelection()}
                                className="gap-2 py-2.5 cursor-pointer"
                              >
                                <div className="bg-primary/10 p-1 rounded-md text-primary">
                                  <Blocks className="w-4 h-4" />
                                </div>
                                <div className="flex flex-col gap-0.5">
                                  <span className="font-medium">Criar novo bloco</span>
                                  <span className="text-[10px] text-muted-foreground">
                                    Adiciona ao final usando a seleção marcada
                                  </span>
                                </div>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuLabel className="text-xs text-muted-foreground font-normal uppercase tracking-wider">
                                Substituir conteúdo de:
                              </DropdownMenuLabel>
                              {session.blocks.length > 0 ? (
                                session.blocks.map(block => (
                                  <DropdownMenuItem
                                    key={block.id}
                                    onClick={() => handleCreateBlockFromSelection(block.id)}
                                    className="cursor-pointer"
                                  >
                                    <span className="truncate text-sm">
                                      {block.title || block.type}
                                    </span>
                                  </DropdownMenuItem>
                                ))
                              ) : (
                                <div className="px-2 py-2 text-xs text-muted-foreground italic text-center">
                                  Nenhum bloco
                                </div>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {selectionText && (
                          <div className="hidden xl:flex max-w-xs text-[10px] text-muted-foreground bg-background/60 border border-border/40 rounded px-2 py-1 font-mono truncate">
                            {selectionText}
                          </div>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleCopyTranscript}
                          className="gap-2 h-8 text-muted-foreground hover:text-foreground"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span className="text-xs">Copiar</span>
                        </Button>
                      </div>
                    </div>
                    <div className="flex-1 p-6 overflow-auto font-mono text-sm leading-relaxed whitespace-pre-wrap selection:bg-primary/20 selection:text-primary-foreground text-foreground/80">
                      {session.fullTranscript ? (
                        search.searchResult.parts.map((part, i) => {
                          if (part.toLowerCase() === search.transcriptSearch.toLowerCase() && search.transcriptSearch) {
                            const matchIndex = Math.floor((i - 1) / 2);
                            const isCurrent = matchIndex === search.currentMatchIndex;
                            return (<mark key={i} id={`match-${matchIndex}`} className={cn("rounded px-1 font-bold shadow-sm transition-all duration-300", isCurrent ? "bg-primary text-primary-foreground ring-4 ring-primary/20 scroll-mt-32" : "bg-yellow-200 text-yellow-900 dark:bg-yellow-900/50 dark:text-yellow-100")}>{part}</mark>);
                          }
                          return <span key={i}>{part}</span>;
                        })
                      ) : (<div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 opacity-50"><FileText className="w-8 h-8" /><p>Nenhuma transcrição disponível.</p></div>)}
                    </div>
                  </div>
                </TabsContent>

                {/* Tab: Por Orador */}
                <TabsContent value="speakers" className="flex-1 overflow-hidden mt-0 data-[state=active]:animate-in data-[state=active]:fade-in-50 duration-300">
                  <SpeakersPanel
                    blocks={session.blocks}
                    fullTranscript={session.fullTranscript}
                    onBlocksChange={handleBlocksChange}
                    onNavigateToBlock={highlightBlock}
                  />
                </TabsContent>

                {/* Tab: Blocos */}
                <TabsContent value="blocks" className="flex-1 overflow-hidden mt-0 data-[state=active]:animate-in data-[state=active]:fade-in-50 duration-300">
                  <div className="h-full overflow-auto pr-2 custom-scrollbar">
                    <BlockEditor
                      blocks={session.blocks}
                      onBlocksChange={handleBlocksChange}
                      onGenerateSummaries={handleGenerateSummaries}
                      onSummarizeBlock={handleSummarizeBlock}
                      isGenerating={isGenerating}
                      processingBlockId={processingBlockId}
                    />
                  </div>
                </TabsContent>

                {/* Tab: Revisão */}
                <TabsContent value="review" className="flex-1 overflow-hidden mt-0 data-[state=active]:animate-in data-[state=active]:fade-in-50 duration-300">
                  <div className="h-full bg-card/80 backdrop-blur-sm rounded-xl border border-border/50 shadow-sm overflow-hidden">
                    <ReviewPanel
                      blocks={session.blocks}
                      onBlockUpdate={handleBlockUpdate}
                      onSummarizeBlock={handleSummarizeBlock}
                      onSummarizeAll={handleGenerateSummaries}
                      processingBlockId={processingBlockId}
                      isGenerating={isGenerating}
                    />
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            {/* Minutes Panel — Collapsed by default */}
            {isMinutesPanelOpen && (
              <div className="w-[480px] border-l border-border/40 bg-card/30 flex flex-col overflow-hidden min-h-0 backdrop-blur-sm shadow-xl z-10 animate-in slide-in-from-right-5 duration-300">
                <MinutesEditor
                  content={session.minutesContent}
                  onChange={setMinutesContent}
                  onExport={handleExport}
                  onPublish={() => toast.info('Funcionalidade de publicação em desenvolvimento.')}
                  camaraName={session.camaraInfo?.nome || null}
                  camaraLogoUrl={session.camaraInfo?.logo_url || null}
                  hasUnsummarizedBlocks={hasUnsummarizedBlocks}
                />
              </div>
            )}
          </div>
        </div>
      </MainLayout>
    </TooltipProvider>
  );
}

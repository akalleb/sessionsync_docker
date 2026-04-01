import { useState, useMemo } from 'react';
import { TranscriptionBlock, blockTypeLabels } from '@/types/transcription';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Sparkles, Edit3, Check, X, RotateCcw, MessageSquarePlus, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from 'sonner';

interface ReviewPanelProps {
  blocks: TranscriptionBlock[];
  onBlockUpdate: (block: TranscriptionBlock) => void;
  onSummarizeBlock: (id: string, customPrompt?: string) => void;
  onSummarizeAll: () => void;
  processingBlockId: string | null;
  isGenerating: boolean;
}

export function ReviewPanel({ 
  blocks, 
  onBlockUpdate, 
  onSummarizeBlock, 
  onSummarizeAll,
  processingBlockId,
  isGenerating 
}: ReviewPanelProps) {
  
  const summarizedBlocks = useMemo(() => {
    // Show all blocks to allow summarizing pending ones, but sort or group if needed
    // For now, list all, highlighting those missing summaries
    return blocks;
  }, [blocks]);

  const stats = useMemo(() => {
    const total = blocks.length;
    const summarized = blocks.filter(b => !!b.summary).length;
    const percent = total > 0 ? Math.round((summarized / total) * 100) : 0;
    return { total, summarized, percent };
  }, [blocks]);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background/50">
      {/* Header Stats */}
      <div className="p-4 border-b border-border/40 bg-muted/20 shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h3 className="font-semibold text-sm">Revisão de Resumos</h3>
            <p className="text-xs text-muted-foreground">
              {stats.summarized} de {stats.total} blocos resumidos ({stats.percent}%)
            </p>
          </div>
          {stats.percent < 100 && (
            <Button 
              size="sm" 
              variant="gradient" 
              onClick={onSummarizeAll} 
              disabled={isGenerating}
              className="h-8 text-xs gap-2"
            >
              <Sparkles className={cn("w-3.5 h-3.5", isGenerating && "animate-spin")} />
              {isGenerating ? 'Processando...' : 'Resumir Pendentes'}
            </Button>
          )}
        </div>
        <Progress value={stats.percent} className="h-2" />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
        {summarizedBlocks.length === 0 ? (
           <div className="flex flex-col items-center justify-center py-10 text-muted-foreground opacity-60">
             <AlertCircle className="w-10 h-10 mb-2" />
             <p>Nenhum bloco disponível para revisão.</p>
           </div>
        ) : (
          summarizedBlocks.map((block, index) => (
            <ReviewItem 
              key={block.id} 
              block={block} 
              index={index}
              onUpdate={onBlockUpdate}
              onSummarize={onSummarizeBlock}
              isProcessing={processingBlockId === block.id}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface ReviewItemProps {
  block: TranscriptionBlock;
  index: number;
  onUpdate: (block: TranscriptionBlock) => void;
  onSummarize: (id: string, customPrompt?: string) => void;
  isProcessing: boolean;
}

function ReviewItem({ block, index, onUpdate, onSummarize, isProcessing }: ReviewItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedSummary, setEditedSummary] = useState('');
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');

  // Parse summary content safely
  const summaryText = useMemo(() => {
    if (!block.summary) return '';
    try {
      const parsed = JSON.parse(block.summary);
      return typeof parsed === 'string' ? parsed : (parsed.texto || JSON.stringify(parsed));
    } catch {
      return block.summary;
    }
  }, [block.summary]);

  const handleStartEdit = () => {
    setEditedSummary(summaryText);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    let newSummary = editedSummary;
    try {
        const parsed = JSON.parse(block.summary || '{}');
        if (typeof parsed === 'object' && parsed !== null) {
            newSummary = JSON.stringify({ ...parsed, texto: editedSummary });
        }
    } catch {
        // Not JSON, just string
    }

    const previousBlock = { ...block };

    onUpdate({ ...block, summary: newSummary });
    setIsEditing(false);

    toast.success('Edição salva', {
      action: {
        label: 'Desfazer',
        onClick: () => {
          onUpdate(previousBlock);
          toast('Ação desfeita.', { icon: '🔄' });
        }
      },
      duration: 5000,
    });
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedSummary('');
  };

  const handleCustomRegenerate = () => {
    onSummarize(block.id, customPrompt);
    setIsPromptOpen(false);
    setCustomPrompt('');
  };

  if (!block.summary && !isProcessing) {
      return (
          <div className="border border-border/40 rounded-lg p-4 bg-muted/10 opacity-70 hover:opacity-100 transition-opacity">
              <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-muted-foreground">#{index + 1}</span>
                      <span className="text-xs font-medium uppercase tracking-wider bg-background px-2 py-0.5 rounded border">{blockTypeLabels[block.type] || block.type}</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => onSummarize(block.id)} className="h-7 text-xs gap-1 hover:text-primary">
                      <Sparkles className="w-3 h-3" />
                      Gerar Resumo
                  </Button>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">{block.content}</p>
          </div>
      );
  }

  return (
    <div className={cn(
      "border rounded-lg bg-card transition-all duration-300 relative group",
      isProcessing ? "border-purple-500/30 ring-1 ring-purple-500/10" : "border-border/60 hover:border-primary/20",
      isEditing && "ring-2 ring-primary/20 border-primary/40"
    )}>
      {/* Loading Overlay */}
      {isProcessing && (
        <div className="absolute inset-0 z-10 bg-background/60 backdrop-blur-[1px] flex items-center justify-center rounded-lg">
           <div className="flex items-center gap-2 text-purple-600 bg-background px-3 py-1.5 rounded-full shadow-sm border border-purple-100">
               <Sparkles className="w-4 h-4 animate-spin" />
               <span className="text-xs font-medium">Gerando...</span>
           </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/40 bg-muted/10 rounded-t-lg">
         <div className="flex items-center gap-3">
             <span className="text-xs font-mono text-muted-foreground/70">#{index + 1}</span>
             <div className={cn("w-2 h-2 rounded-full", block.summary ? "bg-green-500/50" : "bg-yellow-500/50")} />
             <span className="text-xs font-semibold text-foreground/80 uppercase tracking-wide">
                 {blockTypeLabels[block.type] || block.type}
             </span>
             {block.speaker && (
                 <span className="text-[10px] text-muted-foreground bg-background px-1.5 py-0.5 rounded border border-border/20 max-w-[150px] truncate">
                     {block.speaker}
                 </span>
             )}
         </div>

         <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {!isEditing && (
                <>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={handleStartEdit}>
                                <Edit3 className="w-3.5 h-3.5" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Editar resumo manualmente</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => onSummarize(block.id)}>
                                <RotateCcw className="w-3.5 h-3.5" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Regenerar (prompt padrão)</TooltipContent>
                    </Tooltip>

                    <Dialog open={isPromptOpen} onOpenChange={setIsPromptOpen}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <DialogTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-purple-600">
                                        <MessageSquarePlus className="w-3.5 h-3.5" />
                                    </Button>
                                </DialogTrigger>
                            </TooltipTrigger>
                            <TooltipContent>Ajustar tom / Instruir IA</TooltipContent>
                        </Tooltip>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Ajustar Resumo</DialogTitle>
                                <DialogDescription>Dê instruções específicas para reescrever este bloco (ex: "Mais formal", "Corrigir nome", "Resumir em tópicos").</DialogDescription>
                            </DialogHeader>
                            <div className="py-4">
                                <Input 
                                    value={customPrompt} 
                                    onChange={(e) => setCustomPrompt(e.target.value)}
                                    placeholder="Instrução para a IA..."
                                />
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsPromptOpen(false)}>Cancelar</Button>
                                <Button onClick={handleCustomRegenerate}>Reescrever</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </>
            )}
         </div>
      </div>

      {/* Content */}
      <div className="p-4">
          {isEditing ? (
              <div className="space-y-3 animate-in fade-in duration-200">
                  <Textarea 
                      value={editedSummary} 
                      onChange={(e) => setEditedSummary(e.target.value)}
                      className="min-h-[120px] text-sm leading-relaxed"
                      placeholder="Edite o resumo..."
                  />
                  <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={handleCancelEdit} className="h-8 text-xs">
                          <X className="w-3.5 h-3.5 mr-1.5" /> Cancelar
                      </Button>
                      <Button size="sm" onClick={handleSaveEdit} className="h-8 text-xs">
                          <Check className="w-3.5 h-3.5 mr-1.5" /> Salvar Edição
                      </Button>
                  </div>
              </div>
          ) : (
              <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">
                  {summaryText}
              </p>
          )}
      </div>
    </div>
  );
}

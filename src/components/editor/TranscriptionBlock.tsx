import { useState } from 'react';
import { GripVertical, Trash2, Edit3, Sparkles, ChevronDown, ChevronUp, Clock, MessageSquarePlus, Maximize2, Minimize2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { TranscriptionBlock as BlockType, BlockType as BlockTypeEnum, blockTypeLabels, blockTypeCategories } from '@/types/transcription';
import { LoadingIcon } from '@/components/ui/loading-icon';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TranscriptionBlockProps {
  block: BlockType;
  onUpdate: (block: BlockType) => void;
  onDelete: (id: string) => void;
  onSummarize: (id: string, customPrompt?: string) => void;
  isDragging?: boolean;
  isProcessing?: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
}

export function TranscriptionBlock({
  block,
  onUpdate,
  onDelete,
  onSummarize,
  isDragging,
  isProcessing,
  dragHandleProps,
}: TranscriptionBlockProps) {
  const [isExpanded, setIsExpanded] = useState(!block.summary);
  const [isEditing, setIsEditing] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [isPromptOpen, setIsPromptOpen] = useState(false);

  const handleContentChange = (content: string) => {
    onUpdate({ ...block, content });
  };

  const handleTypeChange = (type: BlockTypeEnum) => {
    onUpdate({ ...block, type, title: blockTypeLabels[type] });
  };

  const handleSpeakerChange = (speaker: string) => {
    onUpdate({ ...block, speaker });
  };

  const handleCustomSummarize = () => {
    onSummarize(block.id, customPrompt);
    setIsPromptOpen(false);
    setCustomPrompt('');
  };

  return (
    <div
      id={block.id}
      className={cn(
        "bg-card/80 backdrop-blur-sm border border-border/60 rounded-xl shadow-sm transition-all duration-300 group hover:shadow-md hover:border-primary/20",
        isDragging && "shadow-xl scale-[1.02] rotate-1 border-primary/40 bg-card z-50 ring-2 ring-primary/20",
        isProcessing && "ring-2 ring-purple-500/30"
      )}
    >
      {isProcessing && (
        <div className="absolute inset-0 z-50 bg-background/60 backdrop-blur-[2px] flex flex-col items-center justify-center rounded-xl transition-all duration-300">
          <div className="bg-background/80 p-4 rounded-full shadow-lg border border-border/50">
            <LoadingIcon className="w-8 h-8 text-purple-500" />
          </div>
          <span className="text-xs font-medium text-foreground/80 mt-3 animate-pulse bg-background/50 px-3 py-1 rounded-full">Gerando resumo IA...</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2 md:py-3 border-b border-border/40 bg-muted/20 rounded-t-xl flex-wrap">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              {...dragHandleProps}
              className="p-1.5 rounded-md hover:bg-background/80 cursor-grab active:cursor-grabbing text-muted-foreground/60 hover:text-foreground transition-colors"
            >
              <GripVertical className="w-4 h-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent><p>Arraste para mover</p></TooltipContent>
        </Tooltip>

        <Select value={block.type} onValueChange={handleTypeChange}>
          <SelectTrigger className="w-[180px] h-8 text-xs font-medium bg-background/50 border-border/60 shadow-none focus:ring-1 focus:ring-primary/20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {blockTypeCategories.map((cat) => (
              <SelectGroup key={cat.label}>
                <SelectLabel className="text-[10px] text-muted-foreground uppercase tracking-wider">{cat.label}</SelectLabel>
                {cat.types.map((t) => (
                  <SelectItem key={t} value={t} className="text-xs">
                    {blockTypeLabels[t]}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>

        {block.timestamp && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-background/40 px-2 py-1 rounded-full border border-border/30" title="Timestamp estimado">
            <Clock className="w-3 h-3" />
            <span className="font-mono">{block.timestamp}</span>
            {block.timestamp_estimated && <span className="text-[10px] text-muted-foreground/50">*</span>}
          </div>
        )}

        {isEditing ? (
          <div className="flex items-center gap-1 bg-background/50 border border-border/30 rounded-md px-2 py-0.5">
            <User className="w-3 h-3 text-muted-foreground" />
            <Input
              value={block.speaker || ''}
              onChange={(e) => handleSpeakerChange(e.target.value)}
              className="h-6 w-32 text-xs border-0 bg-transparent focus-visible:ring-0 p-0"
              placeholder="Orador..."
            />
          </div>
        ) : (
          block.speaker && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-foreground/80 bg-primary/5 px-2 py-1 rounded-full border border-primary/10 max-w-[150px]">
              <User className="w-3 h-3 text-primary/70" />
              <span className="truncate">{block.speaker}</span>
            </div>
          )
        )}

        <div className="flex-1" />

        <div className="flex items-center gap-0.5 md:gap-1">
          <Dialog open={isPromptOpen} onOpenChange={setIsPromptOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
                  >
                    <MessageSquarePlus className="w-3.5 h-3.5" />
                  </Button>
                </DialogTrigger>
              </TooltipTrigger>
              <TooltipContent><p>Resumir com instruções personalizadas</p></TooltipContent>
            </Tooltip>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Resumir Bloco com IA</DialogTitle>
                <DialogDescription>
                  Digite um prompt personalizado para instruir a IA sobre como resumir este bloco.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <Input
                  placeholder="Ex: Resuma os principais pontos discutidos..."
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsPromptOpen(false)}>Cancelar</Button>
                <Button onClick={handleCustomSummarize}>Gerar Resumo</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onSummarize(block.id)}
                className="h-7 w-7 text-muted-foreground hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>Gerar resumo automático</p></TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsEditing(!isEditing)}
                className={cn("h-7 w-7 text-muted-foreground transition-colors", isEditing ? "text-primary bg-primary/10" : "hover:text-foreground hover:bg-muted")}
              >
                <Edit3 className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>{isEditing ? 'Parar edição' : 'Editar conteúdo'}</p></TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDelete(block.id)}
                className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>Excluir bloco</p></TooltipContent>
          </Tooltip>

          <div className="w-px h-4 bg-border/50 mx-1" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsExpanded(!isExpanded)}
                className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                {isExpanded ? (
                  <Minimize2 className="w-3.5 h-3.5" />
                ) : (
                  <Maximize2 className="w-3.5 h-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>{isExpanded ? 'Recolher' : 'Expandir'}</p></TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Content */}
      <div className={cn("transition-all duration-300 ease-in-out overflow-hidden", isExpanded ? "max-h-[800px] opacity-100" : block.summary ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0")}>
        <div className="p-4 space-y-4">
          {isExpanded && (
            <div className="animate-in fade-in slide-in-from-top-1 duration-200">
              {isEditing ? (
                <Textarea
                  value={block.content}
                  onChange={(e) => handleContentChange(e.target.value)}
                  className="min-h-[150px] resize-none bg-background/50 focus:bg-background transition-colors"
                  placeholder="Conteúdo da transcrição..."
                />
              ) : (
                <div className="prose prose-sm max-w-none text-foreground/90 bg-muted/10 p-3 rounded-lg border border-border/30">
                  <p className="whitespace-pre-wrap leading-relaxed text-xs md:text-sm font-mono">{block.content}</p>
                </div>
              )}
            </div>
          )}

          {(() => {
            if (!block.summary) return null;
            const raw =
              typeof block.summary === "string"
                ? block.summary
                : JSON.stringify(block.summary);
            if (!raw) return null;

            let mainText = raw;
            let apartes: Array<{ autor?: string; conteudo?: string }> = [];
            let detalhes: string | null = null;
            let vereadorInfo: string | null = null;

            try {
              const parsed = JSON.parse(raw);
              if (parsed && typeof parsed === "object") {
                const anyParsed = parsed as {
                  texto?: unknown;
                  apartes?: unknown;
                  detalhes?: unknown;
                  vereador?: unknown;
                };

                if (typeof anyParsed.texto === "string" && anyParsed.texto.trim().length > 0) {
                  mainText = anyParsed.texto;
                }

                if (Array.isArray(anyParsed.apartes)) {
                  apartes = anyParsed.apartes.map((a) => {
                    const autor =
                      a && typeof a.autor === "string" ? a.autor : undefined;
                    const conteudo =
                      a && typeof a.conteudo === "string" ? a.conteudo : undefined;
                    return { autor, conteudo };
                  });
                }

                if (typeof anyParsed.detalhes === "string" && anyParsed.detalhes.trim().length > 0) {
                  detalhes = anyParsed.detalhes;
                }

                if (typeof anyParsed.vereador === "string" && anyParsed.vereador.trim().length > 0) {
                  vereadorInfo = anyParsed.vereador;
                }
              }
            } catch {
              mainText = raw;
            }

            return (
              <div
                className={cn(
                  "rounded-lg border-l-4 shadow-sm transition-all duration-300 relative overflow-hidden group/summary",
                  "bg-gradient-to-br from-violet-50 to-white dark:from-violet-900/10 dark:to-background border-violet-500/70",
                  !isExpanded && "mt-0"
                )}
              >
                <div className="flex items-center gap-2 mb-2 p-3 pb-0">
                  <div className="p-1 rounded-full bg-violet-100 dark:bg-violet-900/30">
                    <Sparkles className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                  </div>
                  <span className="text-xs font-bold text-violet-700 dark:text-violet-300 uppercase tracking-wider">
                    Resumo Inteligente
                  </span>
                  {!isExpanded && (
                    <span className="text-[10px] text-muted-foreground ml-auto bg-background/50 px-2 py-0.5 rounded-full border border-border/20">
                      Bloco recolhido
                    </span>
                  )}
                </div>
                <div className="p-3 pt-1 space-y-3">
                  <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
                    {mainText}
                  </p>

                  {vereadorInfo && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground bg-black/5 dark:bg-white/5 p-2 rounded-md">
                      <span className="font-medium">Vereador:</span>
                      <span className="font-semibold text-foreground">{vereadorInfo}</span>
                    </div>
                  )}

                  {detalhes && (
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap italic border-l-2 border-muted pl-2">
                      {detalhes}
                    </p>
                  )}

                  {apartes.length > 0 && (
                    <div className="space-y-2 mt-2 pt-2 border-t border-violet-200/50 dark:border-violet-800/30">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                        <MessageSquarePlus className="w-3 h-3" /> Apartes
                      </p>
                      <ul className="space-y-2">
                        {apartes.map((aparte, index) => {
                          const label =
                            aparte.autor && aparte.autor.trim().length > 0
                              ? aparte.autor
                              : `Aparte ${index + 1}`;
                          return (
                            <li
                              key={index}
                              className="text-xs text-muted-foreground whitespace-pre-wrap bg-background/50 p-2 rounded border border-border/20"
                            >
                              <span className="font-semibold text-foreground block mb-0.5">
                                {label}:
                              </span>
                              {aparte.conteudo || ""}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

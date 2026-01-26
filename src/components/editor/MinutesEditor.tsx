import { useState, type MouseEvent } from 'react';
import { FileText, Download, Globe, Copy, Check, Sparkles, Edit3, Eye, ZoomIn, ZoomOut, RotateCcw, Hand } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface MinutesEditorProps {
  content: string;
  onChange: (content: string) => void;
  onExport: (format: 'pdf' | 'docx') => void;
  onPublish: (destination: 'transparency' | 'website') => void;
  camaraName?: string | null;
  camaraLogoUrl?: string | null;
  hasUnsummarizedBlocks?: boolean;
}

export function MinutesEditor({ content, onChange, onExport, onPublish, camaraName, camaraLogoUrl, hasUnsummarizedBlocks = false }: MinutesEditorProps) {
  const [copied, setCopied] = useState(false);
  const [zoom, setZoom] = useState(0.55); // Default zoom level
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    e.preventDefault(); // Prevent text selection
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.1, 2.0));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.1, 0.2));
  const handleResetView = () => {
    setZoom(0.55);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div className="h-full min-h-0 flex flex-col bg-card/50 backdrop-blur-md rounded-xl border border-border/50 shadow-xl overflow-hidden transition-all duration-300">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/50 bg-muted/20 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shadow-inner">
            <FileText className="w-4 h-4 text-primary" />
          </div>
          <div className="flex flex-col">
             <h2 className="font-semibold text-foreground text-sm leading-none">Ata Final</h2>
             <span className="text-[10px] text-muted-foreground mt-1">Documento oficial</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="gap-2 h-8 hover:bg-background/80"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-success" />
                <span className="text-xs text-success font-medium">Copiado</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Copiar</span>
              </>
            )}
          </Button>
        </div>
      </div>
      
      {/* Alert Banner for Unsummarized Blocks */}
      {hasUnsummarizedBlocks && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-3 text-xs text-amber-600 dark:text-amber-400 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
            <Sparkles className="w-4 h-4 mt-0.5 shrink-0 animate-pulse" />
            <div>
              <p className="font-semibold mb-0.5">Sugestão de Melhoria</p>
              <p className="opacity-90 leading-relaxed">
                  A ata contém trechos com texto original não resumido. 
                  Use a função "Resumir" nos blocos para um resultado mais profissional.
              </p>
            </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="edit" className="flex-1 min-h-0 flex flex-col">
        <div className="px-4 pt-4 pb-2">
          <TabsList className="w-full grid grid-cols-2 bg-muted/50 p-1 border border-border/40">
            <TabsTrigger value="edit" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all">
              <Edit3 className="w-3.5 h-3.5" />
              Edição
            </TabsTrigger>
            <TabsTrigger value="preview" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all">
              <Eye className="w-3.5 h-3.5" />
              Visualização
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="edit" className="flex-1 min-h-0 px-4 pb-0 m-0 overflow-hidden data-[state=active]:animate-in data-[state=active]:fade-in-50">
          <Textarea
            value={content}
            onChange={(e) => onChange(e.target.value)}
            className="h-full min-h-0 resize-none font-serif text-base leading-relaxed bg-background/50 focus:bg-background border-border/50 focus:border-primary/30 transition-all p-4 shadow-inner"
            placeholder="A ata será gerada automaticamente a partir dos blocos organizados..."
          />
        </TabsContent>

        <TabsContent value="preview" className="flex-1 min-h-0 p-0 m-0 bg-neutral-100/50 dark:bg-neutral-900/50 overflow-hidden relative data-[state=active]:animate-in data-[state=active]:fade-in-50">
          
          {/* Floating Toolbar */}
          <div className="absolute top-4 right-4 z-20 flex flex-col gap-2 bg-background/80 backdrop-blur-md shadow-lg border border-border/50 p-2 rounded-xl animate-in slide-in-from-right-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={handleZoomIn} className="h-8 w-8 hover:bg-primary/10 hover:text-primary">
                   <ZoomIn className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left"><p>Aumentar Zoom</p></TooltipContent>
            </Tooltip>

            <div className="text-[10px] font-mono text-center text-muted-foreground select-none py-1 border-y border-border/30">
                {Math.round(zoom * 100)}%
            </div>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={handleZoomOut} className="h-8 w-8 hover:bg-primary/10 hover:text-primary">
                   <ZoomOut className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left"><p>Diminuir Zoom</p></TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={handleResetView} className="h-8 w-8 hover:bg-primary/10 hover:text-primary">
                   <RotateCcw className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left"><p>Resetar Visualização</p></TooltipContent>
            </Tooltip>
            
            <div className="h-px bg-border/50 my-1" />
            
             <div className="flex justify-center p-1">
                <Hand className={cn("w-4 h-4 text-muted-foreground", isDragging && "text-primary animate-pulse")} />
             </div>
          </div>

          <div 
            className={cn(
                "h-full w-full overflow-hidden flex items-start justify-center bg-neutral-200/50 dark:bg-neutral-950/50 select-none pt-8",
                isDragging ? "cursor-grabbing" : "cursor-grab"
            )}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <div 
                style={{ 
                   transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                   transformOrigin: 'top center',
                   transition: isDragging ? 'none' : 'transform 0.2s ease-out'
                }}
                className="shadow-2xl origin-top"
            >
                <div className="w-[210mm] min-h-[297mm] bg-white text-black p-[25mm] flex flex-col pointer-events-none">
                <div className="flex items-center gap-4 mb-6 border-b border-neutral-200 pb-6">
                    {camaraLogoUrl && (
                    <img
                        src={camaraLogoUrl}
                        alt={camaraName || 'Brasão da Câmara'}
                        className="w-16 h-16 object-contain"
                    />
                    )}
                    <div className="flex-1 text-center">
                    <p className="text-xs font-bold uppercase tracking-wider mb-1 text-neutral-900 font-serif">
                        {camaraName || 'Câmara Municipal'}
                    </p>
                    <p className="text-[10px] text-neutral-600 font-serif italic hidden">
                        Estado do Pará
                    </p>
                    <div className="w-8 h-px bg-neutral-300 mx-auto my-2" />
                    <p className="text-[10px] font-bold text-neutral-800 uppercase tracking-[0.2em]">
                        Ata de Sessão Legislativa
                    </p>
                    </div>
                </div>
                <div className="flex-1">
                    <article className="prose prose-neutral max-w-none font-serif text-justify leading-snug break-words text-neutral-900 text-[11pt]">
                    <ReactMarkdown>{content || 'Nenhum conteúdo para exibir.'}</ReactMarkdown>
                    </article>
                </div>
                <div className="mt-12 pt-8 grid grid-cols-2 gap-12">
                    <div className="text-center">
                        <div className="border-t border-black w-3/4 mx-auto mb-2" />
                        <p className="text-[10px] uppercase font-serif font-bold">Presidente</p>
                    </div>
                    <div className="text-center">
                        <div className="border-t border-black w-3/4 mx-auto mb-2" />
                        <p className="text-[10px] uppercase font-serif font-bold">1º Secretário</p>
                    </div>
                </div>
                </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Actions */}
      <div className="p-4 border-t border-border/50 bg-muted/20 space-y-3 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="flex-1 gap-2 border-border/60 hover:bg-background/80 transition-all group"
            onClick={() => onExport('docx')}
          >
            <Download className="w-4 h-4 text-blue-500 group-hover:scale-110 transition-transform" />
            <span className="group-hover:text-foreground transition-colors">Word</span>
          </Button>

          <Button
            variant="outline"
            className="flex-1 gap-2 border-border/60 hover:bg-background/80 transition-all group"
            onClick={() => onExport('pdf')}
          >
            <Download className="w-4 h-4 text-red-500 group-hover:scale-110 transition-transform" />
            <span className="group-hover:text-foreground transition-colors">PDF</span>
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            className="flex-1 gap-2 shadow-sm hover:shadow-md transition-all"
            onClick={() => onPublish('transparency')}
          >
            <Globe className="w-4 h-4 text-primary" />
            <span className="text-xs">Portal da Transparência</span>
          </Button>
        </div>

        <Button
          variant="gradient"
          className="w-full gap-2 shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all"
          onClick={() => onPublish('website')}
        >
          <Sparkles className="w-4 h-4 text-primary-foreground animate-pulse" />
          Publicar no Site da Câmara
        </Button>
      </div>
    </div>
  );
}

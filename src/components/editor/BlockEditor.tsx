import { useState } from 'react';
import { Plus, Sparkles, ArrowDownUp, GripVertical, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TranscriptionBlock } from './TranscriptionBlock';
import { TranscriptionBlock as BlockType, blockTypeLabels } from '@/types/transcription';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface BlockEditorProps {
  blocks: BlockType[];
  onBlocksChange: (blocks: BlockType[]) => void;
  onGenerateSummaries: () => void;
  onSummarizeBlock?: (id: string, customPrompt?: string) => Promise<void>;
  isGenerating?: boolean;
  processingBlockId?: string | null;
}

export function BlockEditor({ 
  blocks, 
  onBlocksChange, 
  onGenerateSummaries, 
  onSummarizeBlock, 
  isGenerating = false,
  processingBlockId = null 
}: BlockEditorProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const handleBlockUpdate = (updatedBlock: BlockType) => {
    const newBlocks = blocks.map(b => b.id === updatedBlock.id ? updatedBlock : b);
    onBlocksChange(newBlocks);
  };

  const handleBlockDelete = (id: string) => {
    const newBlocks = blocks.filter(b => b.id !== id);
    onBlocksChange(newBlocks);
  };

  const handleBlockSummarize = async (id: string, customPrompt?: string) => {
    if (onSummarizeBlock) {
      await onSummarizeBlock(id, customPrompt);
    } else {
      // Fallback if not provided (should be provided in SessionEditor)
      const block = blocks.find(b => b.id === id);
      if (block) {
        const summary = `Resumo gerado por IA (simulado): ${block.content.substring(0, 100)}...`;
        handleBlockUpdate({ ...block, summary });
      }
    }
  };

  const handleAddBlock = () => {
    const newBlock: BlockType = {
      id: `block-${Date.now()}`,
      type: 'outros',
      title: blockTypeLabels.outros,
      content: '',
      order: blocks.length,
    };
    onBlocksChange([...blocks, newBlock]);
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
  };

  const handleDrop = (index: number) => {
    if (draggedIndex === null || draggedIndex === index) return;

    const newBlocks = [...blocks];
    const draggedBlock = newBlocks[draggedIndex];
    newBlocks.splice(draggedIndex, 1);
    newBlocks.splice(index, 0, draggedBlock);
    
    // Update order
    newBlocks.forEach((block, i) => {
      block.order = i;
    });

    onBlocksChange(newBlocks);
    setDraggedIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Header Actions */}
      <div className="flex items-center justify-between sticky top-0 z-10 bg-background/80 backdrop-blur-md py-3 px-1 -mx-1 rounded-b-lg border-b border-border/40 shadow-sm transition-all duration-300">
        <div className="flex items-center gap-2 px-2">
          <div className="p-1.5 rounded-md bg-muted/50 text-muted-foreground">
             <ArrowDownUp className="w-4 h-4" />
          </div>
          <span className="text-xs font-medium text-muted-foreground">
            {blocks.length} blocos • Arraste para organizar
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddBlock}
            className="gap-2 border-dashed border-primary/30 hover:border-primary/60 hover:bg-primary/5 transition-all"
          >
            <Plus className="w-4 h-4 text-primary" />
            <span className="hidden sm:inline">Adicionar Bloco</span>
          </Button>

          <Button
            variant="gradient"
            size="sm"
            onClick={onGenerateSummaries}
            disabled={isGenerating}
            className="gap-2 shadow-lg shadow-purple-500/20"
          >
            <Sparkles className={cn("w-4 h-4", isGenerating && "animate-spin")} />
            {isGenerating ? 'Resumindo...' : 'Resumir Tudo'}
          </Button>
        </div>
      </div>

      {/* Blocks */}
      <div className="space-y-4">
        {blocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-border/60 rounded-xl bg-muted/10 animate-in fade-in zoom-in-95 duration-500">
            <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mb-4">
              <Layers className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">Nenhum bloco encontrado</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm text-center">
              A transcrição ainda não foi processada ou não há blocos criados.
            </p>
            <Button variant="outline" onClick={handleAddBlock} className="gap-2">
              <Plus className="w-4 h-4" />
              Adicionar Bloco Manualmente
            </Button>
          </div>
        ) : (
          blocks.map((block, index) => (
            <div
              key={block.id}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={() => handleDrop(index)}
              onDragEnd={handleDragEnd}
              className={cn(
                "transition-all duration-300 rounded-xl",
                draggedIndex === index 
                  ? "opacity-50 scale-95 border-2 border-dashed border-primary bg-primary/5 shadow-none" 
                  : "hover:translate-x-1",
                draggedIndex !== null && draggedIndex !== index && "blur-[1px]"
              )}
            >
              <div className="relative group">
                {/* Drag Handle Indicator - Visible on Hover */}
                <div className="absolute -left-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground hidden md:block">
                  <GripVertical className="w-4 h-4" />
                </div>
                
                <TranscriptionBlock
                  block={block}
                  onUpdate={handleBlockUpdate}
                  onDelete={handleBlockDelete}
                  onSummarize={handleBlockSummarize}
                  isDragging={draggedIndex === index}
                  isProcessing={processingBlockId === block.id}
                  dragHandleProps={{}}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

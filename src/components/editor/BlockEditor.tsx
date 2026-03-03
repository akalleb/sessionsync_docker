import { useState, useRef } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { Plus, Sparkles, ArrowDownUp, GripVertical, Layers, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TranscriptionBlock as TranscriptionBlockComponent } from './TranscriptionBlock';
import { TranscriptionBlock, blockTypeLabels, blockTypeCategories, BlockType } from '@/types/transcription';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";

interface BlockEditorProps {
  blocks: TranscriptionBlock[];
  onBlocksChange: (blocks: TranscriptionBlock[]) => void;
  onGenerateSummaries: () => void;
  onSummarizeBlock: (id: string, customPrompt?: string) => void;
  isGenerating?: boolean;
  processingBlockId?: string | null;
}

// Drag & Drop Item Types
const ItemTypes = {
  BLOCK: 'block',
};

interface DragItem {
  index: number;
  id: string;
  type: string;
}

export function BlockEditor({ 
  blocks, 
  onBlocksChange, 
  onGenerateSummaries, 
  onSummarizeBlock, 
  isGenerating = false,
  processingBlockId = null 
}: BlockEditorProps) {

  const [isMiniMapOpen, setIsMiniMapOpen] = useState(false);
  const [miniMapDragIndex, setMiniMapDragIndex] = useState<number | null>(null);
  const [miniMapHoverIndex, setMiniMapHoverIndex] = useState<number | null>(null);

  const moveBlock = (dragIndex: number, hoverIndex: number) => {
    const dragBlock = blocks[dragIndex];
    const newBlocks = [...blocks];
    newBlocks.splice(dragIndex, 1);
    newBlocks.splice(hoverIndex, 0, dragBlock);
    
    // Update order property
    newBlocks.forEach((b, i) => b.order = i);
    
    onBlocksChange(newBlocks);
  };

  const handleBlockUpdate = (updatedBlock: TranscriptionBlock) => {
    const newBlocks = blocks.map(b => b.id === updatedBlock.id ? updatedBlock : b);
    onBlocksChange(newBlocks);
  };

  const handleBlockDelete = (id: string) => {
    const newBlocks = blocks.filter(b => b.id !== id);
    onBlocksChange(newBlocks);
  };

  const handleAddBlock = (type: BlockType = 'outros') => {
    const newBlock: TranscriptionBlock = {
      id: `block-${Date.now()}`,
      type,
      title: blockTypeLabels[type] || 'Novo Bloco',
      content: '',
      order: blocks.length,
    };
    onBlocksChange([...blocks, newBlock]);
    
    // Scroll to bottom logic could be added here
  };

  return (
    <div className="space-y-6 pb-20 relative">
      <div className="flex items-center justify-between sticky top-0 z-20 bg-background/80 backdrop-blur-md py-3 px-1 rounded-b-lg border-b border-border/40 shadow-sm transition-all duration-300">
        <button
          type="button"
          onClick={() => setIsMiniMapOpen(open => !open)}
          className={cn(
            "flex items-center gap-2 px-2 rounded-md transition-colors",
            "hover:bg-muted/70",
            !isMiniMapOpen && "bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20"
          )}
        >
          <div className="p-1.5 rounded-md bg-muted/50 text-muted-foreground">
             <ArrowDownUp className="w-4 h-4" />
          </div>
          <span className="text-xs font-medium hidden sm:inline">
            {blocks.length} blocos • {isMiniMapOpen ? 'Ocultar mini mapa' : 'Mostrar mini mapa de ordem'}
          </span>
        </button>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 border-dashed border-primary/30 hover:border-primary/60 hover:bg-primary/5 transition-all"
              >
                <Plus className="w-4 h-4 text-primary" />
                <span className="hidden sm:inline">Adicionar Bloco</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 max-h-[400px] overflow-y-auto">
              <DropdownMenuLabel>Escolha o Tipo de Bloco</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {blockTypeCategories.map((category) => (
                <DropdownMenuGroup key={category.label}>
                  <DropdownMenuLabel className="text-xs text-muted-foreground uppercase tracking-wider font-bold mt-2">
                    {category.label}
                  </DropdownMenuLabel>
                  {category.types.map((type) => (
                    <DropdownMenuItem key={type} onClick={() => handleAddBlock(type)} className="cursor-pointer">
                      {blockTypeLabels[type]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

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

      {isMiniMapOpen && (
        <div className="px-1">
          <div className="flex items-center gap-1.5 overflow-x-auto py-1.5 custom-scrollbar">
            {blocks.map((block, index) => {
              const typeLabel = blockTypeLabels[block.type];
              const isSource = miniMapDragIndex === index;
              const isTarget = miniMapHoverIndex === index && miniMapDragIndex !== null && miniMapDragIndex !== index;
              return (
                <div
                  key={block.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', index.toString());
                    e.dataTransfer.effectAllowed = 'move';
                    setMiniMapDragIndex(index);
                    setMiniMapHoverIndex(index);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    setMiniMapHoverIndex(index);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const fromStr = e.dataTransfer.getData('text/plain');
                    const from = parseInt(fromStr, 10);
                    if (!Number.isNaN(from) && from !== index) {
                      moveBlock(from, index);
                    }
                    setMiniMapDragIndex(null);
                    setMiniMapHoverIndex(null);
                  }}
                  onDragEnd={() => {
                    setMiniMapDragIndex(null);
                    setMiniMapHoverIndex(null);
                  }}
                  className={cn(
                    "flex items-center gap-1 px-2 py-1 rounded-full border text-[10px] shadow-sm cursor-grab active:cursor-grabbing transition-all duration-150",
                    "bg-blue-500/5 border-blue-500/40 hover:bg-blue-500/10 hover:border-blue-500/70 hover:shadow-md",
                    isSource && "ring-2 ring-offset-1 ring-blue-400/70",
                    isTarget && "bg-blue-500/20 border-blue-500 ring-2 ring-blue-500/80 scale-[1.03]"
                  )}
                >
                  <span className="font-mono px-1.5 rounded-full bg-blue-500/20 text-blue-900 dark:text-blue-100">
                    {index + 1}
                  </span>
                  <span className="max-w-[96px] truncate">
                    {typeLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-4 px-1">
        {blocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-border/60 rounded-xl bg-muted/10 animate-in fade-in zoom-in-95 duration-500">
            <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mb-4">
              <Layers className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">Nenhum bloco encontrado</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm text-center">
              A transcrição ainda não foi processada ou não há blocos criados.
            </p>
            <Button variant="outline" onClick={() => handleAddBlock('outros')} className="gap-2">
              <Plus className="w-4 h-4" />
              Adicionar Bloco Manualmente
            </Button>
          </div>
        ) : (
          blocks.map((block, index) => (
            <DraggableBlock
              key={block.id}
              block={block}
              index={index}
              moveBlock={moveBlock}
              onUpdate={handleBlockUpdate}
              onDelete={handleBlockDelete}
              onSummarize={onSummarizeBlock}
              isProcessing={processingBlockId === block.id}
            />
          ))
        )}
      </div>
    </div>
  );
}

// Subcomponent for Draggable Item
interface DraggableBlockProps {
  block: TranscriptionBlock;
  index: number;
  moveBlock: (dragIndex: number, hoverIndex: number) => void;
  onUpdate: (block: TranscriptionBlock) => void;
  onDelete: (id: string) => void;
  onSummarize: (id: string, customPrompt?: string) => void;
  isProcessing: boolean;
}

function DraggableBlock({ block, index, moveBlock, onUpdate, onDelete, onSummarize, isProcessing }: DraggableBlockProps) {
  const ref = useRef<HTMLDivElement>(null);
  
  // Note: Since we are not wrapping everything in DndProvider here (it should be at page root or higher), 
  // we assume simple HTML5 drag and drop or that DndProvider is present.
  // Given previous code didn't use react-dnd, I will implement a robust HTML5 drag/drop locally within component 
  // to avoid dependency issues if react-dnd isn't setup.
  // REVERTING TO HTML5 NATIVE DRAG IMPLEMENTATION FROM PREVIOUS VERSION BUT IMPROVED VISUALLY

  const [isDragging, setIsDragging] = useState(false);
  const [isOver, setIsOver] = useState(false);

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', index.toString());
    e.dataTransfer.effectAllowed = 'move';
    setIsDragging(true);
    // e.target.classList.add('opacity-50');
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsOver(true);
  };

  const handleDragLeave = () => {
    setIsOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(false);
    setIsDragging(false);
    const dragIndexStr = e.dataTransfer.getData('text/plain');
    const dragIndex = parseInt(dragIndexStr, 10);
    
    if (dragIndex !== index) {
      moveBlock(dragIndex, index);
    }
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    setIsOver(false);
  };

  return (
    <div
      ref={ref}
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onDragEnd={handleDragEnd}
      className={cn(
        "transition-all duration-300 rounded-xl relative group",
        isDragging ? "opacity-40 scale-95 border-2 border-dashed border-primary" : "opacity-100",
        isOver && !isDragging && "border-t-4 border-t-primary mt-4 transition-all"
      )}
    >
       {/* Drag Handle - Visible on Hover (Left Side) */}
       <div className="absolute -left-6 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing p-2 text-muted-foreground hover:text-primary hidden xl:block">
          <GripVertical className="w-5 h-5" />
       </div>

       <TranscriptionBlockComponent
         block={block}
         onUpdate={onUpdate}
         onDelete={onDelete}
         onSummarize={onSummarize}
         isDragging={isDragging}
         isProcessing={isProcessing}
         dragHandleProps={{}} 
       />
       
       {/* Drop Indicator Line (Bottom) */}
       {isOver && !isDragging && (
           <div className="absolute -bottom-2 left-0 right-0 h-1 bg-primary rounded-full animate-pulse z-20 pointer-events-none" />
       )}
    </div>
  );
}

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical,
  Clock,
  CheckCircle2,
  PlayCircle,
  Pause,
  Edit2,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { SessaoPauta } from '@/types/sessao';

const TIPOS_ITEM = [
  { id: 'projeto_lei', nome: 'Projeto de Lei' },
  { id: 'requerimento', nome: 'Requerimento' },
  { id: 'mocao', nome: 'Moção' },
  { id: 'indicacao', nome: 'Indicação' },
  { id: 'comunicado', nome: 'Comunicado' },
  { id: 'expediente', nome: 'Expediente' },
  { id: 'outros', nome: 'Outros' },
];

interface SortablePautaItemProps {
  item: SessaoPauta;
  faseAtual: string;
  faseCodigo: string;
  readonly: boolean;
  editingItemId: string | null;
  onOpenEdit: (item: SessaoPauta) => void;
  onCloseEdit: () => void;
  onIniciarItem: (item: SessaoPauta) => void;
  onConcluirItem: (item: SessaoPauta) => void;
  onAdiarItem: (item: SessaoPauta) => void;
  onExcluirItem: (itemId: string) => void;
  renderItemForm: () => React.ReactNode;
}

export function SortablePautaItem({
  item,
  faseAtual,
  faseCodigo,
  readonly,
  editingItemId,
  onOpenEdit,
  onCloseEdit,
  onIniciarItem,
  onConcluirItem,
  onAdiarItem,
  onExcluirItem,
  renderItemForm,
}: SortablePautaItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } =
    useSortable({
      id: item.id,
      disabled: readonly,
      data: { fase: faseCodigo },
    });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'concluido':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'em_andamento':
        return <PlayCircle className="h-4 w-4 text-primary" />;
      case 'adiado':
        return <Pause className="h-4 w-4 text-amber-500" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'concluido':
        return (
          <Badge variant="outline" className="border-green-500 text-green-600">
            Concluído
          </Badge>
        );
      case 'em_andamento':
        return <Badge>Em andamento</Badge>;
      case 'adiado':
        return <Badge variant="secondary">Adiado</Badge>;
      default:
        return <Badge variant="outline">Pendente</Badge>;
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg border transition-all group bg-card relative',
        item.status === 'em_andamento' && 'bg-primary/5 border-primary',
        item.status === 'concluido' && 'opacity-75',
        isDragging && 'opacity-30 border-dashed border-2 border-primary bg-primary/5',
        isOver && !isDragging && 'ring-2 ring-primary ring-offset-2'
      )}
    >
      {!readonly && (
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>
      )}
      {getStatusIcon(item.status)}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{item.titulo}</p>
        {item.descricao && (
          <p className="text-xs text-muted-foreground truncate">{item.descricao}</p>
        )}
        {item.tipo && (
          <Badge variant="outline" className="text-xs mt-1">
            {TIPOS_ITEM.find((t) => t.id === item.tipo)?.nome || item.tipo}
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-2">
        {item.tempo_previsto && (
          <span className="text-xs text-muted-foreground">{item.tempo_previsto}min</span>
        )}
        {getStatusBadge(item.status)}

        {!readonly && (
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {item.status === 'pendente' && faseCodigo === faseAtual && (
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => onIniciarItem(item)}
              >
                <PlayCircle className="h-4 w-4 text-green-600" />
              </Button>
            )}
            {item.status === 'em_andamento' && (
              <>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => onConcluirItem(item)}
                >
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => onAdiarItem(item)}
                >
                  <Pause className="h-4 w-4 text-amber-600" />
                </Button>
              </>
            )}

            <Dialog open={editingItemId === item.id} onOpenChange={(open) => !open && onCloseEdit()}>
              <DialogTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => onOpenEdit(item)}
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Editar Item</DialogTitle>
                  <DialogDescription>Faça as alterações necessárias no item da pauta.</DialogDescription>
                </DialogHeader>
                {renderItemForm()}
              </DialogContent>
            </Dialog>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir item?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação não pode ser desfeita. O item "{item.titulo}" será removido da pauta.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onExcluirItem(item.id)}>
                    Excluir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>
    </div>
  );
}

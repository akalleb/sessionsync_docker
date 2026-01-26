import { useState, useEffect } from 'react';
import { Plus, GripVertical, Pencil, Trash2, Save, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { useFasesSessao, FaseSessao } from '@/hooks/useFasesSessao';
import { cn } from '@/lib/utils';
import * as LucideIcons from 'lucide-react';

const AVAILABLE_ICONS = [
  'PlayCircle',
  'FileText',
  'ListOrdered',
  'Mic',
  'Vote',
  'CheckCircle2',
  'Clock',
  'Users',
  'MessageSquare',
  'Gavel',
  'Book',
  'Scale',
  'Flag',
  'Star',
  'Bell',
  'Calendar',
  'ClipboardList',
  'Settings',
];

interface FasesManagerProps {
  camaraId: string;
}

export function FasesManager({ camaraId }: FasesManagerProps) {
  const { fases, loading, addFase, updateFase, deleteFase, reorderFases } = useFasesSessao(camaraId);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingFase, setEditingFase] = useState<FaseSessao | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<FaseSessao | null>(null);
  const [formData, setFormData] = useState({ codigo: '', nome: '', icone: 'Circle' });
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [orderedFases, setOrderedFases] = useState<FaseSessao[]>([]);

  useEffect(() => {
    setOrderedFases(fases);
  }, [fases]);

  const resetForm = () => {
    setFormData({ codigo: '', nome: '', icone: 'Circle' });
    setEditingFase(null);
  };

  const handleAdd = async () => {
    if (!formData.codigo || !formData.nome) {
      toast.error('Preencha todos os campos');
      return;
    }

    try {
      await addFase({
        camara_id: camaraId,
        codigo: formData.codigo.toLowerCase().replace(/\s+/g, '_'),
        nome: formData.nome,
        icone: formData.icone,
        ordem: orderedFases.length + 1,
        ativo: true,
      });
      toast.success('Fase adicionada com sucesso');
      setShowAddDialog(false);
      resetForm();
    } catch (error) {
      toast.error('Erro ao adicionar fase: ' + (error as Error).message);
    }
  };

  const handleEdit = async () => {
    if (!editingFase || !formData.nome) {
      toast.error('Preencha todos os campos');
      return;
    }

    try {
      await updateFase(editingFase.id, {
        nome: formData.nome,
        icone: formData.icone,
      });
      toast.success('Fase atualizada com sucesso');
      setEditingFase(null);
      resetForm();
    } catch (error) {
      toast.error('Erro ao atualizar fase: ' + (error as Error).message);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;

    try {
      await deleteFase(deleteConfirm.id);
      toast.success('Fase removida com sucesso');
      setDeleteConfirm(null);
    } catch (error) {
      toast.error('Erro ao remover fase: ' + (error as Error).message);
    }
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newFases = [...orderedFases];
    const [removed] = newFases.splice(draggedIndex, 1);
    newFases.splice(index, 0, removed);

    setOrderedFases(newFases);
    setDraggedIndex(index);
  };

  const handleDragEnd = async () => {
    if (draggedIndex === null) return;

    const reordered = orderedFases.map((f, i) => ({ id: f.id, ordem: i + 1 }));
    await reorderFases(reordered);
    setDraggedIndex(null);
  };

  const openEditDialog = (fase: FaseSessao) => {
    setFormData({ codigo: fase.codigo, nome: fase.nome, icone: fase.icone });
    setEditingFase(fase);
    setShowAddDialog(true);
  };

  const getIconComponent = (iconName: string) => {
    const IconComponent = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[iconName];
    return IconComponent ? <IconComponent className="h-5 w-5" /> : null;
  };

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Carregando fases...</div>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Fases do Rito Parlamentar</CardTitle>
          <CardDescription>Configure as etapas das sessões da sua Câmara</CardDescription>
        </div>
        <Button onClick={() => setShowAddDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Fase
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {orderedFases.map((fase, index) => (
            <div
              key={fase.id}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              className={cn(
                'flex items-center gap-3 p-3 bg-muted/50 rounded-lg border cursor-move transition-all',
                draggedIndex === index && 'opacity-50 scale-95'
              )}
            >
              <GripVertical className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                {getIconComponent(fase.icone)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{fase.nome}</p>
                <p className="text-xs text-muted-foreground">Código: {fase.codigo}</p>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={() => openEditDialog(fase)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setDeleteConfirm(fase)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        {fases.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            Nenhuma fase configurada. Adicione a primeira fase do rito.
          </div>
        )}
      </CardContent>

      <Dialog
        open={showAddDialog}
        onOpenChange={(open) => {
          setShowAddDialog(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingFase ? 'Editar Fase' : 'Nova Fase'}</DialogTitle>
            <DialogDescription>
              {editingFase
                ? 'Altere o nome ou ícone desta etapa do rito parlamentar'
                : 'Adicione uma nova etapa ao rito parlamentar'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="codigo">Código</Label>
              <Input
                id="codigo"
                placeholder="ex: ordem_do_dia"
                value={formData.codigo}
                onChange={(e) => setFormData({ ...formData, codigo: e.target.value })}
                disabled={!!editingFase}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Identificador único (sem espaços)
              </p>
            </div>
            <div>
              <Label htmlFor="nome">Nome</Label>
              <Input
                id="nome"
                placeholder="ex: Ordem do Dia"
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
              />
            </div>
            <div>
              <Label>Ícone</Label>
              <Select
                value={formData.icone}
                onValueChange={(v) => setFormData({ ...formData, icone: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABLE_ICONS.map((icon) => (
                    <SelectItem key={icon} value={icon}>
                      <div className="flex items-center gap-2">
                        {getIconComponent(icon)}
                        <span>{icon}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAddDialog(false);
                resetForm();
              }}
            >
              <X className="h-4 w-4 mr-2" />
              Cancelar
            </Button>
            <Button onClick={editingFase ? handleEdit : handleAdd}>
              <Save className="h-4 w-4 mr-2" />
              {editingFase ? 'Salvar alterações' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir fase?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A fase "{deleteConfirm?.nome}" será removida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

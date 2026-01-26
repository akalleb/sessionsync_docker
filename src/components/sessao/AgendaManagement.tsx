import { useState } from 'react';
import { Plus, FileText, GripVertical } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { SessaoPauta } from '@/types/sessao';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { FaseSessao } from '@/hooks/useFasesSessao';
import { SortablePautaItem } from './SortablePautaItem';

interface AgendaManagementProps {
  sessaoId: string;
  pauta: SessaoPauta[];
  faseAtual: string;
  fases: FaseSessao[];
  onRefetch: () => void;
  readonly?: boolean;
}

const TIPOS_ITEM = [
  { id: 'projeto_lei', nome: 'Projeto de Lei' },
  { id: 'requerimento', nome: 'Requerimento' },
  { id: 'mocao', nome: 'Moção' },
  { id: 'indicacao', nome: 'Indicação' },
  { id: 'comunicado', nome: 'Comunicado' },
  { id: 'expediente', nome: 'Expediente' },
  { id: 'outros', nome: 'Outros' },
];

interface ItemFormProps {
  formData: {
    titulo: string;
    descricao: string;
    fase: string;
    tipo: string;
    tempo_previsto: number;
  };
  setFormData: React.Dispatch<React.SetStateAction<{
    titulo: string;
    descricao: string;
    fase: string;
    tipo: string;
    tempo_previsto: number;
  }>>;
  fasesParaPauta: FaseSessao[];
  onSubmit: () => void;
  isEdit?: boolean;
}

const ItemForm = ({ formData, setFormData, fasesParaPauta, onSubmit, isEdit = false }: ItemFormProps) => {
  return (
    <div className="space-y-4">
      <div>
        <Label>Título *</Label>
        <Input
          value={formData.titulo}
          onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
          placeholder="Ex: Projeto de Lei nº 123/2024"
        />
      </div>
      <div>
        <Label>Descrição</Label>
        <Textarea
          value={formData.descricao}
          onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
          placeholder="Breve descrição do item"
          rows={3}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Fase</Label>
          <Select
            value={formData.fase}
            onValueChange={(v) => setFormData({ ...formData, fase: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fasesParaPauta.map((fase) => (
                <SelectItem key={fase.codigo} value={fase.codigo}>
                  {fase.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Tipo</Label>
          <Select
            value={formData.tipo}
            onValueChange={(v) => setFormData({ ...formData, tipo: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIPOS_ITEM.map((tipo) => (
                <SelectItem key={tipo.id} value={tipo.id}>
                  {tipo.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>Tempo previsto (minutos)</Label>
        <Input
          type="number"
          value={formData.tempo_previsto}
          onChange={(e) =>
            setFormData({ ...formData, tempo_previsto: Number(e.target.value) })
          }
          min={1}
        />
      </div>
      <Button className="w-full" onClick={onSubmit}>
        {isEdit ? 'Salvar alterações' : 'Adicionar à pauta'}
      </Button>
    </div>
  );
};

export function AgendaManagement({
  sessaoId,
  pauta,
  faseAtual,
  fases,
  onRefetch,
  readonly = false,
}: AgendaManagementProps) {
  const { toast } = useToast();
  const [showNovoItem, setShowNovoItem] = useState(false);
  const [editingItem, setEditingItem] = useState<SessaoPauta | null>(null);
  const [activeItem, setActiveItem] = useState<SessaoPauta | null>(null);
  const [formData, setFormData] = useState({
    titulo: '',
    descricao: '',
    fase: 'ordem_do_dia',
    tipo: 'projeto_lei',
    tempo_previsto: 10,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const fasesParaPauta = fases
    .filter((f) => f.codigo !== 'votacao' && f.codigo !== 'encerramento')
    .sort((a, b) => a.ordem - b.ordem);

  const pautaPorFase = fasesParaPauta.reduce(
    (acc, fase) => {
      acc[fase.codigo] = pauta
        .filter((item) => item.fase === fase.codigo)
        .sort((a, b) => a.ordem - b.ordem);
      return acc;
    },
    {} as Record<string, SessaoPauta[]>
  );

  const resetForm = () => {
    setFormData({
      titulo: '',
      descricao: '',
      fase: fasesParaPauta[0]?.codigo || 'ordem_do_dia',
      tipo: 'projeto_lei',
      tempo_previsto: 10,
    });
  };

  const handleOpenEdit = (item: SessaoPauta) => {
    setEditingItem(item);
    setFormData({
      titulo: item.titulo,
      descricao: item.descricao || '',
      fase: item.fase,
      tipo: item.tipo || 'outros',
      tempo_previsto: item.tempo_previsto || 10,
    });
  };

  const handleCloseEdit = () => {
    setEditingItem(null);
    resetForm();
  };

  const handleCriarItem = async () => {
    if (!formData.titulo) {
      toast({ title: 'Informe o título do item', variant: 'destructive' });
      return;
    }

    const itensNaFase = pauta.filter((p) => p.fase === formData.fase);
    const proximaOrdem =
      itensNaFase.length > 0 ? Math.max(...itensNaFase.map((p) => p.ordem)) + 1 : 1;

    const { error } = await supabase.from('sessao_pauta').insert({
      sessao_id: sessaoId,
      titulo: formData.titulo,
      descricao: formData.descricao || null,
      fase: formData.fase,
      tipo: formData.tipo,
      tempo_previsto: formData.tempo_previsto,
      ordem: proximaOrdem,
      status: 'pendente',
    });

    if (error) {
      toast({ title: 'Erro ao criar item', variant: 'destructive' });
      return;
    }

    toast({ title: 'Item adicionado à pauta' });
    setShowNovoItem(false);
    resetForm();
    onRefetch();
  };

  const handleEditarItem = async () => {
    if (!editingItem || !formData.titulo) return;

    const { error } = await supabase
      .from('sessao_pauta')
      .update({
        titulo: formData.titulo,
        descricao: formData.descricao || null,
        fase: formData.fase,
        tipo: formData.tipo,
        tempo_previsto: formData.tempo_previsto,
      })
      .eq('id', editingItem.id);

    if (error) {
      toast({ title: 'Erro ao editar item', variant: 'destructive' });
      return;
    }

    toast({ title: 'Item atualizado' });
    handleCloseEdit();
    onRefetch();
  };

  const handleExcluirItem = async (itemId: string) => {
    const { error } = await supabase.from('sessao_pauta').delete().eq('id', itemId);

    if (error) {
      toast({ title: 'Erro ao excluir item', variant: 'destructive' });
      return;
    }

    toast({ title: 'Item excluído da pauta' });
    onRefetch();
  };

  const handleIniciarItem = async (item: SessaoPauta) => {
    const itemEmAndamento = pauta.find((p) => p.status === 'em_andamento');
    if (itemEmAndamento) {
      await supabase
        .from('sessao_pauta')
        .update({ status: 'concluido' })
        .eq('id', itemEmAndamento.id);
    }

    await supabase.from('sessao_pauta').update({ status: 'em_andamento' }).eq('id', item.id);
    await supabase.from('sessoes').update({ item_atual: item.id }).eq('id', sessaoId);

    toast({ title: `Iniciado: ${item.titulo}` });
    onRefetch();
  };

  const handleConcluirItem = async (item: SessaoPauta) => {
    await supabase.from('sessao_pauta').update({ status: 'concluido' }).eq('id', item.id);
    await supabase.from('sessoes').update({ item_atual: null }).eq('id', sessaoId);
    toast({ title: 'Item concluído' });
    onRefetch();
  };

  const handleAdiarItem = async (item: SessaoPauta) => {
    await supabase.from('sessao_pauta').update({ status: 'adiado' }).eq('id', item.id);
    toast({ title: 'Item adiado' });
    onRefetch();
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const item = pauta.find((p) => p.id === active.id);
    setActiveItem(item || null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveItem(null);

    const activeData = active.data.current as { fase?: string } | null;
    const faseCodigo = activeData?.fase;

    if (over && active.id !== over.id && faseCodigo) {
      const items = pautaPorFase[faseCodigo] || [];
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const reorderedItems = arrayMove(items, oldIndex, newIndex);

        const updates = reorderedItems.map((item, index) => ({
          id: item.id,
          ordem: index + 1,
        }));

        for (const update of updates) {
          await supabase
            .from('sessao_pauta')
            .update({ ordem: update.ordem })
            .eq('id', update.id);
        }

        toast({ title: 'Ordem atualizada' });
        onRefetch();
      }
    }
  };

  const DragOverlayContent = ({ item }: { item: SessaoPauta }) => (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-card shadow-2xl border-primary scale-105 opacity-95">
      <GripVertical className="h-4 w-4 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{item.titulo}</p>
        {item.descricao && (
          <p className="text-xs text-muted-foreground truncate">{item.descricao}</p>
        )}
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          <CardTitle>Pauta da Sessão</CardTitle>
        </div>
        {!readonly && (
          <Dialog open={showNovoItem} onOpenChange={setShowNovoItem}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Novo Item
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Novo Item de Pauta</DialogTitle>
                <DialogDescription>
                  Preencha os dados do novo item abaixo.
                </DialogDescription>
              </DialogHeader>
              <ItemForm 
                formData={formData}
                setFormData={setFormData}
                fasesParaPauta={fasesParaPauta}
                onSubmit={handleCriarItem}
              />
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent>
        {fasesParaPauta.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>Nenhuma fase configurada para a pauta.</p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="space-y-6">
              {fasesParaPauta.map((fase) => {
                const items = pautaPorFase[fase.codigo] || [];
                if (items.length === 0) return null;

                return (
                  <div key={fase.codigo} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3
                        className={cn(
                          'text-sm font-semibold uppercase tracking-wide',
                          fase.codigo === faseAtual ? 'text-primary' : 'text-muted-foreground'
                        )}
                      >
                        {fase.nome}
                      </h3>
                      <Badge variant={fase.codigo === faseAtual ? 'default' : 'outline'}>
                        {fase.codigo === faseAtual ? 'Fase atual' : 'Fase'}
                      </Badge>
                    </div>
                    <SortableContext
                      items={items.map((item) => item.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-2">
                        {items.map((item) => (
                          <SortablePautaItem
                            key={item.id}
                            item={{ ...item, fase: fase.codigo } as SessaoPauta}
                            faseAtual={faseAtual}
                            faseCodigo={fase.codigo}
                            readonly={readonly}
                            editingItemId={editingItem?.id || null}
                            onOpenEdit={handleOpenEdit}
                            onCloseEdit={handleCloseEdit}
                            onIniciarItem={handleIniciarItem}
                            onConcluirItem={handleConcluirItem}
                            onAdiarItem={handleAdiarItem}
                            onExcluirItem={handleExcluirItem}
                            renderItemForm={() => (
                              <ItemForm 
                                formData={formData}
                                setFormData={setFormData}
                                fasesParaPauta={fasesParaPauta}
                                onSubmit={handleEditarItem}
                                isEdit
                              />
                            )}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </div>
                );
              })}
            </div>

            <DragOverlay>
              {activeItem ? <DragOverlayContent item={activeItem} /> : null}
            </DragOverlay>
          </DndContext>
        )}
      </CardContent>
    </Card>
  );
}

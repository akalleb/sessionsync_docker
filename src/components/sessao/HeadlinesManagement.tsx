import { useState } from 'react';
import { Plus, Trash2, Edit2, Check, X, Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { SessaoManchete } from '@/types/sessao';

interface HeadlinesManagementProps {
  sessaoId: string;
  manchetes: SessaoManchete[];
  readonly?: boolean;
  onChange?: () => void;
}

export function HeadlinesManagement({ sessaoId, manchetes, readonly = false, onChange }: HeadlinesManagementProps) {
  const { toast } = useToast();
  const [novoTexto, setNovoTexto] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const handleAdd = async () => {
    if (!novoTexto.trim()) return;

    try {
      const { error } = await supabase.from('sessao_manchetes').insert({
        sessao_id: sessaoId,
        texto: novoTexto,
        ativa: true,
        ordem: manchetes.length,
      });

      if (error) throw error;

      setNovoTexto('');
      toast({ title: 'Manchete adicionada com sucesso!' });
      onChange?.();
    } catch (error) {
      console.error(error);
      toast({ title: 'Erro ao adicionar manchete', variant: 'destructive' });
    }
  };

  const handleUpdate = async (id: string, updates: Partial<SessaoManchete>) => {
    try {
      const { error } = await supabase
        .from('sessao_manchetes')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
      
      if (editingId === id) {
        setEditingId(null);
      }

      onChange?.();
    } catch (error) {
      console.error(error);
      toast({ title: 'Erro ao atualizar manchete', variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('sessao_manchetes')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      toast({ title: 'Manchete removida' });
      onChange?.();
    } catch (error) {
      console.error(error);
      toast({ title: 'Erro ao remover manchete', variant: 'destructive' });
    }
  };

  const startEditing = (manchete: SessaoManchete) => {
    setEditingId(manchete.id);
    setEditText(manchete.texto);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5" />
            Manchetes e Avisos
          </CardTitle>
          <CardDescription>
            Gerencie as mensagens que aparecem no painel quando não há orador ou votação.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!readonly && (
            <div className="flex gap-2">
              <Input
                value={novoTexto}
                onChange={(e) => setNovoTexto(e.target.value)}
                placeholder="Digite uma nova manchete..."
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
              <Button onClick={handleAdd}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar
              </Button>
            </div>
          )}

          <div className="space-y-2 mt-4">
            {manchetes.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhuma manchete cadastrada. O painel exibirá a mensagem padrão.
              </p>
            ) : (
              manchetes.map((manchete) => (
                <div
                  key={manchete.id}
                  className="flex items-center justify-between p-3 border rounded-lg bg-card shadow-sm gap-4"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <Switch
                      checked={manchete.ativa}
                      onCheckedChange={(checked) => handleUpdate(manchete.id, { ativa: checked })}
                      disabled={readonly}
                    />
                    
                    {editingId === manchete.id ? (
                      <div className="flex items-center gap-2 flex-1">
                        <Input
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          className="flex-1"
                          autoFocus
                        />
                        <Button size="icon" variant="ghost" onClick={() => handleUpdate(manchete.id, { texto: editText })}>
                          <Check className="h-4 w-4 text-green-600" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => setEditingId(null)}>
                          <X className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    ) : (
                      <span className={`flex-1 ${!manchete.ativa ? 'text-muted-foreground line-through' : ''}`}>
                        {manchete.texto}
                      </span>
                    )}
                  </div>

                  {!readonly && (
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" onClick={() => startEditing(manchete)}>
                        <Edit2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => handleDelete(manchete.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

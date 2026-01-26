import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Building2, Plus, Pencil, Trash2, Search, Loader2, Power } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Tables } from '@/integrations/supabase/types';
import { apiCall } from '@/lib/utils';

type Camara = Tables<'camaras'>;

type CamaraFeatures = {
  assistant: boolean;
  sessions: boolean;
  liveSessions: boolean;
  legislativeFactory: boolean;
  upload: boolean;
  adminUsers: boolean;
  adminVereadores: boolean;
};

type CamaraConfiguration = {
  features?: CamaraFeatures;
} | null;

const defaultFeatures: CamaraFeatures = {
  assistant: true,
  sessions: true,
  liveSessions: true,
  legislativeFactory: true,
  upload: true,
  adminUsers: true,
  adminVereadores: true,
};

const Camaras = () => {
  const { hasRole } = useAuth();
  const [camaras, setCamaras] = useState<Camara[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCamara, setEditingCamara] = useState<Camara | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    nome: '',
    cidade: '',
    estado: '',
    site: '',
    email: '',
    telefone: '',
    logo_url: '',
    features: { ...defaultFeatures },
  });

  useEffect(() => {
    fetchCamaras();
  }, []);

  const fetchCamaras = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('camaras')
        .select('*')
        .order('nome');

      if (error) {
        // Ignorar erro se for abortado (pode acontecer em navegação rápida)
        if (error.message?.includes('aborted') || error.code === '20') {
           console.warn('Fetch camaras aborted or cancelled', error);
           return;
        }
        throw error;
      }
      
      if (data) {
        setCamaras(data as Camara[]);
      }
    } catch (err) {
      console.error('Erro ao buscar câmaras:', err);
      toast.error('Erro ao carregar câmaras. Verifique sua conexão.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const configuration: CamaraConfiguration = {
      features: formData.features,
    };

    const dataToSubmit = {
      nome: formData.nome,
      cidade: formData.cidade,
      estado: formData.estado,
      site: formData.site || null,
      email: formData.email || null,
      telefone: formData.telefone || null,
      logo_url: formData.logo_url || null,
      configuration,
    };

    if (editingCamara) {
      const { error } = await supabase
        .from('camaras')
        .update(dataToSubmit)
        .eq('id', editingCamara.id);

      if (error) {
        toast.error('Erro ao atualizar câmara');
      } else {
        toast.success('Câmara atualizada com sucesso!');
        setIsDialogOpen(false);
        fetchCamaras();
      }
    } else {
      const { error } = await supabase
        .from('camaras')
        .insert(dataToSubmit);

      if (error) {
        toast.error('Erro ao criar câmara');
      } else {
        toast.success('Câmara criada com sucesso!');
        setIsDialogOpen(false);
        fetchCamaras();
      }
    }

    setSubmitting(false);
    resetForm();
  };

  const handleEdit = (camara: Camara) => {
    const config = camara.configuration as CamaraConfiguration;
    const existingFeatures = config?.features || {};
    setEditingCamara(camara);
    setFormData({
      nome: camara.nome,
      cidade: camara.cidade,
      estado: camara.estado,
      site: camara.site || '',
      email: camara.email || '',
      telefone: camara.telefone || '',
      logo_url: camara.logo_url || '',
      features: { ...defaultFeatures, ...existingFeatures },
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta câmara?')) return;

    try {
      // Use backend endpoint to delete (secure + bypass RLS)
      await apiCall(`/admin/camaras/${id}`, undefined, 'DELETE');

      toast.success('Câmara excluída com sucesso!');
      setCamaras((prev) => prev.filter((camara) => camara.id !== id));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      console.error('Erro inesperado ao excluir câmara:', err);
      toast.error('Erro ao excluir câmara: ' + message);
    }
  };

  const handleToggleActive = async (camara: Camara) => {
    const { error } = await supabase
      .from('camaras')
      .update({ ativo: !camara.ativo })
      .eq('id', camara.id);

    if (error) {
      toast.error('Erro ao atualizar status da câmara');
    } else {
      toast.success(camara.ativo ? 'Câmara desativada com sucesso!' : 'Câmara ativada com sucesso!');
      fetchCamaras();
    }
  };

  const resetForm = () => {
    setFormData({
      nome: '',
      cidade: '',
      estado: '',
      site: '',
      email: '',
      telefone: '',
      logo_url: '',
      features: { ...defaultFeatures },
    });
    setEditingCamara(null);
  };

  const handleFeatureChange = (key: keyof CamaraFeatures, value: boolean) => {
    setFormData((prev) => ({
      ...prev,
      features: {
        ...prev.features,
        [key]: value,
      },
    }));
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) {
      return;
    }

    const file = e.target.files[0];
    const fileExt = file.name.split('.').pop();
    const filePath = `camaras-logos/${Math.random()}.${fileExt}`;

    setUploadingLogo(true);

    try {
      // 1. Get Presigned URL
      const { data: uploadData, error: uploadError } = await supabase.functions.invoke('generate-upload-url', {
        body: {
          filename: filePath,
          contentType: file.type
        }
      });
        
      if (uploadError || !uploadData?.uploadUrl) throw new Error('Falha ao obter URL de upload.');
      
      const { uploadUrl, publicUrl } = uploadData;

      // 2. Upload to R2
      const uploadResponse = await fetch(uploadUrl, {
             method: 'PUT',
             headers: { 'Content-Type': file.type },
             body: file
      });
 
      if (!uploadResponse.ok) throw new Error('Erro no upload para R2');

      setFormData({ ...formData, logo_url: publicUrl });
      toast.success('Logo enviada com sucesso!');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast.error('Erro ao enviar logo: ' + errorMessage);
      console.error(error);
    } finally {
      setUploadingLogo(false);
    }
  };

  const filteredCamaras = camaras.filter(c => 
    c.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.cidade.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const estados = [
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 
    'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 
    'SP', 'SE', 'TO'
  ];

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Building2 className="w-7 h-7 text-primary" />
              Câmaras Cadastradas
            </h1>
            <p className="text-muted-foreground">
              Gerencie as câmaras municipais do sistema
            </p>
          </div>
          
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button variant="gradient">
                <Plus className="w-4 h-4 mr-2" />
                Nova Câmara
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>
                  {editingCamara ? 'Editar Câmara' : 'Nova Câmara'}
                </DialogTitle>
                <DialogDescription>
                  Preencha os dados da câmara municipal
                </DialogDescription>
              </DialogHeader>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="nome">Nome da Câmara *</Label>
                    <Input
                      id="nome"
                      value={formData.nome}
                      onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                      placeholder="Câmara Municipal de..."
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="cidade">Cidade *</Label>
                      <Input
                        id="cidade"
                        value={formData.cidade}
                        onChange={(e) => setFormData({ ...formData, cidade: e.target.value })}
                        placeholder="Nome da cidade"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="estado">Estado *</Label>
                      <select
                        id="estado"
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={formData.estado}
                        onChange={(e) => setFormData({ ...formData, estado: e.target.value })}
                        required
                      >
                        <option value="">Selecione</option>
                        {estados.map(uf => (
                          <option key={uf} value={uf}>{uf}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="site">Site Oficial</Label>
                    <Input
                      id="site"
                      value={formData.site}
                      onChange={(e) => setFormData({ ...formData, site: e.target.value })}
                      placeholder="https://www.camara.gov.br"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="contato@camara.gov.br"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="telefone">Telefone</Label>
                      <Input
                        id="telefone"
                        value={formData.telefone}
                        onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                        placeholder="(00) 0000-0000"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label>Funcionalidades disponíveis</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Upload de Sessões</span>
                        <Switch
                          checked={formData.features.upload}
                          onCheckedChange={(checked) => handleFeatureChange('upload', checked)}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Sessões</span>
                        <Switch
                          checked={formData.features.sessions}
                          onCheckedChange={(checked) => handleFeatureChange('sessions', checked)}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Assistente</span>
                        <Switch
                          checked={formData.features.assistant}
                          onCheckedChange={(checked) => handleFeatureChange('assistant', checked)}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Fábrica Legislativa</span>
                        <Switch
                          checked={formData.features.legislativeFactory}
                          onCheckedChange={(checked) => handleFeatureChange('legislativeFactory', checked)}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Sessões ao Vivo</span>
                        <Switch
                          checked={formData.features.liveSessions}
                          onCheckedChange={(checked) => handleFeatureChange('liveSessions', checked)}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Admin Usuários</span>
                        <Switch
                          checked={formData.features.adminUsers}
                          onCheckedChange={(checked) => handleFeatureChange('adminUsers', checked)}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Admin Vereadores</span>
                        <Switch
                          checked={formData.features.adminVereadores}
                          onCheckedChange={(checked) => handleFeatureChange('adminVereadores', checked)}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="logo_upload">Brasão/Logo</Label>
                    <div className="flex items-center gap-4">
                      {formData.logo_url && (
                        <div className="relative w-16 h-16 rounded-lg border border-border overflow-hidden">
                          <img 
                            src={formData.logo_url} 
                            alt="Preview" 
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, logo_url: '' })}
                            className="absolute top-0 right-0 p-1 bg-destructive/80 text-white hover:bg-destructive"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                      <div className="flex-1">
                        <Input
                          id="logo_upload"
                          type="file"
                          accept="image/*"
                          onChange={handleLogoUpload}
                          disabled={uploadingLogo}
                          className="cursor-pointer"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          {uploadingLogo ? 'Enviando...' : 'Formatos aceitos: JPG, PNG, WEBP'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-4">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setIsDialogOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" variant="gradient" disabled={submitting}>
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      editingCamara ? 'Atualizar' : 'Criar Câmara'
                    )}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search */}
        <Card>
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou cidade..."
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : filteredCamaras.length === 0 ? (
              <div className="text-center py-12">
                <Building2 className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">
                  {searchTerm ? 'Nenhuma câmara encontrada' : 'Nenhuma câmara cadastrada ainda'}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Cidade/UF</TableHead>
                    <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCamaras.map((camara) => (
                    <TableRow key={camara.id}>
                      <TableCell className="font-medium">{camara.nome}</TableCell>
                      <TableCell>{camara.cidade}/{camara.estado}</TableCell>
                      <TableCell>{camara.email || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={camara.ativo ? 'default' : 'secondary'}>
                          {camara.ativo ? 'Ativa' : 'Inativa'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => handleEdit(camara)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleToggleActive(camara)}
                          >
                            <Power className={camara.ativo ? 'w-4 h-4 text-destructive' : 'w-4 h-4 text-emerald-500'} />
                          </Button>
                          {hasRole('super_admin') && (
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => handleDelete(camara.id)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
};

export default Camaras;

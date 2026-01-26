import { useState, useEffect, useCallback } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { 
  Settings as SettingsIcon, 
  User, 
  Bell, 
  Palette, 
  FileOutput, 
  Bot,
  Building2,
  Save,
  Upload,
  Scale,
  Loader2,
  CheckCircle2,
  Trash2,
  FileText,
  AlertTriangle,
  Workflow
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/integrations/supabase/client';
import { apiCall } from '@/lib/utils';
import { Tables, Json } from '@/integrations/supabase/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface CamaraConfiguration {
  transcriptionLanguage?: string;
  autoDetectSpeakers?: boolean;
  enablePunctuation?: boolean;
  generateTimestamps?: boolean;
  aiModel?: string;
  aiTone?: string;
  autoSummarize?: boolean;
  aiSuggestions?: boolean;
  defaultFormat?: string;
  includeHeader?: boolean;
  includeFooter?: boolean;
  includeTimestamps?: boolean;
  pageSize?: string;
}

interface UserPreferences {
  emailNotifications?: boolean;
  transcriptionComplete?: boolean;
  weeklyReport?: boolean;
  systemUpdates?: boolean;
  theme?: string;
  sidebarCollapsed?: boolean;
  compactMode?: boolean;
}

export default function Settings() {
  const { user, profile, hasRole } = useAuth();
  const [loading, setLoading] = useState(false);
  const [uploadingLaw, setUploadingLaw] = useState(false);
  const [lawTitle, setLawTitle] = useState('');
  const [lawFile, setLawFile] = useState<File | null>(null);
  const isSuperAdmin = hasRole('super_admin');

  interface LegalDocument {
    id: string;
    title: string;
    filename: string;
    created_at: string;
  }
  const [legalDocs, setLegalDocs] = useState<LegalDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);

  const fetchLegalDocs = useCallback(async () => {
    if (!profile?.camara_id) return;
    setLoadingDocs(true);
    try {
      const data = await apiCall(`/legal-documents?camaraId=${profile.camara_id}`, {}, 'GET');
      if ((data as { documents?: LegalDocument[] }).documents) {
        setLegalDocs((data as { documents: LegalDocument[] }).documents);
      }
    } catch (error) {
      console.error('Error fetching legal docs:', error);
    } finally {
      setLoadingDocs(false);
    }
  }, [profile?.camara_id]);

  useEffect(() => {
    if (profile?.camara_id) {
      fetchLegalDocs();
    }
  }, [profile?.camara_id, fetchLegalDocs]);

  const handleDeleteLaw = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este documento?')) return;
    try {
        await apiCall(`/legal-documents/${id}`, {}, 'DELETE');
        toast.success('Documento excluído com sucesso');
        fetchLegalDocs();
    } catch (error) {
        toast.error('Erro ao excluir documento');
    }
  };

  type BillingStatus = 'active' | 'past_due' | 'canceled';
  type BillingConfig = { monthlyFee?: number; paidUntil?: string; status?: BillingStatus; notes?: string };

  const [billingLoading, setBillingLoading] = useState(false);
  const [billingSaving, setBillingSaving] = useState(false);
  const [billingSearch, setBillingSearch] = useState('');
  const [camarasBilling, setCamarasBilling] = useState<Tables<'camaras'>[]>([]);
  const [billingDialogOpen, setBillingDialogOpen] = useState(false);
  const [selectedCamara, setSelectedCamara] = useState<Tables<'camaras'> | null>(null);
  const [billingForm, setBillingForm] = useState({
    monthlyFee: '',
    paidUntil: '',
    status: 'active' as BillingStatus,
    notes: '',
  });

  const getBillingConfig = (configuration: unknown): BillingConfig => {
    if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration)) return {};
    const billing = (configuration as Record<string, unknown>).billing;
    if (!billing || typeof billing !== 'object' || Array.isArray(billing)) return {};
    return billing as BillingConfig;
  };

  const upsertBillingConfig = (configuration: unknown, patch: BillingConfig) => {
    const base =
      configuration && typeof configuration === 'object' && !Array.isArray(configuration)
        ? (configuration as Record<string, unknown>)
        : {};
    const currentBilling = getBillingConfig(base);
    return {
      ...base,
      billing: {
        ...currentBilling,
        ...patch,
      },
    };
  };

  const [settings, setSettings] = useState({
    // ... (existing state structure)
    // Câmara
    camaraName: '',
    camaraAddress: '',
    camaraPhone: '',
    camaraEmail: '',
    camaraWebsite: '',
    camaraLogoUrl: '', // Add this field
    
    // Transcrição
    transcriptionLanguage: 'pt-BR',
    autoDetectSpeakers: true,
    enablePunctuation: true,
    generateTimestamps: true,
    
    // IA
    aiModel: 'default',
    aiTone: 'formal',
    autoSummarize: true,
    aiSuggestions: true,
    
    // Notificações
    emailNotifications: true,
    transcriptionComplete: true,
    weeklyReport: false,
    systemUpdates: true,
    
    // Exportação
    defaultFormat: 'docx',
    includeHeader: true,
    includeFooter: true,
    includeTimestamps: false,
    pageSize: 'A4',
    
    // Aparência
    theme: 'light',
    sidebarCollapsed: false,
    compactMode: false,
  });

  // ... (existing useEffect and handleSave logic)

  useEffect(() => {
    if (!profile) return;
    if (isSuperAdmin) return;

    const loadSettings = async () => {
      setLoading(true);
      try {
        // 1. Fetch Camara Data
        let camaraData:
          | {
              nome?: string;
              endereco?: string;
              telefone?: string;
              email?: string;
              site?: string;
              configuration?: Json | null;
              logo_url?: string | null;
            }
          | null = null;
        if (profile.camara_id) {
          const { data, error } = await supabase
            .from('camaras')
            .select('*')
            .eq('id', profile.camara_id)
            .single();
          
          if (error) {
            console.error('Error fetching camara:', error);
          } else {
            camaraData = data;
          }
        }

        // 2. Fetch Profile Preferences (refresh profile to ensure we have latest prefs)
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('preferences')
          .eq('id', profile.id)
          .single();

        if (profileError) {
          console.error('Error fetching profile preferences:', profileError);
        }

        // 3. Merge Data
        setSettings(prev => {
          const rawCamaraConfig = camaraData?.configuration;
          const camaraConfig: CamaraConfiguration =
            rawCamaraConfig && typeof rawCamaraConfig === 'object' && !Array.isArray(rawCamaraConfig)
              ? (rawCamaraConfig as CamaraConfiguration)
              : {};

          const rawUserPrefs = profileData?.preferences;
          const userPrefs: UserPreferences =
            rawUserPrefs && typeof rawUserPrefs === 'object' && !Array.isArray(rawUserPrefs)
              ? (rawUserPrefs as UserPreferences)
              : {};

          return {
            ...prev,
            camaraName: camaraData?.nome || prev.camaraName,
            camaraAddress: camaraData?.endereco || prev.camaraAddress,
            camaraPhone: camaraData?.telefone || prev.camaraPhone,
            camaraEmail: camaraData?.email || prev.camaraEmail,
            camaraWebsite: camaraData?.site || prev.camaraWebsite,
            camaraLogoUrl: camaraData?.logo_url || prev.camaraLogoUrl,
            transcriptionLanguage: camaraConfig.transcriptionLanguage ?? prev.transcriptionLanguage,
            autoDetectSpeakers: camaraConfig.autoDetectSpeakers ?? prev.autoDetectSpeakers,
            enablePunctuation: camaraConfig.enablePunctuation ?? prev.enablePunctuation,
            generateTimestamps: camaraConfig.generateTimestamps ?? prev.generateTimestamps,
            aiModel: camaraConfig.aiModel ?? prev.aiModel,
            aiTone: camaraConfig.aiTone ?? prev.aiTone,
            autoSummarize: camaraConfig.autoSummarize ?? prev.autoSummarize,
            aiSuggestions: camaraConfig.aiSuggestions ?? prev.aiSuggestions,
            defaultFormat: camaraConfig.defaultFormat ?? prev.defaultFormat,
            includeHeader: camaraConfig.includeHeader ?? prev.includeHeader,
            includeFooter: camaraConfig.includeFooter ?? prev.includeFooter,
            includeTimestamps: camaraConfig.includeTimestamps ?? prev.includeTimestamps,
            pageSize: camaraConfig.pageSize ?? prev.pageSize,
            emailNotifications: userPrefs.emailNotifications ?? prev.emailNotifications,
            transcriptionComplete: userPrefs.transcriptionComplete ?? prev.transcriptionComplete,
            weeklyReport: userPrefs.weeklyReport ?? prev.weeklyReport,
            systemUpdates: userPrefs.systemUpdates ?? prev.systemUpdates,
            theme: userPrefs.theme ?? prev.theme,
            sidebarCollapsed: userPrefs.sidebarCollapsed ?? prev.sidebarCollapsed,
            compactMode: userPrefs.compactMode ?? prev.compactMode,
          };
        });

      } catch (error) {
        console.error('Error loading settings:', error);
        toast.error('Erro ao carregar configurações');
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, [profile, isSuperAdmin]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    const loadBilling = async () => {
      setBillingLoading(true);
      try {
        const { data, error } = await supabase.from('camaras').select('*').order('nome');
        if (error) throw error;
        setCamarasBilling((data || []) as Tables<'camaras'>[]);
      } catch (error) {
        console.error('Erro ao carregar câmaras:', error);
        toast.error('Erro ao carregar câmaras');
      } finally {
        setBillingLoading(false);
      }
    };
    loadBilling();
  }, [isSuperAdmin]);

  const openBillingDialog = (camara: Tables<'camaras'>) => {
    const billing = getBillingConfig(camara.configuration);
    setSelectedCamara(camara);
    setBillingForm({
      monthlyFee: typeof billing.monthlyFee === 'number' && Number.isFinite(billing.monthlyFee) ? String(billing.monthlyFee) : '',
      paidUntil: typeof billing.paidUntil === 'string' ? billing.paidUntil : '',
      status: (billing.status || 'active') as BillingStatus,
      notes: typeof billing.notes === 'string' ? billing.notes : '',
    });
    setBillingDialogOpen(true);
  };

  const saveBilling = async () => {
    if (!selectedCamara) return;
    setBillingSaving(true);
    try {
      const raw = billingForm.monthlyFee.trim().replace(',', '.');
      const parsed = raw.length > 0 ? Number(raw) : NaN;
      const patch: BillingConfig = {
        status: billingForm.status,
        paidUntil: billingForm.paidUntil.trim() || undefined,
        notes: billingForm.notes.trim() || undefined,
        monthlyFee: Number.isFinite(parsed) ? parsed : undefined,
      };

      const nextCfg = upsertBillingConfig(selectedCamara.configuration, patch) as unknown as Json;

      const { error } = await supabase
        .from('camaras')
        .update({ configuration: nextCfg })
        .eq('id', selectedCamara.id);

      if (error) throw error;

      setCamarasBilling((prev) =>
        prev.map((c) => (c.id === selectedCamara.id ? ({ ...c, configuration: nextCfg } as Tables<'camaras'>) : c)),
      );
      setSelectedCamara((prev) => (prev ? ({ ...prev, configuration: nextCfg } as Tables<'camaras'>) : prev));
      setBillingDialogOpen(false);
      toast.success('Pagamentos atualizados com sucesso!');
    } catch (error) {
      console.error('Erro ao salvar pagamentos:', error);
      toast.error('Erro ao salvar pagamentos');
    } finally {
      setBillingSaving(false);
    }
  };

  const handleBrasaoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    if (!profile?.camara_id) {
      toast.error('Você precisa estar vinculado a uma câmara para enviar o brasão.');
      return;
    }

    const file = e.target.files[0];
    const fileExt = file.name.split('.').pop();
    const filePath = `camaras-logos/${profile.camara_id}-${Math.random()}.${fileExt}`;

    const toastId = toast.loading('Enviando brasão...');

    try {
      const { uploadUrl, publicUrl } = await apiCall('/generate-upload-url', {
        filename: filePath,
        contentType: file.type,
      });

      if (!uploadUrl) throw new Error('Falha ao obter URL de upload.');

      let logoUrl = publicUrl;

      try {
        const uploadResponse = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type },
          body: file,
        });

        if (!uploadResponse.ok) {
          throw new Error('Erro no upload direto para R2');
        }
      } catch (directError) {
        console.error('Erro no upload direto para R2, tentando via backend...', directError);

        const formData = new FormData();
        formData.append('file', file);
        formData.append('key', filePath);

        const { data: sessionDataUpload } = await supabase.auth.getSession();
        const tokenUpload = sessionDataUpload.session?.access_token;

        if (!tokenUpload) {
          throw new Error('Sessão expirada. Faça login novamente.');
        }

        const BASE_URL =
          (import.meta.env.VITE_BACKEND_URL as string | undefined) ||
          (import.meta.env.DEV ? 'http://localhost:3001' : '');

        const backendResponse = await fetch(`${BASE_URL}/upload-to-r2`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokenUpload}`,
          },
          body: formData,
        });

        if (!backendResponse.ok) {
          const err = await backendResponse.json().catch(() => null);
          const message = err?.error || 'Falha no upload via backend.';
          throw new Error(message);
        }

        const result = await backendResponse.json();
        if (!result?.publicUrl) {
          throw new Error('Upload concluído, mas URL pública não foi retornada.');
        }

        logoUrl = result.publicUrl;
      }

      setSettings((prev) => ({ ...prev, camaraLogoUrl: logoUrl }));

      const { error: updateError } = await supabase
        .from('camaras')
        .update({ logo_url: logoUrl })
        .eq('id', profile.camara_id);

      if (updateError) throw updateError;

      toast.success('Brasão atualizado com sucesso!', { id: toastId });
    } catch (error) {
      console.error('Erro upload brasão:', error);
      toast.error('Erro ao enviar brasão.', { id: toastId });
    }
  };

  const applyTheme = (theme: string) => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }
  };

  useEffect(() => {
    applyTheme(settings.theme);
  }, [settings.theme]);

  useEffect(() => {
    if (settings.compactMode) {
      document.body.classList.add('compact-mode');
    } else {
      document.body.classList.remove('compact-mode');
    }
  }, [settings.compactMode]);

  if (isSuperAdmin) {
    const filtered = camarasBilling.filter((c) =>
      c.nome.toLowerCase().includes(billingSearch.toLowerCase().trim()),
    );
    return (
      <MainLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center shadow-soft">
                <SettingsIcon className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-foreground">Pagamentos</h1>
                <p className="text-muted-foreground">Gerencie mensalidades das câmaras</p>
              </div>
            </div>
          </div>

          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2">
                <Label htmlFor="billing-search">Buscar câmara</Label>
                <Input
                  id="billing-search"
                  value={billingSearch}
                  onChange={(e) => setBillingSearch(e.target.value)}
                  placeholder="Digite o nome da câmara..."
                />
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden bg-card/80 backdrop-blur-sm border-border/50 shadow-sm">
            <CardContent className="p-0">
              {billingLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : (
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead>Câmara</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Mensalidade (R$)</TableHead>
                      <TableHead>Pago até</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((camara) => {
                      const billing = getBillingConfig(camara.configuration);
                      return (
                        <TableRow key={camara.id}>
                          <TableCell className="font-medium">{camara.nome}</TableCell>
                          <TableCell>{camara.ativo ? 'Ativa' : 'Inativa'}</TableCell>
                          <TableCell>
                            {typeof billing.monthlyFee === 'number' && Number.isFinite(billing.monthlyFee)
                              ? billing.monthlyFee.toFixed(2)
                              : '-'}
                          </TableCell>
                          <TableCell>{typeof billing.paidUntil === 'string' && billing.paidUntil ? billing.paidUntil : '-'}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="outline" size="sm" onClick={() => openBillingDialog(camara)}>
                              Editar
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Dialog open={billingDialogOpen} onOpenChange={setBillingDialogOpen}>
            <DialogContent className="sm:max-w-[520px]">
              <DialogHeader>
                <DialogTitle>Gerenciar pagamentos</DialogTitle>
                <DialogDescription>{selectedCamara?.nome || ''}</DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="billing-status">Status da assinatura</Label>
                  <Select
                    value={billingForm.status}
                    onValueChange={(value: BillingStatus) => setBillingForm((prev) => ({ ...prev, status: value }))}
                  >
                    <SelectTrigger id="billing-status">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Ativa</SelectItem>
                      <SelectItem value="past_due">Em atraso</SelectItem>
                      <SelectItem value="canceled">Cancelada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="billing-fee">Mensalidade (R$)</Label>
                    <Input
                      id="billing-fee"
                      inputMode="decimal"
                      value={billingForm.monthlyFee}
                      onChange={(e) => setBillingForm((prev) => ({ ...prev, monthlyFee: e.target.value }))}
                      placeholder="Ex: 199.90"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="billing-paid-until">Pago até</Label>
                    <Input
                      id="billing-paid-until"
                      type="date"
                      value={billingForm.paidUntil}
                      onChange={(e) => setBillingForm((prev) => ({ ...prev, paidUntil: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="billing-notes">Observações</Label>
                  <Textarea
                    id="billing-notes"
                    value={billingForm.notes}
                    onChange={(e) => setBillingForm((prev) => ({ ...prev, notes: e.target.value }))}
                    placeholder="Anotações internas..."
                    className="min-h-[100px]"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setBillingDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="button" onClick={saveBilling} disabled={billingSaving}>
                  {billingSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Salvar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </MainLayout>
    );
  }

  const handleSave = async () => {
    if (!profile) return;
    
    const loadingToast = toast.loading('Salvando configurações...');
    
    try {
        // 1. Update Camara (Info + Config)
        if (profile.camara_id) {
            const camaraUpdate = {
                nome: settings.camaraName,
                endereco: settings.camaraAddress,
                telefone: settings.camaraPhone,
                email: settings.camaraEmail,
                site: settings.camaraWebsite,
                configuration: {
                    transcriptionLanguage: settings.transcriptionLanguage,
                    autoDetectSpeakers: settings.autoDetectSpeakers,
                    enablePunctuation: settings.enablePunctuation,
                    generateTimestamps: settings.generateTimestamps,
                    aiModel: settings.aiModel,
                    aiTone: settings.aiTone,
                    autoSummarize: settings.autoSummarize,
                    aiSuggestions: settings.aiSuggestions,
                    defaultFormat: settings.defaultFormat,
                    includeHeader: settings.includeHeader,
                    includeFooter: settings.includeFooter,
                    includeTimestamps: settings.includeTimestamps,
                    pageSize: settings.pageSize,
                }
            };

            const { error: camaraError } = await supabase
                .from('camaras')
                .update(camaraUpdate)
                .eq('id', profile.camara_id);
            
            if (camaraError) throw camaraError;
        }

        // 2. Update Profile (Preferences)
        const profileUpdate = {
            preferences: {
                emailNotifications: settings.emailNotifications,
                transcriptionComplete: settings.transcriptionComplete,
                weeklyReport: settings.weeklyReport,
                systemUpdates: settings.systemUpdates,
                theme: settings.theme,
                sidebarCollapsed: settings.sidebarCollapsed,
                compactMode: settings.compactMode,
            }
        };

        const { error: profileError } = await supabase
            .from('profiles')
            .update(profileUpdate as unknown as { preferences: Json })
            .eq('id', profile.id);

        if (profileError) throw profileError;

        toast.success('Configurações salvas com sucesso!', { id: loadingToast });
    } catch (error) {
        console.error('Error saving settings:', error);
        toast.error('Erro ao salvar configurações. Verifique suas permissões.', { id: loadingToast });
    }
  };

  const updateSetting = (key: string, value: string | boolean) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleUploadLaw = async () => {
    if (!lawFile || !lawTitle) {
      toast.error('Selecione um arquivo PDF e dê um nome.');
      return;
    }
    if (!profile?.camara_id) return;

    setUploadingLaw(true);
    const toastId = toast.loading('Processando documento... Isso pode levar alguns minutos.');

    try {
      // Create FormData
      const formData = new FormData();
      formData.append('file', lawFile);
      formData.append('title', lawTitle);
      formData.append('camaraId', profile.camara_id);

      // Call Backend (Not using standard apiCall helper because of FormData)
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      
      const rawBackendUrl = import.meta.env.VITE_BACKEND_URL as string | undefined;
      const BASE_URL =
        rawBackendUrl && !rawBackendUrl.startsWith(':')
          ? rawBackendUrl.replace(/\/$/, '')
          : (import.meta.env.DEV ? 'http://localhost:3001' : '');

      const response = await fetch(`${BASE_URL}/ingest-law`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`
            // Do NOT set Content-Type, browser sets it for FormData
        },
        body: formData
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Falha no upload');
      }

      const result = await response.json();
      toast.success(`Sucesso! ${result.chunks} artigos indexados.`, { id: toastId });
      
      setLawFile(null);
      setLawTitle('');
      fetchLegalDocs();

    } catch (error: unknown) {
      console.error(error);
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      toast.error('Erro ao processar lei: ' + message, { id: toastId });
    } finally {
      setUploadingLaw(false);
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center shadow-soft">
              <SettingsIcon className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Configurações</h1>
              <p className="text-muted-foreground">Personalize o sistema de acordo com suas necessidades</p>
            </div>
          </div>
          <Button variant="gradient" onClick={handleSave} disabled={loading}>
            <Save className="w-4 h-4 mr-2" />
            {loading ? 'Carregando...' : 'Salvar Alterações'}
          </Button>
        </div>

        {/* Settings Tabs */}
        <Tabs defaultValue="camara" className="space-y-6">
        <TabsList className="grid w-full grid-cols-8 lg:w-auto lg:inline-grid bg-muted/50 backdrop-blur-sm border border-border/50 p-1">
            <TabsTrigger value="camara" className="gap-2">
              <Building2 className="w-4 h-4" />
              <span className="hidden sm:inline">Câmara</span>
            </TabsTrigger>
            <TabsTrigger value="legal" className="gap-2">
              <Scale className="w-4 h-4" />
              <span className="hidden sm:inline">Base Legal</span>
            </TabsTrigger>
            <TabsTrigger value="transcription" className="gap-2">
              <FileOutput className="w-4 h-4" />
              <span className="hidden sm:inline">Transcrição</span>
            </TabsTrigger>
            <TabsTrigger value="ai" className="gap-2">
              <Bot className="w-4 h-4" />
              <span className="hidden sm:inline">IA</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-2">
              <Bell className="w-4 h-4" />
              <span className="hidden sm:inline">Notificações</span>
            </TabsTrigger>
            <TabsTrigger value="export" className="gap-2">
              <FileOutput className="w-4 h-4" />
              <span className="hidden sm:inline">Exportação</span>
            </TabsTrigger>
            <TabsTrigger value="appearance" className="gap-2">
              <Palette className="w-4 h-4" />
              <span className="hidden sm:inline">Aparência</span>
            </TabsTrigger>
          </TabsList>

          {/* Câmara Settings */}
          <TabsContent value="camara">
            <Card className="bg-card/80 backdrop-blur-sm border-border/50 shadow-sm">
              <CardContent className="space-y-6 pt-6">
                <div className="flex items-center gap-6">
                  <div className="w-24 h-24 rounded-xl border-2 border-dashed border-border flex items-center justify-center bg-secondary/30 overflow-hidden relative group">
                    {/* Preview do Brasão */}
                    {settings.camaraLogoUrl ? (
                        <img 
                            src={settings.camaraLogoUrl} 
                            alt="Brasão da Câmara" 
                            className="w-full h-full object-contain p-2"
                        />
                    ) : (
                        <Building2 className="w-10 h-10 text-muted-foreground" />
                    )}
                    
                    {/* Input file invisível cobrindo a área */}
                    <Input 
                        type="file" 
                        accept="image/png, image/jpeg, image/svg+xml"
                        className="absolute inset-0 opacity-0 cursor-pointer z-10"
                        onChange={handleBrasaoUpload}
                        title="Clique para alterar o brasão"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="relative">
                        <Button variant="outline" size="sm" className="relative pointer-events-none">
                            <Upload className="w-4 h-4 mr-2" />
                            Carregar Brasão
                        </Button>
                        <Input 
                            type="file" 
                            accept="image/png, image/jpeg, image/svg+xml"
                            className="absolute inset-0 opacity-0 cursor-pointer"
                            onChange={handleBrasaoUpload}
                        />
                    </div>
                    <p className="text-xs text-muted-foreground">PNG ou SVG, máximo 2MB</p>
                  </div>
                </div>

                <Separator />

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="camaraName">Nome da Câmara</Label>
                    <Input
                      id="camaraName"
                      value={settings.camaraName}
                      onChange={(e) => updateSetting('camaraName', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="camaraPhone">Telefone</Label>
                    <Input
                      id="camaraPhone"
                      value={settings.camaraPhone}
                      onChange={(e) => updateSetting('camaraPhone', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="camaraAddress">Endereço</Label>
                    <Input
                      id="camaraAddress"
                      value={settings.camaraAddress}
                      onChange={(e) => updateSetting('camaraAddress', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="camaraEmail">E-mail</Label>
                    <Input
                      id="camaraEmail"
                      type="email"
                      value={settings.camaraEmail}
                      onChange={(e) => updateSetting('camaraEmail', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="camaraWebsite">Website</Label>
                    <Input
                      id="camaraWebsite"
                      value={settings.camaraWebsite}
                      onChange={(e) => updateSetting('camaraWebsite', e.target.value)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* New Legal Base Tab */}
          <TabsContent value="legal">
            <Card className="bg-card/80 backdrop-blur-sm border-border/50 shadow-sm">
              <CardHeader>
                <CardTitle>Base Legal e Regimental</CardTitle>
                <CardDescription>
                  Faça o upload da Lei Orgânica e Regimento Interno para ativar o "Guardião da Legalidade".
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                 <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
                    <Scale className="w-6 h-6 text-blue-600 shrink-0" />
                    <div className="space-y-1">
                       <h4 className="font-semibold text-blue-800">Como funciona?</h4>
                       <p className="text-sm text-blue-700">
                         Ao enviar os PDFs, nossa IA fragmentará o texto em artigos. Isso permite que o Assistente verifique automaticamente se novas propostas ferem a legislação local.
                       </p>
                    </div>
                 </div>

                 <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex gap-3">
                    <AlertTriangle className="w-6 h-6 text-yellow-600 shrink-0" />
                    <div className="space-y-1">
                       <h4 className="font-semibold text-yellow-800">Atenção ao formato do PDF</h4>
                       <p className="text-sm text-yellow-700">
                         O arquivo deve conter <strong>texto selecionável</strong>. PDFs escaneados (imagens) não serão lidos pela IA.
                         <br/>
                         Verifique se você consegue selecionar e copiar o texto do PDF antes de enviar.
                       </p>
                    </div>
                 </div>

                 <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-4">
                       <Label>1. Nome do Documento</Label>
                       <Select value={lawTitle} onValueChange={setLawTitle}>
                          <SelectTrigger>
                             <SelectValue placeholder="Selecione o tipo..." />
                          </SelectTrigger>
                          <SelectContent>
                             <SelectItem value="Lei Orgânica Municipal">Lei Orgânica Municipal</SelectItem>
                             <SelectItem value="Regimento Interno">Regimento Interno</SelectItem>
                             <SelectItem value="Código de Posturas">Código de Posturas</SelectItem>
                             <SelectItem value="Código Tributário">Código Tributário</SelectItem>
                             <SelectItem value="Outro">Outro</SelectItem>
                          </SelectContent>
                       </Select>
                    </div>

                    <div className="space-y-4">
                       <Label>2. Arquivo (PDF)</Label>
                       <Input 
                          type="file" 
                          accept=".pdf"
                          onChange={(e) => setLawFile(e.target.files?.[0] || null)}
                       />
                    </div>
                 </div>

                 <div className="flex justify-end pt-4">
                    <Button 
                      onClick={handleUploadLaw} 
                      disabled={uploadingLaw || !lawFile || !lawTitle}
                      className="gap-2"
                    >
                      {uploadingLaw ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Processando (Isso demora um pouco)...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4" />
                          Enviar e Indexar
                        </>
                      )}
                    </Button>
                 </div>

                 <div className="mt-8 border-t pt-6">
                    <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-primary" />
                        Documentos Indexados
                    </h3>
                    {loadingDocs ? (
                      <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                    ) : legalDocs.length === 0 ? (
                      <div className="text-center py-8 bg-muted/30 rounded-lg border border-dashed">
                          <p className="text-muted-foreground text-sm">Nenhum documento enviado ainda.</p>
                      </div>
                    ) : (
                      <div className="border rounded-md overflow-hidden">
                      <Table>
                        <TableHeader className="bg-muted/50">
                          <TableRow>
                            <TableHead>Título</TableHead>
                            <TableHead>Arquivo Original</TableHead>
                            <TableHead>Data Envio</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {legalDocs.map((doc) => (
                            <TableRow key={doc.id}>
                              <TableCell className="font-medium">{doc.title}</TableCell>
                              <TableCell className="text-muted-foreground text-sm">{doc.filename}</TableCell>
                              <TableCell className="text-muted-foreground text-sm">
                                {new Date(doc.created_at).toLocaleDateString()}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    onClick={() => handleDeleteLaw(doc.id)} 
                                    className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8 p-0"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      </div>
                    )}
                  </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Transcription Settings */}
          <TabsContent value="transcription">
            <Card className="bg-card/80 backdrop-blur-sm border-border/50 shadow-sm">
              <CardHeader>
                <CardTitle>Configurações de Transcrição</CardTitle>
                <CardDescription>
                  Personalize como o áudio é processado e transcrito
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="transcriptionLanguage">Idioma Principal</Label>
                  <Select
                    value={settings.transcriptionLanguage}
                    onValueChange={(value) => updateSetting('transcriptionLanguage', value)}
                  >
                    <SelectTrigger id="transcriptionLanguage" className="w-full md:w-64">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pt-BR">Português (Brasil)</SelectItem>
                      <SelectItem value="pt-PT">Português (Portugal)</SelectItem>
                      <SelectItem value="es">Espanhol</SelectItem>
                      <SelectItem value="en">Inglês</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Detectar Oradores Automaticamente</Label>
                      <p className="text-sm text-muted-foreground">
                        Identifica diferentes vozes na transcrição
                      </p>
                    </div>
                    <Switch
                      checked={settings.autoDetectSpeakers}
                      onCheckedChange={(checked) => updateSetting('autoDetectSpeakers', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Pontuação Automática</Label>
                      <p className="text-sm text-muted-foreground">
                        Adiciona pontuação automaticamente ao texto
                      </p>
                    </div>
                    <Switch
                      checked={settings.enablePunctuation}
                      onCheckedChange={(checked) => updateSetting('enablePunctuation', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Gerar Timestamps</Label>
                      <p className="text-sm text-muted-foreground">
                        Marca o tempo de cada trecho da transcrição
                      </p>
                    </div>
                    <Switch
                      checked={settings.generateTimestamps}
                      onCheckedChange={(checked) => updateSetting('generateTimestamps', checked)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* AI Settings */}
          <TabsContent value="ai">
            <Card className="bg-card/80 backdrop-blur-sm border-border/50 shadow-sm">
              <CardHeader>
                <CardTitle>Assistente de IA</CardTitle>
                <CardDescription>
                  Configure o comportamento do assistente inteligente
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="aiModel">Modelo de IA</Label>
                    <Select
                      value={settings.aiModel}
                      onValueChange={(value) => updateSetting('aiModel', value)}
                    >
                      <SelectTrigger id="aiModel">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Padrão (Recomendado)</SelectItem>
                        <SelectItem value="fast">Rápido</SelectItem>
                        <SelectItem value="precise">Preciso</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="aiTone">Tom das Respostas</Label>
                    <Select
                      value={settings.aiTone}
                      onValueChange={(value) => updateSetting('aiTone', value)}
                    >
                      <SelectTrigger id="aiTone">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="formal">Formal</SelectItem>
                        <SelectItem value="neutral">Neutro</SelectItem>
                        <SelectItem value="concise">Conciso</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Resumo Automático</Label>
                      <p className="text-sm text-muted-foreground">
                        Gera resumos automaticamente ao finalizar transcrição
                      </p>
                    </div>
                    <Switch
                      checked={settings.autoSummarize}
                      onCheckedChange={(checked) => updateSetting('autoSummarize', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Sugestões de IA</Label>
                      <p className="text-sm text-muted-foreground">
                        Exibe sugestões de melhoria durante a edição
                      </p>
                    </div>
                    <Switch
                      checked={settings.aiSuggestions}
                      onCheckedChange={(checked) => updateSetting('aiSuggestions', checked)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notifications Settings */}
          <TabsContent value="notifications">
            <Card>
              <CardHeader>
                <CardTitle>Notificações</CardTitle>
                <CardDescription>
                  Escolha quais notificações deseja receber
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Notificações por E-mail</Label>
                    <p className="text-sm text-muted-foreground">
                      Receber notificações por e-mail
                    </p>
                  </div>
                  <Switch
                    checked={settings.emailNotifications}
                    onCheckedChange={(checked) => updateSetting('emailNotifications', checked)}
                  />
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Transcrição Concluída</Label>
                      <p className="text-sm text-muted-foreground">
                        Notificar quando uma transcrição for finalizada
                      </p>
                    </div>
                    <Switch
                      checked={settings.transcriptionComplete}
                      onCheckedChange={(checked) => updateSetting('transcriptionComplete', checked)}
                      disabled={!settings.emailNotifications}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Relatório Semanal</Label>
                      <p className="text-sm text-muted-foreground">
                        Receber resumo semanal das atividades
                      </p>
                    </div>
                    <Switch
                      checked={settings.weeklyReport}
                      onCheckedChange={(checked) => updateSetting('weeklyReport', checked)}
                      disabled={!settings.emailNotifications}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Atualizações do Sistema</Label>
                      <p className="text-sm text-muted-foreground">
                        Notificar sobre novas funcionalidades
                      </p>
                    </div>
                    <Switch
                      checked={settings.systemUpdates}
                      onCheckedChange={(checked) => updateSetting('systemUpdates', checked)}
                      disabled={!settings.emailNotifications}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Export Settings */}
          <TabsContent value="export">
            <Card>
              <CardHeader>
                <CardTitle>Exportação de Documentos</CardTitle>
                <CardDescription>
                  Configure o formato padrão das atas exportadas
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="defaultFormat">Formato Padrão</Label>
                    <Select
                      value={settings.defaultFormat}
                      onValueChange={(value) => updateSetting('defaultFormat', value)}
                    >
                      <SelectTrigger id="defaultFormat">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="docx">Word (.docx)</SelectItem>
                        <SelectItem value="pdf">PDF</SelectItem>
                        <SelectItem value="odt">OpenDocument (.odt)</SelectItem>
                        <SelectItem value="html">HTML</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pageSize">Tamanho da Página</Label>
                    <Select
                      value={settings.pageSize}
                      onValueChange={(value) => updateSetting('pageSize', value)}
                    >
                      <SelectTrigger id="pageSize">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="A4">A4</SelectItem>
                        <SelectItem value="Letter">Carta (Letter)</SelectItem>
                        <SelectItem value="Legal">Ofício (Legal)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Incluir Cabeçalho</Label>
                      <p className="text-sm text-muted-foreground">
                        Adiciona brasão e dados da câmara no topo
                      </p>
                    </div>
                    <Switch
                      checked={settings.includeHeader}
                      onCheckedChange={(checked) => updateSetting('includeHeader', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Incluir Rodapé</Label>
                      <p className="text-sm text-muted-foreground">
                        Adiciona numeração de página e data
                      </p>
                    </div>
                    <Switch
                      checked={settings.includeFooter}
                      onCheckedChange={(checked) => updateSetting('includeFooter', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Incluir Timestamps</Label>
                      <p className="text-sm text-muted-foreground">
                        Adiciona marcação de tempo na ata
                      </p>
                    </div>
                    <Switch
                      checked={settings.includeTimestamps}
                      onCheckedChange={(checked) => updateSetting('includeTimestamps', checked)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Appearance Settings */}
          <TabsContent value="appearance">
            <Card className="bg-card/80 backdrop-blur-sm border-border/50 shadow-sm">
              <CardHeader>
                <CardTitle>Aparência</CardTitle>
                <CardDescription>
                  Personalize a interface do sistema
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="theme">Tema</Label>
                  <Select
                    value={settings.theme}
                    onValueChange={(value) => updateSetting('theme', value)}
                  >
                    <SelectTrigger id="theme" className="w-full md:w-64">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">Claro</SelectItem>
                      <SelectItem value="dark">Escuro</SelectItem>
                      <SelectItem value="system">Sistema</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Sidebar Recolhida por Padrão</Label>
                      <p className="text-sm text-muted-foreground">
                        Inicia com a barra lateral minimizada
                      </p>
                    </div>
                    <Switch
                      checked={settings.sidebarCollapsed}
                      onCheckedChange={(checked) => updateSetting('sidebarCollapsed', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Modo Compacto</Label>
                      <p className="text-sm text-muted-foreground">
                        Reduz espaçamentos para exibir mais conteúdo
                      </p>
                    </div>
                    <Switch
                      checked={settings.compactMode}
                      onCheckedChange={(checked) => updateSetting('compactMode', checked)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}

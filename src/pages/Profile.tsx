import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/integrations/supabase/client';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, User, Mail, Phone, Building, Save, Lock, KeyRound } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { apiCall } from '@/lib/utils';

export default function Profile() {
  const { user, profile, roles } = useAuth();
  const [loading, setLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile?.avatar_url || null);
  
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    telefone: '',
    cargo: '',
  });

  const [passwordData, setPasswordData] = useState({
    newPassword: '',
    confirmPassword: '',
  });

  // Função auxiliar para formatar a role
  const formatRole = (role: string) => {
    const roleMap: Record<string, string> = {
      'super_admin': 'Super Administrador',
      'admin': 'Administrador',
      'editor': 'Editor',
      'viewer': 'Visualizador'
    };
    return roleMap[role] || role;
  };

  useEffect(() => {
    if (profile && user) {
      setFormData({
        nome: profile.nome || '',
        email: user.email || '',
        telefone: profile.telefone || '',
        cargo: profile.cargo || '',
      });
      setAvatarUrl(profile.avatar_url);
    }
  }, [profile, user]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const isSuperAdmin = roles.some(r => r.role === 'super_admin');

      if (user && formData.email && formData.email !== user.email) {
        if (isSuperAdmin) {
          const resp = await apiCall('/admin/update-user-email', {
            userId: user.id,
            email: formData.email,
          });

          if (!resp?.success) {
            const msg = typeof resp?.error === 'string' && resp.error.trim().length > 0
              ? resp.error
              : 'Não foi possível atualizar o email do super administrador.';
            throw new Error(msg);
          }

          toast.success('Email do Super Administrador atualizado. Use o novo email no próximo login.');
        } else {
          const { data: { session }, error: sessionError } = await supabase.auth.getSession();
          if (sessionError || !session) {
            throw new Error('Sessão expirada. Por favor, recarregue a página e faça login novamente.');
          }

          const { error: emailError } = await supabase.auth.updateUser({
            email: formData.email,
          });
          
          if (emailError) throw emailError;
          
          toast.info('Verifique seu email (novo e antigo) para confirmar a alteração.');
        }
      }

      const updates = {
        nome: formData.nome,
        telefone: formData.telefone,
        cargo: formData.cargo,
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString(),
      };

      // Use backend endpoint to bypass RLS
      const result = await apiCall('/update-profile', {
        userId: user.id,
        updates: updates
      });

      if (!result || !result.success) {
         throw new Error(result?.error || 'Erro ao atualizar perfil via backend.');
      }

      toast.success('Perfil atualizado com sucesso!');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      toast.error('Erro ao atualizar perfil: ' + message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (passwordData.newPassword.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres');
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error('As senhas não coincidem');
      return;
    }

    setPasswordLoading(true);

    try {
      // Verificar sessão válida antes de atualizar senha
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
          throw new Error("Sessão expirada. Por favor, recarregue a página e faça login novamente.");
      }

      const { error } = await supabase.auth.updateUser({
        password: passwordData.newPassword
      });

      if (error) throw error;
      
      toast.success('Senha atualizada com sucesso!');
      setPasswordData({ newPassword: '', confirmPassword: '' });
      
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      toast.error('Erro ao atualizar senha: ' + message);
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      if (!event.target.files || event.target.files.length === 0) {
        throw new Error('Você deve selecionar uma imagem para upload.');
      }

      const file = event.target.files[0];
      const fileExt = file.name.split('.').pop();
      const filePath = `avatars/${user?.id}-${Math.random()}.${fileExt}`;

      const { uploadUrl, publicUrl } = await apiCall('/generate-upload-url', {
             filename: filePath,
             contentType: file.type
      });
        
      if (!uploadUrl) throw new Error('Falha ao obter URL de upload.');

      let finalUrl = publicUrl;

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

        const rawBackendUrl = import.meta.env.VITE_BACKEND_URL as string | undefined;
        const BASE_URL =
          rawBackendUrl && !rawBackendUrl.startsWith(':')
            ? rawBackendUrl.replace(/\/$/, '')
            : (import.meta.env.DEV ? 'http://localhost:3001' : '');

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

        finalUrl = result.publicUrl;
      }

      setAvatarUrl(finalUrl);
      
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      toast.error('Erro ao fazer upload da imagem: ' + message);
    }
  };

  const getInitials = (name: string) => {
    return name
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Meu Perfil</h1>
          <p className="text-muted-foreground">
            Gerencie suas informações pessoais e credenciais
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Card de Informações Pessoais */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Informações Pessoais</CardTitle>
              <CardDescription>
                Atualize seus dados de identificação e contato
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpdateProfile} className="space-y-6">
                
                {/* Avatar Section */}
                <div className="flex flex-col items-center sm:flex-row gap-6 pb-6 border-b">
                  <Avatar className="h-24 w-24 rounded-full overflow-hidden">
                    <AvatarImage src={avatarUrl || ''} />
                    <AvatarFallback className="text-2xl bg-primary/10 text-primary">
                      {getInitials(formData.nome)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 space-y-2 text-center sm:text-left">
                    <Label htmlFor="avatar" className="cursor-pointer">
                      <div className="flex items-center justify-center sm:justify-start gap-2 text-sm text-primary hover:underline">
                        <User className="w-4 h-4" />
                        Alterar foto de perfil
                      </div>
                      <Input
                        id="avatar"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleAvatarUpload}
                      />
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Recomendado: Imagem quadrada, máx. 2MB.
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="nome">Nome Completo</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="nome"
                        value={formData.nome}
                        onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                        className="pl-10"
                        placeholder="Seu nome completo"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="pl-10"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Este é o email usado para login. Ao alterar, você poderá precisar confirmar o novo endereço.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="telefone">Telefone</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="telefone"
                        value={formData.telefone}
                        onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                        className="pl-10"
                        placeholder="(00) 00000-0000"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cargo">Cargo</Label>
                    <div className="relative">
                      <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="cargo"
                        value={formData.cargo}
                        onChange={(e) => setFormData({ ...formData, cargo: e.target.value })}
                        className="pl-10"
                        placeholder="Ex: Vereador, Secretário"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Permissão do Sistema</Label>
                    <div className="relative">
                      <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        value={roles.map(r => formatRole(r.role)).join(', ') || 'Sem permissão'}
                        disabled
                        className="pl-10 bg-muted"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Definido pelo administrador do sistema.
                    </p>
                  </div>
                </div>

                <div className="flex justify-end pt-4">
                  <Button type="submit" disabled={loading} className="w-full sm:w-auto">
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        Salvar Alterações
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Card de Alteração de Senha */}
          <Card className="bg-card/80 backdrop-blur-sm border-border/50 shadow-sm">
            <CardHeader>
              <CardTitle>Segurança</CardTitle>
              <CardDescription>
                Atualize sua senha de acesso ao sistema
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpdatePassword} className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="newPassword">Nova Senha</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="newPassword"
                        type="password"
                        value={passwordData.newPassword}
                        onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                        className="pl-10"
                        placeholder="Mínimo 6 caracteres"
                        minLength={6}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirmar Senha</Label>
                    <div className="relative">
                      <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="confirmPassword"
                        type="password"
                        value={passwordData.confirmPassword}
                        onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                        className="pl-10"
                        placeholder="Repita a nova senha"
                        minLength={6}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-4">
                  <Button type="submit" variant="outline" disabled={passwordLoading} className="w-full sm:w-auto">
                    {passwordLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Atualizando...
                      </>
                    ) : (
                      <>
                        <Lock className="w-4 h-4 mr-2" />
                        Alterar Senha
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}

import { useState, useEffect, useCallback, Fragment } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { supabase } from '@/integrations/supabase/client';
import { createClient } from '@supabase/supabase-js';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Users as UsersIcon, Search, Loader2, Shield, UserCog, Plus, Mail, Lock, User as UserIcon, Power, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { Tables, Enums } from '@/integrations/supabase/types';
import { apiCall } from '@/lib/utils';

type UserProfile = Tables<'profiles'> & {
  camara?: { nome: string } | null;
  roles?: { role: string }[];
  email?: string | null;
};

type VereadorPreferences = {
  apelido?: string | null;
  partido?: string | null;
  data_nascimento?: string | null;
  biografia?: string | null;
};

type UserPreferences = {
  vereador?: VereadorPreferences | null;
} | null;

type Camara = Pick<Tables<'camaras'>, 'id' | 'nome'>;

const Users = () => {
  const { hasRole, profile, loading: authLoading } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [camaras, setCamaras] = useState<Camara[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [openCamaras, setOpenCamaras] = useState<Record<string, boolean>>({});

  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    camara_id: '',
    cargo: '',
    cargo_select: 'Outro' as 'Vereador' | 'Secretário(a)' | 'Outro',
    cargo_other: '',
    role: 'viewer' as Enums<'app_role'>,
    apelido: '',
    partido: '',
    data_nascimento: '',
    biografia: '',
  });

  const [createFormData, setCreateFormData] = useState({
    nome: '',
    email: '',
    password: '',
    camara_id: '',
    cargo: '',
    cargo_select: 'Outro' as 'Vereador' | 'Secretário(a)' | 'Outro',
    cargo_other: '',
    role: 'viewer' as Enums<'app_role'>,
    apelido: '',
    partido: '',
    data_nascimento: '',
    biografia: '',
  });

  const isSuperAdmin = hasRole('super_admin');
  const isAdmin = hasRole('admin');

  const fetchUsers = useCallback(async () => {
    setLoading(true);

    const { data: profiles, error } = await supabase
      .from('profiles')
      .select(`
        *,
        camara:camaras(nome)
      `)
      .order('nome');

    if (error) {
      toast.error('Erro ao carregar usuários');
      console.error(error);
      setLoading(false);
      return;
    }

    const userIds = (profiles || []).map((p) => p.user_id);
    let rolesByUser: Record<string, { role: string }[]> = {};

    if (userIds.length > 0) {
      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('user_id', userIds);

      if (!rolesError && rolesData) {
        rolesByUser = rolesData.reduce<Record<string, { role: string }[]>>((acc, row) => {
          if (!acc[row.user_id]) acc[row.user_id] = [];
          acc[row.user_id].push({ role: row.role });
          return acc;
        }, {});
      } else if (rolesError) {
        console.error(rolesError);
      }
    }

    let usersWithRoles: UserProfile[] = (profiles || []).map((p) => ({
      ...p,
      roles: rolesByUser[p.user_id] || [],
    }));

    if ((isSuperAdmin || hasRole('admin')) && userIds.length > 0) {
      try {
        const resp = await apiCall('/admin/get-user-emails', { userIds });
        if (resp?.success === true && resp?.emails && typeof resp.emails === 'object') {
          const emails: Record<string, string | null> = resp.emails;
          usersWithRoles = usersWithRoles.map((u) => ({
            ...u,
            email: emails[u.user_id] ?? u.email ?? null,
          }));
        }
      } catch (error) {
        // Silently fail for non-super-admins if backend rejects, but log warning
        const msg = error instanceof Error ? error.message : 'Erro desconhecido';
        console.warn('Não foi possível carregar emails do Auth:', msg);
      }
    }

    setUsers(usersWithRoles);
    setLoading(false);
  }, [isSuperAdmin, hasRole]);

  const fetchCamaras = useCallback(async () => {
    const { data } = await supabase
      .from('camaras')
      .select('id, nome')
      .eq('ativo', true)
      .order('nome');
    
    if (data) setCamaras(data);
  }, []);

  useEffect(() => {
    if (!authLoading) {
      fetchUsers();
      if (isSuperAdmin) {
        fetchCamaras();
      }
    }
  }, [authLoading, isSuperAdmin, isAdmin, fetchUsers, fetchCamaras]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      // 1. Validação Básica
      if (!createFormData.nome || !createFormData.email || !createFormData.password) {
        throw new Error('Preencha todos os campos obrigatórios.');
      }

      let effectiveCamaraId = createFormData.camara_id;
      if (!isSuperAdmin) {
         if (!profile?.camara_id) throw new Error('Você não tem câmara vinculada.');
         effectiveCamaraId = profile.camara_id;
      }

      // 2. Criar Cliente Temporário (para não deslogar o admin)
      const tempSupabase = createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        }
      );

      // 3. SignUp no Auth
      const { data: authData, error: authError } = await tempSupabase.auth.signUp({
        email: createFormData.email,
        password: createFormData.password,
        options: {
          emailRedirectTo: undefined,
          data: { nome: createFormData.nome } // Metadados úteis
        }
      });

      if (authError) throw authError;
      if (!authData.user?.id) throw new Error('Erro: Usuário Auth não foi criado.');

      const userId = authData.user.id;
      console.log('Auth User criado:', userId);

      const shouldIncludeVereador = createFormData.cargo_select === 'Vereador';
      const vereadorPrefs = shouldIncludeVereador ? {
        vereador: {
          apelido: createFormData.apelido || null,
          partido: createFormData.partido || null,
          data_nascimento: createFormData.data_nascimento || null,
          biografia: createFormData.biografia || null,
        }
      } : null;

      // 4. Confirmação manual de e-mail e criação de Role (usando RPC admin)
      // Como o usuário está logado como admin, ele pode chamar uma função RPC segura
      let adminSetupError: unknown = null;
      {
        const { error } = await supabase.rpc('setup_new_user', {
          _user_id: userId,
          _role: createFormData.role,
          _camara_id: effectiveCamaraId || null,
          _cargo: createFormData.cargo || null,
          _nome: createFormData.nome,
          _preferences: vereadorPrefs
        });
        adminSetupError = error;
      }

      if (adminSetupError) {
          const { error: legacySetupError } = await supabase.rpc('setup_new_user', {
            _user_id: userId,
            _role: createFormData.role,
            _camara_id: effectiveCamaraId || null,
            _cargo: createFormData.cargo || null,
            _nome: createFormData.nome
          });
          if (legacySetupError) {
            console.error("Erro no setup via RPC:", legacySetupError);
          } else if (vereadorPrefs) {
            await supabase.rpc('manage_user_profile', {
              _user_id: userId,
              _nome: createFormData.nome,
              _camara_id: effectiveCamaraId || null,
              _cargo: createFormData.cargo || null,
              _role: createFormData.role,
              _preferences: vereadorPrefs
            });
          }
      } else {
          toast.success('Usuário criado e configurado com sucesso!');
          // Pula o resto do loop de retry pois já foi feito via RPC
          setIsCreateDialogOpen(false);
          setCreateFormData({
            nome: '',
            email: '',
            password: '',
            camara_id: '',
            cargo: '',
            cargo_select: 'Outro',
            cargo_other: '',
            role: 'viewer',
            apelido: '',
            partido: '',
            data_nascimento: '',
            biografia: '',
          });
          fetchUsers();
          setSubmitting(false);
          return; 
      }
      
      // Fallback antigo (mantido caso RPC não exista ainda, mas idealmente será substituído)
      // 4. Garantir Perfil (Upsert: Update ou Insert)
      let profileEnsured = false;
      let attempts = 0;

      while (!profileEnsured && attempts < 5) {
        attempts++;
        await new Promise(r => setTimeout(r, 1000 * attempts)); 

        // Tenta UPDATE primeiro (assumindo que o trigger criou)
        const { data: updatedData, error: updateError } = await supabase
          .from('profiles')
          .update({
            camara_id: effectiveCamaraId || null,
            cargo: createFormData.cargo || null,
            nome: createFormData.nome
          })
          .eq('user_id', userId)
          .select();

        if (!updateError && updatedData && updatedData.length > 0) {
          profileEnsured = true;
          console.log('Perfil atualizado com sucesso via Update.');
        } else {
          // Se não atualizou nada (count 0) ou deu erro, tenta INSERT manual (Fallback)
          console.warn(`Update falhou ou não encontrou registro (Tentativa ${attempts}). Tentando Insert manual...`);
          
          const { error: insertError } = await supabase
            .from('profiles')
            .insert({
                user_id: userId,
                nome: createFormData.nome,
                camara_id: effectiveCamaraId || null,
                cargo: createFormData.cargo || null,
                ativo: true
            });
            
          if (!insertError) {
              profileEnsured = true;
              console.log('Perfil criado com sucesso via Insert Manual.');
          } else {
              console.warn('Insert manual também falhou:', insertError.message);
          }
        }
      }

      if (!profileEnsured) {
        toast.warning('Atenção: O login foi criado, mas houve erro ao salvar o perfil. O usuário pode não aparecer na lista.');
      } else {
         // 5. Atualizar Role (Upsert)
         const { error: roleUpdateError, data: roleData } = await supabase
             .from('user_roles')
             .update({ role: createFormData.role })
             .eq('user_id', userId)
             .select();
             
         if (roleUpdateError || !roleData || roleData.length === 0) {
             // Se update falhar ou não achar, faz insert
             await supabase.from('user_roles').insert({ user_id: userId, role: createFormData.role });
         }
         
         toast.success('Usuário criado com sucesso!');
      }

      // Limpeza
      setIsCreateDialogOpen(false);
      setCreateFormData({
        nome: '',
        email: '',
        password: '',
        camara_id: '',
        cargo: '',
        cargo_select: 'Outro',
        cargo_other: '',
        role: 'viewer',
        apelido: '',
        partido: '',
        data_nascimento: '',
        biografia: '',
      });
      fetchUsers();

    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      console.error(error);
      toast.error('Erro ao criar usuário: ' + msg);
    } finally {
      setSubmitting(false);
    }
  };

  const getHighestRole = (roles: { role: string }[] | undefined): 'super_admin' | 'admin' | 'editor' | 'viewer' => {
    if (!roles || roles.length === 0) return 'viewer';
    const priority: Array<'super_admin' | 'admin' | 'editor' | 'viewer'> = ['super_admin', 'admin', 'editor', 'viewer'];
    const roleStrings = roles.map(r => r.role as 'super_admin' | 'admin' | 'editor' | 'viewer');
    const sorted = roleStrings.sort((a, b) => priority.indexOf(a) - priority.indexOf(b));
    return sorted[0];
  };

  const fetchAuthEmailForUser = async (userId: string) => {
    // Permite admin tentar buscar email também
    if (!isSuperAdmin && !hasRole('admin')) return;
    try {
      const resp = await apiCall('/admin/get-user-emails', { userIds: [userId] });
      const email = resp?.success === true ? resp?.emails?.[userId] : null;
      if (typeof email === 'string' && email.trim().length > 0) {
        setFormData((prev) => ({ ...prev, email }));
        setSelectedUser((prev) => (prev && prev.user_id === userId ? { ...prev, email } : prev));
        setUsers((prev) => prev.map((u) => (u.user_id === userId ? { ...u, email } : u)));
      }
    } catch (error) {
      console.warn('Erro ao buscar email do Auth:', error);
    }
  };

  const handleEditUser = (user: UserProfile) => {
    const prefs = (user.preferences as UserPreferences) || null;
    const vereador = prefs?.vereador || {};
    const cargoValue = (user.cargo || '').trim();
    const isPresetCargo = cargoValue === 'Vereador' || cargoValue === 'Secretário(a)';
    const cargoSelect = (isPresetCargo ? cargoValue : 'Outro') as 'Vereador' | 'Secretário(a)' | 'Outro';
    setSelectedUser(user);
    setFormData({
      nome: user.nome || '',
      email: user.email || '',
      camara_id: user.camara_id || '',
      cargo: cargoValue,
      cargo_select: cargoSelect,
      cargo_other: isPresetCargo ? '' : cargoValue,
      role: getHighestRole(user.roles),
      apelido: vereador?.apelido || '',
      partido: vereador?.partido || '',
      data_nascimento: vereador?.data_nascimento || '',
      biografia: vereador?.biografia || '',
    });
    setIsDialogOpen(true);
    
    // Busca email se estiver vazio e usuário tiver permissão
    if ((isSuperAdmin || hasRole('admin')) && (!user.email || user.email.trim().length === 0)) {
      fetchAuthEmailForUser(user.user_id);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    setSubmitting(true);

    try {
        // 1. Atualizar e-mail se mudou (apenas Super Admin pode alterar email)
        const nextEmail = (formData.email || '').trim();
        const currentEmail = (selectedUser.email || '').trim();
        
        if (isSuperAdmin && nextEmail.length > 0 && nextEmail !== currentEmail) {
            try {
              const resp = await apiCall('/admin/update-user-email', {
                userId: selectedUser.user_id,
                email: nextEmail,
              });
              if (resp?.success !== true) {
                const msg = typeof resp?.error === 'string' && resp.error.trim().length > 0 ? resp.error : 'Erro desconhecido';
                toast.warning('Não foi possível atualizar o e-mail agora: ' + msg + '. Os demais dados serão salvos.');
              } else {
                setSelectedUser((prev) => (prev ? { ...prev, email: nextEmail } : prev));
                setUsers((prev) => prev.map((u) => (u.user_id === selectedUser.user_id ? { ...u, email: nextEmail } : u)));
              }
            } catch (error) {
              const msg = error instanceof Error ? error.message : 'Erro desconhecido';
              console.error('Erro ao atualizar email:', error);
              toast.warning('Não foi possível atualizar o e-mail agora: ' + msg + '. Os demais dados serão salvos.');
            }
        }

        // 2. Usamos a mesma RPC simplificada para editar dados do perfil
        const prefs = (selectedUser.preferences as UserPreferences) || null;
        const isVereador = formData.cargo_select === 'Vereador';
        const mergedPrefs = isVereador ? {
          ...prefs,
          vereador: {
            apelido: formData.apelido || null,
            partido: formData.partido || null,
            data_nascimento: formData.data_nascimento || null,
            biografia: formData.biografia || null,
          }
        } : prefs;

        const { data: rpcData, error: rpcError } = await supabase.rpc('manage_user_profile', {
            _user_id: selectedUser.user_id,
            _nome: formData.nome, 
            _camara_id: formData.camara_id || null,
            _cargo: formData.cargo || null,
            _role: formData.role,
            _preferences: mergedPrefs
        });

        const result = rpcData as { success?: boolean; error?: string } | null;

        if (rpcError || (result && result.success === false)) {
            const { data: legacyData, error: legacyError } = await supabase.rpc('manage_user_profile', {
              _user_id: selectedUser.user_id,
              _nome: formData.nome, 
              _camara_id: formData.camara_id || null,
              _cargo: formData.cargo || null,
              _role: formData.role
            });
            const legacyResult = legacyData as { success?: boolean; error?: string } | null;
            const legacyFailed = legacyError || (legacyResult && legacyResult.success === false);
            if (legacyFailed) {
              const msg = rpcError?.message || result?.error || legacyError?.message || legacyResult?.error || 'Erro desconhecido';
              toast.error('Erro ao atualizar usuário: ' + msg);
            } else {
              toast.warning('Usuário atualizado, mas sem salvar dados de vereador (SQL antigo).');
              setIsDialogOpen(false);
              fetchUsers();
            }
        } else {
            toast.success('Usuário atualizado com sucesso!');
            setIsDialogOpen(false);
            fetchUsers();
        }
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Erro desconhecido';
        toast.error('Erro ao atualizar: ' + msg);
    } finally {
        setSubmitting(false);
    }
  };

  const handleDeleteUser = async (user: UserProfile) => {
    if (!isSuperAdmin) {
      toast.error('Apenas super administradores podem excluir usuários');
      return;
    }

    const confirmed = window.confirm(`Tem certeza que deseja excluir o usuário "${user.nome}"? Esta ação não pode ser desfeita.`);
    if (!confirmed) return;

    setSubmitting(true);

    try {
      // Usa a RPC segura para exclusão completa (Auth + Dados)
      const { data: rpcData, error: rpcError } = await supabase.rpc('delete_user_completely', {
        target_user_id: user.user_id
      });

      if (rpcError) throw rpcError;

      const result = rpcData as { success: boolean; error?: string };
      if (!result.success) {
        throw new Error(result.error || 'Erro desconhecido ao excluir usuário');
      }

      toast.success('Usuário excluído completamente do sistema!');
      fetchUsers();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      toast.error('Erro ao excluir usuário: ' + message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleUserActive = async (user: UserProfile) => {
    const { error } = await supabase
      .from('profiles')
      .update({ ativo: !user.ativo })
      .eq('id', user.id);

    if (error) {
      toast.error('Erro ao atualizar status do usuário');
    } else {
      toast.success(user.ativo ? 'Usuário desativado com sucesso!' : 'Usuário ativado com sucesso!');
      fetchUsers();
    }
  };

  const getRoleBadge = (roles: { role: string }[] | undefined) => {
    const role = getHighestRole(roles);
    switch (role) {
      case 'super_admin':
        return <Badge variant="destructive" className="shadow-sm">Super Admin</Badge>;
      case 'admin':
        return <Badge className="bg-primary hover:bg-primary/90 shadow-sm">Admin</Badge>;
      case 'editor':
        return <Badge variant="outline" className="border-accent text-accent-foreground font-medium">Editor</Badge>;
      default:
        return <Badge variant="secondary" className="text-muted-foreground">Visualizador</Badge>;
    }
  };

  const getInitials = (nome: string) => {
    return nome.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  const filteredUsers = users
    .filter(u => {
        // Filtra Super Admins da lista se o usuário atual não for Super Admin
        if (!isSuperAdmin && u.roles?.some(r => r.role === 'super_admin')) {
            return false;
        }
        return true;
    })
    .filter(u => 
        u.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.cargo?.toLowerCase().includes(searchTerm.toLowerCase())
    );

  const camaraMap: Record<string, { camaraNome: string; users: UserProfile[] }> = {};

  filteredUsers.forEach((user) => {
    const key = user.camara_id || 'sem_camara';
    const camaraNome = user.camara?.nome || 'Sem câmara';

    if (!camaraMap[key]) {
      camaraMap[key] = { camaraNome, users: [] };
    }

    camaraMap[key].users.push(user);
  });

  const camaraGroups = Object.entries(camaraMap)
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => a.camaraNome.localeCompare(b.camaraNome));

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <UsersIcon className="w-8 h-8 text-primary" />
              Usuários
            </h1>
            <p className="text-muted-foreground mt-1">
              Gerencie os usuários e suas permissões de acesso ao sistema
            </p>
          </div>

          <Button variant="default" onClick={() => setIsCreateDialogOpen(true)} className="shadow-lg hover:shadow-xl transition-all">
            <Plus className="w-4 h-4 mr-2" />
            Novo Usuário
          </Button>
        </div>

        {/* Search */}
        <Card className="border-none shadow-md bg-card/50 backdrop-blur-sm">
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou cargo..."
                className="pl-10 h-12 text-lg bg-background/50"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="border-none shadow-md overflow-hidden">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <UsersIcon className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold">Nenhum usuário encontrado</h3>
                <p className="text-muted-foreground max-w-sm mx-auto mt-2">
                  {searchTerm ? 'Tente buscar por outro termo.' : 'Comece adicionando um novo usuário.'}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="w-[300px]">Usuário</TableHead>
                    <TableHead>Câmara</TableHead>
                    <TableHead>Cargo</TableHead>
                    <TableHead>Permissão</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {camaraGroups.map((group) => (
                    <Fragment key={group.key}>
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={6} className="bg-muted/30 py-2">
                          <button
                            type="button"
                            className="w-full flex items-center justify-between gap-3 text-left"
                            onClick={() => {
                              setOpenCamaras((prev) => {
                                const isOpen = prev[group.key] ?? true;
                                return { ...prev, [group.key]: !isOpen };
                              });
                            }}
                          >
                            <span className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                              {group.camaraNome} ({group.users.length})
                            </span>
                            {(openCamaras[group.key] ?? true) ? (
                              <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            )}
                          </button>
                        </TableCell>
                      </TableRow>
                      {(openCamaras[group.key] ?? true) && group.users.map((user) => (
                        <TableRow key={user.id} className="group transition-colors hover:bg-muted/50">
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-10 w-10 rounded-full overflow-hidden border-2 border-background shadow-sm">
                                {user.avatar_url && (
                                  <AvatarImage
                                    src={user.avatar_url}
                                    className="object-cover"
                                  />
                                )}
                                <AvatarFallback className="bg-primary/10 text-primary font-medium">
                                  {getInitials(user.nome)}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <span className="font-medium block">{user.nome}</span>
                                <span className="text-xs text-muted-foreground block truncate max-w-[200px]" title={user.email || ''}>{user.email || '-'}</span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">{user.camara?.nome || '-'}</span>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm font-medium">{user.cargo || '-'}</span>
                          </TableCell>
                          <TableCell>{getRoleBadge(user.roles)}</TableCell>
                          <TableCell>
                            <Badge variant={user.ativo ? 'default' : 'secondary'} className={user.ativo ? "bg-emerald-500 hover:bg-emerald-600" : ""}>
                              {user.ativo ? 'Ativo' : 'Inativo'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEditUser(user)}
                                title="Editar"
                              >
                                <UserCog className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleToggleUserActive(user)}
                                title={user.ativo ? "Desativar" : "Ativar"}
                              >
                                <Power
                                  className={
                                    user.ativo
                                      ? 'w-4 h-4 text-destructive'
                                      : 'w-4 h-4 text-emerald-500'
                                  }
                                />
                              </Button>
                              {isSuperAdmin && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDeleteUser(user)}
                                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                  title="Excluir"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
              <DialogHeader className="sticky top-0 z-10 bg-background pb-3">
                <DialogTitle className="flex items-center gap-2 text-xl">
                  <Shield className="w-5 h-5 text-primary" />
                  Editar Usuário
              </DialogTitle>
              <DialogDescription>
                Altere os detalhes e permissões do usuário
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-6 py-4">
              <div className="flex items-center gap-4 p-4 bg-muted/30 rounded-lg border">
                <Avatar className="h-16 w-16 rounded-full border-2 border-background shadow-sm">
                  {selectedUser?.avatar_url && (
                    <AvatarImage
                      src={selectedUser.avatar_url}
                      className="object-cover"
                    />
                  )}
                  <AvatarFallback className="bg-primary/10 text-primary text-xl font-medium">
                    {formData.nome ? getInitials(formData.nome) : 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg text-foreground">{formData.nome || 'Usuário'}</h3>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                    <Mail className="w-3.5 h-3.5" />
                    <span>{selectedUser?.email || formData.email || 'Email não carregado'}</span>
                  </div>
                  {selectedUser?.camara?.nome && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-0.5">
                      <Shield className="w-3.5 h-3.5" />
                      <span>{selectedUser.camara.nome}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome Completo</Label>
                  <Input
                    id="nome"
                    value={formData.nome}
                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                    placeholder="Nome do usuário"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-email">Email</Label>
                  <Input
                    id="edit-email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    disabled={!isSuperAdmin}
                    placeholder="email@exemplo.com"
                  />
                  {!isSuperAdmin && (
                    <p className="text-xs text-muted-foreground">Apenas super administradores podem alterar o email.</p>
                  )}
                </div>

                {isSuperAdmin && (
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="camara">Câmara</Label>
                    <Select 
                      value={formData.camara_id} 
                      onValueChange={(value) => setFormData({ ...formData, camara_id: value })}
                    >
                      <SelectTrigger id="camara">
                        <SelectValue placeholder="Selecione uma câmara..." />
                      </SelectTrigger>
                      <SelectContent>
                        {camaras.map((camara) => (
                          <SelectItem key={camara.id} value={camara.id}>
                            {camara.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Cargo</Label>
                  <Select
                    value={formData.cargo_select}
                    onValueChange={(value: 'Vereador' | 'Secretário(a)' | 'Outro') => {
                      if (value === 'Outro') {
                        setFormData({ ...formData, cargo_select: value, cargo_other: formData.cargo_other, cargo: formData.cargo_other });
                        return;
                      }
                      setFormData({ ...formData, cargo_select: value, cargo_other: '', cargo: value });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Vereador">Vereador</SelectItem>
                      <SelectItem value="Secretário(a)">Secretário(a)</SelectItem>
                      <SelectItem value="Outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="role">Nível de Acesso</Label>
                  <Select 
                    value={formData.role} 
                    onValueChange={(value: Enums<'app_role'>) => setFormData({ ...formData, role: value })}
                  >
                    <SelectTrigger id="role">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="viewer">Visualizador</SelectItem>
                      <SelectItem value="editor">Editor</SelectItem>
                      <SelectItem value="admin">Admin da Câmara</SelectItem>
                      {isSuperAdmin && <SelectItem value="super_admin">Super Admin</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>

                {formData.cargo_select === 'Outro' && (
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="edit-cargo-other">Digite o cargo</Label>
                    <Input
                      id="edit-cargo-other"
                      value={formData.cargo_other}
                      onChange={(e) => {
                        const v = e.target.value;
                        setFormData({ ...formData, cargo_other: v, cargo: v });
                      }}
                      placeholder="Ex: Assessor, Secretário, Diretor..."
                    />
                  </div>
                )}
              </div>

              {formData.cargo_select === 'Vereador' && (
                <div className="space-y-4 pt-2 border-t">
                  <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">Dados do Parlamentar</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="vereador-partido">Partido</Label>
                      <Input
                        id="vereador-partido"
                        value={formData.partido}
                        onChange={(e) => setFormData({ ...formData, partido: e.target.value })}
                        placeholder="Ex: MDB, PT, PL..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="vereador-apelido">Nome Parlamentar (Apelido)</Label>
                      <Input
                        id="vereador-apelido"
                        value={formData.apelido}
                        onChange={(e) => setFormData({ ...formData, apelido: e.target.value })}
                        placeholder="Ex: Nininho, Zé..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="vereador-nascimento">Data de Nascimento</Label>
                      <Input
                        id="vereador-nascimento"
                        type="date"
                        value={formData.data_nascimento}
                        onChange={(e) => setFormData({ ...formData, data_nascimento: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="vereador-bio">Biografia</Label>
                      <Textarea
                        id="vereador-bio"
                        value={formData.biografia}
                        onChange={(e) => setFormData({ ...formData, biografia: e.target.value })}
                        placeholder="Resumo biográfico para consumo da IA..."
                        className="min-h-[100px]"
                      />
                    </div>
                  </div>
                </div>
              )}

              <DialogFooter className="sticky bottom-0 z-10 bg-background pt-4 border-t mt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Salvar Alterações
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Create Dialog */}
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader className="sticky top-0 z-10 bg-background pb-3">
              <DialogTitle className="flex items-center gap-2 text-xl">
                <UserIcon className="w-5 h-5 text-primary" />
                Novo Usuário
              </DialogTitle>
              <DialogDescription>
                Crie um novo usuário para acessar o sistema
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreateUser} className="space-y-4 py-4">
              <div className="p-4 bg-muted/50 rounded-lg flex items-center gap-3">
                <Avatar className="h-12 w-12 rounded-full overflow-hidden border-2 border-background shadow-sm">
                  <AvatarFallback className="bg-primary/10 text-primary font-medium">
                    {createFormData.nome ? getInitials(createFormData.nome) : 'U'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold text-sm text-foreground">
                    {createFormData.nome || 'Novo usuário'}
                  </p>
                  <p className="text-xs text-muted-foreground truncate max-w-[260px]">
                    {createFormData.email || 'Email ainda não preenchido'}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-nome">Nome Completo *</Label>
                <Input
                  id="new-nome"
                  value={createFormData.nome}
                  onChange={(e) => setCreateFormData({ ...createFormData, nome: e.target.value })}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="new-email">Email *</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="new-email"
                      type="email"
                      className="pl-10"
                      value={createFormData.email}
                      onChange={(e) => setCreateFormData({ ...createFormData, email: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password">Senha *</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="new-password"
                      type="password"
                      className="pl-10"
                      value={createFormData.password}
                      onChange={(e) => setCreateFormData({ ...createFormData, password: e.target.value })}
                      required
                      minLength={6}
                    />
                  </div>
                </div>
              </div>

              {isSuperAdmin && (
                <div className="space-y-2">
                  <Label htmlFor="new-camara">Câmara *</Label>
                  <Select 
                    value={createFormData.camara_id} 
                    onValueChange={(value) => setCreateFormData({ ...createFormData, camara_id: value })}
                    required={createFormData.role !== 'super_admin'}
                  >
                    <SelectTrigger id="new-camara">
                      <SelectValue placeholder="Selecione uma câmara..." />
                    </SelectTrigger>
                    <SelectContent>
                      {camaras.map((camara) => (
                        <SelectItem key={camara.id} value={camara.id}>
                          {camara.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Cargo</Label>
                <Select
                  value={createFormData.cargo_select}
                  onValueChange={(value: 'Vereador' | 'Secretário(a)' | 'Outro') => {
                    if (value === 'Outro') {
                      setCreateFormData({ ...createFormData, cargo_select: value, cargo_other: createFormData.cargo_other, cargo: createFormData.cargo_other });
                      return;
                    }
                    setCreateFormData({ ...createFormData, cargo_select: value, cargo_other: '', cargo: value });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Vereador">Vereador</SelectItem>
                    <SelectItem value="Secretário(a)">Secretário(a)</SelectItem>
                    <SelectItem value="Outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {createFormData.cargo_select === 'Outro' && (
                <div className="space-y-2">
                  <Label htmlFor="new-cargo-other">Digite o cargo</Label>
                  <Input
                    id="new-cargo-other"
                    value={createFormData.cargo_other}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCreateFormData({ ...createFormData, cargo_other: v, cargo: v });
                    }}
                    placeholder="Ex: Assessor, Diretor..."
                  />
                </div>
              )}

              {createFormData.cargo_select === 'Vereador' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="new-vereador-partido">Partido</Label>
                      <Input
                        id="new-vereador-partido"
                        value={createFormData.partido}
                        onChange={(e) => setCreateFormData({ ...createFormData, partido: e.target.value })}
                        placeholder="Ex: MDB, PT, PL..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="new-vereador-apelido">Como é conhecido (apelido)</Label>
                      <Input
                        id="new-vereador-apelido"
                        value={createFormData.apelido}
                        onChange={(e) => setCreateFormData({ ...createFormData, apelido: e.target.value })}
                        placeholder="Ex: Nininho, Zé..."
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-vereador-nascimento">Data de Nascimento</Label>
                    <Input
                      id="new-vereador-nascimento"
                      type="date"
                      value={createFormData.data_nascimento}
                      onChange={(e) => setCreateFormData({ ...createFormData, data_nascimento: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-vereador-bio">Biografia</Label>
                    <Textarea
                      id="new-vereador-bio"
                      value={createFormData.biografia}
                      onChange={(e) => setCreateFormData({ ...createFormData, biografia: e.target.value })}
                      placeholder="Resumo biográfico para consumo da IA..."
                      className="min-h-[120px]"
                    />
                  </div>
                </>
              )}

              <div className="space-y-2">
                <Label htmlFor="new-role">Nível de Acesso *</Label>
                <Select 
                  value={createFormData.role} 
                  onValueChange={(value: Enums<'app_role'>) => setCreateFormData({ ...createFormData, role: value })}
                  required
                >
                  <SelectTrigger id="new-role">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">Visualizador</SelectItem>
                    <SelectItem value="editor">Editor</SelectItem>
                    <SelectItem value="admin">Admin da Câmara</SelectItem>
                    {isSuperAdmin && <SelectItem value="super_admin">Super Admin</SelectItem>}
                  </SelectContent>
                </Select>
              </div>

              <DialogFooter className="sticky bottom-0 z-10 bg-background pt-4 pb-2">
                <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" variant="gradient" disabled={submitting}>
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Criar Usuário
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
};

export default Users;

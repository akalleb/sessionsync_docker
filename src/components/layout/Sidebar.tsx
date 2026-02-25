import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { 
  Shield,
  LayoutDashboard, 
  Upload, 
  FileText, 
  ScrollText,
  Settings, 
  Mic,
  Bot,
  Building2,
  Users,
  LogOut,
  CreditCard,
  PlayCircle,
  MessageCircle,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Sidebar as SidebarUI,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupContent,
  useSidebar,
} from "@/components/ui/sidebar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tables } from '@/integrations/supabase/types';

type CamaraRow = Tables<'camaras'>;

type CamaraFeatures = {
  assistant?: boolean;
  sessions?: boolean;
  liveSessions?: boolean;
  legislativeFactory?: boolean;
  upload?: boolean;
  adminUsers?: boolean;
  adminVereadores?: boolean;
  ouvidoria?: boolean;
};

type CamaraConfiguration = {
  features?: CamaraFeatures;
} | null;

type CamaraDetails = Pick<CamaraRow, 'nome' | 'logo_url' | 'configuration'>;

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut, hasRole } = useAuth();
  const [camaraDetails, setCamaraDetails] = useState<CamaraDetails | null>(null);
  const { state, setOpen } = useSidebar();

  useEffect(() => {
    // Carregar preferência de sidebar recolhida do perfil
    const loadPreferences = async () => {
      if (profile?.id) {
        const { data } = await supabase
          .from('profiles')
          .select('preferences')
          .eq('id', profile.id)
          .single();
        
        const prefs = data?.preferences as { sidebarCollapsed?: boolean } | null;
        if (prefs?.sidebarCollapsed) {
          setOpen(false);
        }
      }
    };
    loadPreferences();
  }, [profile?.id, setOpen]);

  useEffect(() => {
    const fetchCamara = async () => {
      if (profile?.camara_id) {
        const { data } = await supabase
          .from('camaras')
          .select('nome, logo_url, configuration')
          .eq('id', profile.camara_id)
          .maybeSingle();

        if (data) {
          setCamaraDetails(data as CamaraDetails);
        }
      }
    };
    fetchCamara();
  }, [profile?.camara_id]);

  const isSuperAdmin = hasRole('super_admin');
  const isAdmin = hasRole('admin');
  const isVereador = (profile?.cargo || '').trim().toLowerCase() === 'vereador';

  const config = camaraDetails?.configuration as CamaraConfiguration;
  const features = config?.features || {};

  const isFeatureEnabled = (key: keyof CamaraFeatures) => {
    const value = features[key];
    return value !== false;
  };

  const mainMenuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
    ...(!isSuperAdmin && !isVereador && isFeatureEnabled('upload')
      ? [{ icon: Upload, label: 'Nova Sessão', path: '/upload' }]
      : []),
    ...(isFeatureEnabled('sessions') ? [{ icon: FileText, label: 'Sessões', path: '/sessions' }] : []),
    ...(isFeatureEnabled('assistant') ? [{ icon: Bot, label: 'Assistente', path: '/assistant' }] : []),
    ...(isFeatureEnabled('legislativeFactory')
      ? [{ icon: ScrollText, label: 'Fábrica Legislativa', path: '/legislative-factory' }]
      : []),
    ...(!isSuperAdmin && isAdmin
      ? [{ icon: Settings, label: 'Configurações', path: '/settings' }]
      : []),
  ];

  const liveSessionItems = isFeatureEnabled('liveSessions')
    ? [{ icon: PlayCircle, label: 'Sessões ao Vivo', path: '/sessoes' }]
    : [];

  const adminMenuItems = [
    ...(isSuperAdmin ? [{ icon: Shield, label: 'Painel SAAS', path: '/admin/dashboard' }] : []),
    ...(isSuperAdmin ? [{ icon: Building2, label: 'Câmaras', path: '/admin/camaras' }] : []),
    ...(isSuperAdmin ? [{ icon: CreditCard, label: 'Pagamentos', path: '/settings' }] : []),
    ...((isAdmin || isSuperAdmin) && isFeatureEnabled('adminUsers')
      ? [{ icon: Users, label: 'Usuários', path: '/admin/users' }]
      : []),
    ...(isAdmin && isFeatureEnabled('adminVereadores')
      ? [{ icon: Users, label: 'Vereadores', path: '/admin/vereadores' }]
      : []),
    ...(isAdmin && isFeatureEnabled('ouvidoria')
      ? [{ icon: MessageCircle, label: 'Ouvidoria', path: '/admin/ouvidoria' }]
      : []),
  ];

  const handleLogout = async () => {
    await signOut();
    navigate('/auth');
  };

  const getInitials = (nome: string) => {
    return nome.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  return (
    <SidebarUI collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
              <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground group-data-[collapsible=icon]:!p-0 group-data-[collapsible=icon]:justify-center">
              <div className="flex items-center gap-3">
                <div className={`flex aspect-square size-10 items-center justify-center rounded-xl ${!camaraDetails?.logo_url && 'bg-primary/10'}`}>
                  {camaraDetails?.logo_url ? (
                    <img 
                      src={camaraDetails.logo_url} 
                      alt="Brasão" 
                      className="size-10 object-cover rounded-xl"
                    />
                  ) : (
                    <img src="/iconsessionsync_black.svg" alt="Logo" className="size-6" />
                  )}
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                  <span className="truncate font-bold text-base">SessionSync</span>
                  <span className="truncate text-xs text-muted-foreground">{camaraDetails?.nome || 'Câmara Municipal'}</span>
                </div>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-2">
              {[...mainMenuItems, ...liveSessionItems, ...adminMenuItems].map((item) => (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton 
                    asChild 
                    isActive={location.pathname === item.path || (item.path === '/sessoes' && location.pathname.startsWith('/sessao'))} 
                    tooltip={item.label}
                    size="lg"
                    className="h-12 gap-4 px-4 data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold hover:bg-sidebar-accent/50 transition-all duration-200 group-data-[collapsible=icon]:!p-0 group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:[&>svg]:mx-auto rounded-xl"
                  >
                    <Link to={item.path}>
                      <item.icon className="size-7 shrink-0" />
                      <span className="text-base group-data-[collapsible=icon]:hidden">{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground group-data-[collapsible=icon]:!p-0 group-data-[collapsible=icon]:justify-center"
                >
                  <Avatar className="h-9 w-9 rounded-lg overflow-hidden border border-border/50">
                    {profile?.avatar_url && (
                      <AvatarImage
                        src={profile.avatar_url}
                        className="object-cover"
                      />
                    )}
                    <AvatarFallback className="rounded-lg bg-primary/10 text-primary font-bold">
                      {profile?.nome ? getInitials(profile.nome) : 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                    <span className="truncate font-semibold">{profile?.nome || 'Usuário'}</span>
                    <span className="truncate text-xs text-muted-foreground">{profile?.cargo || 'Membro'}</span>
                  </div>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                side="bottom"
                align="end"
                sideOffset={4}
              >
                <DropdownMenuItem asChild>
                  <Link to="/profile" className="cursor-pointer">
                    <Users className="mr-2 h-4 w-4" />
                    Perfil
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive cursor-pointer">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </SidebarUI>
  );
}

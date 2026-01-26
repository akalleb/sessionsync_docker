import { useEffect, useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { Building2, Users, FileText, Activity, Server, Shield, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DemoRequestsList } from '@/components/admin/DemoRequestsList';
import { checkBackendHealth, cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    camaras: 0,
    users: 0,
    sessions: 0,
    activeCamaras: 0
  });
  const [loading, setLoading] = useState(true);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  useEffect(() => {
    fetchStats();
    checkHealth();
  }, []);

  const checkHealth = async () => {
    const isHealthy = await checkBackendHealth();
    setBackendStatus(isHealthy ? 'online' : 'offline');
  };

  const fetchStats = async () => {
    try {
      // Fetch Camaras count
      const { count: camarasCount } = await supabase
        .from('camaras')
        .select('*', { count: 'exact', head: true });

      const { count: activeCamarasCount } = await supabase
        .from('camaras')
        .select('*', { count: 'exact', head: true })
        .eq('ativo', true);

      // Fetch Users count
      const { count: usersCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      // Fetch Sessions count (assuming table name is 'sessions' or similar, checking context... 
      // Based on previous LS, there is a 'sessions' page, let's assume table is 'sessions' or similar. 
      // Actually I haven't seen the schema for sessions. I'll skip it or guess 'sessions' and handle error silently)
      
      // Let's stick to what we know: Camaras and Profiles.
      
      setStats({
        camaras: camarasCount || 0,
        activeCamaras: activeCamarasCount || 0,
        users: usersCount || 0,
        sessions: 0 // Placeholder
      });

    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const menuItems = [
    {
      title: "Gestão de Câmaras",
      description: "Cadastre e gerencie as câmaras municipais clientes do SAAS.",
      icon: Building2,
      path: "/admin/camaras",
      color: "text-blue-500",
      bg: "bg-blue-500/10"
    },
    {
      title: "Gestão de Usuários",
      description: "Administre usuários, atribua funções e vincule a câmaras.",
      icon: Users,
      path: "/admin/users",
      color: "text-green-500",
      bg: "bg-green-500/10"
    },
    {
      title: "Monitoramento",
      description: "Visualize logs de acesso e métricas do sistema (Em breve).",
      icon: Activity,
      path: "#",
      color: "text-orange-500",
      bg: "bg-orange-500/10"
    },
    {
      title: "Configurações Globais",
      description: "Definições gerais do sistema SAAS.",
      icon: Server,
      path: "/settings",
      color: "text-purple-500",
      bg: "bg-purple-500/10"
    }
  ];

  return (
    <MainLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Shield className="h-8 w-8 text-primary" />
            Painel Super Administrador
          </h1>
          <p className="text-muted-foreground mt-2">
            Visão geral e controle total do sistema TranscriCam SAAS.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Câmaras</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{loading ? "..." : stats.camaras}</div>
              <p className="text-xs text-muted-foreground">
                {stats.activeCamaras} ativas
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Usuários</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{loading ? "..." : stats.users}</div>
              <p className="text-xs text-muted-foreground">
                Registrados no sistema
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Status do Sistema</CardTitle>
              <Activity className={cn("h-4 w-4", backendStatus === 'online' ? "text-green-500" : "text-red-500")} />
            </CardHeader>
            <CardContent>
              <div className={cn("text-2xl font-bold", backendStatus === 'online' ? "text-green-500" : "text-red-500")}>
                {backendStatus === 'checking' ? "Verificando..." : (backendStatus === 'online' ? "Online" : "Offline")}
              </div>
              <p className="text-xs text-muted-foreground">
                {backendStatus === 'online' ? "Backend operacional" : "Backend inacessível"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Sessões Transcritas</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">-</div>
              <p className="text-xs text-muted-foreground">
                Métrica em desenvolvimento
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Backend Alert if Offline */}
        {backendStatus === 'offline' && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Servidor de IA Offline</AlertTitle>
            <AlertDescription>
              O backend de processamento (RAG/IA) não está respondendo em localhost:3001. 
              Funcionalidades de chat e transcrição não funcionarão. 
              Execute `npm run backend` no terminal para iniciar.
            </AlertDescription>
          </Alert>
        )}

        {/* Demo Requests Section */}
        <DemoRequestsList />

        {/* Quick Actions */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Gerenciamento</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
            {menuItems.map((item, index) => (
              <Card 
                key={index} 
                className={`cursor-pointer hover:shadow-md transition-shadow border-l-4 ${item.color.replace('text-', 'border-')}`}
                onClick={() => navigate(item.path)}
              >
                <CardHeader className="flex flex-row items-start gap-4 space-y-0">
                  <div className={`p-3 rounded-xl ${item.bg}`}>
                    <item.icon className={`w-6 h-6 ${item.color}`} />
                  </div>
                  <div className="space-y-1">
                    <CardTitle className="text-base">{item.title}</CardTitle>
                    <CardDescription>{item.description}</CardDescription>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}

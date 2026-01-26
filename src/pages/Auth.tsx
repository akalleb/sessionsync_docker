import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Landmark, Mail, Lock, User, Loader2, Phone, Building2, MapPin, MessageSquare, CheckCircle } from 'lucide-react';
import { z } from 'zod';

const emailSchema = z.string().email('Email inválido');
const passwordSchema = z.string().min(6, 'Senha deve ter no mínimo 6 caracteres');

const demoRequestSchema = z.object({
  nome: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres').max(100),
  email: z.string().email('Email inválido').max(255),
  telefone: z.string().max(20).optional(),
  camara_nome: z.string().min(2, 'Nome da Câmara é obrigatório').max(200),
  cidade: z.string().min(2, 'Cidade é obrigatória').max(100),
  estado: z.string().length(2, 'Use a sigla do estado (ex: SP)'),
  mensagem: z.string().max(1000).optional(),
});

const Auth = () => {
  const navigate = useNavigate();
  const { user, signIn, loading, profile } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [demoSubmitted, setDemoSubmitted] = useState(false);
  
  // Login form
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Demo request form
  const [demoNome, setDemoNome] = useState('');
  
  useEffect(() => {
    const checkConnection = async () => {
      console.log('Testando conexão com Supabase...');
      // Usar head: false para tentar obter mais detalhes do erro se houver
      const { error } = await supabase.from('camaras').select('*', { count: 'exact', head: true });
      
      // Ignorar erros de conexão se a resposta vier do servidor (status 40x)
      // O erro com message vazia ou código 42501 indica que o servidor respondeu, mas bloqueou acesso (o que é esperado sem login)
      const isConnectionSuccess = !error || 
                                error.code === '42501' || 
                                error.message === '' || 
                                error.message?.includes('RLS') ||
                                // Se tem status code, é porque conectou
                                (error as { status?: number }).status === 401 ||
                                (error as { status?: number }).status === 403;

      if (isConnectionSuccess) {
         console.log('Conexão com Supabase estabelecida (Servidor acessível)');
      } else {
         console.error('Supabase connection error:', error);
         toast.error('Erro de conexão com Supabase. Verifique sua internet ou configurações.');
      }
    };
    checkConnection();
  }, []);
  const [demoEmail, setDemoEmail] = useState('');
  const [demoTelefone, setDemoTelefone] = useState('');
  const [demoCamaraNome, setDemoCamaraNome] = useState('');
  const [demoCidade, setDemoCidade] = useState('');
  const [demoEstado, setDemoEstado] = useState('');
  const [demoMensagem, setDemoMensagem] = useState('');

  const checkRoleAndRedirect = async () => {
    // Se o usuário não estiver carregado, não faz nada
    if (!user) return;
    
    try {
      // Query roles handling multiple rows safely
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);
        
      if (error) {
        console.error("Error fetching roles:", error);
        // Não redireciona automaticamente para evitar loop se houver erro
        return;
      }

      // Check if ANY of the user's roles is 'super_admin'
      const isSuperAdmin = data?.some(r => r.role === 'super_admin');
      
      if (isSuperAdmin) {
        navigate('/admin/dashboard', { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    } catch (e) {
      console.error("Unexpected error in checkRoleAndRedirect:", e);
    }
  };

  useEffect(() => {
    const justLoggedOut = localStorage.getItem('sessionsync:justLoggedOut') === 'true';
    if (justLoggedOut) {
      localStorage.removeItem('sessionsync:justLoggedOut');
      return;
    }
    if (user && profile && !loading) {
      const timer = setTimeout(() => {
        checkRoleAndRedirect();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [user, profile, loading, navigate, checkRoleAndRedirect]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      emailSchema.parse(loginEmail);
      passwordSchema.parse(loginPassword);
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast.error(err.errors[0].message);
        return;
      }
    }

    setIsSubmitting(true);
    const { error } = await signIn(loginEmail, loginPassword);
    setIsSubmitting(false);

    if (error) {
      const code = (error as { code?: string }).code;
      if (code === 'CAMARA_INACTIVE' || code === 'PROFILE_INACTIVE' || code === 'PROFILE_MISSING') {
        toast.error(error.message);
        return;
      }
      if (error.message.includes('Invalid login credentials')) {
        toast.error('Email ou senha incorretos');
      } else {
        toast.error('Erro ao fazer login: ' + error.message);
      }
    } else {
      toast.success('Login realizado com sucesso!');
      // Redirection is handled by useEffect
    }
  };

  const handleDemoRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      demoRequestSchema.parse({
        nome: demoNome,
        email: demoEmail,
        telefone: demoTelefone || undefined,
        camara_nome: demoCamaraNome,
        cidade: demoCidade,
        estado: demoEstado.toUpperCase(),
        mensagem: demoMensagem || undefined,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast.error(err.errors[0].message);
        return;
      }
    }

    setIsSubmitting(true);
    
    const { error } = await supabase.from('demo_requests').insert({
      nome: demoNome.trim(),
      email: demoEmail.trim().toLowerCase(),
      telefone: demoTelefone.trim() || null,
      camara_nome: demoCamaraNome.trim(),
      cidade: demoCidade.trim(),
      estado: demoEstado.toUpperCase().trim(),
      mensagem: demoMensagem.trim() || null,
    });
    
    setIsSubmitting(false);

    if (error) {
      toast.error('Erro ao enviar solicitação. Tente novamente.');
    } else {
      setDemoSubmitted(true);
      toast.success('Solicitação enviada com sucesso!');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5 p-4">
      <div className="w-full max-w-md">
        {/* Logo e título */}
        <div className="text-center mb-8">
          <img 
            src="/logosessionsync.svg" 
            alt="SessionSync" 
            className="h-32 mx-auto mb-4" 
          />
          <p>Acesse para criar e revisar com agilidade.</p>
        </div>

        <Card className="border-0 shadow-xl bg-card/80 backdrop-blur">
          <Tabs defaultValue="login" className="w-full">
            <CardHeader className="pb-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Entrar</TabsTrigger>
                <TabsTrigger value="demo">Solicitar Demo</TabsTrigger>
              </TabsList>
            </CardHeader>

            <CardContent>
              <TabsContent value="login" className="mt-0">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="seu@email.com"
                        className="pl-10"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="login-password">Senha</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="login-password"
                        type="password"
                        placeholder="••••••••"
                        className="pl-10"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full" 
                    variant="gradient"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Entrando...
                      </>
                    ) : (
                      'Entrar'
                    )}
                  </Button>

                  <p className="text-xs text-center text-muted-foreground">
                    Não tem acesso? Solicite uma demonstração do sistema.
                  </p>
                </form>
              </TabsContent>

              <TabsContent value="demo" className="mt-0">
                {demoSubmitted ? (
                  <div className="text-center py-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 text-green-600 mb-4">
                      <CheckCircle className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">
                      Solicitação Enviada!
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      Recebemos sua solicitação de demonstração. Nossa equipe entrará em contato em breve.
                    </p>
                    <Button 
                      variant="outline" 
                      className="mt-4"
                      onClick={() => setDemoSubmitted(false)}
                    >
                      Enviar Nova Solicitação
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleDemoRequest} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="demo-nome">Nome Completo *</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="demo-nome"
                          type="text"
                          placeholder="Seu nome completo"
                          className="pl-10"
                          value={demoNome}
                          onChange={(e) => setDemoNome(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="demo-email">Email *</Label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            id="demo-email"
                            type="email"
                            placeholder="seu@email.com"
                            className="pl-10"
                            value={demoEmail}
                            onChange={(e) => setDemoEmail(e.target.value)}
                            required
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="demo-telefone">Telefone</Label>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            id="demo-telefone"
                            type="tel"
                            placeholder="(00) 00000-0000"
                            className="pl-10"
                            value={demoTelefone}
                            onChange={(e) => setDemoTelefone(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="demo-camara">Nome da Câmara Municipal *</Label>
                      <div className="relative">
                        <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="demo-camara"
                          type="text"
                          placeholder="Câmara Municipal de..."
                          className="pl-10"
                          value={demoCamaraNome}
                          onChange={(e) => setDemoCamaraNome(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-2 space-y-2">
                        <Label htmlFor="demo-cidade">Cidade *</Label>
                        <div className="relative">
                          <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            id="demo-cidade"
                            type="text"
                            placeholder="Nome da cidade"
                            className="pl-10"
                            value={demoCidade}
                            onChange={(e) => setDemoCidade(e.target.value)}
                            required
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="demo-estado">Estado *</Label>
                        <Input
                          id="demo-estado"
                          type="text"
                          placeholder="SP"
                          maxLength={2}
                          className="uppercase"
                          value={demoEstado}
                          onChange={(e) => setDemoEstado(e.target.value.toUpperCase())}
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="demo-mensagem">Mensagem (opcional)</Label>
                      <div className="relative">
                        <MessageSquare className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                        <Textarea
                          id="demo-mensagem"
                          placeholder="Conte-nos mais sobre suas necessidades..."
                          className="pl-10 min-h-[80px] resize-none"
                          value={demoMensagem}
                          onChange={(e) => setDemoMensagem(e.target.value)}
                        />
                      </div>
                    </div>

                    <Button 
                      type="submit" 
                      className="w-full" 
                      variant="gradient"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Enviando...
                        </>
                      ) : (
                        'Solicitar Demonstração'
                      )}
                    </Button>

                    <p className="text-xs text-center text-muted-foreground">
                      Após a análise, nossa equipe entrará em contato para agendar uma demonstração.
                    </p>
                  </form>
                )}
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          © 2026 SessionSync. Todos os direitos reservados.
        </p>
      </div>
    </div>
  );
};

export default Auth;

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'super_admin' | 'admin' | 'editor' | 'viewer';
  allowMesa?: string[]; // Novos cargos permitidos (ex: ['Presidente', 'Secretario'])
  disallowCargo?: string | string[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  requiredRole,
  allowMesa,
  disallowCargo
}) => {
  const { user, loading, hasRole, profile, vereador, roles } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  if (!profile && roles.length === 0) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // Verifica se tem acesso por cargo na mesa
  const hasMesaPermission = allowMesa && vereador?.cargo_mesa && allowMesa.includes(vereador.cargo_mesa);

  if (requiredRole && !hasMesaPermission) {
    const hasPermission = hasRole(requiredRole) || (requiredRole !== 'super_admin' && hasRole('super_admin'));
    
    if (!hasPermission) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground mb-2">Acesso Negado</h1>
            <p className="text-muted-foreground">
              Você não tem permissão para acessar esta página.
            </p>
          </div>
        </div>
      );
    }
  }

  if (disallowCargo) {
    const cargo = (profile?.cargo || '').trim().toLowerCase();
    const disallowed = Array.isArray(disallowCargo) ? disallowCargo : [disallowCargo];
    const disallowedNormalized = disallowed.map(c => c.trim().toLowerCase());
    if (cargo && disallowedNormalized.includes(cargo)) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground mb-2">Acesso Negado</h1>
            <p className="text-muted-foreground">
              Você não tem permissão para acessar esta página.
            </p>
          </div>
        </div>
      );
    }
  }

  return <>{children}</>;
};

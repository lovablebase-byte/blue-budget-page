import { useEffect, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/contexts/CompanyContext';
import { moduleFeatureMap } from '@/lib/routes';
import { resolveInitialRoute } from '@/lib/initial-route';
import { toast } from '@/hooks/use-toast';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredModule?: string;
  requiredAction?: 'view' | 'create' | 'edit' | 'delete';
  requiredRole?: ('admin' | 'user')[];
}

function useDeniedToast(message: string, shouldShow: boolean) {
  const shown = useRef(false);
  useEffect(() => {
    if (shouldShow && !shown.current) {
      shown.current = true;
      toast({ title: 'Acesso restrito', description: message, variant: 'destructive' });
    }
  }, [shouldShow, message]);
}

function getSafeHomeRoute(role: 'admin' | 'user' | null): string {
  if (role === 'admin') return '/dashboard';
  return '/account';
}

export function ProtectedRoute({ children, requiredModule, requiredAction = 'view', requiredRole }: ProtectedRouteProps) {
  const { user, loading, role, hasPermission, permissions, roleError, signOut } = useAuth();
  const { hasFeature, plan, planLoading } = useCompany();
  const location = useLocation();


  const isAdminRoute = location.pathname.startsWith('/admin') || ['/dashboard', '/users', '/settings', '/branding'].includes(location.pathname);
  const adminRouteDenied = role === 'user' && isAdminRoute;
  const roleDenied = !!(role && requiredRole && !requiredRole.includes(role));

  const getPermDenied = (): boolean => {
    if (!role || role === 'admin' || !requiredModule) return false;
    const featureKey = moduleFeatureMap[requiredModule];
    if (featureKey) {
      if (!plan || !hasFeature(featureKey)) return true;
    }
    if (permissions.length > 0) return !hasPermission(requiredModule, requiredAction);
    return false;
  };

  const permDenied = getPermDenied();

  useDeniedToast(
    adminRouteDenied
      ? 'Você não tem permissão para acessar a área administrativa.'
      : roleDenied
        ? 'Você não tem o papel necessário para acessar este recurso.'
        : 'Você não tem permissão para acessar este módulo.',
    adminRouteDenied || roleDenied || permDenied,
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        <span className="ml-3 text-sm text-muted-foreground animate-pulse">Carregando sessão...</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Erro estrutural ao carregar role: bloqueia com tela controlada (sem fallback perigoso)
  if (roleError || role === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-xl font-bold text-destructive">Acesso indisponível</h1>
          <p className="text-sm text-muted-foreground">
            {roleError || 'Sua conta não possui um papel configurado. Contate o administrador.'}
          </p>
          <button
            onClick={() => signOut().then(() => (window.location.href = '/auth'))}
            className="text-sm text-primary underline"
          >
            Sair e tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (role !== 'admin' && planLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        <span className="ml-3 text-sm text-muted-foreground animate-pulse">Carregando plano...</span>
      </div>
    );
  }

  if (adminRouteDenied) {
    console.log('ProtectedRoute: User tried to access admin route, redirecting to safe home');
    return <Navigate to={getSafeHomeRoute(role)} replace />;
  }

  if (roleDenied) {
    console.log('ProtectedRoute: Role denied, redirecting to safe home');
    return <Navigate to={getSafeHomeRoute(role)} replace />;
  }

  if (permDenied) {
    const fallback = resolveInitialRoute({ role, plan, permissions });
    // Proteção contra loop: se o fallback é a rota atual, vai para /account
    const target = fallback === location.pathname ? '/account' : fallback;
    console.log('[ProtectedRoute] Permission denied em', location.pathname, '→ fallback:', target);
    return <Navigate to={target} replace />;
  }

  return <>{children}</>;
}

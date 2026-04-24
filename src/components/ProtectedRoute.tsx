import { useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/contexts/CompanyContext';
import { routeOrderForRedirect, moduleFeatureMap } from '@/lib/routes';
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

function getFallbackRoute(hasPermission: (m: string, a: string) => boolean): string {
  for (const route of routeOrderForRedirect) {
    if (hasPermission(route.module, 'view')) return route.path;
  }
  return '/account';
}

export function ProtectedRoute({ children, requiredModule, requiredAction = 'view', requiredRole }: ProtectedRouteProps) {
  const { user, loading, role, hasPermission, permissions } = useAuth();
  const { hasFeature, plan, planLoading } = useCompany();

  // Console logs for debugging (as requested)
  useEffect(() => {
    if (user) {
      console.log('ProtectedRoute Debug:', {
        userId: user.id,
        role,
        loading,
        planLoading,
        requiredModule,
        requiredRole
      });
    }
  }, [user, role, loading, planLoading, requiredModule, requiredRole]);

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
    roleDenied
      ? 'Você não tem o papel necessário para acessar este recurso.'
      : 'Você não tem permissão para acessar este módulo.',
    roleDenied || permDenied,
  );

  // Still loading session or basic auth state
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        <span className="ml-3 text-sm text-muted-foreground animate-pulse">Carregando sessão...</span>
      </div>
    );
  }

  // Not logged in
  if (!user) {
    console.log('ProtectedRoute: No user found, redirecting to /auth');
    return <Navigate to="/auth" replace />;
  }

  // Session loaded, but waiting for plan data (only if not admin)
  if (role !== 'admin' && planLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        <span className="ml-3 text-sm text-muted-foreground animate-pulse">Carregando plano...</span>
      </div>
    );
  }

  // User has no role assigned yet (should be rare with auto-creation)
  if (role === null) {
    console.warn('ProtectedRoute: User has no role. Fallback to user role.');
    // If it's been loading for a while and still no role, we could show an error
    // but here we trust the AuthContext fallback. If we are here, something is slow.
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        <span className="ml-3 text-sm text-muted-foreground animate-pulse">Finalizando configuração...</span>
      </div>
    );
  }

  // Admin bypass
  if (role === 'admin') {
    return <>{children}</>;
  }

  // Role check
  if (roleDenied) {
    console.log('ProtectedRoute: Role denied, redirecting to fallback');
    return <Navigate to={getFallbackRoute(hasPermission)} replace />;
  }

  // Permission check
  if (permDenied) {
    console.log('ProtectedRoute: Permission denied, redirecting to fallback');
    return <Navigate to={getFallbackRoute(hasPermission)} replace />;
  }

  return <>{children}</>;
}

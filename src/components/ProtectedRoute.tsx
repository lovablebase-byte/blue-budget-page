import { useEffect, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
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

function getSafeHomeRoute(role: 'admin' | 'user' | null): string {
  if (role === 'admin') return '/dashboard';
  return '/account';
}

function getFallbackRoute(
  role: 'admin' | 'user' | null,
  hasPermission: (m: string, a: string) => boolean,
): string {
  if (role === 'admin') return '/dashboard';

  for (const route of routeOrderForRedirect) {
    if (route.path.startsWith('/admin')) continue;
    if (route.path === '/dashboard') continue;
    if (hasPermission(route.module, 'view')) return route.path;
  }

  return '/account';
}

export function ProtectedRoute({ children, requiredModule, requiredAction = 'view', requiredRole }: ProtectedRouteProps) {
  const { user, loading, role, hasPermission, permissions } = useAuth();
  const { hasFeature, plan, planLoading } = useCompany();
  const location = useLocation();

  useEffect(() => {
    if (user) {
      console.log('ProtectedRoute Debug:', {
        userId: user.id,
        role,
        loading,
        planLoading,
        requiredModule,
        requiredRole,
        pathname: location.pathname,
      });
    }
  }, [user, role, loading, planLoading, requiredModule, requiredRole, location.pathname]);

  const isAdminRoute = location.pathname.startsWith('/admin') || ['/dashboard', '/users', '/settings', '/branding'].includes(location.pathname);
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
  const adminRouteDenied = role === 'user' && isAdminRoute;

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
    console.log('ProtectedRoute: No user found, redirecting to /auth');
    return <Navigate to="/auth" replace />;
  }

  if (role !== 'admin' && planLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        <span className="ml-3 text-sm text-muted-foreground animate-pulse">Carregando plano...</span>
      </div>
    );
  }

  if (role === null) {
    console.warn('ProtectedRoute: User has no role. Waiting instead of assuming admin.');
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        <span className="ml-3 text-sm text-muted-foreground animate-pulse">Finalizando configuração...</span>
      </div>
    );
  }

  if (adminRouteDenied) {
    console.log('ProtectedRoute: User tried to access admin route, redirecting to safe home');
    return <Navigate to={getSafeHomeRoute(role)} replace />;
  }

  if (roleDenied) {
    console.log('ProtectedRoute: Role denied, redirecting to fallback');
    return <Navigate to={getFallbackRoute(role, hasPermission)} replace />;
  }

  if (permDenied) {
    console.log('ProtectedRoute: Permission denied, redirecting to fallback');
    return <Navigate to={getFallbackRoute(role, hasPermission)} replace />;
  }

  return <>{children}</>;
}

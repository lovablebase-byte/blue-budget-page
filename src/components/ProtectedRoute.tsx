import { useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { routeOrderForRedirect } from '@/lib/routes';
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
  const { user, loading, role, hasPermission } = useAuth();

  const roleDenied = !!(role && requiredRole && !requiredRole.includes(role));
  const permDenied = !!(role && role !== 'admin' && requiredModule && !hasPermission(requiredModule, requiredAction));

  useDeniedToast(
    roleDenied
      ? 'Você não tem o papel necessário para acessar este recurso.'
      : 'Você não tem permissão para acessar este módulo.',
    roleDenied || permDenied,
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (role === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // Admin has full access (bypass)
  if (role === 'admin') {
    return <>{children}</>;
  }

  // Role-based restriction
  if (roleDenied) {
    return <Navigate to={getFallbackRoute(hasPermission)} replace />;
  }

  // Module permission check
  if (permDenied) {
    return <Navigate to={getFallbackRoute(hasPermission)} replace />;
  }

  return <>{children}</>;
}

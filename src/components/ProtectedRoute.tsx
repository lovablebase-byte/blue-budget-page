import { useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/contexts/CompanyContext';
import { routeOrderForRedirect } from '@/lib/routes';
import { toast } from '@/hooks/use-toast';
import type { PlanFeatures } from '@/services/plan-enforcement';

const moduleFeatureMap: Record<string, keyof PlanFeatures> = {
  instances: 'instances_enabled',
  campaigns: 'campaigns_enabled',
  ai_agents: 'ai_agents_enabled',
};

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
  const { hasFeature, plan } = useCompany();

  const roleDenied = !!(role && requiredRole && !requiredRole.includes(role));

  // Permission check aligned with sidebar visibility:
  // 1. Admin → always allowed
  // 2. Plan feature disabled → denied
  // 3. Granular permissions exist → respect them
  // 4. No granular permissions → plan feature is enough
  const getPermDenied = (): boolean => {
    if (!role || role === 'admin' || !requiredModule) return false;

    const featureKey = moduleFeatureMap[requiredModule];
    if (featureKey && plan && !hasFeature(featureKey)) return true;

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

  if (role === 'admin') {
    return <>{children}</>;
  }

  if (roleDenied) {
    return <Navigate to={getFallbackRoute(hasPermission)} replace />;
  }

  if (permDenied) {
    return <Navigate to={getFallbackRoute(hasPermission)} replace />;
  }

  return <>{children}</>;
}

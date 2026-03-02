import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredModule?: string;
  requiredAction?: 'view' | 'create' | 'edit' | 'delete';
  requiredRole?: ('super_admin' | 'admin' | 'user')[];
}

export function ProtectedRoute({ children, requiredModule, requiredAction = 'view', requiredRole }: ProtectedRouteProps) {
  const { user, loading, role, hasPermission, forcePasswordChange } = useAuth();

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

  if (forcePasswordChange) {
    return <Navigate to="/force-password-change" replace />;
  }

  if (requiredRole && role && !requiredRole.includes(role)) {
    return <Navigate to="/access-denied" replace />;
  }

  if (requiredModule && !hasPermission(requiredModule, requiredAction)) {
    return <Navigate to="/access-denied" replace />;
  }

  return <>{children}</>;
}

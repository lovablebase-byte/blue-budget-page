import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredModule?: string;
  requiredAction?: 'view' | 'create' | 'edit' | 'delete';
  requiredRole?: ('admin' | 'user')[];
}

export function ProtectedRoute({ children, requiredModule, requiredAction = 'view', requiredRole }: ProtectedRouteProps) {
  const { user, loading, role, hasPermission } = useAuth();

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

  // Role-based restriction (e.g. admin-only pages)
  if (requiredRole && !requiredRole.includes(role)) {
    return <Navigate to="/access-denied" replace state={{ requiredRole, userRole: role, module: requiredModule }} />;
  }

  // Module permission check for 'user' role
  if (requiredModule && !hasPermission(requiredModule, requiredAction)) {
    return <Navigate to="/access-denied" replace state={{ module: requiredModule, action: requiredAction, userRole: role }} />;
  }

  return <>{children}</>;
}

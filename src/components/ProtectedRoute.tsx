import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredModule?: string;
  requiredAction?: 'view' | 'create' | 'edit' | 'delete';
  requiredRole?: ('super_admin' | 'admin' | 'user')[];
}

export function ProtectedRoute({ children, requiredModule, requiredAction = 'view', requiredRole }: ProtectedRouteProps) {
  const { user, loading, role, hasPermission } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // 1. Not authenticated → login
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // 1b. User exists but role not yet loaded → keep showing spinner
  if (role === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }


  // 3. Super Admin and Admin bypass ALL module permission checks
  if (role === 'super_admin' || role === 'admin') {
    // Only enforce requiredRole (e.g. super_admin-only pages)
    if (requiredRole && !requiredRole.includes(role)) {
      return <Navigate to="/access-denied" replace state={{ requiredRole, userRole: role, module: requiredModule }} />;
    }
    return <>{children}</>;
  }

  // 4. Role check for regular users
  if (requiredRole && role && !requiredRole.includes(role)) {
    return <Navigate to="/access-denied" replace state={{ requiredRole, userRole: role, module: requiredModule }} />;
  }

  // 5. Module permission check for regular users
  if (requiredModule && !hasPermission(requiredModule, requiredAction)) {
    return <Navigate to="/access-denied" replace state={{ module: requiredModule, action: requiredAction, userRole: role }} />;
  }

  return <>{children}</>;
}

import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { routeOrderForRedirect } from '@/lib/routes';

const Index = () => {
  const { user, loading, role, hasPermission } = useAuth();
  
  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  if (role === 'admin') return <Navigate to="/dashboard" replace />;

  for (const route of routeOrderForRedirect) {
    if (hasPermission(route.module, 'view')) {
      return <Navigate to={route.path} replace />;
    }
  }

  return <Navigate to="/profile" replace />;
};

export default Index;

import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

const ROUTE_ORDER = [
  { path: '/dashboard', module: 'dashboard' },
  { path: '/instances', module: 'instances' },
  { path: '/greetings', module: 'greetings' },
  { path: '/absence', module: 'absence' },
  { path: '/status', module: 'status' },
  { path: '/chatbot-keys', module: 'chatbot_keys' },
  { path: '/workflow', module: 'workflow' },
  { path: '/ai-agents', module: 'ai_agents' },
  { path: '/campaigns', module: 'campaigns' },
];

const Index = () => {
  const { user, loading, role, hasPermission } = useAuth();
  
  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  // Admin always goes to dashboard
  if (role === 'admin') return <Navigate to="/dashboard" replace />;

  // For 'user' role, find first allowed route
  for (const route of ROUTE_ORDER) {
    if (hasPermission(route.module, 'view')) {
      return <Navigate to={route.path} replace />;
    }
  }

  // Fallback: profile page (always accessible)
  return <Navigate to="/profile" replace />;
};

export default Index;

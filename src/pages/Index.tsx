import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

const Index = () => {
  const { user, loading } = useAuth();
  
  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return <Navigate to="/auth" replace />;
};

export default Index;

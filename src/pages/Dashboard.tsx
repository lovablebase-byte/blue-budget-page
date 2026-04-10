import { useAuth } from '@/contexts/AuthContext';
import AdminDashboard from '@/components/dashboard/AdminDashboard';
import ClientDashboard from '@/components/dashboard/ClientDashboard';

export default function Dashboard() {
  const { isAdmin } = useAuth();

  if (isAdmin) {
    return <AdminDashboard />;
  }

  return <ClientDashboard />;
}

import AdminDashboard from '@/components/dashboard/AdminDashboard';

/**
 * Dashboard é EXCLUSIVO do admin. Usuário comum nunca chega aqui
 * (bloqueado por ProtectedRoute com role={['admin']} em App.tsx).
 */
export default function Dashboard() {
  return <AdminDashboard />;
}

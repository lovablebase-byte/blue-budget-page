import { ShieldX, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';

export default function AccessDenied() {
  const navigate = useNavigate();
  const location = useLocation();
  const { role, permissions, refreshAuth } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const state = location.state as { module?: string; action?: string; requiredRole?: string[]; userRole?: string } | null;

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshAuth();
    setRefreshing(false);
    navigate('/dashboard', { replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
      <ShieldX className="h-16 w-16 text-destructive mb-4" />
      <h1 className="text-2xl font-bold text-foreground mb-2">Acesso Negado</h1>
      <p className="text-muted-foreground mb-4">Você não tem permissão para acessar esta página.</p>

      <div className="mb-6 space-y-2 text-sm text-muted-foreground">
        {role && (
          <p>Seu papel: <Badge variant="outline" className="ml-1">{role}</Badge></p>
        )}
        {state?.module && (
          <p>Permissão requerida: <Badge variant="secondary" className="ml-1">{state.module}.{state.action || 'view'}</Badge></p>
        )}
        {state?.requiredRole && (
          <p>Papéis permitidos: {state.requiredRole.map((r: string) => (
            <Badge key={r} variant="secondary" className="ml-1">{r}</Badge>
          ))}</p>
        )}
        {permissions.length > 0 && (
          <div className="mt-3">
            <p className="font-medium text-foreground mb-1">Suas permissões atuais:</p>
            <div className="flex flex-wrap gap-1 justify-center max-w-md">
              {permissions.filter(p => p.can_view).map(p => (
                <Badge key={p.module} variant="outline" className="text-xs">{p.module}</Badge>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <Button onClick={() => navigate('/dashboard')}>Ir ao Dashboard</Button>
        <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
          Recarregar Permissões
        </Button>
        <Button variant="ghost" onClick={() => navigate('/profile')}>Meu Perfil</Button>
      </div>
    </div>
  );
}

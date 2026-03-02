import { ShieldX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';

export default function AccessDenied() {
  const navigate = useNavigate();
  const location = useLocation();
  const { role } = useAuth();
  const state = location.state as { module?: string; action?: string; requiredRole?: string[]; userRole?: string } | null;

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
          <p>Módulo requerido: <Badge variant="secondary" className="ml-1">{state.module}.{state.action || 'view'}</Badge></p>
        )}
        {state?.requiredRole && (
          <p>Papéis permitidos: {state.requiredRole.map((r: string) => (
            <Badge key={r} variant="secondary" className="ml-1">{r}</Badge>
          ))}</p>
        )}
      </div>

      <div className="flex gap-3">
        <Button onClick={() => navigate('/dashboard')}>Ir ao Dashboard</Button>
        <Button variant="outline" onClick={() => navigate('/profile')}>Meu Perfil</Button>
      </div>
    </div>
  );
}

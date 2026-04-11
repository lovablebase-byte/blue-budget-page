import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/contexts/CompanyContext';
import { DataTable, Column } from '@/components/DataTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { LimitReachedBanner } from '@/components/PlanEnforcementGuard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from '@/hooks/use-toast';
import { Trash2, Plus, AlertCircle, Users } from 'lucide-react';
import { useResourceLimit } from '@/hooks/use-plan-enforcement';

export default function CompanyUsers() {
  const { company, user, isAdmin } = useAuth();
  const { isSuspended } = useCompany();
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'user'>('user');

  const { data: limitData } = useResourceLimit('max_users', 'user_roles');

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['company-users', company?.id],
    queryFn: async () => {
      if (!company?.id) return [];
      const { data, error } = await supabase
        .from('user_roles')
        .select('*, profiles:profiles!inner(full_name, user_id)')
        .eq('company_id', company.id)
        .order('created_at');
      if (error) throw error;
      return data;
    },
    enabled: !!company?.id,
  });

  const updateRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => {
      const { error } = await supabase.from('user_roles').update({ role: role as any }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-users'] });
      toast({ title: 'Papel atualizado' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('user_roles').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-users'] });
      queryClient.invalidateQueries({ queryKey: ['resource-limit'] });
      toast({ title: 'Usuário removido' });
    },
  });

  const inviteMutation = useMutation({
    mutationFn: async () => {
      if (!company?.id || !user?.id) throw new Error('Empresa não encontrada');
      throw new Error('Para convidar usuários, eles devem primeiro criar uma conta. Após o cadastro, adicione-os manualmente informando o ID do usuário.');
    },
    onError: (e: any) => toast({ title: 'Info', description: e.message }),
  });

  const limitReached = limitData ? !limitData.allowed : false;

  const columns: Column<any>[] = [
    {
      key: 'profiles',
      label: 'Nome',
      render: (row) => (
        <span className="font-medium text-foreground">{(row.profiles as any)?.full_name || '—'}</span>
      ),
      sortable: true,
    },
    {
      key: 'role',
      label: 'Papel',
      render: (row) => {
        if (!isAdmin || row.user_id === user?.id || isSuspended) {
          return (
            <Badge
              variant="outline"
              className={row.role === 'admin'
                ? 'bg-primary/10 text-primary border-primary/30'
                : 'bg-muted/30 text-muted-foreground border-border/40'}
            >
              {row.role === 'admin' ? 'Admin' : 'Usuário'}
            </Badge>
          );
        }
        return (
          <Select
            value={row.role}
            onValueChange={(v) => updateRole.mutate({ id: row.id, role: v })}
          >
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="user">Usuário</SelectItem>
            </SelectContent>
          </Select>
        );
      },
    },
    {
      key: 'created_at',
      label: 'Desde',
      render: (row) => (
        <span className="text-muted-foreground text-sm">{new Date(row.created_at).toLocaleDateString('pt-BR')}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 tracking-tight">
            <div className="p-1.5 rounded-md bg-primary/10">
              <Users className="h-6 w-6 text-primary" />
            </div>
            Usuários da Empresa
          </h1>
          {limitData && (
            <p className="text-sm text-muted-foreground mt-1">
              <span className="text-foreground font-semibold">{limitData.current}</span> / {limitData.max} usuários utilizados
            </p>
          )}
        </div>
      </div>

      {isSuspended && (
        <Alert variant="destructive" className="bg-destructive/10 border-destructive/30">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Assinatura suspensa</AlertTitle>
          <AlertDescription>
            Gerenciamento de usuários está desabilitado. Regularize sua assinatura.
          </AlertDescription>
        </Alert>
      )}

      {limitData && <LimitReachedBanner current={limitData.current} max={limitData.max} resourceLabel="usuários" />}

      <DataTable
        data={users}
        columns={columns}
        loading={isLoading}
        emptyMessage="Nenhum usuário encontrado"
        actions={(row) =>
          row.user_id !== user?.id && isAdmin && !isSuspended ? (
            <ConfirmDialog
              title="Remover usuário?"
              description="O usuário perderá acesso à empresa."
              onConfirm={() => deleteMutation.mutate(row.id)}
              trigger={
                <Button variant="ghost" size="icon" className="hover:bg-destructive/10">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              }
            />
          ) : null
        }
      />
    </div>
  );
}

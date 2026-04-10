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
      // Look up user by email via profiles (we need the auth user id)
      // Since we can't query auth.users, we create the role entry
      // The admin should provide the user_id or the user must already exist
      // For now, we search profiles by email match — but profiles don't store email.
      // Realistic approach: use supabase admin to invite, or user signs up and admin assigns.
      // Simple approach: admin enters user UUID directly or email is matched via auth metadata.
      
      // Try to find user via auth — we can use supabase.auth.admin only server-side.
      // Workaround: ask for the user_id or use an edge function.
      // For MVP: we'll add a user_role entry expecting the user already signed up.
      // The invite flow should ideally use an edge function. 
      // Let's create a simple "add by email" that searches profiles.
      
      throw new Error('Para convidar usuários, eles devem primeiro criar uma conta. Após o cadastro, adicione-os manualmente informando o ID do usuário.');
    },
    onError: (e: any) => toast({ title: 'Info', description: e.message }),
  });

  const limitReached = limitData ? !limitData.allowed : false;

  const columns: Column<any>[] = [
    {
      key: 'profiles',
      label: 'Nome',
      render: (row) => (row.profiles as any)?.full_name || '—',
      sortable: true,
    },
    {
      key: 'role',
      label: 'Papel',
      render: (row) => {
        if (!isAdmin || row.user_id === user?.id || isSuspended) {
          return (
            <Badge variant={row.role === 'admin' ? 'default' : 'secondary'}>
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
      render: (row) => new Date(row.created_at).toLocaleDateString('pt-BR'),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" /> Usuários da Empresa
          </h1>
          {limitData && (
            <p className="text-sm text-muted-foreground mt-1">
              {limitData.current} / {limitData.max} usuários utilizados
            </p>
          )}
        </div>
      </div>

      {isSuspended && (
        <Alert variant="destructive">
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
                <Button variant="ghost" size="icon">
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

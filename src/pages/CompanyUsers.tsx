import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { DataTable, Column } from '@/components/DataTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from '@/hooks/use-toast';
import { Trash2, AlertCircle, Users, UserPlus } from 'lucide-react';
import {
  listAdminUsers,
  createAdminUser,
  deleteAdminUser,
  updateAdminUserRole,
  type AdminUserRow,
} from '@/services/admin-users';

export default function CompanyUsers() {
  const { user, isAdmin } = useAuth();
  const { isSuspended } = useCompany();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'user'>('user');

  const { data: usersData, isLoading } = useQuery({
    queryKey: ['admin-users-list-diagnostic'],
    enabled: isAdmin,
    queryFn: async () => {
      const users = await listAdminUsers();
      // Enriquecer com dados de assinatura para diagnóstico admin
      const results = await Promise.all(users.map(async (u) => {
        // No single-tenant, profiles/user_roles pode ter o company_id ou null (tenant principal)
        // Vamos buscar a assinatura deste usuário específico se ele for o dono de uma company ou via RLS
        // Para simplificar o diagnóstico, listamos apenas os usuários e buscamos o plano/assinatura se houver 1:1
        const { data: sub } = await supabase
          .from('subscriptions')
          .select('status, expires_at, plans(name, max_instances, max_messages_month, allowed_providers)')
          .eq('company_id', (u as any).company_id || '249e802a-203e-4437-b92e-a7f77bf1cdcc') // tenant principal fallback
          .maybeSingle();

        const { count: instCount } = await supabase
          .from('instances')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', (u as any).company_id || '249e802a-203e-4437-b92e-a7f77bf1cdcc');

        const { count: msgs } = await supabase
          .from('messages_log')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', (u as any).company_id || '249e802a-203e-4437-b92e-a7f77bf1cdcc')
          .gte('created_at', new Date(new Date().setDate(1)).toISOString()); // mês atual

        return {
          ...u,
          plan_name: (sub as any)?.plans?.name || 'Sem plano',
          sub_status: sub?.status || 'inactive',
          instance_count: instCount || 0,
          messages_month: msgs || 0,
          max_instances: (sub as any)?.plans?.max_instances || 0,
          max_messages_month: (sub as any)?.plans?.max_messages_month || 0,
          allowed_providers: (sub as any)?.plans?.allowed_providers || []
        };
      }));
      return results;
    },
  });

  const users = usersData || [];

  const totalEndUsers = users.filter((u) => u.role === 'user').length;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-users-list'] });
    queryClient.invalidateQueries({ queryKey: ['admin-dashboard-stats'] });
  };

  const updateRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: 'admin' | 'user' }) =>
      updateAdminUserRole(userId, role),
    onSuccess: () => {
      invalidate();
      toast({ title: 'Papel atualizado' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAdminUser,
    onSuccess: () => {
      invalidate();
      toast({ title: 'Usuário removido' });
    },
    onError: (e: any) =>
      toast({ title: 'Erro ao remover', description: e.message, variant: 'destructive' }),
  });

  const createUser = useMutation({
    mutationFn: () => {
      if (!newEmail) throw new Error('Email é obrigatório');
      return createAdminUser({
        email: newEmail,
        full_name: newName || newEmail,
        password: newPassword || undefined,
        role: newRole,
      });
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Usuário criado' });
      setDialogOpen(false);
      setNewEmail(''); setNewName(''); setNewPassword(''); setNewRole('user');
    },
    onError: (e: any) =>
      toast({ title: 'Erro ao criar', description: e.message, variant: 'destructive' }),
  });

  const columns: Column<any>[] = [
    {
      key: 'full_name',
      label: 'Nome',
      render: (row) => (
        <div className="flex flex-col">
          <span className="font-medium text-foreground">{row.full_name || '—'}</span>
          <span className="text-xs text-muted-foreground">{row.email || 'sem email'}</span>
        </div>
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
            onValueChange={(v) => updateRole.mutate({ userId: row.user_id, role: v as 'admin' | 'user' })}
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
      key: 'diagnostic',
      label: 'Diagnóstico Comercial',
      render: (row) => (
        <div className="flex flex-col gap-1 min-w-[200px]">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[9px] font-bold">{row.plan_name}</Badge>
            <Badge variant={row.sub_status === 'active' ? 'success' : 'destructive'} className="text-[9px] font-bold">
              {row.sub_status.toUpperCase()}
            </Badge>
          </div>
          <div className="text-[10px] text-muted-foreground flex flex-wrap gap-x-2">
            <span>Instâncias: <b>{row.instance_count}/{row.max_instances}</b></span>
            <span>Msgs: <b>{row.messages_month}/{row.max_messages_month}</b></span>
          </div>
          {row.allowed_providers?.length > 0 && (
            <div className="flex gap-1 mt-0.5">
              {row.allowed_providers.slice(0, 3).map((p: string) => (
                <span key={p} className="text-[8px] opacity-60 uppercase font-black tracking-tighter">[{p}]</span>
              ))}
            </div>
          )}
        </div>
      )
    },
    {
      key: 'created_at',
      label: 'Desde',
      render: (row) => (
        <span className="text-muted-foreground text-xs tabular-nums">{new Date(row.created_at).toLocaleDateString('pt-BR')}</span>
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
            Usuários
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            <span className="text-foreground font-semibold">{totalEndUsers}</span> {totalEndUsers === 1 ? 'usuário final' : 'usuários finais'} · {users.length} no total
          </p>
        </div>
        {isAdmin && !isSuspended && (
          <Button onClick={() => setDialogOpen(true)}>
            <UserPlus className="h-4 w-4 mr-2" /> Novo Usuário
          </Button>
        )}
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

      <DataTable
        data={users}
        columns={columns}
        loading={isLoading}
        emptyMessage="Nenhum usuário encontrado"
        actions={(row) =>
          row.user_id !== user?.id && isAdmin && !isSuspended ? (
            <ConfirmDialog
              title="Remover usuário?"
              description="O usuário perderá acesso ao sistema."
              onConfirm={() => deleteMutation.mutate(row.user_id)}
              trigger={
                <Button variant="ghost" size="icon" className="hover:bg-destructive/10">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              }
            />
          ) : null
        }
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="border-border/40">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" /> Novo Usuário
            </DialogTitle>
            <DialogDescription>Cadastre um novo usuário no sistema. Ele poderá fazer login com o email e senha definidos. Nenhum plano será aplicado automaticamente.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">Email *</Label>
              <Input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="email@exemplo.com" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">Nome</Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nome completo" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">Senha</Label>
              <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Padrão: 123456" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">Papel</Label>
              <Select value={newRole} onValueChange={(v) => setNewRole(v as 'admin' | 'user')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="user">Usuário</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => createUser.mutate()} disabled={createUser.isPending || !newEmail}>
              {createUser.isPending ? 'Criando...' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

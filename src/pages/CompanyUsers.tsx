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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { LimitReachedBanner } from '@/components/PlanEnforcementGuard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from '@/hooks/use-toast';
import { Trash2, AlertCircle, Users, UserPlus } from 'lucide-react';
import { useResourceLimit } from '@/hooks/use-plan-enforcement';

export default function CompanyUsers() {
  const { company, user, isAdmin } = useAuth();
  const { isSuspended } = useCompany();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'user'>('user');

  const { data: limitData } = useResourceLimit('max_users', 'user_roles');

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['company-users', isAdmin ? 'all' : company?.id],
    queryFn: async () => {
      // Admin vê TODOS os usuários do sistema; usuário comum vê apenas os da sua company
      let query = supabase
        .from('user_roles')
        .select('*, profiles:profiles!inner(full_name, user_id)')
        .order('created_at');

      if (!isAdmin && company?.id) {
        query = query.eq('company_id', company.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: isAdmin || !!company?.id,
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
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard-stats'] });
      toast({ title: 'Usuário removido' });
    },
  });

  const createUser = useMutation({
    mutationFn: async () => {
      if (!newEmail) throw new Error('Email é obrigatório');
      const { data, error } = await supabase.functions.invoke('seed-users', {
        body: {
          email: newEmail,
          full_name: newName || newEmail,
          password: newPassword || undefined,
          role: newRole,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard-stats'] });
      toast({ title: 'Usuário criado' });
      setDialogOpen(false);
      setNewEmail(''); setNewName(''); setNewPassword(''); setNewRole('user');
    },
    onError: (e: any) => toast({ title: 'Erro ao criar', description: e.message, variant: 'destructive' }),
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
            Usuários
          </h1>
          {!isAdmin && limitData && (
            <p className="text-sm text-muted-foreground mt-1">
              <span className="text-foreground font-semibold">{limitData.current}</span> / {limitData.max} usuários utilizados
            </p>
          )}
          {isAdmin && (
            <p className="text-sm text-muted-foreground mt-1">
              <span className="text-foreground font-semibold">{users.length}</span> {users.length === 1 ? 'usuário cadastrado' : 'usuários cadastrados'}
            </p>
          )}
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

      {!isAdmin && limitData && <LimitReachedBanner current={limitData.current} max={limitData.max} resourceLabel="usuários" />}

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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="border-border/40">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" /> Novo Usuário
            </DialogTitle>
            <DialogDescription>Cadastre um novo usuário no sistema. Ele poderá fazer login com o email e senha definidos.</DialogDescription>
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

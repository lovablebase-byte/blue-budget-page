import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DataTable, Column } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { toast } from '@/hooks/use-toast';
import { UserPlus, Trash2, Eye, Users } from 'lucide-react';

const ROLE_LABELS: Record<string, string> = { admin: 'Admin', user: 'Usuário' };

export default function AdminUsers() {
  const queryClient = useQueryClient();
  const [roleFilter, setRoleFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailUser, setDetailUser] = useState<any | null>(null);

  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<string>('user');

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      // Buscamos perfis e seus respectivos papéis para garantir que todos apareçam
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          *,
          user_roles (
            id,
            role,
            created_at
          )
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;

      // Transformamos os dados para que cada linha represente um usuário único
      return (data as any[]).map(profile => ({
        ...profile,
        // Pegamos o papel (role) do primeiro registro de user_roles, ou 'user' como padrão
        role: profile.user_roles?.[0]?.role || 'user',
        role_id: profile.user_roles?.[0]?.id,
        created_at: profile.created_at || new Date().toISOString()
      }));
    },
  });

  const updateRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => {
      const { error } = await supabase.from('user_roles').update({ role: role as any }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-users'] }); toast({ title: 'Papel atualizado' }); },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('user_roles').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-users'] }); toast({ title: 'Usuário removido' }); },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const createUser = useMutation({
    mutationFn: async () => {
      if (!newEmail) throw new Error('Email é obrigatório');
      const { data, error } = await supabase.functions.invoke('seed-users', {
        body: { email: newEmail, full_name: newName || newEmail, role: newRole },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({ title: 'Usuário criado' });
      setDialogOpen(false);
      setNewEmail(''); setNewName(''); setNewRole('user');
    },
    onError: (e: any) => toast({ title: 'Erro ao criar', description: e.message, variant: 'destructive' }),
  });

  const filtered = users.filter((u: any) => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    return true;
  });

  const columns: Column<any>[] = [
    {
      key: 'full_name', label: 'Nome',
      render: (row) => (
        <div className="flex flex-col">
          <span className="font-medium text-foreground">{row.full_name || '—'}</span>
          <span className="text-xs text-muted-foreground">{row.email || 'sem email'}</span>
        </div>
      ),
      sortable: true,
    },
    {
      key: 'role', label: 'Papel',
      render: (row) => (
        <Select 
          value={row.role} 
          onValueChange={(v) => updateRole.mutate({ id: row.role_id, role: v })}
          disabled={!row.role_id}
        >
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="user">Usuário</SelectItem>
          </SelectContent>
        </Select>
      ),
    },
    {
      key: 'created_at', label: 'Criado em',
      render: (row) => <span className="text-muted-foreground text-sm">{new Date(row.created_at).toLocaleDateString('pt-BR')}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-primary/10">
            <Users className="h-5 w-5 text-primary" />
          </div>
          Usuários
        </h1>
        <Button onClick={() => setDialogOpen(true)}>
          <UserPlus className="h-4 w-4 mr-2" /> Novo Usuário
        </Button>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Papel" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os papéis</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="user">Usuário</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        data={filtered}
        columns={columns}
        searchKey="full_name"
        searchPlaceholder="Buscar usuário..."
        loading={isLoading}
        emptyMessage="Nenhum usuário"
        actions={(row) => (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => setDetailUser(row)} className="hover:bg-accent/10">
              <Eye className="h-4 w-4 text-accent" />
            </Button>
            <ConfirmDialog
              title="Remover usuário?"
              description="O vínculo será removido permanentemente."
              onConfirm={() => deleteMutation.mutate(row.role_id)}
              trigger={<Button variant="ghost" size="icon" className="hover:bg-destructive/10" disabled={!row.role_id}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
            />
          </div>
        )}
      />

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="border-border/40">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" /> Novo Usuário
            </DialogTitle>
            <DialogDescription>Crie um novo usuário no sistema</DialogDescription>
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
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">Papel</Label>
              <Select value={newRole} onValueChange={setNewRole}>
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

      {/* Detail dialog */}
      <Dialog open={!!detailUser} onOpenChange={() => setDetailUser(null)}>
        <DialogContent className="max-w-md border-border/40">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-accent" /> Detalhes do Usuário
            </DialogTitle>
            <DialogDescription>Informações do usuário</DialogDescription>
          </DialogHeader>
          {detailUser && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between p-3 rounded-lg bg-muted/20 border border-border/30">
                <span className="text-muted-foreground">Nome</span>
                <span className="font-medium text-foreground">{detailUser.full_name || '—'}</span>
              </div>
              <div className="flex justify-between p-3 rounded-lg bg-muted/20 border border-border/30">
                <span className="text-muted-foreground">Email</span>
                <span className="font-medium text-foreground">{detailUser.email || '—'}</span>
              </div>
              <div className="flex justify-between items-center p-3 rounded-lg bg-muted/20 border border-border/30">
                <span className="text-muted-foreground">Papel</span>
                <Badge variant="outline" className="bg-primary/10 border-primary/30 text-primary">{ROLE_LABELS[detailUser.role] || detailUser.role}</Badge>
              </div>
              <Separator className="bg-border/30" />
              <div className="flex justify-between p-3 rounded-lg bg-muted/20 border border-border/30">
                <span className="text-muted-foreground">Criado em</span>
                <span className="text-foreground">{new Date(detailUser.created_at).toLocaleDateString('pt-BR')}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

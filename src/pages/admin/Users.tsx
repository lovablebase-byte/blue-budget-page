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
import { UserPlus, Trash2, Pencil, Eye } from 'lucide-react';

const ROLE_LABELS: Record<string, string> = { admin: 'Admin', user: 'Usuário' };

export default function AdminUsers() {
  const queryClient = useQueryClient();
  const [roleFilter, setRoleFilter] = useState('all');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailUser, setDetailUser] = useState<any | null>(null);
  const [editUser, setEditUser] = useState<any | null>(null);

  // Form state for create
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<string>('user');
  const [newCompanyId, setNewCompanyId] = useState('');

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('*, profiles:profiles!inner(full_name, user_id), companies(name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: companies = [] } = useQuery({
    queryKey: ['admin-companies-list'],
    queryFn: async () => {
      const { data } = await supabase.from('companies').select('id, name').order('name');
      return data || [];
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

  const updateCompany = useMutation({
    mutationFn: async ({ id, company_id }: { id: string; company_id: string | null }) => {
      const { error } = await supabase.from('user_roles').update({ company_id }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-users'] }); toast({ title: 'Empresa atualizada' }); },
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
      if (!newEmail || !newCompanyId) throw new Error('Email e empresa são obrigatórios');
      // Create user via edge function
      const { data, error } = await supabase.functions.invoke('seed-users', {
        body: { email: newEmail, full_name: newName || newEmail, role: newRole, company_id: newCompanyId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({ title: 'Usuário criado' });
      setDialogOpen(false);
      setNewEmail(''); setNewName(''); setNewRole('user'); setNewCompanyId('');
    },
    onError: (e: any) => toast({ title: 'Erro ao criar', description: e.message, variant: 'destructive' }),
  });

  const filtered = users.filter((u: any) => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    if (companyFilter !== 'all' && u.company_id !== companyFilter) return false;
    return true;
  });

  const columns: Column<any>[] = [
    { key: 'profiles', label: 'Nome', render: (row) => (row.profiles as any)?.full_name || '—', sortable: true },
    { key: 'companies', label: 'Empresa', render: (row) => (row.companies as any)?.name || 'Sem empresa', sortable: true },
    {
      key: 'role', label: 'Papel',
      render: (row) => (
        <Select value={row.role} onValueChange={(v) => updateRole.mutate({ id: row.id, role: v })}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="user">Usuário</SelectItem>
          </SelectContent>
        </Select>
      ),
    },
    { key: 'created_at', label: 'Criado em', render: (row) => new Date(row.created_at).toLocaleDateString('pt-BR') },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Usuários</h1>
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
        <Select value={companyFilter} onValueChange={setCompanyFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Empresa" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as empresas</SelectItem>
            {companies.map((c: any) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        data={filtered}
        columns={columns}
        searchKey="profiles"
        searchPlaceholder="Buscar usuário..."
        loading={isLoading}
        emptyMessage="Nenhum usuário"
        actions={(row) => (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => setDetailUser(row)}>
              <Eye className="h-4 w-4" />
            </Button>
            <ConfirmDialog
              title="Remover usuário?"
              description="O vínculo será removido permanentemente."
              onConfirm={() => deleteMutation.mutate(row.id)}
              trigger={<Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>}
            />
          </div>
        )}
      />

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Usuário</DialogTitle>
            <DialogDescription>Crie um novo usuário e vincule a uma empresa</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Email *</Label>
              <Input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="email@exemplo.com" />
            </div>
            <div>
              <Label>Nome</Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nome completo" />
            </div>
            <div>
              <Label>Papel</Label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="user">Usuário</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Empresa *</Label>
              <Select value={newCompanyId} onValueChange={setNewCompanyId}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {companies.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => createUser.mutate()} disabled={createUser.isPending || !newEmail || !newCompanyId}>
              {createUser.isPending ? 'Criando...' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail dialog */}
      <Dialog open={!!detailUser} onOpenChange={() => setDetailUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Detalhes do Usuário</DialogTitle>
            <DialogDescription>Informações e vínculo</DialogDescription>
          </DialogHeader>
          {detailUser && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Nome</span>
                <span className="font-medium">{(detailUser.profiles as any)?.full_name || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Papel</span>
                <Badge variant="outline">{ROLE_LABELS[detailUser.role] || detailUser.role}</Badge>
              </div>
              <Separator />
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Empresa</span>
                <Select
                  value={detailUser.company_id || ''}
                  onValueChange={(v) => {
                    updateCompany.mutate({ id: detailUser.id, company_id: v || null });
                    setDetailUser((prev: any) => prev ? { ...prev, company_id: v } : null);
                  }}
                >
                  <SelectTrigger className="w-[180px]"><SelectValue placeholder="Sem empresa" /></SelectTrigger>
                  <SelectContent>
                    {companies.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Criado em</span>
                <span>{new Date(detailUser.created_at).toLocaleDateString('pt-BR')}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

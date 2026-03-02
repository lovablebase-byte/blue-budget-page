import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DataTable, Column } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';

export default function AdminUsers() {
  const queryClient = useQueryClient();

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

  const updateRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => {
      const { error } = await supabase.from('user_roles').update({ role: role as any }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-users'] }); toast({ title: 'Papel atualizado' }); },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const columns: Column<any>[] = [
    { key: 'profiles', label: 'Nome', render: (row) => (row.profiles as any)?.full_name || '—', sortable: true },
    { key: 'companies', label: 'Empresa', render: (row) => (row.companies as any)?.name || 'Sem empresa' },
    {
      key: 'role', label: 'Papel',
      render: (row) => (
        <Select value={row.role} onValueChange={(v) => updateRole.mutate({ id: row.id, role: v })}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="super_admin">Super Admin</SelectItem>
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
      <h1 className="text-2xl font-bold">Usuários</h1>
      <DataTable data={users} columns={columns} searchKey="profiles" searchPlaceholder="Buscar usuário..." loading={isLoading} emptyMessage="Nenhum usuário" />
    </div>
  );
}

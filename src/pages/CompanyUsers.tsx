import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { DataTable, Column } from '@/components/DataTable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { toast } from '@/hooks/use-toast';
import { Trash2 } from 'lucide-react';

export default function CompanyUsers() {
  const { company, user } = useAuth();
  const queryClient = useQueryClient();

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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['company-users'] }); toast({ title: 'Papel atualizado' }); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('user_roles').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['company-users'] }); toast({ title: 'Usuário removido' }); },
  });

  const roleLabel: Record<string, string> = { admin: 'Admin', user: 'Usuário' };

  const columns: Column<any>[] = [
    { key: 'profiles', label: 'Nome', render: (row) => (row.profiles as any)?.full_name || '—', sortable: true },
    {
      key: 'role', label: 'Papel',
      render: (row) => (
        <Select value={row.role} onValueChange={(v) => updateRole.mutate({ id: row.id, role: v })} disabled={row.user_id === user?.id}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="user">Usuário</SelectItem>
          </SelectContent>
        </Select>
      ),
    },
    { key: 'created_at', label: 'Desde', render: (row) => new Date(row.created_at).toLocaleDateString('pt-BR') },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Usuários da Empresa</h1>
      <DataTable data={users} columns={columns} loading={isLoading} emptyMessage="Nenhum usuário" actions={(row) =>
        row.user_id !== user?.id ? (
          <ConfirmDialog title="Remover usuário?" description="O usuário perderá acesso à empresa." onConfirm={() => deleteMutation.mutate(row.id)} trigger={<Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>} />
        ) : null
      } />
    </div>
  );
}

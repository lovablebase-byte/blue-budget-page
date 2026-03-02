import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DataTable, Column } from '@/components/DataTable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';

export default function AdminCompanies() {
  const queryClient = useQueryClient();

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ['admin-companies'],
    queryFn: async () => {
      const { data, error } = await supabase.from('companies').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('companies').update({ is_active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-companies'] }); toast({ title: 'Status atualizado' }); },
  });

  const columns: Column<any>[] = [
    { key: 'name', label: 'Nome', sortable: true },
    { key: 'slug', label: 'Slug' },
    { key: 'is_active', label: 'Ativa', render: (row) => <Switch checked={row.is_active} onCheckedChange={(v) => toggleMutation.mutate({ id: row.id, is_active: v })} /> },
    { key: 'created_at', label: 'Criada em', render: (row) => new Date(row.created_at).toLocaleDateString('pt-BR') },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Empresas</h1>
      <DataTable data={companies} columns={columns} searchKey="name" searchPlaceholder="Buscar empresa..." loading={isLoading} emptyMessage="Nenhuma empresa" />
    </div>
  );
}

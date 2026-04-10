import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DataTable, Column } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { toast } from '@/hooks/use-toast';
import { Trash2, Clock, Building2 } from 'lucide-react';

export default function AdminAbsence() {
  const queryClient = useQueryClient();
  const [companyFilter, setCompanyFilter] = useState('all');

  const { data: companies = [] } = useQuery({
    queryKey: ['admin-companies'],
    queryFn: async () => {
      const { data } = await supabase.from('companies').select('id, name').order('name');
      return data || [];
    },
  });

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['admin-absence', companyFilter],
    queryFn: async () => {
      let q = supabase.from('absence_rules').select('*, companies(name)').order('created_at', { ascending: false });
      if (companyFilter !== 'all') q = q.eq('company_id', companyFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('absence_rules').update({ is_active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-absence'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('absence_rules').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-absence'] }); toast({ title: 'Regra excluída' }); },
  });

  const activeCount = rules.filter((r: any) => r.is_active).length;

  const columns: Column<any>[] = [
    { key: 'companies', label: 'Empresa', render: (row) => <Badge variant="outline"><Building2 className="h-3 w-3 mr-1" />{(row.companies as any)?.name || '—'}</Badge> },
    { key: 'name', label: 'Nome', sortable: true },
    { key: 'message', label: 'Mensagem', render: (row) => <span className="line-clamp-1 max-w-[200px]">{row.message}</span> },
    { key: 'only_first_message', label: 'Só 1ª msg', render: (row) => row.only_first_message ? 'Sim' : 'Não' },
    { key: 'is_active', label: 'Ativo', render: (row) => <Switch checked={row.is_active} onCheckedChange={(v) => toggleMutation.mutate({ id: row.id, is_active: v })} /> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ausência — Visão Global</h1>
          <p className="text-muted-foreground">Todas as regras de ausência de todas as empresas</p>
        </div>
        <Select value={companyFilter} onValueChange={setCompanyFilter}>
          <SelectTrigger className="w-[220px]"><SelectValue placeholder="Filtrar empresa" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as empresas</SelectItem>
            {companies.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Clock className="h-8 w-8 text-primary" /><div><p className="text-2xl font-bold">{rules.length}</p><p className="text-sm text-muted-foreground">Total</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-2xl font-bold text-green-500">{activeCount}</p><p className="text-sm text-muted-foreground">Ativas</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-2xl font-bold text-muted-foreground">{rules.length - activeCount}</p><p className="text-sm text-muted-foreground">Inativas</p></CardContent></Card>
      </div>

      <DataTable data={rules} columns={columns} searchKey="name" searchPlaceholder="Buscar regra..." loading={isLoading} emptyMessage="Nenhuma regra encontrada"
        actions={(row) => (
          <ConfirmDialog title="Excluir regra?" description="Esta ação é irreversível." onConfirm={() => deleteMutation.mutate(row.id)}
            trigger={<Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>} />
        )}
      />
    </div>
  );
}

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
import { Trash2, GitBranch, Building2 } from 'lucide-react';

export default function AdminWorkflows() {
  const queryClient = useQueryClient();
  const [companyFilter, setCompanyFilter] = useState('all');

  const { data: companies = [] } = useQuery({
    queryKey: ['admin-companies'],
    queryFn: async () => {
      const { data } = await supabase.from('companies').select('id, name').order('name');
      return data || [];
    },
  });

  const { data: workflows = [], isLoading } = useQuery({
    queryKey: ['admin-workflows', companyFilter],
    queryFn: async () => {
      let q = supabase.from('workflows').select('*, companies(name)').order('created_at', { ascending: false });
      if (companyFilter !== 'all') q = q.eq('company_id', companyFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const togglePublish = useMutation({
    mutationFn: async ({ id, is_published }: { id: string; is_published: boolean }) => {
      const { error } = await supabase.from('workflows').update({ is_published, is_active: is_published }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-workflows'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('workflows').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-workflows'] }); toast({ title: 'Workflow excluído' }); },
  });

  const publishedCount = workflows.filter((w: any) => w.is_published).length;

  const columns: Column<any>[] = [
    { key: 'companies', label: 'Empresa', render: (row) => <Badge variant="outline"><Building2 className="h-3 w-3 mr-1" />{(row.companies as any)?.name || '—'}</Badge> },
    { key: 'name', label: 'Nome', sortable: true },
    { key: 'description', label: 'Descrição', render: (row) => row.description || '—' },
    { key: 'version', label: 'Versão', render: (row) => `v${row.version}` },
    { key: 'is_published', label: 'Status', render: (row) => <Badge variant={row.is_published ? 'default' : 'secondary'}>{row.is_published ? 'Publicado' : 'Rascunho'}</Badge> },
    { key: 'is_active', label: 'Publicar', render: (row) => <Switch checked={row.is_published} onCheckedChange={(v) => togglePublish.mutate({ id: row.id, is_published: v })} /> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Workflows — Visão Global</h1>
          <p className="text-muted-foreground">Todos os workflows de todas as empresas</p>
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
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-accent/10"><GitBranch className="h-6 w-6 text-accent" /></div>
              <div><p className="text-2xl font-bold tracking-tight">{workflows.length}</p><p className="text-sm text-muted-foreground">Total</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-success/10"><GitBranch className="h-6 w-6 text-success" /></div>
              <div><p className="text-2xl font-bold tracking-tight text-success">{publishedCount}</p><p className="text-sm text-muted-foreground">Publicados</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted/30"><GitBranch className="h-6 w-6 text-muted-foreground" /></div>
              <div><p className="text-2xl font-bold tracking-tight text-muted-foreground">{workflows.length - publishedCount}</p><p className="text-sm text-muted-foreground">Rascunhos</p></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <DataTable data={workflows} columns={columns} searchKey="name" searchPlaceholder="Buscar workflow..." loading={isLoading} emptyMessage="Nenhum workflow encontrado"
        actions={(row) => (
          <ConfirmDialog title="Excluir workflow?" description="Esta ação é irreversível." onConfirm={() => deleteMutation.mutate(row.id)}
            trigger={<Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>} />
        )}
      />
    </div>
  );
}

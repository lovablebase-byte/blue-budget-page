import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DataTable, Column } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';

export default function AdminWebhooks() {
  const { data: events = [], isLoading } = useQuery({
    queryKey: ['admin-webhooks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('webhook_events')
        .select('*, instances(name), companies(name)')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  const columns: Column<any>[] = [
    { key: 'event_type', label: 'Evento', sortable: true },
    { key: 'instances', label: 'Instância', render: (row) => (row.instances as any)?.name || '—' },
    { key: 'companies', label: 'Empresa', render: (row) => (row.companies as any)?.name || '—' },
    { key: 'direction', label: 'Direção', render: (row) => <Badge variant="outline">{row.direction}</Badge> },
    { key: 'status', label: 'Status', render: (row) => <Badge variant={row.status === 'processed' ? 'default' : 'secondary'}>{row.status}</Badge> },
    { key: 'created_at', label: 'Data', render: (row) => new Date(row.created_at).toLocaleString('pt-BR') },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Webhooks</h1>
      <DataTable data={events} columns={columns} searchKey="event_type" searchPlaceholder="Buscar evento..." loading={isLoading} emptyMessage="Nenhum evento" />
    </div>
  );
}

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DataTable, Column } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';

export default function AdminInvoices() {
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['admin-invoices'],
    queryFn: async () => {
      const { data, error } = await supabase.from('invoices').select('*, companies(name)').order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const statusBadge = (status: string) => {
    switch (status) {
      case 'paid': return <Badge className="bg-success text-success-foreground">Pago</Badge>;
      case 'pending': return <Badge variant="secondary">Pendente</Badge>;
      case 'overdue': return <Badge variant="destructive">Vencido</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const columns: Column<any>[] = [
    { key: 'companies', label: 'Empresa', render: (row) => (row.companies as any)?.name || '—', sortable: true },
    { key: 'amount_cents', label: 'Valor', render: (row) => `R$ ${(row.amount_cents / 100).toFixed(2)}` },
    { key: 'status', label: 'Status', render: (row) => statusBadge(row.status) },
    { key: 'due_date', label: 'Vencimento', render: (row) => new Date(row.due_date).toLocaleDateString('pt-BR') },
    { key: 'gateway', label: 'Gateway', render: (row) => row.gateway || '—' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Faturas</h1>
      <DataTable data={invoices} columns={columns} searchKey="companies" searchPlaceholder="Buscar por empresa..." loading={isLoading} emptyMessage="Nenhuma fatura" />
    </div>
  );
}

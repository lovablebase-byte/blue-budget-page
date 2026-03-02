import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { DataTable, Column } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';

export default function CompanyInvoices() {
  const { company } = useAuth();

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['company-invoices', company?.id],
    queryFn: async () => {
      if (!company?.id) return [];
      const { data, error } = await supabase.from('invoices').select('*').eq('company_id', company.id).order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!company?.id,
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
    { key: 'amount_cents', label: 'Valor', render: (row) => `R$ ${(row.amount_cents / 100).toFixed(2)}` },
    { key: 'status', label: 'Status', render: (row) => statusBadge(row.status) },
    { key: 'due_date', label: 'Vencimento', render: (row) => new Date(row.due_date).toLocaleDateString('pt-BR') },
    { key: 'paid_at', label: 'Pago em', render: (row) => row.paid_at ? new Date(row.paid_at).toLocaleDateString('pt-BR') : '—' },
    { key: 'gateway', label: 'Gateway', render: (row) => row.gateway || '—' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Faturas</h1>
      <DataTable data={invoices} columns={columns} loading={isLoading} emptyMessage="Nenhuma fatura" />
    </div>
  );
}

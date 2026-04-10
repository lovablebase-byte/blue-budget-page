import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DataTable, Column } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'pending', label: 'Pendente' },
  { value: 'paid', label: 'Pago' },
  { value: 'overdue', label: 'Vencido' },
  { value: 'canceled', label: 'Cancelado' },
];

function statusBadge(status: string) {
  switch (status) {
    case 'paid': return <Badge className="bg-success/10 text-success border-success/30">Pago</Badge>;
    case 'pending': return <Badge className="bg-warning/10 text-warning border-warning/30">Pendente</Badge>;
    case 'overdue': return <Badge variant="destructive">Vencido</Badge>;
    case 'canceled': return <Badge variant="outline">Cancelado</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
}

function formatCurrency(cents: number) {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR');
}

export default function AdminInvoices() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['admin-invoices'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('*, companies(name), subscriptions(plans(name))')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = statusFilter === 'all'
    ? invoices
    : invoices.filter((i: any) => i.status === statusFilter);

  const columns: Column<any>[] = [
    { key: 'companies', label: 'Empresa', render: (row) => (row.companies as any)?.name || '—', sortable: true },
    { key: 'plan', label: 'Plano', render: (row) => (row.subscriptions as any)?.plans?.name || '—' },
    { key: 'amount_cents', label: 'Valor', render: (row) => formatCurrency(row.amount_cents) },
    { key: 'status', label: 'Status', render: (row) => statusBadge(row.status) },
    { key: 'due_date', label: 'Vencimento', render: (row) => formatDate(row.due_date) },
    { key: 'paid_at', label: 'Pago em', render: (row) => formatDate(row.paid_at) },
    { key: 'gateway', label: 'Gateway', render: (row) => row.gateway || '—' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Faturas</h1>

      <div className="flex items-center gap-4 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        data={filtered}
        columns={columns}
        searchKey="companies"
        searchPlaceholder="Buscar por empresa..."
        loading={isLoading}
        emptyMessage="Nenhuma fatura"
        actions={(row) => (
          <button
            className="text-sm text-primary hover:underline"
            onClick={() => setSelectedInvoice(row)}
          >
            Detalhes
          </button>
        )}
      />

      <Dialog open={!!selectedInvoice} onOpenChange={() => setSelectedInvoice(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Detalhes da Fatura</DialogTitle>
            <DialogDescription>Informações completas da cobrança</DialogDescription>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Empresa</span>
                <span className="font-medium">{(selectedInvoice.companies as any)?.name || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Plano</span>
                <span className="font-medium">{(selectedInvoice.subscriptions as any)?.plans?.name || '—'}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Valor</span>
                <span className="font-medium">{formatCurrency(selectedInvoice.amount_cents)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                {statusBadge(selectedInvoice.status)}
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Vencimento</span>
                <span>{formatDate(selectedInvoice.due_date)}</span>
              </div>
              {selectedInvoice.period_start && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Período</span>
                  <span>{formatDate(selectedInvoice.period_start)} — {formatDate(selectedInvoice.period_end)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pago em</span>
                <span>{formatDate(selectedInvoice.paid_at)}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gateway</span>
                <span>{selectedInvoice.gateway || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Ref. externa</span>
                <span className="truncate max-w-[200px]">{selectedInvoice.gateway_reference || '—'}</span>
              </div>
              {selectedInvoice.notes && (
                <>
                  <Separator />
                  <div>
                    <span className="text-muted-foreground block mb-1">Observações</span>
                    <p className="text-foreground">{selectedInvoice.notes}</p>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

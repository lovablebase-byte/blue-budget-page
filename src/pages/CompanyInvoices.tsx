import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/contexts/CompanyContext';
import { DataTable, Column } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, Search } from 'lucide-react';

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'pending', label: 'Pendente' },
  { value: 'paid', label: 'Pago' },
  { value: 'overdue', label: 'Vencido' },
];

function statusBadge(status: string) {
  switch (status) {
    case 'paid': return <Badge className="bg-green-600 text-white">Pago</Badge>;
    case 'pending': return <Badge variant="secondary">Pendente</Badge>;
    case 'overdue': return <Badge variant="destructive">Vencido</Badge>;
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

export default function CompanyInvoices() {
  const { company } = useAuth();
  const { isSuspended } = useCompany();
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['company-invoices', company?.id],
    queryFn: async () => {
      if (!company?.id) return [];
      const { data, error } = await supabase
        .from('invoices')
        .select('*, subscriptions(plans(name))')
        .eq('company_id', company.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!company?.id,
  });

  const pendingCount = invoices.filter((i: any) => i.status === 'pending' || i.status === 'overdue').length;

  const filtered = invoices
    .filter((i: any) => statusFilter === 'all' || i.status === statusFilter)
    .filter((i: any) => {
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        formatCurrency(i.amount_cents).toLowerCase().includes(s) ||
        (i.gateway || '').toLowerCase().includes(s) ||
        (i.gateway_reference || '').toLowerCase().includes(s) ||
        (i.notes || '').toLowerCase().includes(s)
      );
    });

  const columns: Column<any>[] = [
    { key: 'amount_cents', label: 'Valor', render: (row) => formatCurrency(row.amount_cents) },
    { key: 'status', label: 'Status', render: (row) => statusBadge(row.status) },
    { key: 'due_date', label: 'Vencimento', render: (row) => formatDate(row.due_date) },
    { key: 'paid_at', label: 'Pago em', render: (row) => formatDate(row.paid_at) },
    { key: 'gateway', label: 'Gateway', render: (row) => row.gateway || '—' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Faturas</h1>

      {pendingCount > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Faturas pendentes</AlertTitle>
          <AlertDescription>
            Você possui {pendingCount} fatura(s) pendente(s) ou vencida(s). Regularize para evitar bloqueios.
          </AlertDescription>
        </Alert>
      )}

      {isSuspended && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Conta suspensa</AlertTitle>
          <AlertDescription>
            Sua conta está suspensa por inadimplência. Regularize as faturas pendentes.
          </AlertDescription>
        </Alert>
      )}

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
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por valor, gateway, referência..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <DataTable
        data={filtered}
        columns={columns}
        loading={isLoading}
        emptyMessage="Nenhuma fatura encontrada"
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
            <DialogDescription>Informações da cobrança</DialogDescription>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-3 text-sm">
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
                    <span className="text-muted-foreground">Observações</span>
                    <p className="mt-1">{selectedInvoice.notes}</p>
                  </div>
                </>
              )}
              {selectedInvoice.subscriptions?.plans?.name && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Plano</span>
                  <span>{selectedInvoice.subscriptions.plans.name}</span>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getActivePaymentGateway } from '@/lib/payment-gateway';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import {
  Plus, MoreHorizontal, Pencil, Eye, RefreshCw, Ban, XCircle, PlayCircle, Search,
  Users, TestTube, AlertTriangle, Clock, QrCode, Copy, Loader2,
} from 'lucide-react';

/* ── types ── */
interface SubRow {
  id: string;
  company_id: string;
  plan_id: string;
  status: string;
  started_at: string;
  expires_at: string | null;
  renewal_date: string | null;
  canceled_at: string | null;
  suspended_at: string | null;
  notes: string | null;
  gateway: string | null;
  gateway_reference: string | null;
  auto_renew: boolean;
  created_at: string;
  companies?: { name: string } | null;
  plans?: { name: string } | null;
  latest_paid_at?: string | null;
}

/* ── constants ── */
const STATUS_OPTIONS = ['active', 'trialing', 'past_due', 'canceled', 'suspended'] as const;

const STATUS_LABEL: Record<string, string> = {
  active: 'Ativa',
  trialing: 'Em teste',
  past_due: 'Vencida',
  canceled: 'Cancelada',
  suspended: 'Suspensa',
};

const STATUS_VARIANT: Record<string, string> = {
  active: 'bg-success/15 text-success border-success/30',
  trialing: 'bg-accent/15 text-accent border-accent/30',
  past_due: 'bg-warning/15 text-warning border-warning/30',
  canceled: 'bg-destructive/15 text-destructive border-destructive/30',
  suspended: 'bg-destructive/15 text-destructive border-destructive/30',
};

type QuickFilter = 'all' | 'active' | 'trialing' | 'expiring7' | 'past_due' | 'canceled' | 'suspended';

const QUICK_FILTERS: { key: QuickFilter; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'active', label: 'Ativas' },
  { key: 'trialing', label: 'Em teste' },
  { key: 'expiring7', label: 'Vencendo em 7 dias' },
  { key: 'past_due', label: 'Vencidas' },
  { key: 'canceled', label: 'Canceladas' },
  { key: 'suspended', label: 'Suspensas' },
];

const emptyForm = {
  company_id: '',
  plan_id: '',
  status: 'active',
  started_at: new Date().toISOString().slice(0, 10),
  expires_at: '',
  renewal_date: '',
  auto_renew: true,
  gateway: '',
  gateway_reference: '',
  notes: '',
};

const fmt = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('pt-BR') : '—';

const isExpiringSoon = (d: string | null) => {
  if (!d) return false;
  const diff = new Date(d).getTime() - Date.now();
  return diff > 0 && diff <= 7 * 86400000;
};

/* ── component ── */
export default function AdminSubscriptions() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<SubRow | null>(null);
  const [editing, setEditing] = useState<SubRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [planFilter, setPlanFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [pixRow, setPixRow] = useState<SubRow | null>(null);
  const [pixResult, setPixResult] = useState<any>(null);
  const [pixLoading, setPixLoading] = useState(false);

  /* ── queries ── */
  const { data: subs = [], isLoading } = useQuery({
    queryKey: ['admin-subscriptions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*, companies(name), plans(name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as SubRow[];
    },
  });

  // fetch latest paid invoice per subscription
  const { data: lastPayments = {} } = useQuery({
    queryKey: ['admin-sub-last-payments'],
    queryFn: async () => {
      const { data } = await supabase
        .from('invoices')
        .select('subscription_id, paid_at')
        .eq('status', 'paid')
        .order('paid_at', { ascending: false });
      const map: Record<string, string> = {};
      (data ?? []).forEach((inv: any) => {
        if (inv.subscription_id && !map[inv.subscription_id]) {
          map[inv.subscription_id] = inv.paid_at;
        }
      });
      return map;
    },
  });

  const { data: companies = [] } = useQuery({
    queryKey: ['admin-companies-list'],
    queryFn: async () => {
      const { data } = await supabase.from('companies').select('id, name').order('name');
      return data || [];
    },
  });

  const { data: plans = [] } = useQuery({
    queryKey: ['admin-plans-list'],
    queryFn: async () => {
      const { data } = await supabase.from('plans').select('id, name').eq('is_active', true).order('name');
      return data || [];
    },
  });

  /* ── filtering ── */
  const filtered = useMemo(() => {
    let list = subs;

    // search
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(
        (r) =>
          ((r.companies as any)?.name ?? '').toLowerCase().includes(s) ||
          ((r.plans as any)?.name ?? '').toLowerCase().includes(s),
      );
    }

    // plan filter
    if (planFilter !== 'all') {
      list = list.filter((r) => r.plan_id === planFilter);
    }

    // quick filter
    switch (quickFilter) {
      case 'active':
        list = list.filter((r) => r.status === 'active');
        break;
      case 'trialing':
        list = list.filter((r) => r.status === 'trialing');
        break;
      case 'past_due':
        list = list.filter((r) => r.status === 'past_due');
        break;
      case 'canceled':
        list = list.filter((r) => r.status === 'canceled');
        break;
      case 'suspended':
        list = list.filter((r) => r.status === 'suspended');
        break;
      case 'expiring7':
        list = list.filter((r) => isExpiringSoon(r.expires_at));
        break;
    }
    return list;
  }, [subs, search, quickFilter, planFilter]);

  /* ── stats ── */
  const stats = useMemo(() => {
    const active = subs.filter((s) => s.status === 'active').length;
    const trialing = subs.filter((s) => s.status === 'trialing').length;
    const expiring = subs.filter((s) => s.status === 'active' && isExpiringSoon(s.expires_at)).length;
    const past_due = subs.filter((s) => s.status === 'past_due').length;
    return { active, trialing, expiring, past_due };
  }, [subs]);

  /* ── mutations ── */
  const saveMutation = useMutation({
    mutationFn: async (values: typeof form & { id?: string }) => {
      const payload = {
        company_id: values.company_id,
        plan_id: values.plan_id,
        status: values.status,
        started_at: values.started_at,
        expires_at: values.expires_at || null,
        renewal_date: values.renewal_date || null,
        auto_renew: values.auto_renew,
        gateway: values.gateway || null,
        gateway_reference: values.gateway_reference || null,
        notes: values.notes || null,
        canceled_at: values.status === 'canceled' ? new Date().toISOString() : null,
        suspended_at: values.status === 'suspended' ? new Date().toISOString() : null,
      };
      if (values.id) {
        const { error } = await supabase.from('subscriptions').update(payload).eq('id', values.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('subscriptions').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-subscriptions'] });
      toast.success(editing ? 'Assinatura atualizada' : 'Assinatura criada');
      closeDialog();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const quickAction = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const extra: Record<string, any> = { status };
      if (status === 'canceled') extra.canceled_at = new Date().toISOString();
      if (status === 'suspended') extra.suspended_at = new Date().toISOString();
      if (status === 'active') {
        extra.canceled_at = null;
        extra.suspended_at = null;
      }
      const { error } = await supabase.from('subscriptions').update(extra).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-subscriptions'] });
      toast.success('Status atualizado');
    },
    onError: (e: any) => toast.error(e.message),
  });

  /* ── dialog helpers ── */
  const closeDialog = () => {
    setOpen(false);
    setEditing(null);
    setForm(emptyForm);
  };

  const openCreate = () => {
    setForm(emptyForm);
    setEditing(null);
    setOpen(true);
  };

  const openEdit = (row: SubRow) => {
    setEditing(row);
    setForm({
      company_id: row.company_id,
      plan_id: row.plan_id,
      status: row.status,
      started_at: row.started_at?.slice(0, 10) || '',
      expires_at: row.expires_at?.slice(0, 10) || '',
      renewal_date: row.renewal_date?.slice(0, 10) || '',
      auto_renew: row.auto_renew ?? true,
      gateway: row.gateway || '',
      gateway_reference: row.gateway_reference || '',
      notes: row.notes || '',
    });
    setOpen(true);
  };

  /* ── render ── */
  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Assinaturas</h1>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Assinatura
        </Button>
      </div>

      {/* summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard icon={Users} label="Ativas" value={stats.active} color="text-success" />
        <SummaryCard icon={TestTube} label="Em teste" value={stats.trialing} color="text-accent" />
        <SummaryCard icon={Clock} label="Vencendo em breve" value={stats.expiring} color="text-warning" />
        <SummaryCard icon={AlertTriangle} label="Vencidas" value={stats.past_due} color="text-destructive" />
      </div>

      {/* quick filters */}
      <div className="flex flex-wrap gap-2">
        {QUICK_FILTERS.map((f) => (
          <Button
            key={f.key}
            variant={quickFilter === f.key ? 'default' : 'secondary'}
            size="sm"
            onClick={() => setQuickFilter(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {/* search + plan filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar cliente ou plano..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={planFilter} onValueChange={setPlanFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filtrar por plano" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os planos</SelectItem>
            {plans.map((p: any) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Plano</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Início</TableHead>
              <TableHead>Próxima cobrança</TableHead>
              <TableHead>Renovação auto.</TableHead>
              <TableHead>Último pagamento</TableHead>
              <TableHead className="w-[80px]">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Carregando...</TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhuma assinatura encontrada</TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{(row.companies as any)?.name || '—'}</TableCell>
                  <TableCell>{(row.plans as any)?.name || '—'}</TableCell>
                  <TableCell>
                    <Badge className={STATUS_VARIANT[row.status] || ''}>
                      {STATUS_LABEL[row.status] || row.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{fmt(row.started_at)}</TableCell>
                  <TableCell>{fmt(row.expires_at)}</TableCell>
                  <TableCell>
                    <Badge variant={row.auto_renew ? 'success' : 'outline'}>
                      {row.auto_renew ? 'Sim' : 'Não'}
                    </Badge>
                  </TableCell>
                  <TableCell>{fmt(lastPayments[row.id])}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setDetailRow(row)}>
                          <Eye className="h-4 w-4 mr-2" />Ver detalhes
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEdit(row)}>
                          <Pencil className="h-4 w-4 mr-2" />Editar
                        </DropdownMenuItem>
                        {row.status !== 'active' && (
                          <DropdownMenuItem onClick={() => quickAction.mutate({ id: row.id, status: 'active' })}>
                            <PlayCircle className="h-4 w-4 mr-2" />Reativar
                          </DropdownMenuItem>
                        )}
                        {row.status === 'active' && (
                          <DropdownMenuItem onClick={() => quickAction.mutate({ id: row.id, status: 'suspended' })}>
                            <Ban className="h-4 w-4 mr-2" />Suspender
                          </DropdownMenuItem>
                        )}
                        {row.status !== 'canceled' && (
                          <DropdownMenuItem className="text-destructive" onClick={() => quickAction.mutate({ id: row.id, status: 'canceled' })}>
                            <XCircle className="h-4 w-4 mr-2" />Cancelar
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => { setPixRow(row); setPixResult(null); }}>
                          <QrCode className="h-4 w-4 mr-2" />Gerar Cobrança PIX
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-sm text-muted-foreground">{filtered.length} assinatura(s)</p>

      {/* detail dialog */}
      <Dialog open={!!detailRow} onOpenChange={(v) => { if (!v) setDetailRow(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Detalhes da Assinatura</DialogTitle></DialogHeader>
          {detailRow && (
            <div className="space-y-3 text-sm">
              <Row label="Cliente" value={(detailRow.companies as any)?.name} />
              <Row label="Plano" value={(detailRow.plans as any)?.name} />
              <Row label="Status" value={STATUS_LABEL[detailRow.status] || detailRow.status} />
              <Row label="Início" value={fmt(detailRow.started_at)} />
              <Row label="Próxima cobrança" value={fmt(detailRow.expires_at)} />
              <Row label="Renovação automática" value={detailRow.auto_renew ? 'Sim' : 'Não'} />
              <Row label="Data de renovação" value={fmt(detailRow.renewal_date)} />
              <Row label="Gateway" value={detailRow.gateway || '—'} />
              <Row label="ID externo" value={detailRow.gateway_reference || '—'} />
              <Row label="Último pagamento" value={fmt(lastPayments[detailRow.id])} />
              <Row label="Cancelada em" value={fmt(detailRow.canceled_at)} />
              <Row label="Suspensa em" value={fmt(detailRow.suspended_at)} />
              {detailRow.notes && <Row label="Observações internas" value={detailRow.notes} />}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailRow(null)}>Fechar</Button>
            <Button onClick={() => { if (detailRow) { openEdit(detailRow); setDetailRow(null); } }}>Editar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* create/edit dialog */}
      <Dialog open={open} onOpenChange={(v) => { if (!v) closeDialog(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Assinatura' : 'Nova Assinatura'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="Cliente">
              <Select value={form.company_id} onValueChange={(v) => setForm({ ...form, company_id: v })} disabled={!!editing}>
                <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                <SelectContent>
                  {companies.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Plano">
              <Select value={form.plan_id} onValueChange={(v) => setForm({ ...form, plan_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione o plano" /></SelectTrigger>
                <SelectContent>
                  {plans.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Data de início">
                <Input type="date" value={form.started_at} onChange={(e) => setForm({ ...form, started_at: e.target.value })} />
              </Field>
              <Field label="Próxima cobrança">
                <Input type="date" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} />
              </Field>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border px-4 py-3">
              <Label>Renovação automática</Label>
              <Switch checked={form.auto_renew} onCheckedChange={(v) => setForm({ ...form, auto_renew: v })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Gateway">
                <Input value={form.gateway} onChange={(e) => setForm({ ...form, gateway: e.target.value })} placeholder="amplopay" disabled />
              </Field>
              <Field label="ID externo da assinatura">
                <Input value={form.gateway_reference} onChange={(e) => setForm({ ...form, gateway_reference: e.target.value })} placeholder="sub_xxx" />
              </Field>
            </div>
            <Field label="Observações internas">
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} placeholder="Anotações visíveis apenas para o admin" />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
            <Button
              onClick={() => saveMutation.mutate(editing ? { ...form, id: editing.id } : form)}
              disabled={!form.company_id || !form.plan_id || saveMutation.isPending}
            >
              {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PIX charge dialog */}
      <Dialog open={!!pixRow} onOpenChange={(v) => { if (!v) { setPixRow(null); setPixResult(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Cobrança PIX — Amplo Pay</DialogTitle></DialogHeader>
          {pixRow && !pixResult && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Gerar cobrança PIX para <strong>{(pixRow.companies as any)?.name || 'Cliente'}</strong> — plano <strong>{(pixRow.plans as any)?.name || '—'}</strong>
              </p>
              <Button
                className="w-full"
                disabled={pixLoading}
                onClick={async () => {
                  setPixLoading(true);
                  try {
                    const SUPABASE_PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
                    const session = await supabase.auth.getSession();
                    const token = session.data?.session?.access_token;
                    // Get plan price
                    const { data: plan } = await supabase.from('plans').select('price_cents, name').eq('id', pixRow.plan_id).single();
                    const resp = await fetch(
                      `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/amplopay-proxy?action=create-charge`,
                      {
                        method: 'POST',
                        headers: {
                          Authorization: `Bearer ${token}`,
                          'Content-Type': 'application/json',
                          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                        },
                        body: JSON.stringify({
                          subscription_id: pixRow.id,
                          company_id: pixRow.company_id,
                          amount_cents: plan?.price_cents || 0,
                          description: `Assinatura ${plan?.name || ''}`,
                        }),
                      }
                    );
                    const result = await resp.json();
                    if (result.ok) {
                      setPixResult(result);
                      toast.success('Cobrança PIX gerada!');
                    } else {
                      toast.error(result.error || 'Erro ao gerar cobrança');
                    }
                  } catch (err: any) {
                    toast.error(err.message);
                  } finally {
                    setPixLoading(false);
                  }
                }}
              >
                {pixLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <QrCode className="h-4 w-4 mr-2" />}
                Gerar Cobrança PIX
              </Button>
            </div>
          )}
          {pixResult && (
            <div className="space-y-4">
              <div className="text-center">
                <Badge variant="default" className="mb-3">Cobrança gerada</Badge>
                {pixResult.qr_code && (
                  <div className="flex justify-center mb-4">
                    <img src={pixResult.qr_code} alt="QR Code PIX" className="w-48 h-48 border rounded-lg" />
                  </div>
                )}
              </div>
              {pixResult.pix_copy_paste && (
                <div className="space-y-2">
                  <Label>Código Copia e Cola</Label>
                  <div className="flex gap-2">
                    <Input value={pixResult.pix_copy_paste} readOnly className="font-mono text-xs" />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        navigator.clipboard.writeText(pixResult.pix_copy_paste);
                        toast.success('Código copiado!');
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground text-center">
                ID externo: {pixResult.external_id || '—'} • Status: {pixResult.status === 'paid' ? 'Pago ✓' : pixResult.status === 'pending' ? 'Aguardando pagamento' : pixResult.status}
              </p>
              {/* Fallback: consultar status (PDF seção 5.3) */}
              {pixResult.charge_id && pixResult.status !== 'paid' && (
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={pixLoading}
                  onClick={async () => {
                    setPixLoading(true);
                    try {
                      const SUPABASE_PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
                      const session = await supabase.auth.getSession();
                      const token = session.data?.session?.access_token;
                      const resp = await fetch(
                        `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/amplopay-proxy?action=query-charge&charge_id=${pixResult.charge_id}`,
                        {
                          method: 'POST',
                          headers: {
                            Authorization: `Bearer ${token}`,
                            'Content-Type': 'application/json',
                            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                          },
                        }
                      );
                      const result = await resp.json();
                      if (result.ok) {
                        setPixResult({ ...pixResult, status: result.status, paid_at: result.paid_at });
                        if (result.status === 'paid') {
                          toast.success('Pagamento confirmado!');
                          qc.invalidateQueries({ queryKey: ['admin-subscriptions'] });
                        } else {
                          toast.info(`Status atual: ${result.status}`);
                        }
                      }
                    } catch (err: any) {
                      toast.error(err.message);
                    } finally {
                      setPixLoading(false);
                    }
                  }}
                >
                  {pixLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  Consultar Status do Pagamento
                </Button>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPixRow(null); setPixResult(null); }}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── small helpers ── */
function SummaryCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div className={`rounded-lg bg-muted p-2.5 ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between border-b border-border/40 pb-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value || '—'}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DataTable, Column } from '@/components/DataTable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Plus, Pencil } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';

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
  created_at: string;
  companies?: { name: string } | null;
  plans?: { name: string } | null;
}

const STATUS_OPTIONS = ['active', 'trialing', 'past_due', 'canceled', 'suspended'];
const statusColor: Record<string, string> = {
  active: 'bg-green-500/10 text-green-700',
  trialing: 'bg-blue-500/10 text-blue-700',
  past_due: 'bg-yellow-500/10 text-yellow-700',
  canceled: 'bg-destructive/10 text-destructive',
  suspended: 'bg-orange-500/10 text-orange-700',
};

const emptyForm = {
  company_id: '',
  plan_id: '',
  status: 'active',
  started_at: new Date().toISOString().slice(0, 10),
  expires_at: '',
  renewal_date: '',
  notes: '',
};

export default function AdminSubscriptions() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SubRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [statusFilter, setStatusFilter] = useState('all');

  const { data: subs = [], isLoading } = useQuery({
    queryKey: ['admin-subscriptions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*, companies(name), plans(name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as SubRow[];
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

  const saveMutation = useMutation({
    mutationFn: async (values: typeof form & { id?: string }) => {
      const payload: any = {
        company_id: values.company_id,
        plan_id: values.plan_id,
        status: values.status,
        started_at: values.started_at,
        expires_at: values.expires_at || null,
        renewal_date: values.renewal_date || null,
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

  const closeDialog = () => { setOpen(false); setEditing(null); setForm(emptyForm); };

  const openCreate = () => { setForm(emptyForm); setEditing(null); setOpen(true); };

  const openEdit = (row: SubRow) => {
    setEditing(row);
    setForm({
      company_id: row.company_id,
      plan_id: row.plan_id,
      status: row.status,
      started_at: row.started_at?.slice(0, 10) || '',
      expires_at: row.expires_at?.slice(0, 10) || '',
      renewal_date: row.renewal_date?.slice(0, 10) || '',
      notes: row.notes || '',
    });
    setOpen(true);
  };

  const filtered = statusFilter === 'all' ? subs : subs.filter(s => s.status === statusFilter);

  const columns: Column<SubRow>[] = [
    { key: 'company', label: 'Empresa', render: (r) => (r.companies as any)?.name || '—' },
    { key: 'plan', label: 'Plano', render: (r) => (r.plans as any)?.name || '—' },
    {
      key: 'status', label: 'Status', render: (r) => (
        <Badge className={statusColor[r.status] || ''}>{r.status}</Badge>
      ),
    },
    { key: 'started_at', label: 'Início', render: (r) => new Date(r.started_at).toLocaleDateString('pt-BR') },
    { key: 'expires_at', label: 'Vencimento', render: (r) => r.expires_at ? new Date(r.expires_at).toLocaleDateString('pt-BR') : '—' },
    { key: 'renewal_date', label: 'Renovação', render: (r) => r.renewal_date ? new Date(r.renewal_date).toLocaleDateString('pt-BR') : '—' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Assinaturas</h1>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Nova Assinatura</Button>
      </div>

      <div className="flex gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Filtrar status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        data={filtered}
        columns={columns}
        searchKey="company"
        searchPlaceholder="Buscar empresa..."
        loading={isLoading}
        emptyMessage="Nenhuma assinatura"
        actions={(row) => (
          <Button variant="ghost" size="icon" onClick={() => openEdit(row)}>
            <Pencil className="h-4 w-4" />
          </Button>
        )}
      />

      <Dialog open={open} onOpenChange={(v) => { if (!v) closeDialog(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Assinatura' : 'Nova Assinatura'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Empresa</Label>
              <Select value={form.company_id} onValueChange={(v) => setForm({ ...form, company_id: v })} disabled={!!editing}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {companies.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Plano</Label>
              <Select value={form.plan_id} onValueChange={(v) => setForm({ ...form, plan_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {plans.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Data de início</Label>
                <Input type="date" value={form.started_at} onChange={(e) => setForm({ ...form, started_at: e.target.value })} />
              </div>
              <div>
                <Label>Vencimento</Label>
                <Input type="date" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Data de renovação</Label>
              <Input type="date" value={form.renewal_date} onChange={(e) => setForm({ ...form, renewal_date: e.target.value })} />
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
            </div>
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
    </div>
  );
}

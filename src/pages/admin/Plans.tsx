import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DataTable, Column } from '@/components/DataTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Plus, Trash2, CreditCard, Package, Users } from 'lucide-react';

const CYCLES: { value: string; label: string }[] = [
  { value: 'monthly', label: 'Mensal' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'semiannual', label: 'Semestral' },
  { value: 'yearly', label: 'Anual' },
];

const SUPPORT_LEVELS = [
  { value: 'standard', label: 'Padrão' },
  { value: 'priority', label: 'Prioritário' },
  { value: 'premium', label: 'Premium' },
];

const defaultForm = {
  name: '', description: '', price_cents: 0, billing_cycle: 'monthly',
  display_order: 0, notes: '',
  max_instances: 1, max_messages_month: 1000, max_messages_day: 500,
  max_users: 3, max_campaigns: 5, max_ai_agents: 1,
  max_chatbots: 3, max_workflows: 3, max_contacts: 1000,
  campaigns_enabled: false, workflows_enabled: false, ai_agents_enabled: false,
  api_access: false, whitelabel_enabled: false, support_priority: 'standard',
  is_active: true,
};

type PlanForm = typeof defaultForm;

export default function AdminPlans() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<PlanForm>({ ...defaultForm });

  // Providers per plan
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ['admin-plans'],
    queryFn: async () => {
      const { data, error } = await supabase.from('plans').select('*').order('display_order', { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: planProviders = [] } = useQuery({
    queryKey: ['plan-providers'],
    queryFn: async () => {
      const { data } = await supabase.from('plan_allowed_providers').select('*');
      return data || [];
    },
  });

  const { data: subscriptionCounts = {} } = useQuery({
    queryKey: ['plan-sub-counts'],
    queryFn: async () => {
      const { data } = await supabase.from('subscriptions').select('plan_id, status');
      const counts: Record<string, number> = {};
      (data || []).forEach((s: any) => {
        if (s.status === 'active' || s.status === 'trialing') {
          counts[s.plan_id] = (counts[s.plan_id] || 0) + 1;
        }
      });
      return counts;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { notes, ...rest } = form;
      const payload: any = {
        ...rest,
        description: rest.description || null,
        notes: notes || null,
      };

      let planId = editId;
      if (editId) {
        const { error } = await supabase.from('plans').update(payload).eq('id', editId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('plans').insert(payload).select('id').single();
        if (error) throw error;
        planId = data.id;
      }

      // Sync providers
      if (planId) {
        await supabase.from('plan_allowed_providers').delete().eq('plan_id', planId);
        if (selectedProviders.length > 0) {
          const rows = selectedProviders.map(p => ({ plan_id: planId!, provider: p }));
          await supabase.from('plan_allowed_providers').insert(rows);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-plans'] });
      queryClient.invalidateQueries({ queryKey: ['plan-providers'] });
      resetForm();
      toast({ title: editId ? 'Plano atualizado' : 'Plano criado' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('plan_allowed_providers').delete().eq('plan_id', id);
      const { error } = await supabase.from('plans').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-plans'] });
      toast({ title: 'Plano excluído' });
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('plans').update({ is_active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-plans'] }),
  });

  const resetForm = () => {
    setOpen(false); setEditId(null);
    setForm({ ...defaultForm });
    setSelectedProviders([]);
  };

  const openEdit = (p: any) => {
    setEditId(p.id);
    setForm({
      name: p.name, description: p.description || '', price_cents: p.price_cents,
      billing_cycle: p.billing_cycle || 'monthly', display_order: p.display_order ?? 0,
      notes: p.notes || '',
      max_instances: p.max_instances, max_messages_month: p.max_messages_month,
      max_messages_day: p.max_messages_day ?? 500, max_users: p.max_users,
      max_campaigns: p.max_campaigns ?? 5, max_ai_agents: p.max_ai_agents ?? 1,
      max_chatbots: p.max_chatbots ?? 3, max_workflows: p.max_workflows ?? 3,
      max_contacts: p.max_contacts ?? 1000,
      campaigns_enabled: p.campaigns_enabled, workflows_enabled: p.workflows_enabled,
      ai_agents_enabled: p.ai_agents_enabled, api_access: p.api_access ?? false,
      whitelabel_enabled: p.whitelabel_enabled ?? false,
      support_priority: p.support_priority ?? 'standard', is_active: p.is_active,
    });
    setSelectedProviders(
      planProviders.filter((pp: any) => pp.plan_id === p.id).map((pp: any) => pp.provider)
    );
    setOpen(true);
  };

  const set = (key: keyof PlanForm, val: any) => setForm(f => ({ ...f, [key]: val }));

  const cycleLabel = (c: string) => CYCLES.find(x => x.value === c)?.label || c;
  const supportLabel = (s: string) => SUPPORT_LEVELS.find(x => x.value === s)?.label || s;

  const activePlans = plans.filter((p: any) => p.is_active).length;
  const totalSubs = Object.values(subscriptionCounts).reduce((a: number, b: any) => a + (b as number), 0);

  const columns: Column<any>[] = [
    { key: 'display_order', label: '#', render: (row) => row.display_order },
    { key: 'name', label: 'Nome', sortable: true },
    { key: 'price_cents', label: 'Preço', render: (row) => `R$ ${(row.price_cents / 100).toFixed(2)}` },
    { key: 'billing_cycle', label: 'Ciclo', render: (row) => <Badge variant="outline">{cycleLabel(row.billing_cycle || 'monthly')}</Badge> },
    { key: 'max_instances', label: 'Inst.' },
    { key: 'max_users', label: 'Usr.' },
    {
      key: 'features', label: 'Recursos',
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.campaigns_enabled && <Badge variant="secondary" className="text-[10px]">Camp</Badge>}
          {row.workflows_enabled && <Badge variant="secondary" className="text-[10px]">WF</Badge>}
          {row.ai_agents_enabled && <Badge variant="secondary" className="text-[10px]">IA</Badge>}
          {row.api_access && <Badge variant="secondary" className="text-[10px]">API</Badge>}
          {row.whitelabel_enabled && <Badge variant="secondary" className="text-[10px]">WL</Badge>}
        </div>
      ),
    },
    {
      key: 'subs', label: 'Assinaturas',
      render: (row) => <Badge variant="outline">{(subscriptionCounts as any)[row.id] || 0}</Badge>,
    },
    {
      key: 'is_active', label: 'Ativo',
      render: (row) => <Switch checked={row.is_active} onCheckedChange={(v) => toggleActive.mutate({ id: row.id, is_active: v })} />,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Planos</h1>
          <p className="text-muted-foreground">Gerencie planos, limites e recursos disponíveis</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); else setOpen(true); }}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> Novo Plano</Button></DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editId ? 'Editar Plano' : 'Novo Plano'}</DialogTitle></DialogHeader>
            <Tabs defaultValue="general">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="general">Geral</TabsTrigger>
                <TabsTrigger value="limits">Limites</TabsTrigger>
                <TabsTrigger value="features">Recursos</TabsTrigger>
                <TabsTrigger value="providers">Providers</TabsTrigger>
              </TabsList>

              <TabsContent value="general" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Nome</Label><Input value={form.name} onChange={e => set('name', e.target.value)} /></div>
                  <div><Label>Preço (centavos)</Label><Input type="number" value={form.price_cents} onChange={e => set('price_cents', Number(e.target.value))} /></div>
                </div>
                <div><Label>Descrição</Label><Input value={form.description} onChange={e => set('description', e.target.value)} /></div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>Ciclo de cobrança</Label>
                    <Select value={form.billing_cycle} onValueChange={v => set('billing_cycle', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CYCLES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Nível de Suporte</Label>
                    <Select value={form.support_priority} onValueChange={v => set('support_priority', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SUPPORT_LEVELS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Ordem de exibição</Label><Input type="number" value={form.display_order} onChange={e => set('display_order', Number(e.target.value))} /></div>
                </div>
                <div>
                  <Label>Notas internas</Label>
                  <Textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Observações visíveis apenas para o admin..." />
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.is_active} onCheckedChange={v => set('is_active', v)} />
                  <Label>Plano ativo</Label>
                </div>
              </TabsContent>

              <TabsContent value="limits" className="space-y-4 mt-4">
                <p className="text-sm text-muted-foreground">Defina os limites quantitativos do plano. Estes limites podem ser sobrescritos por empresa via overrides.</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div><Label>Max Instâncias</Label><Input type="number" min={0} value={form.max_instances} onChange={e => set('max_instances', Number(e.target.value))} /></div>
                  <div><Label>Max Usuários</Label><Input type="number" min={0} value={form.max_users} onChange={e => set('max_users', Number(e.target.value))} /></div>
                  <div><Label>Max Campanhas</Label><Input type="number" min={0} value={form.max_campaigns} onChange={e => set('max_campaigns', Number(e.target.value))} /></div>
                  <div><Label>Msgs/mês</Label><Input type="number" min={0} value={form.max_messages_month} onChange={e => set('max_messages_month', Number(e.target.value))} /></div>
                  <div><Label>Msgs/dia</Label><Input type="number" min={0} value={form.max_messages_day} onChange={e => set('max_messages_day', Number(e.target.value))} /></div>
                  <div><Label>Max Agentes IA</Label><Input type="number" min={0} value={form.max_ai_agents} onChange={e => set('max_ai_agents', Number(e.target.value))} /></div>
                  <div><Label>Max Chatbots</Label><Input type="number" min={0} value={form.max_chatbots} onChange={e => set('max_chatbots', Number(e.target.value))} /></div>
                  <div><Label>Max Workflows</Label><Input type="number" min={0} value={form.max_workflows} onChange={e => set('max_workflows', Number(e.target.value))} /></div>
                  <div><Label>Max Contatos</Label><Input type="number" min={0} value={form.max_contacts} onChange={e => set('max_contacts', Number(e.target.value))} /></div>
                </div>
              </TabsContent>

              <TabsContent value="features" className="space-y-4 mt-4">
                <p className="text-sm text-muted-foreground">Módulos e funcionalidades habilitados neste plano.</p>
                <div className="space-y-3">
                  {[
                    { key: 'campaigns_enabled' as const, label: 'Campanhas', desc: 'Disparo em massa de mensagens' },
                    { key: 'workflows_enabled' as const, label: 'Workflows', desc: 'Construtor visual de fluxos' },
                    { key: 'ai_agents_enabled' as const, label: 'Agentes IA', desc: 'Agentes inteligentes com IA' },
                    { key: 'api_access' as const, label: 'Acesso API', desc: 'API externa para integrações' },
                    { key: 'whitelabel_enabled' as const, label: 'White Label', desc: 'Marca personalizada do cliente' },
                  ].map(feat => (
                    <div key={feat.key} className="flex items-center justify-between border rounded-md p-3">
                      <div><p className="text-sm font-medium">{feat.label}</p><p className="text-xs text-muted-foreground">{feat.desc}</p></div>
                      <Switch checked={form[feat.key] as boolean} onCheckedChange={v => set(feat.key, v)} />
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="providers" className="space-y-4 mt-4">
                <p className="text-sm text-muted-foreground">Selecione os providers de WhatsApp permitidos para este plano. Se nenhum for selecionado, todos serão permitidos.</p>
                <div className="space-y-3">
                  {['evolution', 'wuzapi'].map(provider => (
                    <label key={provider} className="flex items-center gap-3 border rounded-md p-3 cursor-pointer">
                      <Checkbox
                        checked={selectedProviders.includes(provider)}
                        onCheckedChange={(checked) => {
                          setSelectedProviders(prev =>
                            checked ? [...prev, provider] : prev.filter(p => p !== provider)
                          );
                        }}
                      />
                      <div>
                        <p className="text-sm font-medium capitalize">{provider === 'evolution' ? 'Evolution API' : 'WuzAPI'}</p>
                        <p className="text-xs text-muted-foreground">{provider === 'evolution' ? 'API completa com suporte a v1 e v2' : 'API leve e direta'}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </TabsContent>
            </Tabs>

            <Button onClick={() => saveMutation.mutate()} disabled={!form.name || saveMutation.isPending} className="w-full mt-4">
              {editId ? 'Salvar Alterações' : 'Criar Plano'}
            </Button>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><CreditCard className="h-6 w-6 text-primary" /></div>
              <div><p className="text-2xl font-bold tracking-tight">{plans.length}</p><p className="text-sm text-muted-foreground">Total de Planos</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-success/10"><Package className="h-6 w-6 text-success" /></div>
              <div><p className="text-2xl font-bold tracking-tight text-success">{activePlans}</p><p className="text-sm text-muted-foreground">Ativos</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-accent/10"><Users className="h-6 w-6 text-accent" /></div>
              <div><p className="text-2xl font-bold tracking-tight">{totalSubs}</p><p className="text-sm text-muted-foreground">Assinaturas Ativas</p></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <DataTable data={plans} columns={columns} searchKey="name" searchPlaceholder="Buscar plano..." loading={isLoading} emptyMessage="Nenhum plano cadastrado"
        actions={(row) => (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>Editar</Button>
            <ConfirmDialog title="Excluir plano?" description="Assinaturas vinculadas podem ser afetadas." onConfirm={() => deleteMutation.mutate(row.id)}
              trigger={<Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>} />
          </div>
        )}
      />
    </div>
  );
}

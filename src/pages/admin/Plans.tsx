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
import { Plus, Trash2, CreditCard, Package, Users, Star, Copy } from 'lucide-react';

const CYCLES = [
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

const ALL_FEATURES = [
  { key: 'instances_enabled', label: 'Instâncias', desc: 'Gerenciar conexões WhatsApp' },
  { key: 'campaigns_enabled', label: 'Campanhas', desc: 'Disparo em massa de mensagens' },
  { key: 'ai_agents_enabled', label: 'Agentes IA', desc: 'Agentes inteligentes com IA' },
  { key: 'invoices_enabled', label: 'Faturas', desc: 'Visualização de faturas e cobranças' },
  { key: 'branding_enabled', label: 'Branding', desc: 'Personalização de marca e visual' },
  { key: 'api_access', label: 'Acesso API', desc: 'API externa para integrações' },
  { key: 'whitelabel_enabled', label: 'White Label', desc: 'Marca personalizada do cliente' },
  { key: 'advanced_logs_enabled', label: 'Logs Avançados', desc: 'Logs detalhados de operações' },
  { key: 'advanced_webhooks_enabled', label: 'Webhooks Avançados', desc: 'Webhooks com filtros avançados' },
] as const;

type FeatureKey = typeof ALL_FEATURES[number]['key'];

const defaultForm = {
  name: '', slug: '', description: '', price_cents: 0, billing_cycle: 'monthly',
  display_order: 0, notes: '', is_popular: false,
  max_instances: 1, max_messages_month: 1000, max_messages_day: 500,
  max_users: 3, max_campaigns: 5, max_ai_agents: 1,
  max_contacts: 1000,
  // Active feature toggles
  instances_enabled: true,
  campaigns_enabled: false, ai_agents_enabled: false,
  invoices_enabled: true, branding_enabled: false,
  api_access: false, whitelabel_enabled: false,
  advanced_logs_enabled: false, advanced_webhooks_enabled: false,
  support_priority: 'standard', is_active: true,
};

type PlanForm = typeof defaultForm;

export default function AdminPlans() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<PlanForm>({ ...defaultForm });
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
        slug: rest.slug || rest.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
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

  const duplicatePlan = (p: any) => {
    setEditId(null);
    const f: any = { ...defaultForm };
    for (const key of Object.keys(defaultForm)) {
      if (p[key] !== undefined && p[key] !== null) f[key] = p[key];
    }
    f.name = `${p.name} (cópia)`;
    f.slug = '';
    setForm(f);
    setSelectedProviders(
      planProviders.filter((pp: any) => pp.plan_id === p.id).map((pp: any) => pp.provider)
    );
    setOpen(true);
  };

  const openEdit = (p: any) => {
    setEditId(p.id);
    const f: any = { ...defaultForm };
    for (const key of Object.keys(defaultForm)) {
      if (p[key] !== undefined && p[key] !== null) f[key] = p[key];
    }
    setForm(f);
    setSelectedProviders(
      planProviders.filter((pp: any) => pp.plan_id === p.id).map((pp: any) => pp.provider)
    );
    setOpen(true);
  };

  const set = (key: keyof PlanForm, val: any) => setForm(f => ({ ...f, [key]: val }));

  const cycleLabel = (c: string) => CYCLES.find(x => x.value === c)?.label || c;

  const activePlans = plans.filter((p: any) => p.is_active).length;
  const totalSubs = Object.values(subscriptionCounts).reduce((a: number, b: any) => a + (b as number), 0);

  const enabledFeaturesCount = (row: any) => ALL_FEATURES.filter(f => row[f.key]).length;

  const columns: Column<any>[] = [
    { key: 'display_order', label: '#', render: (row) => row.display_order },
    {
      key: 'name', label: 'Nome', sortable: true,
      render: (row) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{row.name}</span>
          {row.is_popular && <Star className="h-3.5 w-3.5 text-warning fill-warning" />}
        </div>
      ),
    },
    { key: 'slug', label: 'Slug', render: (row) => <span className="text-xs text-muted-foreground font-mono">{row.slug || '—'}</span> },
    { key: 'price_cents', label: 'Preço', render: (row) => `R$ ${(row.price_cents / 100).toFixed(2)}` },
    { key: 'billing_cycle', label: 'Ciclo', render: (row) => <Badge variant="outline">{cycleLabel(row.billing_cycle || 'monthly')}</Badge> },
    {
      key: 'features', label: 'Recursos',
      render: (row) => {
        const count = enabledFeaturesCount(row);
        return (
          <Badge variant="secondary" className="text-[10px]">
            {count}/{ALL_FEATURES.length}
          </Badge>
        );
      },
    },
    {
      key: 'providers', label: 'Providers',
      render: (row) => {
        const pp = planProviders.filter((p: any) => p.plan_id === row.id);
        if (pp.length === 0) return <span className="text-xs text-muted-foreground">Todos</span>;
        return (
          <div className="flex gap-1">
            {pp.map((p: any) => (
              <Badge key={p.id} variant="outline" className="text-[10px] capitalize">{p.provider}</Badge>
            ))}
          </div>
        );
      },
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
          <p className="text-muted-foreground">Gerencie planos, limites, recursos e providers</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); else setOpen(true); }}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> Novo Plano</Button></DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editId ? 'Editar Plano' : 'Novo Plano'}</DialogTitle></DialogHeader>
            <Tabs defaultValue="general">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="general" className="data-[state=active]:text-[#00F5FF] data-[state=active]:bg-[#00F5FF]/10">Ciclo</TabsTrigger>
                <TabsTrigger value="features" className="data-[state=active]:text-[#24FF91] data-[state=active]:bg-[#24FF91]/10">Recursos</TabsTrigger>
                <TabsTrigger value="limits" className="data-[state=active]:text-[#FFD600] data-[state=active]:bg-[#FFD600]/10">Limites</TabsTrigger>
                <TabsTrigger value="providers" className="data-[state=active]:text-[#FF2D92] data-[state=active]:bg-[#FF2D92]/10">Providers</TabsTrigger>
                <TabsTrigger value="notes" className="data-[state=active]:text-[#BF7AFF] data-[state=active]:bg-[#BF7AFF]/10">Notas</TabsTrigger>
              </TabsList>

              <TabsContent value="general" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Nome</Label><Input value={form.name} onChange={e => set('name', e.target.value)} /></div>
                  <div><Label>Slug interno</Label><Input value={form.slug} onChange={e => set('slug', e.target.value)} placeholder="auto-gerado se vazio" className="font-mono text-sm" /></div>
                </div>
                <div><Label>Descrição</Label><Input value={form.description} onChange={e => set('description', e.target.value)} /></div>
                <div className="grid grid-cols-3 gap-4">
                  <div><Label>Preço (centavos)</Label><Input type="number" value={form.price_cents} onChange={e => set('price_cents', Number(e.target.value))} /></div>
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
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Ordem de exibição</Label><Input type="number" value={form.display_order} onChange={e => set('display_order', Number(e.target.value))} /></div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch checked={form.is_active} onCheckedChange={v => set('is_active', v)} />
                    <Label>Plano ativo</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={form.is_popular} onCheckedChange={v => set('is_popular', v)} />
                    <Label className="flex items-center gap-1"><Star className="h-3.5 w-3.5 text-warning" /> Destaque / Popular</Label>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="features" className="space-y-4 mt-4">
                <p className="text-sm text-muted-foreground">Módulos e funcionalidades habilitados neste plano.</p>
                <div className="space-y-2">
                  {ALL_FEATURES.map(feat => (
                    <div key={feat.key} className="flex items-center justify-between border border-border/30 rounded-md p-3 bg-muted/10">
                      <div>
                        <p className="text-sm font-medium">{feat.label}</p>
                        <p className="text-xs text-muted-foreground">{feat.desc}</p>
                      </div>
                      <Switch
                        checked={form[feat.key] as boolean}
                        onCheckedChange={v => set(feat.key as keyof PlanForm, v)}
                      />
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="limits" className="space-y-4 mt-4">
                <p className="text-sm text-muted-foreground">Limites quantitativos do plano. Podem ser sobrescritos por empresa via overrides.</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div><Label>Max Instâncias</Label><Input type="number" min={0} value={form.max_instances} onChange={e => set('max_instances', Number(e.target.value))} /></div>
                  <div><Label>Max Usuários</Label><Input type="number" min={0} value={form.max_users} onChange={e => set('max_users', Number(e.target.value))} /></div>
                  <div><Label>Max Campanhas</Label><Input type="number" min={0} value={form.max_campaigns} onChange={e => set('max_campaigns', Number(e.target.value))} /></div>
                  <div><Label>Msgs/mês</Label><Input type="number" min={0} value={form.max_messages_month} onChange={e => set('max_messages_month', Number(e.target.value))} /></div>
                  <div><Label>Msgs/dia</Label><Input type="number" min={0} value={form.max_messages_day} onChange={e => set('max_messages_day', Number(e.target.value))} /></div>
                  <div><Label>Max Agentes IA</Label><Input type="number" min={0} value={form.max_ai_agents} onChange={e => set('max_ai_agents', Number(e.target.value))} /></div>
                  <div><Label>Max Contatos</Label><Input type="number" min={0} value={form.max_contacts} onChange={e => set('max_contacts', Number(e.target.value))} /></div>
                </div>
              </TabsContent>

              <TabsContent value="providers" className="space-y-4 mt-4">
                <p className="text-sm text-muted-foreground">Selecione os providers de WhatsApp permitidos. Se nenhum for selecionado, todos serão permitidos.</p>
                <div className="space-y-3">
                  {['evolution', 'evolution_go', 'wuzapi'].map(provider => (
                    <label key={provider} className="flex items-center gap-3 border border-border/30 rounded-md p-3 cursor-pointer bg-muted/10 hover:bg-muted/20 transition-colors">
                      <Checkbox
                        checked={selectedProviders.includes(provider)}
                        onCheckedChange={(checked) => {
                          setSelectedProviders(prev =>
                            checked ? [...prev, provider] : prev.filter(p => p !== provider)
                          );
                        }}
                      />
                      <div>
                        <p className="text-sm font-medium capitalize">
                          {provider === 'evolution' ? 'Evolution API' : provider === 'evolution_go' ? 'Evolution Go (v2)' : 'WuzAPI'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {provider === 'evolution' ? 'API v1 (Node.js)' : provider === 'evolution_go' ? 'API v2 escrita em Go — alta performance' : 'API leve e direta'}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="notes" className="space-y-4 mt-4">
                <p className="text-sm text-muted-foreground">Observações internas sobre este plano (visíveis apenas para administradores).</p>
                <Textarea rows={5} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Observações internas..." />
              </TabsContent>
            </Tabs>

            <Button onClick={() => saveMutation.mutate()} disabled={!form.name || saveMutation.isPending} className="w-full mt-4">
              {saveMutation.isPending ? 'Salvando...' : editId ? 'Salvar Alterações' : 'Criar Plano'}
            </Button>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card/40 backdrop-blur-sm border-white/5 transition-all duration-300 hover:shadow-lg hover:shadow-[var(--icon-shadow)]/10">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="icon-premium metric-blue rounded-md p-2"><CreditCard className="h-6 w-6" /></div>
              <div>
                <p className="text-2xl font-black metric-blue filter drop-shadow-[0_0_8px_var(--icon-shadow)]">{plans.length}</p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-70">Total de Planos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/40 backdrop-blur-sm border-white/5 transition-all duration-300 hover:shadow-lg hover:shadow-[var(--icon-shadow)]/10">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="icon-premium metric-pink rounded-md p-2"><Package className="h-6 w-6" /></div>
              <div>
                <p className="text-2xl font-black metric-pink filter drop-shadow-[0_0_8px_var(--icon-shadow)]">{activePlans}</p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-70">Ativos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/40 backdrop-blur-sm border-white/5 transition-all duration-300 hover:shadow-lg hover:shadow-[var(--icon-shadow)]/10">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="icon-premium metric-pink rounded-md p-2"><Users className="h-6 w-6" /></div>
              <div>
                <p className="text-2xl font-black metric-pink filter drop-shadow-[0_0_8px_var(--icon-shadow)]">{totalSubs}</p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-70">Assinaturas Ativas</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <DataTable data={plans} columns={columns} searchKey="name" searchPlaceholder="Buscar plano..." loading={isLoading} emptyMessage="Nenhum plano cadastrado"
        actions={(row) => (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>Editar</Button>
            <Button variant="ghost" size="sm" onClick={() => duplicatePlan(row)} title="Duplicar plano">
              <Copy className="h-4 w-4" />
            </Button>
            <ConfirmDialog title="Excluir plano?" description="Assinaturas vinculadas podem ser afetadas." onConfirm={() => deleteMutation.mutate(row.id)}
              trigger={<Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>} />
          </div>
        )}
      />
    </div>
  );
}

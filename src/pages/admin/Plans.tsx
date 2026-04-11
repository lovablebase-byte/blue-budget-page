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
import { Plus, Trash2, CreditCard, Package, Users, Star } from 'lucide-react';

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
  { key: 'greetings_enabled', label: 'Saudações', desc: 'Mensagens automáticas de boas-vindas' },
  { key: 'absence_enabled', label: 'Ausência', desc: 'Respostas automáticas de ausência' },
  { key: 'status_enabled', label: 'Status', desc: 'Templates de status automático' },
  { key: 'chatbot_keys_enabled', label: 'Chatbot Keys', desc: 'Chaves de API para chatbots' },
  { key: 'chatbot_keywords_enabled', label: 'Chatbot Keywords', desc: 'Respostas por palavras-chave' },
  { key: 'campaigns_enabled', label: 'Campanhas', desc: 'Disparo em massa de mensagens' },
  { key: 'workflows_enabled', label: 'Workflows', desc: 'Construtor visual de fluxos' },
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
  max_chatbots: 3, max_workflows: 3, max_contacts: 1000,
  // All feature toggles
  instances_enabled: true, greetings_enabled: true, absence_enabled: true,
  status_enabled: true, chatbot_keys_enabled: true, chatbot_keywords_enabled: true,
  campaigns_enabled: false, workflows_enabled: false, ai_agents_enabled: false,
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
                <TabsTrigger value="general">Geral</TabsTrigger>
                <TabsTrigger value="features">Recursos</TabsTrigger>
                <TabsTrigger value="limits">Limites</TabsTrigger>
                <TabsTrigger value="providers">Providers</TabsTrigger>
                <TabsTrigger value="notes">Notas</TabsTrigger>
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
                  <div><Label>Max Chatbots</Label><Input type="number" min={0} value={form.max_chatbots} onChange={e => set('max_chatbots', Number(e.target.value))} /></div>
                  <div><Label>Max Workflows</Label><Input type="number" min={0} value={form.max_workflows} onChange={e => set('max_workflows', Number(e.target.value))} /></div>
                  <div><Label>Max Contatos</Label><Input type="number" min={0} value={form.max_contacts} onChange={e => set('max_contacts', Number(e.target.value))} /></div>
                </div>
              </TabsContent>

              <TabsContent value="providers" className="space-y-4 mt-4">
                <p className="text-sm text-muted-foreground">Selecione os providers de WhatsApp permitidos. Se nenhum for selecionado, todos serão permitidos.</p>
                <div className="space-y-3">
                  {['evolution', 'wuzapi'].map(provider => (
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
                        <p className="text-sm font-medium capitalize">{provider === 'evolution' ? 'Evolution API' : 'WuzAPI'}</p>
                        <p className="text-xs text-muted-foreground">{provider === 'evolution' ? 'API completa com suporte a v1 e v2' : 'API leve e direta'}</p>
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

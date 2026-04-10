import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/contexts/CompanyContext';
import { useResourceLimit, useFeatureEnabled } from '@/hooks/use-plan-enforcement';
import { LimitReachedBanner, FeatureLockedBanner, GuardedButton } from '@/components/PlanEnforcementGuard';
import { DataTable, Column } from '@/components/DataTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { toast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Plus, Trash2, Bot, Brain, Zap, AlertTriangle } from 'lucide-react';

const TOOLS = [
  { value: 'respond', label: 'Responder' },
  { value: 'classify', label: 'Classificar' },
  { value: 'extract', label: 'Extrair dados' },
  { value: 'summarize', label: 'Resumir conversa' },
];

const PROVIDERS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'google', label: 'Google Gemini' },
  { value: 'anthropic', label: 'Anthropic Claude' },
  { value: 'lovable', label: 'Lovable AI' },
];

const STYLES = [
  { value: 'formal', label: 'Formal' },
  { value: 'balanced', label: 'Equilibrado' },
  { value: 'casual', label: 'Casual' },
  { value: 'technical', label: 'Técnico' },
];

const DAYS = [
  { key: 'seg', label: 'Segunda' },
  { key: 'ter', label: 'Terça' },
  { key: 'qua', label: 'Quarta' },
  { key: 'qui', label: 'Quinta' },
  { key: 'sex', label: 'Sexta' },
  { key: 'sab', label: 'Sábado' },
  { key: 'dom', label: 'Domingo' },
];

interface DaySchedule {
  enabled: boolean;
  start: string;
  end: string;
}

interface AgentForm {
  name: string;
  objective: string;
  base_prompt: string;
  safety_rules: string;
  tools: string[];
  provider: string;
  api_key: string;
  response_style: string;
  delay_seconds: number;
  max_tokens: number;
  understand_audio: boolean;
  understand_image: boolean;
  function_calling: boolean;
  enabled_instances: string[];
  schedule: Record<string, DaySchedule>;
}

const defaultSchedule = (): Record<string, DaySchedule> =>
  Object.fromEntries(DAYS.map(d => [d.key, { enabled: d.key !== 'sab' && d.key !== 'dom', start: '08:00', end: '18:00' }]));

const defaultForm = (): AgentForm => ({
  name: '', objective: '', base_prompt: '', safety_rules: '',
  tools: ['respond'], provider: 'openai', api_key: '', response_style: 'balanced',
  delay_seconds: 2, max_tokens: 1024, understand_audio: false, understand_image: false,
  function_calling: false, enabled_instances: [], schedule: defaultSchedule(),
});

export default function AIAgents() {
  const { company } = useAuth();
  const { isSuspended } = useCompany();
  const aiFeature = useFeatureEnabled('ai_agents_enabled');
  const agentLimit = useResourceLimit('max_ai_agents', 'ai_agents');
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<AgentForm>(defaultForm());

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ['ai-agents', company?.id],
    queryFn: async () => {
      if (!company?.id) return [];
      const { data, error } = await supabase.from('ai_agents').select('*').eq('company_id', company.id).order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!company?.id,
  });

  const { data: instances = [] } = useQuery({
    queryKey: ['instances-list', company?.id],
    queryFn: async () => {
      if (!company?.id) return [];
      const { data } = await supabase.from('instances').select('id, name').eq('company_id', company.id);
      return data || [];
    },
    enabled: !!company?.id,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        company_id: company!.id,
        name: form.name,
        objective: form.objective || null,
        base_prompt: form.base_prompt || null,
        safety_rules: form.safety_rules || null,
        tools: form.tools,
        provider: form.provider,
        api_key: form.api_key || null,
        response_style: form.response_style,
        delay_seconds: form.delay_seconds,
        max_tokens: form.max_tokens,
        understand_audio: form.understand_audio,
        understand_image: form.understand_image,
        function_calling: form.function_calling,
        enabled_instances: form.enabled_instances,
        schedule: form.schedule,
      };
      if (editId) {
        const { error } = await supabase.from('ai_agents').update(payload).eq('id', editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('ai_agents').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-agents'] });
      resetForm();
      toast({ title: editId ? 'Agente atualizado' : 'Agente criado' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('ai_agents').update({ is_active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ai-agents'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ai_agents').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['ai-agents'] }); toast({ title: 'Agente excluído' }); },
  });

  const resetForm = () => { setOpen(false); setEditId(null); setForm(defaultForm()); };

  const openEdit = (a: any) => {
    setEditId(a.id);
    const sched = (a.schedule && typeof a.schedule === 'object' && Object.keys(a.schedule).length > 0) ? a.schedule : defaultSchedule();
    setForm({
      name: a.name, objective: a.objective || '', base_prompt: a.base_prompt || '',
      safety_rules: a.safety_rules || '', tools: a.tools || ['respond'],
      provider: a.provider || 'openai', api_key: a.api_key || '',
      response_style: a.response_style || 'balanced', delay_seconds: a.delay_seconds ?? 2,
      max_tokens: a.max_tokens ?? 1024, understand_audio: a.understand_audio ?? false,
      understand_image: a.understand_image ?? false, function_calling: a.function_calling ?? false,
      enabled_instances: a.enabled_instances || [], schedule: sched,
    });
    setOpen(true);
  };

  const updateDay = (day: string, field: keyof DaySchedule, value: any) => {
    setForm(f => ({ ...f, schedule: { ...f.schedule, [day]: { ...f.schedule[day], [field]: value } } }));
  };

  const activeCount = agents.filter((a: any) => a.is_active).length;

  const columns: Column<any>[] = [
    { key: 'name', label: 'Nome', sortable: true },
    {
      key: 'provider', label: 'Provedor',
      render: (row) => <Badge variant="outline">{PROVIDERS.find(p => p.value === row.provider)?.label || row.provider}</Badge>,
    },
    { key: 'objective', label: 'Objetivo', render: (row) => <span className="line-clamp-1">{row.objective || '—'}</span> },
    {
      key: 'tools', label: 'Capacidades',
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.understand_audio && <Badge variant="secondary" className="text-[10px]">🎤 Áudio</Badge>}
          {row.understand_image && <Badge variant="secondary" className="text-[10px]">🖼️ Imagem</Badge>}
          {row.function_calling && <Badge variant="secondary" className="text-[10px]">⚡ Functions</Badge>}
        </div>
      ),
    },
    {
      key: 'is_active', label: 'Ativo',
      render: (row) => <Switch checked={row.is_active} onCheckedChange={(v) => toggleMutation.mutate({ id: row.id, is_active: v })} />,
    },
  ];

  const featureBlocked = aiFeature.data === false;
  const limitBlocked = agentLimit.data && !agentLimit.data.allowed;

  return (
    <div className="space-y-6">
      {featureBlocked && <FeatureLockedBanner featureLabel="Agentes IA" />}
      {!featureBlocked && agentLimit.data && (
        <LimitReachedBanner current={agentLimit.data.current} max={agentLimit.data.max} resourceLabel="agentes IA" />
      )}
      {isSuspended && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Conta suspensa</AlertTitle>
          <AlertDescription>Sua conta está suspensa. Não é possível criar ou editar agentes.</AlertDescription>
        </Alert>
      )}
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Bot className="h-8 w-8 text-primary" /><div><p className="text-2xl font-bold">{agents.length}</p><p className="text-sm text-muted-foreground">Total de Agentes</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Zap className="h-8 w-8 text-green-500" /><div><p className="text-2xl font-bold">{activeCount}</p><p className="text-sm text-muted-foreground">Ativos</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Brain className="h-8 w-8 text-purple-500" /><div><p className="text-2xl font-bold">{new Set(agents.map((a: any) => a.provider)).size}</p><p className="text-sm text-muted-foreground">Provedores</p></div></div></CardContent></Card>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agentes IA</h1>
          <p className="text-muted-foreground">Configure agentes inteligentes com integração de IA</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); else if (!featureBlocked && !limitBlocked) setOpen(true); }}>
          <DialogTrigger asChild>
            <GuardedButton
              allowed={!featureBlocked && !limitBlocked}
              reason={featureBlocked ? 'Agentes IA não habilitados no plano' : `Limite de ${agentLimit.data?.max || 0} agentes atingido`}
              onClick={() => {}}
            >
              <Plus className="h-4 w-4 mr-2" /> Novo Agente
            </GuardedButton>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editId ? 'Editar Agente' : 'Novo Agente'}</DialogTitle></DialogHeader>
            <Tabs defaultValue="general" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="general">Geral</TabsTrigger>
                <TabsTrigger value="ai">IA</TabsTrigger>
                <TabsTrigger value="schedule">Horários</TabsTrigger>
                <TabsTrigger value="advanced">Avançado</TabsTrigger>
              </TabsList>

              {/* General */}
              <TabsContent value="general" className="space-y-4 mt-4">
                <div><Label>Nome do Chatbot</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
                <div><Label>Objetivo</Label><Input value={form.objective} onChange={e => setForm(f => ({ ...f, objective: e.target.value }))} placeholder="Ex: Atender clientes e responder dúvidas" /></div>
                <div>
                  <Label>Instâncias Associadas</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {instances.map((inst: any) => (
                      <label key={inst.id} className="flex items-center gap-2 text-sm border rounded-md p-2">
                        <Checkbox
                          checked={form.enabled_instances.includes(inst.id)}
                          onCheckedChange={(checked) => setForm(f => ({
                            ...f, enabled_instances: checked
                              ? [...f.enabled_instances, inst.id]
                              : f.enabled_instances.filter(x => x !== inst.id),
                          }))}
                        />
                        {inst.name}
                      </label>
                    ))}
                    {instances.length === 0 && <p className="text-sm text-muted-foreground col-span-2">Nenhuma instância disponível</p>}
                  </div>
                </div>
                <div><Label>Prompt Personalizado</Label><Textarea rows={5} value={form.base_prompt} onChange={e => setForm(f => ({ ...f, base_prompt: e.target.value }))} placeholder="Instruções detalhadas para o agente..." /></div>
                <div><Label>Regras de Segurança</Label><Textarea rows={2} value={form.safety_rules} onChange={e => setForm(f => ({ ...f, safety_rules: e.target.value }))} placeholder="Ex: Nunca compartilhar dados sensíveis" /></div>
              </TabsContent>

              {/* AI Config */}
              <TabsContent value="ai" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Provedor de IA</Label>
                    <Select value={form.provider} onValueChange={v => setForm(f => ({ ...f, provider: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PROVIDERS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Estilo da Resposta</Label>
                    <Select value={form.response_style} onValueChange={v => setForm(f => ({ ...f, response_style: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STYLES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {form.provider !== 'lovable' && (
                  <div>
                    <Label>Chave da API</Label>
                    <Input type="password" value={form.api_key} onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))} placeholder="sk-..." />
                    <p className="text-xs text-muted-foreground mt-1">A chave é armazenada de forma segura e nunca exibida novamente.</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Delay da Resposta (segundos)</Label>
                    <Input type="number" min={0} max={30} value={form.delay_seconds} onChange={e => setForm(f => ({ ...f, delay_seconds: Number(e.target.value) }))} />
                  </div>
                  <div>
                    <Label>Limite de Tokens</Label>
                    <Input type="number" min={64} max={8192} value={form.max_tokens} onChange={e => setForm(f => ({ ...f, max_tokens: Number(e.target.value) }))} />
                  </div>
                </div>
                <div>
                  <Label>Ferramentas</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {TOOLS.map(t => (
                      <label key={t.value} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={form.tools.includes(t.value)}
                          onCheckedChange={(checked) => setForm(f => ({ ...f, tools: checked ? [...f.tools, t.value] : f.tools.filter(x => x !== t.value) }))}
                        />
                        {t.label}
                      </label>
                    ))}
                  </div>
                </div>
              </TabsContent>

              {/* Schedule */}
              <TabsContent value="schedule" className="space-y-3 mt-4">
                <p className="text-sm text-muted-foreground">Defina o horário de operação do agente. Fora desses horários, o agente não responderá.</p>
                {DAYS.map(day => (
                  <div key={day.key} className="flex items-center gap-3 border rounded-md p-3">
                    <Switch checked={form.schedule[day.key]?.enabled ?? false} onCheckedChange={v => updateDay(day.key, 'enabled', v)} />
                    <span className="w-20 text-sm font-medium">{day.label}</span>
                    <Input type="time" className="w-32" value={form.schedule[day.key]?.start || '08:00'} onChange={e => updateDay(day.key, 'start', e.target.value)} disabled={!form.schedule[day.key]?.enabled} />
                    <span className="text-muted-foreground">até</span>
                    <Input type="time" className="w-32" value={form.schedule[day.key]?.end || '18:00'} onChange={e => updateDay(day.key, 'end', e.target.value)} disabled={!form.schedule[day.key]?.enabled} />
                  </div>
                ))}
              </TabsContent>

              {/* Advanced */}
              <TabsContent value="advanced" className="space-y-4 mt-4">
                <p className="text-sm text-muted-foreground">Capacidades avançadas do agente.</p>
                <div className="space-y-3">
                  <div className="flex items-center justify-between border rounded-md p-3">
                    <div>
                      <p className="text-sm font-medium">🎤 Entender Áudio</p>
                      <p className="text-xs text-muted-foreground">O agente poderá transcrever e interpretar mensagens de áudio recebidas.</p>
                    </div>
                    <Switch checked={form.understand_audio} onCheckedChange={v => setForm(f => ({ ...f, understand_audio: v }))} />
                  </div>
                  <div className="flex items-center justify-between border rounded-md p-3">
                    <div>
                      <p className="text-sm font-medium">🖼️ Entender Imagem</p>
                      <p className="text-xs text-muted-foreground">O agente poderá analisar imagens enviadas pelos contatos.</p>
                    </div>
                    <Switch checked={form.understand_image} onCheckedChange={v => setForm(f => ({ ...f, understand_image: v }))} />
                  </div>
                  <div className="flex items-center justify-between border rounded-md p-3">
                    <div>
                      <p className="text-sm font-medium">⚡ Function Calling</p>
                      <p className="text-xs text-muted-foreground">Permite que o agente execute funções externas (webhooks, APIs) durante a conversa.</p>
                    </div>
                    <Switch checked={form.function_calling} onCheckedChange={v => setForm(f => ({ ...f, function_calling: v }))} />
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <Button onClick={() => saveMutation.mutate()} disabled={!form.name || saveMutation.isPending} className="w-full mt-4">
              {editId ? 'Salvar Agente' : 'Criar Agente'}
            </Button>
          </DialogContent>
        </Dialog>
      </div>

      <DataTable
        data={agents}
        columns={columns}
        searchKey="name"
        searchPlaceholder="Buscar agente..."
        loading={isLoading}
        emptyMessage="Nenhum agente criado"
        actions={(row) => (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>Editar</Button>
            <ConfirmDialog title="Excluir agente?" description="Esta ação é irreversível." onConfirm={() => deleteMutation.mutate(row.id)} trigger={<Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>} />
          </div>
        )}
      />
    </div>
  );
}

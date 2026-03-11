import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  MessageCircle, Settings, FileText, Send, TestTube, ChevronDown,
  CheckCircle, XCircle, Clock, RefreshCw, Copy, Info
} from 'lucide-react';

const ORDER_STATUSES = [
  { key: 'aceito', label: 'Aceito', icon: '✅' },
  { key: 'preparando', label: 'Preparando', icon: '👨‍🍳' },
  { key: 'cancelado', label: 'Cancelado', icon: '❌' },
  { key: 'pronto', label: 'Pronto', icon: '✅' },
  { key: 'saiu_entrega', label: 'Saiu P/ Entrega', icon: '🚗' },
  { key: 'entregue_pendente', label: 'Entregue & Pendente', icon: '📦' },
  { key: 'entregue_pago', label: 'Entregue & Pago', icon: '💰' },
];

const TEMPLATE_EVENTS = [
  { key: 'new_order_store', label: 'Novo Pedido → Loja', description: 'Enviado para o WhatsApp da loja quando um novo pedido é recebido' },
  { key: 'new_order_client', label: 'Novo Pedido → Cliente', description: 'Enviado para o WhatsApp do cliente quando um novo pedido é recebido' },
  ...ORDER_STATUSES.map(s => ({
    key: `status_${s.key}`,
    label: `${s.icon} Status: ${s.label}`,
    description: `Enviado ao cliente quando o pedido muda para "${s.label}"`,
  })),
];

const AVAILABLE_VARIABLES = [
  { group: 'Pedido', vars: ['{{order_code}}', '{{order_id}}', '{{order_link}}', '{{order_note}}', '{{order_items_formatted}}', '${order_code}', '${order_link}', '${order_note}', '${order_price_order}', '${order_price_total}', '${order_price_delivery}', '${order_payment_method}', '${order_price_discount}', '${order_coupons}', '${order_exchanged}', '${order_exchanged_value}', '${order_card_rate}', '${order_waiter_rate}', '${order_coin}'] },
  { group: 'Data/Hora', vars: ['{{date_created_order}}', '{{time_created_order}}', '${date_created_order}', '${time_created_order}', '${date_schedule_order}', '${time_schedule_order}'] },
  { group: 'Cliente', vars: ['{{client_name}}', '{{client_phone}}', '${customer_name}', '${customer_phone_number}'] },
  { group: 'Valores', vars: ['{{order_total}}', '{{order_subtotal}}', '{{payment_method}}', '${order_price_order}', '${order_price_total}'] },
  { group: 'Entrega / Retirada', vars: ['{{delivery_type}}', '{{delivery_address}}', '{{delivery_or_pickup_text}}', '{{delivery_ready_text}}', '${delivery_details}'] },
  { group: 'Atendente', vars: ['${employee_name}'] },
  { group: 'Produtos (dentro de foreach)', vars: ['${item_name}', '${item_description}', '${item_quantity}', '${item_price}', '${item_size_name}', '${item_note}', '${item_flavor_name}', '${item_flavor_amount}'] },
  { group: 'Adicionais (dentro de foreach)', vars: ['${additional_name}', '${additional_amount}', '${additional_price_total}', '${additional_category_name}'] },
];

const CONDITIONAL_BLOCKS = [
  '${if_datetime_date_created_order}...${endif_datetime_date_created_order}',
  '${if_datetime_schedule_order}...${endif_datetime_schedule_order}',
  '${if_employee}...${endif_employee}',
  '${if_customer}...${endif_customer}',
  '${if_order_note}...${endif_order_note}',
  '${if_delivery_type_0}...${endif_delivery_type_0}',
  '${if_card_rate}...${endif_card_rate}',
  '${if_waiter_rate}...${endif_waiter_rate}',
  '${if_coin}...${endif_coin}',
  '${if_price_discount}...${endif_price_discount}',
  '${if_coupon}...${endif_coupon}',
  '${if_exchanged}...${endif_exchanged}',
  '${if_item_size}...${endif_item_size}',
  '${if_item_note}...${endif_item_note}',
  '${if_item_additionals}...${endif_item_additionals}',
  '${if_item_flavors}...${endif_item_flavors}',
];

export default function DeliveryWhatsApp() {
  const { company } = useAuth();
  const queryClient = useQueryClient();

  // Config state
  const [isEnabled, setIsEnabled] = useState(false);
  const [endpointUrl, setEndpointUrl] = useState('');
  const [storePhone, setStorePhone] = useState('');
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  // Templates state
  const [templates, setTemplates] = useState<Record<string, { message: string; enabled: boolean }>>({});

  // Load config
  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ['delivery-whatsapp-config', company?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('delivery_whatsapp_config')
        .select('*')
        .eq('company_id', company!.id)
        .single();
      return data;
    },
    enabled: !!company?.id,
  });

  // Load templates
  const { data: savedTemplates, isLoading: templatesLoading } = useQuery({
    queryKey: ['delivery-whatsapp-templates', company?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('delivery_message_templates')
        .select('*')
        .eq('company_id', company!.id);
      return data || [];
    },
    enabled: !!company?.id,
  });

  // Load logs
  const { data: logs, isLoading: logsLoading, refetch: refetchLogs } = useQuery({
    queryKey: ['delivery-whatsapp-logs', company?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('delivery_send_logs')
        .select('*')
        .eq('company_id', company!.id)
        .order('created_at', { ascending: false })
        .limit(100);
      return data || [];
    },
    enabled: !!company?.id,
  });

  // Hydrate state from DB
  useEffect(() => {
    if (config) {
      setIsEnabled(config.is_enabled);
      setEndpointUrl(config.endpoint_url);
      setStorePhone(config.store_phone);
    }
  }, [config]);

  useEffect(() => {
    if (savedTemplates) {
      const map: Record<string, { message: string; enabled: boolean }> = {};
      for (const t of savedTemplates) {
        map[t.event_key] = { message: t.message_template, enabled: t.is_enabled };
      }
      setTemplates(map);
    }
  }, [savedTemplates]);

  // Save config
  const saveConfigMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        company_id: company!.id,
        is_enabled: isEnabled,
        endpoint_url: endpointUrl,
        store_phone: storePhone,
      };
      if (config?.id) {
        await supabase.from('delivery_whatsapp_config').update(payload).eq('id', config.id);
      } else {
        await supabase.from('delivery_whatsapp_config').insert(payload);
      }
    },
    onSuccess: () => {
      toast.success('Configurações salvas!');
      queryClient.invalidateQueries({ queryKey: ['delivery-whatsapp-config'] });
    },
    onError: () => toast.error('Erro ao salvar configurações'),
  });

  // Save templates
  const saveTemplatesMutation = useMutation({
    mutationFn: async () => {
      for (const event of TEMPLATE_EVENTS) {
        const tmpl = templates[event.key];
        if (!tmpl) continue;
        const payload = {
          company_id: company!.id,
          event_key: event.key,
          label: event.label,
          message_template: tmpl.message,
          is_enabled: tmpl.enabled,
        };
        await supabase.from('delivery_message_templates').upsert(payload, {
          onConflict: 'company_id,event_key',
        });
      }
    },
    onSuccess: () => {
      toast.success('Templates salvos!');
      queryClient.invalidateQueries({ queryKey: ['delivery-whatsapp-templates'] });
    },
    onError: () => toast.error('Erro ao salvar templates'),
  });

  // Test send
  const handleTest = async () => {
    if (!endpointUrl || !testPhone) {
      toast.error('Preencha o endpoint e o telefone de teste');
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('delivery-whatsapp', {
        body: {
          action: 'test',
          endpoint_url: endpointUrl,
          phone: testPhone,
          message: testMessage || '✅ Teste de integração WhatsApp - Delivery',
        },
      });
      setTestResult(data || { error: error?.message });
    } catch (err: any) {
      setTestResult({ error: err.message });
    }
    setTesting(false);
  };

  const updateTemplate = (key: string, field: 'message' | 'enabled', value: any) => {
    setTemplates(prev => ({
      ...prev,
      [key]: { message: prev[key]?.message || '', enabled: prev[key]?.enabled ?? true, [field]: value },
    }));
  };

  const copyVar = (v: string) => {
    navigator.clipboard.writeText(v);
    toast.success(`Copiado: ${v}`);
  };

  const fmtDate = (d: string) => {
    try { return new Date(d).toLocaleString('pt-BR'); } catch { return d; }
  };

  if (configLoading || templatesLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-64 bg-muted animate-pulse rounded" />
        <div className="h-48 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <MessageCircle className="h-6 w-6 text-primary" />
          Integração Delivery WhatsApp
        </h1>
        <p className="text-muted-foreground mt-1">Configure o envio automático de mensagens de WhatsApp para pedidos do delivery.</p>
      </div>

      <Tabs defaultValue="config" className="space-y-4">
        <TabsList>
          <TabsTrigger value="config" className="gap-1"><Settings className="h-4 w-4" /> Configurações</TabsTrigger>
          <TabsTrigger value="templates" className="gap-1"><FileText className="h-4 w-4" /> Templates</TabsTrigger>
          <TabsTrigger value="variables" className="gap-1"><Info className="h-4 w-4" /> Variáveis</TabsTrigger>
          <TabsTrigger value="test" className="gap-1"><TestTube className="h-4 w-4" /> Testar</TabsTrigger>
          <TabsTrigger value="logs" className="gap-1"><Clock className="h-4 w-4" /> Logs</TabsTrigger>
        </TabsList>

        {/* CONFIG TAB */}
        <TabsContent value="config" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Configurações Gerais</CardTitle>
              <CardDescription>Ative a integração e configure o endpoint da sua API de WhatsApp.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <p className="font-medium text-foreground">Permitir mensagens automáticas</p>
                  <p className="text-sm text-muted-foreground">Ative para enviar mensagens de WhatsApp automaticamente.</p>
                </div>
                <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
              </div>

              <div className="space-y-2">
                <Label>URL do Endpoint (API)*</Label>
                <Input
                  placeholder="https://api.exemplo.com/api/send/text?uuid=...&access_token=..."
                  value={endpointUrl}
                  onChange={e => setEndpointUrl(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Endpoint da sua API personalizada de WhatsApp. O sistema enviará POST com {`{ number, text }`}.</p>
              </div>

              <div className="space-y-2">
                <Label>Telefone da Loja (WhatsApp)</Label>
                <Input
                  placeholder="5511999999999"
                  value={storePhone}
                  onChange={e => setStorePhone(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Número que receberá a cópia dos novos pedidos.</p>
              </div>

              <Button onClick={() => saveConfigMutation.mutate()} disabled={saveConfigMutation.isPending}>
                {saveConfigMutation.isPending ? 'Salvando...' : 'Salvar Configurações'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TEMPLATES TAB */}
        <TabsContent value="templates" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Templates de Mensagens</CardTitle>
              <CardDescription>Configure as mensagens para cada evento. Use as variáveis disponíveis na aba "Variáveis".</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* New Order Templates */}
              <h3 className="font-semibold text-foreground text-sm uppercase tracking-wide">Novo Pedido</h3>
              {TEMPLATE_EVENTS.filter(e => e.key.startsWith('new_order')).map(event => (
                <TemplateEditor
                  key={event.key}
                  event={event}
                  value={templates[event.key]?.message || ''}
                  enabled={templates[event.key]?.enabled ?? true}
                  onChange={(msg) => updateTemplate(event.key, 'message', msg)}
                  onToggle={(en) => updateTemplate(event.key, 'enabled', en)}
                />
              ))}

              <Separator className="my-4" />

              <h3 className="font-semibold text-foreground text-sm uppercase tracking-wide">Mudança de Status</h3>
              {TEMPLATE_EVENTS.filter(e => e.key.startsWith('status_')).map(event => (
                <TemplateEditor
                  key={event.key}
                  event={event}
                  value={templates[event.key]?.message || ''}
                  enabled={templates[event.key]?.enabled ?? true}
                  onChange={(msg) => updateTemplate(event.key, 'message', msg)}
                  onToggle={(en) => updateTemplate(event.key, 'enabled', en)}
                />
              ))}

              <Button onClick={() => saveTemplatesMutation.mutate()} disabled={saveTemplatesMutation.isPending} className="mt-4">
                {saveTemplatesMutation.isPending ? 'Salvando...' : 'Salvar Todos os Templates'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* VARIABLES TAB */}
        <TabsContent value="variables" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Variáveis Disponíveis</CardTitle>
              <CardDescription>Clique para copiar. Use nos templates de mensagens.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {AVAILABLE_VARIABLES.map(group => (
                <div key={group.group}>
                  <h4 className="text-sm font-semibold text-foreground mb-2">{group.group}</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {group.vars.map(v => (
                      <Badge key={v} variant="secondary" className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors text-xs font-mono"
                        onClick={() => copyVar(v)}>
                        <Copy className="h-3 w-3 mr-1" />{v}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}

              <Separator />
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-2">Blocos Condicionais</h4>
                <div className="space-y-1">
                  {CONDITIONAL_BLOCKS.map(b => (
                    <div key={b} className="text-xs font-mono text-muted-foreground bg-muted px-2 py-1 rounded cursor-pointer hover:bg-accent"
                      onClick={() => { navigator.clipboard.writeText(b); toast.success('Copiado!'); }}>
                      {b}
                    </div>
                  ))}
                </div>
              </div>

              <Separator />
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-2">Blocos de Repetição</h4>
                <div className="space-y-1 text-xs font-mono text-muted-foreground">
                  <div className="bg-muted px-2 py-1 rounded cursor-pointer hover:bg-accent"
                    onClick={() => { navigator.clipboard.writeText('${foreach_item}...${endforeach_item}'); toast.success('Copiado!'); }}>
                    {'${foreach_item}...${endforeach_item}'}
                  </div>
                  <div className="bg-muted px-2 py-1 rounded cursor-pointer hover:bg-accent"
                    onClick={() => { navigator.clipboard.writeText('${foreach_additional}...${endforeach_additional}'); toast.success('Copiado!'); }}>
                    {'${foreach_additional}...${endforeach_additional}'}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TEST TAB */}
        <TabsContent value="test" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Testar Envio</CardTitle>
              <CardDescription>Envie uma mensagem de teste para verificar se a integração está funcionando.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Telefone de teste</Label>
                <Input placeholder="5511999999999" value={testPhone} onChange={e => setTestPhone(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Mensagem (opcional)</Label>
                <Textarea placeholder="✅ Teste de integração WhatsApp - Delivery" value={testMessage} onChange={e => setTestMessage(e.target.value)} rows={3} />
              </div>
              <Button onClick={handleTest} disabled={testing || !endpointUrl}>
                {testing ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Enviando...</> : <><Send className="h-4 w-4 mr-2" /> Enviar Teste</>}
              </Button>

              {testResult && (
                <div className={`p-4 rounded-lg border ${testResult.success ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800' : 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    {testResult.success ? <CheckCircle className="h-5 w-5 text-green-600" /> : <XCircle className="h-5 w-5 text-red-600" />}
                    <span className="font-medium">{testResult.success ? 'Enviado com sucesso!' : 'Falha no envio'}</span>
                  </div>
                  <pre className="text-xs font-mono bg-background p-2 rounded overflow-auto max-h-32">
                    {JSON.stringify(testResult.response || testResult.error, null, 2)}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* LOGS TAB */}
        <TabsContent value="logs" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Logs de Envio</CardTitle>
                <CardDescription>Histórico dos últimos 100 disparos.</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => refetchLogs()}>
                <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
              </Button>
            </CardHeader>
            <CardContent>
              {logsLoading ? (
                <div className="h-32 flex items-center justify-center text-muted-foreground">Carregando...</div>
              ) : !logs || logs.length === 0 ? (
                <div className="h-32 flex items-center justify-center text-muted-foreground">Nenhum log encontrado.</div>
              ) : (
                <ScrollArea className="h-[500px]">
                  <div className="space-y-2">
                    {logs.map((log: any) => (
                      <Collapsible key={log.id}>
                        <CollapsibleTrigger className="w-full">
                          <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition-colors text-left w-full">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              {log.status === 'sent' ? <CheckCircle className="h-4 w-4 text-green-500 shrink-0" /> : <XCircle className="h-4 w-4 text-red-500 shrink-0" />}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-medium text-foreground">{log.order_code || '—'}</span>
                                  <Badge variant="outline" className="text-xs">{log.event_key}</Badge>
                                </div>
                                <p className="text-xs text-muted-foreground">{log.phone} • {fmtDate(log.created_at)}</p>
                              </div>
                            </div>
                            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="mx-3 mb-2 p-3 bg-muted/50 rounded-b-lg text-xs space-y-2">
                            {log.message && (
                              <div>
                                <span className="font-semibold">Mensagem:</span>
                                <pre className="whitespace-pre-wrap mt-1 text-muted-foreground">{log.message}</pre>
                              </div>
                            )}
                            {log.error && (
                              <div>
                                <span className="font-semibold text-red-600">Erro:</span>
                                <p className="text-red-600">{log.error}</p>
                              </div>
                            )}
                            {log.api_response && (
                              <div>
                                <span className="font-semibold">Resposta da API:</span>
                                <pre className="whitespace-pre-wrap mt-1 text-muted-foreground">{JSON.stringify(log.api_response, null, 2)}</pre>
                              </div>
                            )}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Template editor component
function TemplateEditor({ event, value, enabled, onChange, onToggle }: {
  event: { key: string; label: string; description: string };
  value: string;
  enabled: boolean;
  onChange: (msg: string) => void;
  onToggle: (enabled: boolean) => void;
}) {
  return (
    <Collapsible>
      <CollapsibleTrigger className="w-full">
        <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition-colors">
          <div className="flex items-center gap-3 text-left">
            <div>
              <p className="text-sm font-medium text-foreground">{event.label}</p>
              <p className="text-xs text-muted-foreground">{event.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={enabled ? 'default' : 'secondary'} className="text-xs">
              {enabled ? 'Ativo' : 'Inativo'}
            </Badge>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mx-3 mb-2 p-3 border border-t-0 rounded-b-lg space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Ativar envio</Label>
            <Switch checked={enabled} onCheckedChange={onToggle} />
          </div>
          <Textarea
            placeholder="Digite o template da mensagem aqui. Use variáveis como ${order_code}, ${customer_name}..."
            value={value}
            onChange={e => onChange(e.target.value)}
            rows={6}
            className="font-mono text-sm"
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

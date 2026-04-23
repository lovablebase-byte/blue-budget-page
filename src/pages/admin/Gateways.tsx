import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import {
  Plug, Save, TestTube, Loader2, CheckCircle2, XCircle, Clock, Eye, EyeOff, Copy,
  AlertTriangle, RefreshCw, Shield, Activity,
} from 'lucide-react';

const SUPABASE_PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;

function getWebhookUrl(secret: string) {
  return `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/amplopay-webhook?secret=${secret}`;
}

const RESULT_COLORS: Record<string, string> = {
  success: 'bg-success/15 text-success border-success/30',
  processed: 'bg-success/15 text-success border-success/30',
  received: 'bg-accent/15 text-accent border-accent/30',
  error: 'bg-destructive/15 text-destructive border-destructive/30',
  failure: 'bg-destructive/15 text-destructive border-destructive/30',
  rejected: 'bg-destructive/15 text-destructive border-destructive/30',
  value_mismatch: 'bg-warning/15 text-warning border-warning/30',
};

const RESULT_LABEL: Record<string, string> = {
  success: 'Sucesso',
  processed: 'Processado',
  received: 'Recebido',
  error: 'Erro',
  failure: 'Falha',
  rejected: 'Rejeitado',
  value_mismatch: 'Divergência',
};

const EVENT_LABEL: Record<string, string> = {
  connection_test: 'Teste de conexão',
  charge_created: 'Cobrança criada',
  charge_creation_failed: 'Falha na cobrança',
  'payment.confirmed': 'Pagamento confirmado',
  'charge.paid': 'Cobrança paga',
  auth_failure: 'Falha de autenticação',
  processing_error: 'Erro de processamento',
  fallback_reconciliation: 'Conciliação manual',
};

export default function AdminGateways() {
  const queryClient = useQueryClient();
  const [showApiKey, setShowApiKey] = useState(false);
  const [form, setForm] = useState({
    base_url: '',
    api_key: '',
    webhook_secret: '',
    environment: 'production',
  });

  /* ── Load gateway config ── */
  const { data: gateway, isLoading } = useQuery({
    queryKey: ['admin-gateway-amplopay'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_gateways')
        .select('*')
        .eq('provider', 'amplopay')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  /* ── Load recent events (logs) ── */
  const { data: recentEvents = [], refetch: refetchEvents } = useQuery({
    queryKey: ['admin-gateway-events'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_events')
        .select('*')
        .order('received_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (gateway) {
      const config = (gateway.config || {}) as Record<string, any>;
      setForm({
        base_url: config.base_url || '',
        api_key: config.api_key || '',
        webhook_secret: config.webhook_secret || '',
        environment: config.environment || 'production',
      });
    }
  }, [gateway]);

  /* ── Save config ── */
  const saveMutation = useMutation({
    mutationFn: async () => {
      const existing = gateway ? (gateway.config as Record<string, any> || {}) : {};
      const configPayload = {
        ...existing,
        base_url: form.base_url,
        api_key: form.api_key,
        webhook_secret: form.webhook_secret,
        environment: form.environment,
      };

      if (gateway) {
        const { error } = await supabase
          .from('payment_gateways')
          .update({ config: configPayload, name: 'Amplo Pay', is_active: true })
          .eq('id', gateway.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('payment_gateways')
          .insert({ name: 'Amplo Pay', provider: 'amplopay', config: configPayload, is_active: true });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-gateway-amplopay'] });
      toast({ title: 'Configuração salva com sucesso' });
    },
    onError: (e: any) =>
      toast({ title: 'Erro ao salvar', description: e.message, variant: 'destructive' }),
  });

  /* ── Test connection ── */
  const [testing, setTesting] = useState(false);
  const testConnection = async () => {
    setTesting(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data?.session?.access_token;
      const resp = await fetch(
        `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/amplopay-proxy?action=test`,
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
        toast({ title: 'Conexão estabelecida', description: `Status: ${result.status}` });
      } else {
        toast({ title: 'Falha na conexão', description: result.error || 'Verifique as credenciais', variant: 'destructive' });
      }
      queryClient.invalidateQueries({ queryKey: ['admin-gateway-amplopay'] });
      refetchEvents();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  /* ── Toggle active ── */
  const toggleMutation = useMutation({
    mutationFn: async (isActive: boolean) => {
      if (!gateway) return;
      const { error } = await supabase.from('payment_gateways').update({ is_active: isActive }).eq('id', gateway.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-gateway-amplopay'] }),
  });

  const config = (gateway?.config || {}) as Record<string, any>;
  const lastTestAt = config.last_test_at;
  const lastTestStatus = config.last_test_status;
  const webhookUrl = form.webhook_secret ? getWebhookUrl(form.webhook_secret) : '';

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copiado!' });
  };

  // Stats from events
  const eventStats = {
    total: recentEvents.length,
    success: recentEvents.filter((e: any) => e.result === 'success' || e.result === 'processed').length,
    errors: recentEvents.filter((e: any) => e.result === 'error' || e.result === 'failure' || e.result === 'rejected').length,
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Gateway de Pagamento</h1>
          <p className="text-muted-foreground">Integração PIX exclusiva via Amplo Pay</p>
        </div>
        {gateway && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Ativo</span>
            <Switch checked={gateway.is_active} onCheckedChange={(v) => toggleMutation.mutate(v)} />
          </div>
        )}
      </div>

      {/* Identification card (PDF seção 10 — Identificação) */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Plug className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Amplo Pay</CardTitle>
                <CardDescription>Gateway PIX oficial do sistema</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {gateway?.is_active ? (
                <Badge className="bg-success text-success-foreground hover:bg-success/90">Ativo</Badge>
              ) : (
                <Badge variant="secondary">Inativo</Badge>
              )}
              {lastTestStatus === 'connected' && (
                <Badge variant="outline" className="text-success border-success">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Conectado
                </Badge>
              )}
              {lastTestStatus === 'error' && (
                <Badge variant="outline" className="text-destructive border-destructive">
                  <XCircle className="h-3 w-3 mr-1" /> Erro
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            {lastTestAt && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Última verificação: {new Date(lastTestAt).toLocaleString('pt-BR')}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Shield className="h-3 w-3" />
              Ambiente: {form.environment === 'production' ? 'Produção' : 'Homologação'}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Observability mini-cards (PDF seção 10 — Observabilidade) */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex flex-col items-center justify-center gap-2">
            <div className="icon-premium metric-purple p-2 rounded-md"><Activity className="h-5 w-5" /></div>
            <div className="text-center">
              <p className="text-2xl font-bold metric-purple">{eventStats.total}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider metric-purple">Eventos recentes</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col items-center justify-center gap-2">
            <div className="icon-premium metric-green p-2 rounded-md"><CheckCircle2 className="h-5 w-5" /></div>
            <div className="text-center">
              <p className="text-2xl font-bold metric-green">{eventStats.success}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider metric-green">Sucesso</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col items-center justify-center gap-2">
            <div className="icon-premium metric-red p-2 rounded-md"><XCircle className="h-5 w-5" /></div>
            <div className="text-center">
              <p className="text-2xl font-bold metric-red">{eventStats.errors}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider metric-red">Falhas</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Credentials (PDF seção 10 — Credenciais) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Credenciais</CardTitle>
          <CardDescription>Preencha conforme o portal oficial da Amplo Pay</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>URL Base da API</Label>
              <Input
                placeholder="https://api.amplopay.com"
                value={form.base_url}
                onChange={(e) => setForm((f) => ({ ...f, base_url: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Ambiente</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={form.environment}
                onChange={(e) => setForm((f) => ({ ...f, environment: e.target.value }))}
              >
                <option value="production">Produção</option>
                <option value="sandbox">Homologação</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>API Key / Token</Label>
            <div className="flex gap-2">
              <Input
                type={showApiKey ? 'text' : 'password'}
                placeholder="Chave de autenticação da Amplo Pay"
                value={form.api_key}
                onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))}
              />
              <Button variant="outline" size="icon" type="button" onClick={() => setShowApiKey(!showApiKey)}>
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Nunca compartilhe esta chave. Ela é armazenada apenas no backend.</p>
          </div>

          <div className="space-y-2">
            <Label>Webhook Secret</Label>
            <Input
              placeholder="Secret para validação do webhook"
              value={form.webhook_secret}
              onChange={(e) => setForm((f) => ({ ...f, webhook_secret: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              Usado para validar a autenticidade das notificações recebidas da Amplo Pay
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Webhook (PDF seção 10 — Webhook) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Webhook</CardTitle>
          <CardDescription>
            Cadastre esta URL no portal da Amplo Pay para receber notificações automáticas de pagamento
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {webhookUrl ? (
            <>
              <div className="flex items-center gap-2">
                <Input value={webhookUrl} readOnly className="font-mono text-xs" />
                <Button variant="outline" size="icon" onClick={() => copyToClipboard(webhookUrl)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3 w-3 text-success" />
                URL gerada. Cadastre no portal da Amplo Pay.
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Preencha o Webhook Secret acima para gerar a URL
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions (PDF seção 10 — Operação) */}
      <div className="flex gap-3">
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Salvar Configuração
        </Button>
        <Button variant="outline" onClick={testConnection} disabled={testing || !form.base_url || !form.api_key}>
          {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <TestTube className="h-4 w-4 mr-2" />}
          Testar Conexão
        </Button>
      </div>

      <Separator />

      {/* Recent events / logs (PDF seção 10 — Observabilidade) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Logs da Integração</CardTitle>
              <CardDescription>Webhooks, testes de conexão, cobranças e falhas recentes</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => refetchEvents()}>
              <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {recentEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhum evento registrado</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>ID Externo</TableHead>
                    <TableHead>Resultado</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentEvents.map((evt: any) => (
                    <TableRow key={evt.id}>
                      <TableCell className="font-mono text-xs">
                        {EVENT_LABEL[evt.event_type] || evt.event_type}
                      </TableCell>
                      <TableCell className="font-mono text-xs max-w-[120px] truncate">
                        {evt.external_id || '—'}
                      </TableCell>
                      <TableCell>
                        <Badge className={RESULT_COLORS[evt.result] || 'bg-muted text-muted-foreground'}>
                          {RESULT_LABEL[evt.result] || evt.result}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(evt.received_at).toLocaleString('pt-BR')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

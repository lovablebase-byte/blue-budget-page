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
  Plug, Save, TestTube, Loader2, CheckCircle2, XCircle, Clock, Eye, EyeOff, Copy, ExternalLink,
} from 'lucide-react';

const SUPABASE_PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID || 'rmswpurvnqqayemvuocv';

function getWebhookUrl(secret: string) {
  return `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/amplopay-webhook?secret=${secret}`;
}

export default function AdminGateways() {
  const queryClient = useQueryClient();
  const [showApiKey, setShowApiKey] = useState(false);
  const [form, setForm] = useState({
    base_url: '',
    api_key: '',
    webhook_secret: '',
    environment: 'production',
  });

  // ─── Load gateway config ───
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

  // ─── Load recent events ───
  const { data: recentEvents = [] } = useQuery({
    queryKey: ['admin-gateway-events'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_events')
        .select('*')
        .order('received_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });

  // Populate form from DB
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

  // ─── Save config ───
  const saveMutation = useMutation({
    mutationFn: async () => {
      const configPayload = {
        base_url: form.base_url,
        api_key: form.api_key,
        webhook_secret: form.webhook_secret,
        environment: form.environment,
        ...(gateway?.config as Record<string, any> || {}),
        // Override with form values
        ...{
          base_url: form.base_url,
          api_key: form.api_key,
          webhook_secret: form.webhook_secret,
          environment: form.environment,
        },
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
          .insert({
            name: 'Amplo Pay',
            provider: 'amplopay',
            config: configPayload,
            is_active: true,
          });
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

  // ─── Test connection ───
  const [testing, setTesting] = useState(false);
  const testConnection = async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('amplopay-proxy', {
        body: null,
        headers: { 'Content-Type': 'application/json' },
      });
      // Build URL with action param
      const projectId = SUPABASE_PROJECT_ID;
      const session = await supabase.auth.getSession();
      const token = session.data?.session?.access_token;

      const resp = await fetch(
        `https://${projectId}.supabase.co/functions/v1/amplopay-proxy?action=test`,
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
        toast({
          title: 'Falha na conexão',
          description: result.error || result.status || 'Verifique as credenciais',
          variant: 'destructive',
        });
      }
      queryClient.invalidateQueries({ queryKey: ['admin-gateway-amplopay', 'admin-gateway-events'] });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  // ─── Toggle active ───
  const toggleMutation = useMutation({
    mutationFn: async (isActive: boolean) => {
      if (!gateway) return;
      const { error } = await supabase
        .from('payment_gateways')
        .update({ is_active: isActive })
        .eq('id', gateway.id);
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
          <p className="text-muted-foreground">Configuração da integração PIX via Amplo Pay</p>
        </div>
        <div className="flex items-center gap-2">
          {gateway && (
            <div className="flex items-center gap-2 mr-4">
              <span className="text-sm text-muted-foreground">Ativo</span>
              <Switch
                checked={gateway.is_active}
                onCheckedChange={(v) => toggleMutation.mutate(v)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Status card */}
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
                <Badge variant="default" className="bg-green-600">Ativo</Badge>
              ) : (
                <Badge variant="secondary">Inativo</Badge>
              )}
              {lastTestStatus === 'connected' && (
                <Badge variant="outline" className="text-green-600 border-green-600">
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
        {lastTestAt && (
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Última verificação: {new Date(lastTestAt).toLocaleString('pt-BR')}
            </p>
          </CardContent>
        )}
      </Card>

      {/* Credentials */}
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
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
              <Button
                variant="outline"
                size="icon"
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Webhook Secret</Label>
            <Input
              placeholder="Secret para validação do webhook"
              value={form.webhook_secret}
              onChange={(e) => setForm((f) => ({ ...f, webhook_secret: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              Usado para validar a autenticidade das notificações recebidas
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Webhook */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Webhook</CardTitle>
          <CardDescription>
            Cadastre esta URL no portal da Amplo Pay para receber notificações automáticas de pagamento
          </CardDescription>
        </CardHeader>
        <CardContent>
          {webhookUrl ? (
            <div className="flex items-center gap-2">
              <Input value={webhookUrl} readOnly className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={() => copyToClipboard(webhookUrl)}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Preencha o Webhook Secret acima para gerar a URL do webhook
            </p>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-3">
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Salvar Configuração
        </Button>
        <Button variant="outline" onClick={testConnection} disabled={testing || !form.base_url || !form.api_key}>
          {testing ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <TestTube className="h-4 w-4 mr-2" />
          )}
          Testar Conexão
        </Button>
      </div>

      <Separator />

      {/* Recent events / logs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Últimos Eventos</CardTitle>
          <CardDescription>Webhook, testes de conexão e cobranças recentes</CardDescription>
        </CardHeader>
        <CardContent>
          {recentEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhum evento registrado</p>
          ) : (
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
                    <TableCell className="font-mono text-xs">{evt.event_type}</TableCell>
                    <TableCell className="font-mono text-xs">{evt.external_id || '—'}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          evt.result === 'success' || evt.result === 'processed'
                            ? 'default'
                            : evt.result === 'error'
                            ? 'destructive'
                            : 'secondary'
                        }
                      >
                        {evt.result}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(evt.received_at).toLocaleString('pt-BR')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

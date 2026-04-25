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
import { toast } from '@/hooks/use-toast';
import {
  Plug, Save, TestTube, Loader2, CheckCircle2, XCircle, Clock, Eye, EyeOff, Copy,
  AlertTriangle, Shield, Wallet,
} from 'lucide-react';

const SUPABASE_PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;

export default function MercadoPagoCard() {
  const queryClient = useQueryClient();
  const [showToken, setShowToken] = useState(false);
  const [form, setForm] = useState({
    public_key: '',
    access_token: '',
    webhook_secret: '',
    environment: 'production' as 'production' | 'sandbox',
  });

  const { data: gateway, isLoading } = useQuery({
    queryKey: ['admin-gateway-mercadopago'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_gateways')
        .select('*')
        .eq('provider', 'mercadopago')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (gateway) {
      const config = (gateway.config || {}) as Record<string, any>;
      setForm({
        public_key: config.public_key || '',
        access_token: config.access_token || '',
        webhook_secret: config.webhook_secret || '',
        environment: ((gateway as any).environment || 'production') as any,
      });
    }
  }, [gateway]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const existing = gateway ? ((gateway.config as Record<string, any>) || {}) : {};
      const configPayload = {
        ...existing,
        public_key: form.public_key,
        access_token: form.access_token,
        webhook_secret: form.webhook_secret,
      };

      if (gateway) {
        const { error } = await supabase
          .from('payment_gateways')
          .update({
            config: configPayload,
            name: 'Mercado Pago',
            environment: form.environment,
          } as any)
          .eq('id', gateway.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('payment_gateways')
          .insert({
            name: 'Mercado Pago',
            provider: 'mercadopago',
            config: configPayload,
            is_active: false,
            environment: form.environment,
          } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-gateway-mercadopago'] });
      toast({ title: 'Mercado Pago salvo com sucesso' });
    },
    onError: (e: any) =>
      toast({ title: 'Erro ao salvar', description: e.message, variant: 'destructive' }),
  });

  const toggleMutation = useMutation({
    mutationFn: async (isActive: boolean) => {
      if (!gateway) {
        toast({ title: 'Salve as credenciais antes de ativar', variant: 'destructive' });
        return;
      }
      const { error } = await supabase
        .from('payment_gateways')
        .update({ is_active: isActive })
        .eq('id', gateway.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-gateway-mercadopago'] }),
  });

  const [testing, setTesting] = useState(false);
  const testConnection = async () => {
    if (!form.access_token) {
      toast({ title: 'Informe o Access Token antes de testar', variant: 'destructive' });
      return;
    }
    setTesting(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data?.session?.access_token;
      const resp = await fetch(
        `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/mercadopago-proxy?action=test`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        },
      );
      const result = await resp.json();
      if (result.ok) {
        toast({
          title: 'Conexão com Mercado Pago realizada com sucesso',
          description: result.site_id ? `Site: ${result.site_id}` : undefined,
        });
      } else {
        const msg =
          result.status === 'invalid_token'
            ? 'Access Token inválido ou sem permissão.'
            : result.status === 'unreachable'
              ? 'Não foi possível conectar à API Mercado Pago.'
              : result.error || 'Falha desconhecida';
        toast({ title: 'Falha na conexão', description: msg, variant: 'destructive' });
      }
      queryClient.invalidateQueries({ queryKey: ['admin-gateway-mercadopago'] });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const config = (gateway?.config || {}) as Record<string, any>;
  const lastTestAt = config.last_test_at;
  const lastTestStatus = config.last_test_status;
  const webhookUrl = `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/mercadopago-webhook`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copiado!' });
  };

  const maskToken = (t: string) => (t ? `${t.slice(0, 8)}••••${t.slice(-4)}` : '');

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-info/10 flex items-center justify-center">
                <Wallet className="h-5 w-5 text-info" />
              </div>
              <div>
                <CardTitle className="text-lg">Mercado Pago</CardTitle>
                <CardDescription>Pix avulso por fatura via /v1/payments</CardDescription>
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
              <Switch
                checked={!!gateway?.is_active}
                onCheckedChange={(v) => toggleMutation.mutate(v)}
                disabled={!gateway}
              />
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
              Ambiente: {form.environment === 'production' ? 'Produção' : 'Sandbox'}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Credenciais</CardTitle>
          <CardDescription>
            Use as credenciais da sua aplicação Mercado Pago. O Access Token deve ficar protegido e
            nunca ser exposto no frontend.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Public Key</Label>
              <Input
                placeholder="APP_USR-xxxxxxxx-..."
                value={form.public_key}
                onChange={(e) => setForm((f) => ({ ...f, public_key: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Ambiente</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={form.environment}
                onChange={(e) =>
                  setForm((f) => ({ ...f, environment: e.target.value as any }))
                }
              >
                <option value="production">Produção</option>
                <option value="sandbox">Sandbox</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Access Token</Label>
            <div className="flex gap-2">
              <Input
                type={showToken ? 'text' : 'password'}
                placeholder="APP_USR-xxxxxxxxxxxxxxxx-..."
                value={showToken ? form.access_token : (form.access_token ? maskToken(form.access_token) : '')}
                onChange={(e) => {
                  if (showToken) setForm((f) => ({ ...f, access_token: e.target.value }));
                }}
                onFocus={() => setShowToken(true)}
              />
              <Button variant="outline" size="icon" type="button" onClick={() => setShowToken(!showToken)}>
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Encontre em mercadopago.com.br → Suas integrações → Credenciais. Armazenado apenas no backend.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Webhook Secret (opcional)</Label>
            <Input
              placeholder="Secret para validação do webhook (opcional)"
              value={form.webhook_secret}
              onChange={(e) => setForm((f) => ({ ...f, webhook_secret: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              Se configurar “Notificações de pagamento” no portal do MP com chave secreta, informe aqui.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Webhook</CardTitle>
          <CardDescription>
            Cadastre esta URL em Mercado Pago → Suas integrações → Webhooks → Eventos de pagamento.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Input value={webhookUrl} readOnly className="font-mono text-xs" />
            <Button variant="outline" size="icon" onClick={() => copyToClipboard(webhookUrl)}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <AlertTriangle className="h-3 w-3 text-warning" />
            Habilite os eventos: <code className="px-1 rounded bg-muted">payment</code>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Salvar Configuração
        </Button>
        <Button
          variant="outline"
          onClick={testConnection}
          disabled={testing || !form.access_token}
        >
          {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <TestTube className="h-4 w-4 mr-2" />}
          Testar Conexão
        </Button>
      </div>

      <Separator />
    </div>
  );
}

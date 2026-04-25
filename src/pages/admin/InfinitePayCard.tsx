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
  Save, TestTube, Loader2, CheckCircle2, XCircle, Clock, Copy,
  AlertTriangle, Shield, QrCode,
} from 'lucide-react';

const SUPABASE_PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;

export default function InfinitePayCard() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    base_url: 'https://api.infinitepay.io',
    handle: '',
    webhook_secret: '',
  });

  const { data: gateway, isLoading } = useQuery({
    queryKey: ['admin-gateway-infinitepay'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_gateways')
        .select('*')
        .eq('provider', 'infinitepay')
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
        base_url: config.base_url || 'https://api.infinitepay.io',
        handle: config.handle || '',
        webhook_secret: config.webhook_secret || '',
      });
    }
  }, [gateway]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Sanitiza handle removendo $ inicial
      const cleanHandle = form.handle.trim().replace(/^[\$@]+/, '');
      const existing = gateway ? ((gateway.config as Record<string, any>) || {}) : {};
      const configPayload = {
        ...existing,
        base_url: form.base_url.trim().replace(/\/+$/, ''),
        handle: cleanHandle,
        webhook_secret: form.webhook_secret.trim(),
      };

      if (gateway) {
        const { error } = await supabase
          .from('payment_gateways')
          .update({ config: configPayload, name: 'InfinitePay (Pix)' })
          .eq('id', gateway.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('payment_gateways')
          .insert({
            name: 'InfinitePay (Pix)',
            provider: 'infinitepay',
            config: configPayload,
            is_active: false,
          } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-gateway-infinitepay'] });
      toast({ title: 'InfinitePay salvo com sucesso' });
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
      const cfg = (gateway.config || {}) as Record<string, any>;
      if (isActive && !cfg.handle) {
        toast({ title: 'Configure a InfiniteTag antes de ativar', variant: 'destructive' });
        return;
      }
      const { error } = await supabase
        .from('payment_gateways')
        .update({ is_active: isActive })
        .eq('id', gateway.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-gateway-infinitepay'] }),
  });

  const [testing, setTesting] = useState(false);
  const testConnection = async () => {
    if (!form.handle) {
      toast({ title: 'Informe a InfiniteTag antes de testar', variant: 'destructive' });
      return;
    }
    setTesting(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data?.session?.access_token;
      const resp = await fetch(
        `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/infinitepay-proxy?action=test`,
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
          title: 'Conexão com InfinitePay realizada com sucesso',
          description: result.handle ? `Handle: ${result.handle}` : undefined,
        });
      } else {
        const msg =
          result.status === 'invalid_handle'
            ? 'InfiniteTag inválida.'
            : result.status === 'unreachable'
              ? 'Não foi possível conectar à API InfinitePay.'
              : result.error || 'Falha desconhecida';
        toast({ title: 'Falha na conexão', description: msg, variant: 'destructive' });
      }
      queryClient.invalidateQueries({ queryKey: ['admin-gateway-infinitepay'] });
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
  const webhookUrl = `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/infinitepay-webhook${form.webhook_secret ? `?secret=${form.webhook_secret}` : ''}`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copiado!' });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center">
                <QrCode className="h-5 w-5 text-success" />
              </div>
              <div>
                <CardTitle className="text-lg">Gateway Pix via InfinitePay</CardTitle>
                <CardDescription>Checkout Integrado — somente Pix por fatura</CardDescription>
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
              Método único: Pix
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Credenciais</CardTitle>
          <CardDescription>
            InfinitePay usa sua InfiniteTag pública. Não exige Access Token. Cartão, débito e
            parcelamento estão desabilitados — este gateway opera somente com Pix.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Base URL</Label>
            <Input
              placeholder="https://api.infinitepay.io"
              value={form.base_url}
              onChange={(e) => setForm((f) => ({ ...f, base_url: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label>InfiniteTag (Handle)</Label>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-sm">$</span>
              <Input
                placeholder="seuhandle"
                value={form.handle}
                onChange={(e) => setForm((f) => ({ ...f, handle: e.target.value.replace(/^[\$@]+/, '') }))}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Informe sua InfiniteTag sem o símbolo <code>$</code>. Encontre em sua conta InfinitePay.
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
              Se cadastrado, será validado em cada notificação recebida.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Webhook</CardTitle>
          <CardDescription>
            Cadastre esta URL na InfinitePay para receber confirmações de pagamento Pix.
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
            Aceita apenas notificações Pix. Outros métodos são registrados mas não ativam plano.
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
          disabled={testing || !form.handle}
        >
          {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <TestTube className="h-4 w-4 mr-2" />}
          Testar Conexão
        </Button>
      </div>

      <Separator />
    </div>
  );
}

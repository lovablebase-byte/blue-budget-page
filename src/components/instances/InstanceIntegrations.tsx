/**
 * InstanceIntegrations — Unified integrations & webhooks panel for an instance.
 * Gated by plan features: api_access for endpoint, advanced_webhooks_enabled for webhooks.
 */
import { useState } from 'react';
import { useCompany } from '@/contexts/CompanyContext';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  Copy, Eye, EyeOff, Globe, Key, Webhook, Send,
  Loader2, Lock, CheckCircle2, XCircle, ExternalLink, Code,
} from 'lucide-react';
import { getDeliveryEndpoint } from '@/lib/instance-endpoint';
import { getWebhookEndpoint } from '@/lib/webhook-endpoint';
import { getProviderEvents } from '@/components/instances/constants';
import { callProviderProxy } from '@/components/instances/useProviderProxy';

interface Props {
  instance: {
    id: string;
    name: string;
    access_token: string;
    webhook_url: string | null;
    webhook_secret: string | null;
    provider: string;
    provider_instance_id: string | null;
    status: string;
  };
  actionsBlocked: boolean;
  onRefreshEvents?: () => void;
}

function FeatureLockedCard({ title, description }: { title: string; description: string }) {
  return (
    <Card className="border-border/40 bg-muted/10 opacity-80">
      <CardContent className="p-6 flex items-start gap-3">
        <div className="rounded-lg p-2 bg-muted/20 shrink-0">
          <Lock className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <p className="font-semibold text-sm">{title}</p>
          <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => window.open('mailto:suporte@exemplo.com', '_blank')}>
            Solicitar upgrade
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function InstanceIntegrations({ instance, actionsBlocked, onRefreshEvents }: Props) {
  const { hasFeature } = useCompany();
  const { isAdmin } = useAuth();
  const [showToken, setShowToken] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);

  const hasApiAccess = isAdmin || hasFeature('api_access');
  const hasWebhooks = isAdmin || hasFeature('advanced_webhooks_enabled');

  const deliveryEndpoint = getDeliveryEndpoint(instance.id, instance.access_token);
  const webhookUrl = instance.webhook_secret
    ? getWebhookEndpoint(instance.id, instance.webhook_secret, instance.provider)
    : instance.webhook_url || '';
  const providerEvents = getProviderEvents(instance.provider);
  const maskedToken = instance.access_token.slice(0, 4) + '••••••••';

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const apiBase = `https://${projectId}.supabase.co/functions/v1/public-api/v1`;
  const healthUrl = `${apiBase}/health`;
  const statusUrl = `${apiBase}/instances/status`;
  const sendTextUrl = `${apiBase}/messages/text`;
  const sendImageUrl = `${apiBase}/messages/image`;
  const sendDocumentUrl = `${apiBase}/messages/document`;
  const sendAudioUrl = `${apiBase}/messages/audio`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado!');
  };

  const handleTestWebhook = async () => {
    if (!webhookUrl) { toast.error('Webhook não configurado'); return; }
    setTestingWebhook(true);
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: instance.provider === 'wuzapi' ? 'Connected'
               : instance.provider === 'evolution_go' ? 'CONNECTION_UPDATE'
               : 'connection.update',
          type: instance.provider === 'wuzapi' ? 'Connected' : undefined,
          instance: instance.name,
          data: { state: 'open', statusReason: 200, _test: true },
        }),
      });
      if (res.ok) {
        toast.success('Evento de teste enviado!');
        onRefreshEvents?.();
      } else {
        const txt = await res.text().catch(() => '');
        toast.error(`Webhook retornou ${res.status}: ${txt}`);
      }
    } catch (e: any) {
      toast.error(e.message || 'Falha ao testar webhook');
    } finally {
      setTestingWebhook(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Integration status summary */}
      <Card className="border-border/40 bg-card/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Code className="h-4 w-4" /> Resumo da integração
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatusItem label="API" enabled={hasApiAccess} />
            <StatusItem label="Webhooks" enabled={hasWebhooks} />
            <StatusItem label="Endpoint ativo" enabled={!!instance.access_token} />
            <StatusItem label="Webhook configurado" enabled={!!webhookUrl} />
          </div>
        </CardContent>
      </Card>

      {/* API / Endpoint section */}
      {!hasApiAccess ? (
        <FeatureLockedCard
          title="Endpoint de API bloqueado"
          description="Seu plano atual não inclui acesso à API de integração. Solicite um upgrade para habilitar endpoints de produção."
        />
      ) : (
        <Card className="border-border/40 bg-card/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Globe className="h-4 w-4" /> Endpoint de Produção (API)
            </CardTitle>
            <CardDescription>Cole este endpoint no seu sistema de delivery para envio automático de mensagens via WhatsApp.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">URL do endpoint (recomendado)</Label>
              <div className="flex gap-2">
                <Input
                  value={`https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/api-send-text`}
                  readOnly
                  className="font-mono text-xs bg-muted/20"
                />
                <Button variant="outline" size="icon" onClick={() => copyToClipboard(`https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/api-send-text`)} title="Copiar endpoint">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Envie o token via header: <code className="bg-muted px-1 rounded">Authorization: Bearer SEU_TOKEN</code>.
                Aceita <code className="bg-muted px-1 rounded">multipart/form-data</code>, <code className="bg-muted px-1 rounded">JSON</code> e <code className="bg-muted px-1 rounded">form-urlencoded</code>. Campos: <code className="bg-muted px-1 rounded">phone_number</code> e <code className="bg-muted px-1 rounded">body</code>.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground/70">URL legado (compatibilidade)</Label>
              <div className="flex gap-2">
                <Input value={deliveryEndpoint} readOnly className="font-mono text-[11px] bg-muted/10 opacity-80" />
                <Button variant="outline" size="icon" onClick={() => copyToClipboard(deliveryEndpoint)} title="Copiar endpoint legado">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground/70">Mantido apenas para integrações antigas que enviam <code className="bg-muted px-1 rounded">?uuid=&access_token=</code> na URL.</p>
            </div>

            <Separator className="bg-border/30" />

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Token de acesso</Label>
              <div className="flex gap-2">
                <Input
                  type={showToken ? 'text' : 'password'}
                  value={showToken ? instance.access_token : maskedToken}
                  readOnly
                  className="font-mono text-xs bg-muted/20"
                />
                <Button variant="outline" size="icon" onClick={() => setShowToken(!showToken)} title={showToken ? 'Ocultar' : 'Mostrar'}>
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button variant="outline" size="icon" onClick={() => copyToClipboard(instance.access_token)} title="Copiar token">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-[11px] text-destructive/80">⚠ Não compartilhe este token. Ele permite enviar mensagens pela sua instância.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Public API v1 — multiuso (chatbots, CRMs, ERPs, delivery, etc) */}
      {hasApiAccess && (
        <Card className="border-border/40 bg-card/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Globe className="h-4 w-4" /> API Pública v1 <Badge variant="outline" className="text-[10px]">novo</Badge>
            </CardTitle>
            <CardDescription>
              Use a API pública v1 para integrar sua instância WhatsApp a chatbots, CRMs, ERPs, sistemas próprios,
              notificações, cobranças, agendamentos, delivery ou qualquer automação externa.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Health-check (público)</Label>
              <div className="flex gap-2">
                <Input value={healthUrl} readOnly className="font-mono text-xs bg-muted/20" />
                <Button variant="outline" size="icon" onClick={() => copyToClipboard(healthUrl)}><Copy className="h-4 w-4" /></Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Status da instância</Label>
              <div className="flex gap-2">
                <Input value={statusUrl} readOnly className="font-mono text-xs bg-muted/20" />
                <Button variant="outline" size="icon" onClick={() => copyToClipboard(statusUrl)}><Copy className="h-4 w-4" /></Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                <code className="bg-muted px-1 rounded">GET</code> com{' '}
                <code className="bg-muted px-1 rounded">Authorization: Bearer SEU_TOKEN</code>.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Envio de texto</Label>
              <div className="flex gap-2">
                <Input value={sendTextUrl} readOnly className="font-mono text-xs bg-muted/20" />
                <Button variant="outline" size="icon" onClick={() => copyToClipboard(sendTextUrl)}><Copy className="h-4 w-4" /></Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                <code className="bg-muted px-1 rounded">POST</code> aceitando <code className="bg-muted px-1 rounded">JSON</code>,{' '}
                <code className="bg-muted px-1 rounded">multipart/form-data</code> e{' '}
                <code className="bg-muted px-1 rounded">x-www-form-urlencoded</code>.
              </p>
            </div>

            <Separator className="bg-border/30" />

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Exemplo — JSON</Label>
              <pre className="text-[11px] bg-muted/30 p-3 rounded font-mono overflow-x-auto whitespace-pre-wrap">{`curl -X POST ${sendTextUrl} \\
  -H "Authorization: Bearer SEU_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"to":"5511999999999","text":"Olá!","external_id":"pedido_123"}'`}</pre>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Exemplo — multipart/form-data</Label>
              <pre className="text-[11px] bg-muted/30 p-3 rounded font-mono overflow-x-auto whitespace-pre-wrap">{`curl -X POST ${sendTextUrl} \\
  -H "Authorization: Bearer SEU_TOKEN" \\
  -F "to=5511999999999" \\
  -F "text=Olá!" \\
  -F "external_id=pedido_123"`}</pre>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Exemplo — x-www-form-urlencoded</Label>
              <pre className="text-[11px] bg-muted/30 p-3 rounded font-mono overflow-x-auto whitespace-pre-wrap">{`curl -X POST ${sendTextUrl} \\
  -H "Authorization: Bearer SEU_TOKEN" \\
  -H "Content-Type: application/x-www-form-urlencoded" \\
  --data-urlencode "to=5511999999999" \\
  --data-urlencode "text=Olá!" \\
  --data-urlencode "external_id=pedido_123"`}</pre>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Exemplo — Idempotency-Key (anti-duplicação)</Label>
              <pre className="text-[11px] bg-muted/30 p-3 rounded font-mono overflow-x-auto whitespace-pre-wrap">{`curl -X POST ${sendTextUrl} \\
  -H "Authorization: Bearer SEU_TOKEN" \\
  -H "Idempotency-Key: pedido_123_status_pago" \\
  -H "Content-Type: application/json" \\
  -d '{"to":"5511999999999","text":"Seu pagamento foi confirmado.","external_id":"pedido_123_status_pago"}'`}</pre>
              <p className="text-[11px] text-muted-foreground">
                Use <code className="bg-muted px-1 rounded">Idempotency-Key</code> ou <code className="bg-muted px-1 rounded">external_id</code> para evitar mensagens duplicadas em caso de retry do seu sistema. A chave é isolada por instância.
              </p>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Campos aceitos para destinatário: <code className="bg-muted px-1 rounded">to</code>, <code className="bg-muted px-1 rounded">phone</code>, <code className="bg-muted px-1 rounded">phone_number</code>, <code className="bg-muted px-1 rounded">number</code>, <code className="bg-muted px-1 rounded">destination</code>, <code className="bg-muted px-1 rounded">recipient</code>.
              Para a mensagem: <code className="bg-muted px-1 rounded">text</code>, <code className="bg-muted px-1 rounded">message</code>, <code className="bg-muted px-1 rounded">body</code>.
            </p>
            <p className="text-[11px] text-destructive/80">
              ⚠ O token concede acesso total de envio nesta instância. Nunca compartilhe nem inclua em código público.
            </p>
          </CardContent>
        </Card>
      )}

      {!hasWebhooks ? (
        <FeatureLockedCard
          title="Webhooks avançados bloqueados"
          description="Seu plano atual não inclui webhooks avançados. Solicite um upgrade para configurar recebimento de eventos."
        />
      ) : (
        <Card className="border-border/40 bg-card/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Webhook className="h-4 w-4" /> Webhook da instância
            </CardTitle>
            <CardDescription>URL de callback para receber eventos desta instância em tempo real.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">URL do Webhook</Label>
              <div className="flex gap-2">
                <Input value={webhookUrl || 'Não configurado'} readOnly className="font-mono text-xs bg-muted/20" />
                {webhookUrl && (
                  <Button variant="outline" size="icon" onClick={() => copyToClipboard(webhookUrl)} title="Copiar URL">
                    <Copy className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            {instance.webhook_secret && (
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Secret do Webhook</Label>
                <div className="flex gap-2">
                  <Input value={`${instance.webhook_secret.slice(0, 6)}••••••••`} readOnly className="font-mono text-xs bg-muted/20" />
                  <Button variant="outline" size="icon" onClick={() => copyToClipboard(instance.webhook_secret!)} title="Copiar secret">
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            <Separator className="bg-border/30" />

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Eventos assinados</Label>
              <div className="flex flex-wrap gap-1.5">
                {providerEvents.map(ev => (
                  <Badge key={ev} variant="outline" className="text-[10px] font-mono">{ev}</Badge>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground/70">
                Eventos configurados automaticamente pelo provider <span className="capitalize font-medium">{instance.provider}</span>.
              </p>
            </div>

            <Separator className="bg-border/30" />

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestWebhook}
                disabled={testingWebhook || actionsBlocked || !webhookUrl}
              >
                {testingWebhook ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
                Testar webhook
              </Button>
              <span className="text-[11px] text-muted-foreground">Envia um evento simulado para verificar a conectividade.</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatusItem({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-md bg-muted/20 border border-border/30">
      {enabled ? (
        <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
      ) : (
        <XCircle className="h-4 w-4 text-muted-foreground/50 shrink-0" />
      )}
      <span className={`text-xs ${enabled ? 'text-foreground' : 'text-muted-foreground/60'}`}>{label}</span>
    </div>
  );
}

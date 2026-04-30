/**
 * InstanceIntegrations — Unified integrations & webhooks panel for an instance.
 * Refactored for Stage 9: Improved Public API v1 documentation and usage.
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import {
  Copy, Eye, EyeOff, Globe, Webhook, Send,
  Loader2, Lock, CheckCircle2, XCircle, Code,
  Info, AlertTriangle, Terminal, ShieldCheck
} from 'lucide-react';
import { getDeliveryEndpoint, getLegacyApiSendTextBase, getPublicApiV1Base } from '@/lib/instance-endpoint';
import { getWebhookEndpoint } from '@/lib/webhook-endpoint';
import { getProviderEvents } from '@/components/instances/constants';
import { CustomerWebhooksPanel } from '@/components/instances/CustomerWebhooksPanel';

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

const TOKEN_PLACEHOLDER = 'TOKEN_DA_INSTANCIA';

function CodeBlock({
  code,
  title,
  realToken,
  showReal,
}: {
  code: string;
  title?: string;
  /** When provided + showReal=true, copy will substitute the placeholder by the real token. */
  realToken?: string;
  showReal?: boolean;
}) {
  const containsPlaceholder = code.includes(TOKEN_PLACEHOLDER);

  const copySafe = () => {
    navigator.clipboard.writeText(code);
    toast.success('Exemplo copiado (com placeholder).');
  };

  const copyWithRealToken = () => {
    if (!realToken) return copySafe();
    const replaced = code.split(TOKEN_PLACEHOLDER).join(realToken);
    navigator.clipboard.writeText(replaced);
    toast.warning('Exemplo copiado COM TOKEN REAL — não compartilhe.');
  };

  return (
    <div className="relative group rounded-md border border-border/40 bg-muted/30 overflow-hidden">
      {title && (
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/40 bg-muted/50">
          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{title}</span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={copySafe}
              title="Copiar com placeholder"
            >
              <Copy className="h-3 w-3" />
            </Button>
            {containsPlaceholder && realToken && showReal && (
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-warning"
                onClick={copyWithRealToken}
                title="Copiar com token real"
              >
                <ShieldCheck className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      )}
      {!title && (
        <Button variant="ghost" size="icon" className="absolute right-2 top-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" onClick={copySafe}>
          <Copy className="h-3 w-3" />
        </Button>
      )}
      <pre className="p-3 text-[11px] font-mono overflow-x-auto whitespace-pre leading-relaxed">
        {code}
      </pre>
    </div>
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
  const apiBase = getPublicApiV1Base();
  const legacySendTextBase = getLegacyApiSendTextBase();
  const usingCustomDomain = !!import.meta.env.VITE_PUBLIC_API_BASE_URL;
  const healthUrl = `${apiBase}/health`;
  const statusUrl = `${apiBase}/instances/status`;
  const sendTextUrl = `${apiBase}/messages/text`;
  const sendImageUrl = `${apiBase}/messages/image`;
  const sendDocumentUrl = `${apiBase}/messages/document`;
  const sendAudioUrl = `${apiBase}/messages/audio`;
  const sendMediaUrl = `${apiBase}/messages/media`;

  const copyToClipboard = (text: string, msg = 'Copiado!') => {
    navigator.clipboard.writeText(text);
    toast.success(msg);
  };

  /**
   * Copy a sensitive value (token, secret, Authorization header).
   * Always shows an explicit warning toast so the user is aware the clipboard
   * now holds a credential.
   */
  const copySensitive = (text: string, label = 'credencial') => {
    navigator.clipboard.writeText(text);
    toast.warning(`${label} copiada para a área de transferência — não compartilhe.`);
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
      <Card className="border-border/40 bg-card/80 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Code className="h-4 w-4 text-primary" /> Resumo da integração
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatusItem label="API Pública v1" enabled={hasApiAccess} />
            <StatusItem label="Webhooks" enabled={hasWebhooks} />
            <StatusItem label="Token ativo" enabled={!!instance.access_token} />
            <StatusItem label="Webhook configurado" enabled={!!webhookUrl} />
          </div>
        </CardContent>
      </Card>

      {!hasApiAccess ? (
        <FeatureLockedCard
          title="Acesso à API bloqueado"
          description="Seu plano atual não permite o uso da API externa. Faça um upgrade para integrar com sistemas externos."
        />
      ) : (
        <Card className="border-border/40 bg-card/80 shadow-sm overflow-hidden">
          <CardHeader className="bg-muted/30 border-b border-border/40 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Globe className="h-5 w-5 text-primary" /> API Pública v1
                </CardTitle>
                <CardDescription className="mt-1">
                  Integre sua instância com chatbots, CRMs, ERPs, sistemas de cobrança e automações.
                </CardDescription>
              </div>
              <Badge variant="success" className="bg-success/20 text-success hover:bg-success/30 border-success/30">
                Ativa
              </Badge>
            </div>
          </CardHeader>

          <Tabs defaultValue="overview" className="w-full">
            <div className="px-4 pt-4 border-b border-border/40 bg-muted/10">
              <TabsList className="h-9 w-full justify-start bg-transparent p-0 gap-4 overflow-x-auto">
                <TabsTrigger value="overview" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent shadow-none px-1 pb-2">Visão geral</TabsTrigger>
                <TabsTrigger value="auth" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent shadow-none px-1 pb-2">Autenticação</TabsTrigger>
                <TabsTrigger value="endpoints" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent shadow-none px-1 pb-2">Endpoints</TabsTrigger>
                <TabsTrigger value="examples" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent shadow-none px-1 pb-2">Exemplos</TabsTrigger>
                <TabsTrigger value="errors" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent shadow-none px-1 pb-2">Erros</TabsTrigger>
                <TabsTrigger value="legacy" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent shadow-none px-1 pb-2">Legado</TabsTrigger>
                <TabsTrigger value="outbound" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent shadow-none px-1 pb-2">Webhooks de saída</TabsTrigger>
              </TabsList>
            </div>

            <ScrollArea className="h-[500px]">
              <div className="p-6">
                <TabsContent value="overview" className="mt-0 space-y-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2 p-4 rounded-lg border border-border/40 bg-muted/20">
                      <div className="flex items-center gap-2 text-primary">
                        <ShieldCheck className="h-4 w-4" />
                        <h4 className="text-sm font-semibold">Segurança & Idempotência</h4>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Use <code className="bg-muted px-1 rounded">Idempotency-Key</code> ou <code className="bg-muted px-1 rounded">external_id</code> para evitar duplicidade de mensagens em caso de retentativa.
                      </p>
                    </div>
                    <div className="space-y-2 p-4 rounded-lg border border-border/40 bg-muted/20">
                      <div className="flex items-center gap-2 text-primary">
                        <Terminal className="h-4 w-4" />
                        <h4 className="text-sm font-semibold">Rate Limit</h4>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Proteção integrada contra abusos. Se exceder o limite, receberá um <code className="bg-muted px-1 rounded">HTTP 429</code>. Aguarde e tente novamente.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4 pt-2">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <Info className="h-4 w-4 text-primary" /> Capacidades do Provider
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className="flex items-center gap-1.5 py-1 px-2.5 bg-success/5 border-success/20">
                        <CheckCircle2 className="h-3 w-3 text-success" /> Texto
                      </Badge>
                      <Badge variant="outline" className="flex items-center gap-1.5 py-1 px-2.5 bg-success/5 border-success/20">
                        <CheckCircle2 className="h-3 w-3 text-success" /> Imagens
                      </Badge>
                      <Badge variant="outline" className="flex items-center gap-1.5 py-1 px-2.5 bg-success/5 border-success/20">
                        <CheckCircle2 className="h-3 w-3 text-success" /> Áudios
                      </Badge>
                      <Badge variant="outline" className="flex items-center gap-1.5 py-1 px-2.5 bg-success/5 border-success/20">
                        <CheckCircle2 className="h-3 w-3 text-success" /> Documentos
                      </Badge>
                      <Badge variant="outline" className="flex items-center gap-1.5 py-1 px-2.5 bg-success/5 border-success/20">
                        <CheckCircle2 className="h-3 w-3 text-success" /> Status Real-time
                      </Badge>
                      {instance.provider !== 'wuzapi' && (
                        <Badge variant="outline" className="flex items-center gap-1.5 py-1 px-2.5 bg-success/5 border-success/20">
                          <CheckCircle2 className="h-3 w-3 text-success" /> Vídeos
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                    <p className="text-xs text-primary font-medium">💡 Sugestão de uso:</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Ideal para notificações de pagamento, confirmações de agendamento, alertas de delivery e automação de atendimento via CRM.
                    </p>
                  </div>
                </TabsContent>

                <TabsContent value="auth" className="mt-0 space-y-6">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase">Token da Instância</Label>
                      <div className="flex gap-2">
                        <Input
                          type={showToken ? 'text' : 'password'}
                          value={showToken ? instance.access_token : maskedToken}
                          readOnly
                          className="font-mono text-xs bg-muted/30 border-border/40 h-10"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-10 w-10 shrink-0"
                          onClick={() => setShowToken(!showToken)}
                          title={showToken ? 'Ocultar token' : 'Revelar token'}
                        >
                          {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-10 w-10 shrink-0"
                          onClick={() => copySensitive(instance.access_token, 'Token da instância')}
                          title="Copiar token (sensível)"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex items-start gap-2 text-[11px] text-destructive mt-2 bg-destructive/5 p-2 rounded border border-destructive/20">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        <span>Aviso de segurança: Não compartilhe este token. Ele permite enviar mensagens pela sua instância.</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase">Exemplo de Header</Label>
                      <div className="flex gap-2">
                        <Input
                          value={
                            showToken
                              ? `Authorization: Bearer ${instance.access_token}`
                              : `Authorization: Bearer ${TOKEN_PLACEHOLDER}`
                          }
                          readOnly
                          className="font-mono text-xs bg-muted/30 border-border/40 h-10"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-10 w-10 shrink-0"
                          onClick={() =>
                            copyToClipboard(
                              `Authorization: Bearer ${TOKEN_PLACEHOLDER}`,
                              'Header copiado (com placeholder).'
                            )
                          }
                          title="Copiar header com placeholder"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-10 w-10 shrink-0 border-warning/40 text-warning"
                          onClick={() =>
                            copySensitive(
                              `Authorization: Bearer ${instance.access_token}`,
                              'Header Authorization (com token real)'
                            )
                          }
                          title="Copiar header com token real (sensível)"
                        >
                          <ShieldCheck className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Por padrão os exemplos usam <code className="bg-muted px-1 rounded">{TOKEN_PLACEHOLDER}</code>.
                        Use o botão <ShieldCheck className="inline h-3 w-3 text-warning" /> para copiar com o token real
                        (ação explícita).
                      </p>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="endpoints" className="mt-0 space-y-4">
                  <div className="grid gap-4">
                    <EndpointRow method="GET" path="/health" url={healthUrl} label="Health Check" onCopy={copyToClipboard} />
                    <EndpointRow method="GET" path="/instances/status" url={statusUrl} label="Status da Instância" onCopy={copyToClipboard} />
                    <EndpointRow method="POST" path="/messages/text" url={sendTextUrl} label="Enviar Texto" onCopy={copyToClipboard} />
                    <EndpointRow method="POST" path="/messages/media" url={sendMediaUrl} label="Enviar Mídia (Genérico)" onCopy={copyToClipboard} />
                    <EndpointRow method="POST" path="/messages/image" url={sendImageUrl} label="Enviar Imagem" onCopy={copyToClipboard} />
                    <EndpointRow method="POST" path="/messages/audio" url={sendAudioUrl} label="Enviar Áudio" onCopy={copyToClipboard} />
                    <EndpointRow method="POST" path="/messages/document" url={sendDocumentUrl} label="Enviar Documento" onCopy={copyToClipboard} />
                  </div>
                </TabsContent>

                <TabsContent value="examples" className="mt-0 space-y-6">
                  <div className="flex items-center justify-between p-3 rounded-lg border border-border/40 bg-muted/20">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                      Exemplos exibem <code className="bg-muted px-1 rounded">{TOKEN_PLACEHOLDER}</code> por padrão.
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[11px]"
                      onClick={() => setShowToken(!showToken)}
                    >
                      {showToken ? <EyeOff className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
                      {showToken ? 'Ocultar token real' : 'Habilitar copiar com token real'}
                    </Button>
                  </div>

                  <div className="space-y-6">
                    <section className="space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Status da Instância</h4>
                      <CodeBlock
                        title="cURL - GET Status"
                        realToken={instance.access_token}
                        showReal={showToken}
                        code={`curl -X GET "${statusUrl}" \\
  -H "Authorization: Bearer ${TOKEN_PLACEHOLDER}"`}
                      />
                      <CodeBlock
                        title="Resposta Esperada"
                        code={`{
  "success": true,
  "instance_id": "${instance.id}",
  "provider": "${instance.provider}",
  "status": "online",
  "connected": true,
  "phone_number": "..."
}`}
                      />
                    </section>

                    <Separator className="bg-border/30" />

                    <section className="space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Envio de Mensagem de Texto</h4>
                      <CodeBlock
                        title="cURL - JSON Payload"
                        realToken={instance.access_token}
                        showReal={showToken}
                        code={`curl -X POST "${sendTextUrl}" \\
  -H "Authorization: Bearer ${TOKEN_PLACEHOLDER}" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: msg_123" \\
  -d '{
    "to": "558796810157",
    "text": "Olá, esta é uma mensagem enviada pela API Pública v1.",
    "external_id": "msg_123"
  }'`}
                      />
                      <CodeBlock
                        title="cURL - Form Data"
                        realToken={instance.access_token}
                        showReal={showToken}
                        code={`curl -X POST "${sendTextUrl}" \\
  -H "Authorization: Bearer ${TOKEN_PLACEHOLDER}" \\
  -F "to=558796810157" \\
  -F "text=Mensagem via form-data" \\
  -F "external_id=form_123"`}
                      />
                    </section>

                    <Separator className="bg-border/30" />

                    <section className="space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Envio de Mídia (Imagem)</h4>
                      <CodeBlock
                        title="cURL - POST Image"
                        realToken={instance.access_token}
                        showReal={showToken}
                        code={`curl -X POST "${sendImageUrl}" \\
  -H "Authorization: Bearer ${TOKEN_PLACEHOLDER}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "558796810157",
    "media_url": "https://dominio.com/imagem.jpg",
    "caption": "Segue a imagem solicitada.",
    "external_id": "imagem_123"
  }'`}
                      />
                    </section>

                    <section className="space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Envio de Mídia (Documento)</h4>
                      <CodeBlock
                        title="cURL - POST Document"
                        realToken={instance.access_token}
                        showReal={showToken}
                        code={`curl -X POST "${sendDocumentUrl}" \\
  -H "Authorization: Bearer ${TOKEN_PLACEHOLDER}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "558796810157",
    "media_url": "https://dominio.com/arquivo.pdf",
    "filename": "boleto.pdf",
    "caption": "Segue o documento.",
    "external_id": "doc_123"
  }'`}
                      />
                    </section>
                  </div>
                </TabsContent>

                <TabsContent value="errors" className="mt-0 space-y-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <ErrorSample title="401: Token Inválido" code={`{
  "success": false,
  "error": "invalid_token",
  "message": "Token inválido."
}`} />
                    <ErrorSample title="403: Plano Limitado" code={`{
  "success": false,
  "error": "api_access_not_allowed",
  "message": "Seu plano não permite uso da API externa."
}`} />
                    <ErrorSample title="429: Rate Limit" code={`{
  "success": false,
  "error": "rate_limit_exceeded",
  "message": "Limite de envio excedido. Tente novamente em instantes."
}`} />
                    <ErrorSample title="409: Conflito Idempotência" code={`{
  "success": false,
  "error": "idempotency_conflict",
  "message": "A mesma chave foi usada com conteúdo diferente."
}`} />
                    <ErrorSample title="503: Instância Offline" code={`{
  "success": false,
  "error": "instance_offline",
  "message": "A instância está desconectada."
}`} />
                    <ErrorSample title="400: Limite Mensal" code={`{
  "success": false,
  "error": "monthly_message_limit_reached",
  "message": "Limite mensal de mensagens atingido."
}`} />
                  </div>
                </TabsContent>

                <TabsContent value="legacy" className="mt-0 space-y-4">
                  <div className="p-4 border border-warning/20 bg-warning/5 rounded-lg flex gap-3">
                    <Info className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-warning-foreground">Compatibilidade Legada</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Estes endpoints são mantidos apenas para sistemas antigos. Recomendamos migrar para a <span className="font-semibold">API Pública v1</span>.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                        Endpoint Legado (api-send-text) <Badge variant="outline" className="ml-1 text-[9px]">compatibilidade</Badge>
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          value={legacySendTextBase}
                          readOnly
                          className="font-mono text-xs bg-muted/20"
                        />
                        <Button variant="outline" size="icon" onClick={() => copyToClipboard(legacySendTextBase)}>
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Aceita <code className="bg-muted px-1 rounded">phone_number</code> e <code className="bg-muted px-1 rounded">body</code> via POST.
                        Para novos projetos, prefira a <span className="font-semibold">API Pública v1</span>.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                        URL de Callback (Delivery) — contém token
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          value={
                            showToken
                              ? deliveryEndpoint
                              : deliveryEndpoint.replace(instance.access_token, TOKEN_PLACEHOLDER)
                          }
                          readOnly
                          className="font-mono text-xs bg-muted/20 opacity-80"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setShowToken(!showToken)}
                          title={showToken ? 'Ocultar token' : 'Revelar token'}
                        >
                          {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="border-warning/40 text-warning"
                          onClick={() => copySensitive(deliveryEndpoint, 'URL de callback (com token)')}
                          title="Copiar URL com token real (sensível)"
                        >
                          <ShieldCheck className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-[11px] text-muted-foreground">Parâmetros via URL: <code className="bg-muted px-1 rounded">?uuid=&access_token=</code>.</p>
                    </div>
                  </div>
                </TabsContent>
              </div>
            </ScrollArea>
          </Tabs>
        </Card>
      )}

      {/* Webhook section */}
      {!hasWebhooks ? (
        <FeatureLockedCard
          title="Webhooks avançados bloqueados"
          description="Seu plano atual não inclui webhooks. Faça um upgrade para receber eventos em tempo real."
        />
      ) : (
        <Card className="border-border/40 bg-card/80 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Webhook className="h-4 w-4 text-primary" /> Webhook da Instância
            </CardTitle>
            <CardDescription>Receba notificações de mensagens, status e entregas em seu sistema.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">URL de Callback</Label>
                <div className="flex gap-2">
                  <Input value={webhookUrl || 'Não configurado'} readOnly className="font-mono text-xs bg-muted/30 h-9" />
                  {webhookUrl && (
                    <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => copyToClipboard(webhookUrl)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              {instance.webhook_secret && (
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase text-muted-foreground">Assinatura (Secret)</Label>
                  <div className="flex gap-2">
                    <Input value={`${instance.webhook_secret.slice(0, 6)}••••••••`} readOnly className="font-mono text-xs bg-muted/30 h-9" />
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 shrink-0 border-warning/40 text-warning"
                      onClick={() => copySensitive(instance.webhook_secret!, 'Webhook secret')}
                      title="Copiar secret (sensível)"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Eventos Assinados</Label>
              <div className="flex flex-wrap gap-2 p-3 rounded-lg border border-border/40 bg-muted/10">
                {providerEvents.map(ev => (
                  <Badge key={ev} variant="outline" className="text-[10px] font-mono bg-background/50 border-border/40 px-2">
                    {ev}
                  </Badge>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5" />
                Eventos detectados automaticamente para o provider <span className="font-semibold text-primary">{instance.provider}</span>.
              </p>
            </div>

            <Separator className="bg-border/30" />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-xs font-medium">Teste de Conectividade</p>
                <p className="text-[11px] text-muted-foreground">Envia um payload simulado para seu servidor.</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-4 border-border/60 hover:border-primary/50 transition-colors"
                onClick={handleTestWebhook}
                disabled={testingWebhook || actionsBlocked || !webhookUrl}
              >
                {testingWebhook ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                Testar Webhook
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatusItem({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 p-2.5 rounded-lg border transition-all ${
      enabled ? 'bg-success/5 border-success/20 text-foreground' : 'bg-muted/10 border-border/20 text-muted-foreground/60'
    }`}>
      {enabled ? (
        <div className="h-5 w-5 rounded-full bg-success/20 flex items-center justify-center">
          <CheckCircle2 className="h-3.5 w-3.5 text-success" />
        </div>
      ) : (
        <div className="h-5 w-5 rounded-full bg-muted/20 flex items-center justify-center">
          <XCircle className="h-3.5 w-3.5 text-muted-foreground/40" />
        </div>
      )}
      <span className="text-xs font-medium">{label}</span>
    </div>
  );
}

function EndpointRow({ method, path, url, label, onCopy }: { method: string, path: string, url: string, label: string, onCopy: any }) {
  const methodColor = method === 'GET' ? 'bg-info/20 text-info border-info/30' : 'bg-warning/20 text-warning border-warning/30';
  
  return (
    <div className="p-3 rounded-lg border border-border/40 bg-muted/10 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground/80">{label}</span>
        <Badge variant="outline" className={`text-[9px] font-bold ${methodColor}`}>{method}</Badge>
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input value={url} readOnly className="font-mono text-[10px] bg-muted/30 border-border/30 h-8 pr-8" />
          <span className="absolute right-2 top-1.5 text-[9px] font-mono text-muted-foreground/50">{path}</span>
        </div>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onCopy(url)}>
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function ErrorSample({ title, code }: { title: string, code: string }) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold text-destructive uppercase tracking-wider">{title}</p>
      <pre className="p-2 text-[10px] font-mono bg-muted/30 border border-border/40 rounded overflow-x-auto whitespace-pre">
        {code}
      </pre>
    </div>
  );
}

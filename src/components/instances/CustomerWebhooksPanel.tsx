/**
 * CustomerWebhooksPanel — Outbound webhooks management for an instance.
 * Lets the client register their own URLs to receive WhatsApp events
 * (chatbots, CRMs, ERPs, automations).
 */
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  Eye, EyeOff, Copy, RefreshCw, Send, Trash2, Plus,
  ShieldCheck, Loader2, CheckCircle2, XCircle, Clock, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  instance: {
    id: string;
    name: string;
    provider: string;
  };
  companyId: string;
}

interface CustomerWebhook {
  id: string;
  company_id: string;
  instance_id: string | null;
  url: string;
  secret: string;
  enabled: boolean;
  events: string[];
  description: string | null;
  created_at: string;
}

interface DeliveryRow {
  id: string;
  event_type: string;
  status: string;
  http_status: number | null;
  attempts: number;
  last_error: string | null;
  created_at: string;
  delivered_at: string | null;
}

const SUPPORTED_EVENTS = [
  { key: 'message.received',  label: 'Mensagem recebida' },
  { key: 'message.sent',      label: 'Mensagem enviada' },
  { key: 'message.delivered', label: 'Mensagem entregue' },
  { key: 'message.read',      label: 'Mensagem lida' },
  { key: 'message.failed',    label: 'Falha no envio' },
  { key: 'connection.open',   label: 'Conectado' },
  { key: 'connection.close',  label: 'Desconectado' },
  { key: 'connection.update', label: 'Atualização de conexão' },
  { key: 'provider.error',    label: 'Erro do provedor' },
];

function generateStrongSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function maskSecret(secret: string): string {
  if (!secret) return '';
  if (secret.length <= 8) return '••••••••';
  return `${secret.slice(0, 4)}${'•'.repeat(Math.max(8, secret.length - 8))}${secret.slice(-4)}`;
}

function statusBadge(status: string) {
  switch (status) {
    case 'delivered': return <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600"><CheckCircle2 className="h-3 w-3 mr-1" /> Entregue</Badge>;
    case 'failed':    return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Falhou</Badge>;
    case 'retrying':  return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" /> Repetindo</Badge>;
    case 'pending':   return <Badge variant="outline"><Clock className="h-3 w-3 mr-1" /> Pendente</Badge>;
    default:          return <Badge variant="outline">{status}</Badge>;
  }
}

export function CustomerWebhooksPanel({ instance, companyId }: Props) {
  const { isAdmin } = useAuth();
  const [hooks, setHooks] = useState<CustomerWebhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);

  // Editor state
  const [draft, setDraft] = useState<{
    url: string;
    description: string;
    events: string[];
    secret: string;
    scopeAll: boolean;
  }>({ url: '', description: '', events: [], secret: generateStrongSecret(), scopeAll: false });
  const [draftSecretRevealed, setDraftSecretRevealed] = useState(false);
  const [creating, setCreating] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    const [hooksRes, delsRes] = await Promise.all([
      supabase
        .from('customer_webhooks')
        .select('*')
        .eq('company_id', companyId)
        .or(`instance_id.eq.${instance.id},instance_id.is.null`)
        .order('created_at', { ascending: false }),
      supabase
        .from('customer_webhook_deliveries')
        .select('id, event_type, status, http_status, attempts, last_error, created_at, delivered_at, customer_webhook_id, instance_id')
        .eq('company_id', companyId)
        .or(`instance_id.eq.${instance.id},instance_id.is.null`)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);
    if (hooksRes.error) toast.error('Falha ao carregar webhooks');
    setHooks((hooksRes.data || []) as CustomerWebhook[]);
    setDeliveries((delsRes.data || []) as DeliveryRow[]);
    setLoading(false);
  }, [companyId, instance.id]);

  useEffect(() => { reload(); }, [reload]);

  const copyValue = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.warning(`${label} copiado. Trate como credencial sensível.`);
  };

  const handleCreate = async () => {
    if (!draft.url.trim()) { toast.error('Informe a URL'); return; }
    if (draft.events.length === 0) { toast.error('Selecione ao menos um evento'); return; }
    if (!isAdmin) { toast.error('Apenas administradores podem criar webhooks'); return; }
    setCreating(true);
    const { error } = await supabase.from('customer_webhooks').insert({
      company_id: companyId,
      instance_id: draft.scopeAll ? null : instance.id,
      url: draft.url.trim(),
      secret: draft.secret,
      enabled: true,
      events: draft.events,
      description: draft.description.trim() || null,
    });
    setCreating(false);
    if (error) {
      toast.error(`Falha ao criar: ${error.message}`);
      return;
    }
    toast.success('Webhook criado');
    setDraft({ url: '', description: '', events: [], secret: generateStrongSecret(), scopeAll: false });
    setDraftSecretRevealed(false);
    reload();
  };

  const toggleEnabled = async (h: CustomerWebhook) => {
    setSavingId(h.id);
    const { error } = await supabase.from('customer_webhooks')
      .update({ enabled: !h.enabled })
      .eq('id', h.id);
    setSavingId(null);
    if (error) toast.error('Falha ao atualizar');
    else { toast.success(h.enabled ? 'Webhook desativado' : 'Webhook ativado'); reload(); }
  };

  const rotateSecret = async (h: CustomerWebhook) => {
    if (!confirm('Gerar novo secret? O antigo deixará de funcionar imediatamente.')) return;
    const newSecret = generateStrongSecret();
    setSavingId(h.id);
    const { error } = await supabase.from('customer_webhooks')
      .update({ secret: newSecret })
      .eq('id', h.id);
    setSavingId(null);
    if (error) toast.error('Falha ao rotacionar');
    else { toast.success('Secret rotacionado'); reload(); }
  };

  const removeHook = async (h: CustomerWebhook) => {
    if (!confirm(`Excluir webhook para ${h.url}?`)) return;
    const { error } = await supabase.from('customer_webhooks').delete().eq('id', h.id);
    if (error) toast.error('Falha ao excluir');
    else { toast.success('Webhook excluído'); reload(); }
  };

  const testHook = async (h: CustomerWebhook) => {
    setTestingId(h.id);
    // Insert a test delivery; dispatcher worker will pick it up.
    // Payload event_type is webhook.test — does NOT change instance status.
    const { error } = await supabase.from('customer_webhook_deliveries').insert({
      customer_webhook_id: h.id,
      company_id: companyId,
      instance_id: instance.id,
      event_type: 'webhook.test',
      payload: {
        event: 'webhook.test',
        instance_id: instance.id,
        provider: instance.provider,
        message: 'Teste de webhook enviado com sucesso.',
        timestamp: new Date().toISOString(),
      },
      status: 'pending',
    });
    setTestingId(null);
    if (error) toast.error(`Falha ao agendar teste: ${error.message}`);
    else {
      toast.success('Teste enfileirado. A entrega aparecerá no histórico em instantes.');
      setTimeout(reload, 1500);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-border/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Send className="h-4 w-4 text-primary" />
            Webhooks de saída
          </CardTitle>
          <CardDescription>
            Receba eventos do WhatsApp (mensagens, conexão) na sua URL para integrar com chatbots, CRMs e automações.
            Cada envio é assinado com HMAC SHA-256 no header <code className="text-xs">X-Webhook-Signature</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Create form */}
          <div className="rounded-lg border border-border/50 p-4 space-y-3">
            <p className="text-sm font-semibold">Adicionar novo webhook</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cw-url">URL do seu endpoint</Label>
                <Input
                  id="cw-url"
                  placeholder="https://seu-sistema.com/webhooks/whatsapp"
                  value={draft.url}
                  onChange={(e) => setDraft(d => ({ ...d, url: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cw-desc">Descrição (opcional)</Label>
                <Input
                  id="cw-desc"
                  placeholder="CRM principal, Bot de atendimento..."
                  value={draft.description}
                  onChange={(e) => setDraft(d => ({ ...d, description: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Secret HMAC</Label>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={draftSecretRevealed ? draft.secret : maskSecret(draft.secret)}
                  className="font-mono text-xs"
                />
                <Button type="button" variant="ghost" size="icon" onClick={() => setDraftSecretRevealed(v => !v)}>
                  {draftSecretRevealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => copyValue(draft.secret, 'Secret')}>
                  <ShieldCheck className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => setDraft(d => ({ ...d, secret: generateStrongSecret() }))}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Guarde este secret no seu sistema. Você usará ele para validar a assinatura HMAC dos eventos recebidos.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Eventos a receber</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {SUPPORTED_EVENTS.map(ev => (
                  <label key={ev.key} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={draft.events.includes(ev.key)}
                      onCheckedChange={(c) => {
                        setDraft(d => ({
                          ...d,
                          events: c ? [...d.events, ev.key] : d.events.filter(e => e !== ev.key),
                        }));
                      }}
                    />
                    <span className="font-mono text-xs">{ev.key}</span>
                    <span className="text-muted-foreground">— {ev.label}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Lista vazia não envia nenhum evento.
              </p>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Switch checked={draft.scopeAll} onCheckedChange={(c) => setDraft(d => ({ ...d, scopeAll: c }))} />
                <span>Aplicar a todas as instâncias da empresa</span>
              </label>
              <Button onClick={handleCreate} disabled={creating || !isAdmin}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                Criar webhook
              </Button>
            </div>
            {!isAdmin && (
              <p className="text-xs text-amber-500 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Apenas administradores podem criar webhooks.
              </p>
            )}
          </div>

          <Separator />

          {/* List */}
          <div className="space-y-3">
            <p className="text-sm font-semibold">Webhooks configurados</p>
            {loading ? (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
              </div>
            ) : hooks.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum webhook configurado para esta instância.</p>
            ) : (
              <div className="space-y-2">
                {hooks.map(h => {
                  const isRevealed = !!revealed[h.id];
                  return (
                    <div key={h.id} className="rounded-lg border border-border/50 p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <code className="text-xs break-all">{h.url}</code>
                            {h.enabled ? <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600">Ativo</Badge> : <Badge variant="outline">Inativo</Badge>}
                            {h.instance_id ? <Badge variant="outline">Esta instância</Badge> : <Badge variant="secondary">Todas as instâncias</Badge>}
                          </div>
                          {h.description && <p className="text-xs text-muted-foreground mt-1">{h.description}</p>}
                          <div className="flex flex-wrap gap-1 mt-1">
                            {h.events.map(e => <Badge key={e} variant="outline" className="text-xs font-mono">{e}</Badge>)}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Switch checked={h.enabled} disabled={savingId === h.id || !isAdmin} onCheckedChange={() => toggleEnabled(h)} />
                          <Button variant="ghost" size="icon" disabled={testingId === h.id} onClick={() => testHook(h)} title="Testar webhook">
                            {testingId === h.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                          </Button>
                          <Button variant="ghost" size="icon" disabled={!isAdmin} onClick={() => rotateSecret(h)} title="Rotacionar secret">
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" disabled={!isAdmin} onClick={() => removeHook(h)} title="Excluir">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground shrink-0">Secret:</Label>
                        <code className="text-xs font-mono bg-muted/40 px-2 py-1 rounded flex-1 truncate">
                          {isRevealed ? h.secret : maskSecret(h.secret)}
                        </code>
                        <Button variant="ghost" size="icon" onClick={() => setRevealed(r => ({ ...r, [h.id]: !r[h.id] }))}>
                          {isRevealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => copyValue(h.secret, 'Secret')}>
                          <ShieldCheck className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <Separator />

          {/* Recent deliveries */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Últimas entregas</p>
              <Button variant="ghost" size="sm" onClick={reload}>
                <RefreshCw className="h-3 w-3 mr-1" /> Atualizar
              </Button>
            </div>
            {deliveries.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem entregas registradas ainda.</p>
            ) : (
              <div className="space-y-1.5 max-h-80 overflow-y-auto">
                {deliveries.map(d => (
                  <div key={d.id} className="flex items-center gap-2 text-xs border border-border/30 rounded px-2 py-1.5">
                    <span className="font-mono text-muted-foreground shrink-0">
                      {new Date(d.created_at).toLocaleString('pt-BR')}
                    </span>
                    <code className="font-mono shrink-0">{d.event_type}</code>
                    {statusBadge(d.status)}
                    {d.http_status != null && <span className="text-muted-foreground">HTTP {d.http_status}</span>}
                    <span className="text-muted-foreground">tent. {d.attempts}</span>
                    {d.last_error && <span className="text-destructive truncate">{d.last_error}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Signature reference */}
          <div className="rounded-lg border border-dashed border-border/40 p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-semibold text-foreground">Como validar a assinatura</p>
            <p>Headers enviados: <code>X-Webhook-Signature: sha256=&lt;hex&gt;</code>, <code>X-Webhook-Event</code>, <code>X-Webhook-Delivery</code>, <code>X-Webhook-Timestamp</code>.</p>
            <p>Base da assinatura: <code>HMAC_SHA256(secret, timestamp + "." + raw_body)</code>.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

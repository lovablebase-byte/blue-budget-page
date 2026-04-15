import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable, Column } from '@/components/DataTable';
import { toast } from 'sonner';
import {
  ArrowLeft, QrCode, RefreshCw, Copy,
  Send, Loader2, AlertCircle, Webhook, ScrollText,
  Key, Globe, Eye, EyeOff,
} from 'lucide-react';
import { getDeliveryEndpoint } from '@/lib/instance-endpoint';
import { getWebhookEndpoint } from '@/lib/webhook-endpoint';

import { ProviderBadge } from '@/components/instances/ProviderBadge';
import { StatusBadge } from '@/components/instances/StatusBadge';
import { callProviderProxy } from '@/components/instances/useProviderProxy';
import { getProviderEvents } from '@/components/instances/constants';

interface InstanceDetail {
  id: string;
  name: string;
  phone_number: string | null;
  status: string;
  webhook_url: string | null;
  webhook_secret: string | null;
  tags: string[];
  timezone: string;
  reconnect_policy: string;
  last_connected_at: string | null;
  created_at: string;
  updated_at?: string;
  evolution_instance_id: string | null;
  access_token: string;
  provider: string;
  provider_instance_id: string | null;
}

interface WebhookEvent {
  id: string;
  event_type: string;
  direction: string;
  status: string;
  created_at: string;
  payload: any;
}

const getProviderInstanceName = (inst: InstanceDetail): string => {
  // Evolution API uses the human-readable instance name
  if (inst.provider === 'evolution') {
    return inst.name;
  }
  // Wuzapi uses the token stored in provider_instance_id
  return inst.provider_instance_id || inst.name;
};

export default function InstanceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { company, isReadOnly } = useAuth();
  const { isSuspended } = useCompany();
  const [instance, setInstance] = useState<InstanceDetail | null>(null);
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [showQrDialog, setShowQrDialog] = useState(false);

  const handlePairQR = async () => {
    if (!instance) return;
    setActionLoading('qr');
    setQrCode(null);
    try {
      const providerName = getProviderInstanceName(instance);
      const webhookUrl = instance.webhook_secret
        ? getWebhookEndpoint(instance.id, instance.webhook_secret, instance.provider)
        : instance.webhook_url;
      const data = await callProviderProxy('connect', instance.provider, providerName, {
        webhook: webhookUrl || undefined,
        events: getProviderEvents(instance.provider),
      });
      const qr = data?.qrCode || data?.base64 || data?.qr?.data?.QRCode;
      if (qr) {
        setQrCode(qr);
        setShowQrDialog(true);
      } else if (data?.connected || data?.jid) {
        toast.success('Instância já está conectada!');
        refreshInstance();
      } else {
        setShowQrDialog(true);
        toast.info('Abra o WhatsApp no celular para escanear o QR Code');
      }
    } catch (e: any) {
      toast.error(e.message || 'Falha ao gerar QR Code');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReconnect = async () => {
    if (!instance) return;
    setActionLoading('reconnect');
    try {
      const providerName = getProviderInstanceName(instance);
      const webhookUrl = instance.webhook_secret
        ? getWebhookEndpoint(instance.id, instance.webhook_secret, instance.provider)
        : instance.webhook_url;
      await callProviderProxy('connect', instance.provider, providerName, {
        webhook: webhookUrl || undefined,
        events: getProviderEvents(instance.provider),
      });
      toast.success('Reconexão solicitada ao provider');
      setTimeout(refreshInstance, 2000);
    } catch (e: any) {
      toast.error(e.message || 'Falha ao reconectar');
    } finally {
      setActionLoading(null);
    }
  };

  const handleLogout = async () => {
    if (!instance) return;
    setActionLoading('logout');
    try {
      await callProviderProxy('logout', instance.provider, getProviderInstanceName(instance));
      await supabase.from('instances').update({ status: 'offline' }).eq('id', instance.id);
      toast.success('Instância desconectada');
      refreshInstance();
    } catch (e: any) {
      toast.error(e.message || 'Falha ao desconectar');
    } finally {
      setActionLoading(null);
    }
  };

  const handleTestWebhook = async () => {
    if (!instance) return;
    setActionLoading('webhook');
    try {
      const webhookUrl = instance.webhook_secret
        ? getWebhookEndpoint(instance.id, instance.webhook_secret, instance.provider)
        : instance.webhook_url;
      if (!webhookUrl) {
        toast.error('Webhook não configurado para esta instância');
        return;
      }
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: instance.provider === 'wuzapi' ? 'Connected' : 'connection.update',
          type: instance.provider === 'wuzapi' ? 'Connected' : undefined,
          instance: instance.name,
          data: { state: 'open', statusReason: 200, _test: true },
        }),
      });
      if (res.ok) {
        toast.success('Evento de teste enviado! Verifique na aba de Logs.');
        setTimeout(fetchEvents, 1500);
      } else {
        const txt = await res.text().catch(() => '');
        toast.error(`Webhook retornou ${res.status}: ${txt}`);
      }
    } catch (e: any) {
      toast.error(e.message || 'Falha ao testar webhook');
    } finally {
      setActionLoading(null);
    }
  };

  const refreshInstance = async () => {
    if (!id) return;
    const { data } = await supabase.from('instances').select('*').eq('id', id).single();
    if (data) setInstance(data as InstanceDetail);
  };

  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) { setLoadError('ID da instância não informado'); setLoading(false); return; }
    const fetchData = async () => {
      setLoading(true);
      setLoadError(null);
      const { data, error } = await supabase.from('instances').select('*').eq('id', id).single();
      if (error) {
        setLoadError(error.code === 'PGRST116' ? 'Instância não encontrada' : error.message);
        setLoading(false);
        return;
      }
      setInstance(data as InstanceDetail);
      setLoading(false);
    };
    fetchData();
  }, [id]);

  const fetchEvents = async () => {
    if (!id) return;
    setLoadingEvents(true);
    const { data } = await supabase
      .from('webhook_events')
      .select('*')
      .eq('instance_id', id)
      .order('created_at', { ascending: false })
      .limit(50);
    setEvents((data as WebhookEvent[]) || []);
    setLoadingEvents(false);
  };

  useEffect(() => { if (id) fetchEvents(); }, [id]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado!');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (loadError || !instance) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <h2 className="text-xl font-semibold">{loadError || 'Instância não encontrada'}</h2>
        <p className="text-muted-foreground text-sm">Verifique o ID ou se você tem permissão para acessar esta instância.</p>
        <Button variant="outline" onClick={() => navigate('/instances')}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar para Instâncias
        </Button>
      </div>
    );
  }

  const eventColumns: Column<WebhookEvent>[] = [
    { key: 'event_type', label: 'Evento', sortable: true },
    {
      key: 'direction', label: 'Direção', render: (r) =>
        <Badge variant="outline">{r.direction === 'inbound' ? '← Entrada' : '→ Saída'}</Badge>
    },
    { key: 'status', label: 'Status' },
    {
      key: 'created_at', label: 'Data', sortable: true,
      render: (r) => new Date(r.created_at).toLocaleString('pt-BR')
    },
  ];

  const isOnline = instance.status === 'online' || instance.status === 'connected';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/instances')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{instance.name}</h1>
          <p className="text-muted-foreground text-sm">{instance.phone_number || 'Número não registrado'}</p>
        </div>
        <ProviderBadge provider={instance.provider} className="mr-2" />
        <StatusBadge status={instance.status} />
      </div>

      {isSuspended && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <AlertCircle className="h-5 w-5 text-destructive" />
          <div>
            <p className="font-medium">Assinatura suspensa</p>
            <p className="text-sm text-muted-foreground">Ações de gerenciamento estão temporariamente indisponíveis.</p>
          </div>
        </div>
      )}

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Visão geral</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          <TabsTrigger value="logs">Logs de eventos</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Live status card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Status ao vivo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Conexão</span>
                  <StatusBadge status={instance.status} />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Provider</span>
                  <ProviderBadge provider={instance.provider} />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Reconexão</span>
                  <span className="text-sm capitalize">{instance.reconnect_policy}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Última conexão</span>
                  <span className="text-sm">
                    {instance.last_connected_at ? new Date(instance.last_connected_at).toLocaleString('pt-BR') : 'Nunca'}
                  </span>
                </div>
                <Separator />
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={handlePairQR} disabled={actionLoading === 'qr' || isSuspended || isReadOnly}>
                    {actionLoading === 'qr' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <QrCode className="h-3.5 w-3.5" />} Parear QR
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={handleReconnect} disabled={actionLoading === 'reconnect' || isSuspended || isReadOnly}>
                    {actionLoading === 'reconnect' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Reconectar
                  </Button>
                </div>
                {isOnline && (
                  <Button size="sm" variant="secondary" className="w-full gap-1" onClick={handleLogout} disabled={actionLoading === 'logout' || isSuspended || isReadOnly}>
                    {actionLoading === 'logout' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Desconectar
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Info card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Informações</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">ID</span>
                  <span className="text-xs font-mono text-muted-foreground">{instance.id.slice(0, 8)}...</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Fuso horário</span>
                  <span className="text-sm">{instance.timezone}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Tags</span>
                  <div className="flex gap-1">
                    {instance.tags?.length ? instance.tags.map(t =>
                      <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                    ) : <span className="text-sm text-muted-foreground">—</span>}
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Criada em</span>
                  <span className="text-sm">{new Date(instance.created_at).toLocaleDateString('pt-BR')}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Provider Instance ID</span>
                  <span className="text-xs font-mono text-muted-foreground">
                    {instance.provider_instance_id || instance.evolution_instance_id || '—'}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* API Endpoint */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Key className="h-4 w-4" /> Endpoint de Produção para Delivery
              </CardTitle>
              <CardDescription>Cole este endpoint diretamente no seu sistema de delivery para envio automático de mensagens via WhatsApp.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5" /> Endpoint de Produção (API)
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={getDeliveryEndpoint(instance.id, instance.access_token)}
                    readOnly
                    className="font-mono text-xs"
                  />
                  <Button variant="outline" size="icon" onClick={() => copyToClipboard(getDeliveryEndpoint(instance.id, instance.access_token))}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Aceita <code className="bg-muted px-1 rounded">multipart/form-data</code>, <code className="bg-muted px-1 rounded">JSON</code> e <code className="bg-muted px-1 rounded">form-urlencoded</code>. Campos aceitos: <code className="bg-muted px-1 rounded">phone_number</code> e <code className="bg-muted px-1 rounded">body</code>.
                </p>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Key className="h-3.5 w-3.5" /> Token da Sessão
                </Label>
                <div className="flex gap-2">
                  <Input
                    type={showToken ? 'text' : 'password'}
                    value={instance.access_token}
                    readOnly
                    className="font-mono text-xs"
                  />
                  <Button variant="outline" size="icon" onClick={() => setShowToken(!showToken)}>
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => copyToClipboard(instance.access_token)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex justify-between items-center pt-1">
                <span className="text-xs text-muted-foreground">Instância na API</span>
                <Badge variant="outline" className="font-mono text-xs">{instance.name}</Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="webhooks" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Webhook className="h-5 w-5" /> Configuração de Webhook</CardTitle>
              <CardDescription>URL para receber eventos desta instância</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>URL do Webhook</Label>
                <div className="flex gap-2">
                  <Input
                    value={instance.webhook_secret
                      ? getWebhookEndpoint(instance.id, instance.webhook_secret, instance.provider)
                      : instance.webhook_url || 'Não configurado'}
                    readOnly
                    className="font-mono text-xs"
                  />
                  <Button variant="outline" size="icon" onClick={() => copyToClipboard(
                    instance.webhook_secret
                      ? getWebhookEndpoint(instance.id, instance.webhook_secret, instance.provider)
                      : instance.webhook_url || ''
                  )}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  URL configurada automaticamente no provider para receber eventos em tempo real.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Secret</Label>
                <div className="flex gap-2">
                  <Input value={instance.webhook_secret || 'Não configurado'} readOnly className="font-mono text-xs" />
                  <Button variant="outline" size="icon" onClick={() => copyToClipboard(instance.webhook_secret || '')}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Eventos assinados</Label>
                <div className="flex flex-wrap gap-1">
                  {getProviderEvents(instance.provider).map(ev => (
                    <Badge key={ev} variant="outline" className="text-xs">{ev}</Badge>
                  ))}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={handleTestWebhook} disabled={actionLoading === 'webhook'}>
                {actionLoading === 'webhook' ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />} Testar webhook
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium flex items-center gap-2">
              <ScrollText className="h-5 w-5" /> Eventos recebidos e enviados
            </h3>
            <Button variant="outline" size="sm" onClick={fetchEvents}>
              <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
            </Button>
          </div>
          <DataTable
            data={events}
            columns={eventColumns}
            searchKey="event_type"
            searchPlaceholder="Buscar evento..."
            loading={loadingEvents}
            emptyMessage="Nenhum evento registrado."
            pageSize={15}
          />
        </TabsContent>
      </Tabs>

      {/* QR Code Dialog */}
      <Dialog open={showQrDialog} onOpenChange={setShowQrDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Parear WhatsApp</DialogTitle>
            <DialogDescription className="flex items-center gap-2">
              Escaneie o QR Code • <ProviderBadge provider={instance.provider} />
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="w-64 h-64 bg-card rounded-lg flex items-center justify-center border border-border/60 overflow-hidden shadow-[inset_0_0_20px_-8px_hsl(var(--primary)/0.1)]">
              {qrCode ? (
                <img src={qrCode} alt="QR Code" className="w-full h-full object-contain" />
              ) : (
                <div className="text-center text-muted-foreground p-4">
                  <QrCode className="h-16 w-16 mx-auto mb-2" />
                  <p className="text-sm">Clique para gerar</p>
                </div>
              )}
            </div>
            <Button onClick={handlePairQR} disabled={actionLoading === 'qr'}>
              {actionLoading === 'qr' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <QrCode className="h-4 w-4 mr-2" />}
              {qrCode ? 'Atualizar QR' : 'Gerar QR Code'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

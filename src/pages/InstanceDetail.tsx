import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useIsPlatformAdmin } from '@/hooks/use-plan-enforcement';
import { useCompany } from '@/contexts/CompanyContext';
import { useFeatureEnabled } from '@/hooks/use-plan-enforcement';
import { PlanStatusBanner } from '@/components/PlanStatusBanner';
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
import { notify } from '@/lib/notifications';
import {
  ArrowLeft, QrCode, RefreshCw, Copy, Power, PowerOff,
  Send, Loader2, AlertCircle, Webhook, ScrollText, Pencil, Check, X,
  Key, Globe, Eye, EyeOff, RotateCcw, Clock, Phone, Calendar,
  Fingerprint, Tag, Shield, Settings,
} from 'lucide-react';
import { getDeliveryEndpoint } from '@/lib/instance-endpoint';
import { getWebhookEndpoint } from '@/lib/webhook-endpoint';
import {
  fetchCompanyActiveProviders,
  getProviderConfigurationError,
  hasActiveProviderConfig,
  type ActiveProvider,
} from '@/lib/whatsapp-provider-config';

import { ProviderBadge } from '@/components/instances/ProviderBadge';
import { StatusBadge } from '@/components/instances/StatusBadge';
import { callProviderProxy } from '@/components/instances/useProviderProxy';
import { syncSingleInstanceStatus } from '@/services/instances-sync';
import { getProviderEvents } from '@/components/instances/constants';
import { InstanceActivityLog } from '@/components/instances/InstanceActivityLog';
import { InstanceIntegrations } from '@/components/instances/InstanceIntegrations';
import {
  normalizeProviderStatus,
  extractWhatsappPhone,
} from '@/lib/whatsapp-normalizers';

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
  if (inst.provider === 'evolution') return inst.name;
  if (inst.provider === 'evolution_go') return inst.provider_instance_id || inst.name;
  if (inst.provider === 'wppconnect') return inst.name;
  if (inst.provider === 'quepasa') return inst.name;
  return inst.provider_instance_id || inst.name;
};

export default function InstanceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { company, hasPermission, isReadOnly, isAdmin } = useAuth();
  const { data: isPlatformAdmin = false } = useIsPlatformAdmin();
  const { isSuspended } = useCompany();
  const instanceFeature = useFeatureEnabled('instances_enabled');
  const [instance, setInstance] = useState<InstanceDetail | null>(null);
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [activeProviders, setActiveProviders] = useState<ActiveProvider[]>([]);
  const [showQrDialog, setShowQrDialog] = useState(false);
  const [connectionSuccess, setConnectionSuccess] = useState(false);
  const [autoCloseCountdown, setAutoCloseCountdown] = useState<number | null>(null);

  // Edit name
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState('');

  // Send test message
  const [showTestMsg, setShowTestMsg] = useState(false);
  const [testNumber, setTestNumber] = useState('');
  const [testMessage, setTestMessage] = useState('');
  const [sendingTest, setSendingTest] = useState(false);

  // Bypass comercial SOMENTE para admin global da plataforma.
  const featureBlocked = !isPlatformAdmin && instanceFeature.data === false;
  const actionsBlocked = isSuspended || isReadOnly || featureBlocked;

  useEffect(() => {
    if (!company?.id) return;
    fetchCompanyActiveProviders(company.id).then(setActiveProviders);
  }, [company?.id]);

  const refreshInstance = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase.from('instances').select('*').eq('id', id).single();
    if (data) setInstance(data as InstanceDetail);
  }, [id]);

  const syncInstanceStatus = useCallback(async (inst: InstanceDetail) => {
    const updated = await syncSingleInstanceStatus(inst as any, activeProviders);
    if (updated && (updated.status !== inst.status || updated.phone_number !== inst.phone_number)) {
      setInstance((prev) => (prev ? { ...prev, ...updated } as InstanceDetail : prev));
    }
  }, [activeProviders]);

  useEffect(() => {
    if (!id) { setLoadError('ID da instância não informado'); setLoading(false); return; }
    const fetchData = async () => {
      setLoading(true);
      setLoadError(null);
      const { data, error } = await supabase.from('instances').select('*').eq('id', id).single();
      if (error) {
        if (error.code === 'PGRST116') setLoadError('not_found');
        else if (error.code === '42501' || error.message?.includes('permission')) setLoadError('no_permission');
        else setLoadError(error.message);
        setLoading(false);
        return;
      }
      setInstance(data as InstanceDetail);
      setLoading(false);
    };
    fetchData();
  }, [id]);

  useEffect(() => {
    if (!instance) return;
    void syncInstanceStatus(instance);
  }, [instance?.id, activeProviders, syncInstanceStatus]);

  const fetchEvents = useCallback(async () => {
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
  }, [id]);

  useEffect(() => { if (id) fetchEvents(); }, [id, fetchEvents]);

  // Poll connection when QR dialog is open
  useEffect(() => {
    if (!showQrDialog || !instance || connectionSuccess || !hasActiveProviderConfig(activeProviders, instance.provider)) return;
    const providerName = getProviderInstanceName(instance);
    if (!providerName) return;
    const poll = setInterval(async () => {
      try {
        const res = await callProviderProxy('status', instance.provider, providerName);
        const norm = normalizeProviderStatus(res, instance.provider);
        if (norm.connected) {
          setConnectionSuccess(true);
          const phone = extractWhatsappPhone(res?.instance) || extractWhatsappPhone(res);
          const nowIso = new Date().toISOString();
          const updateData: Record<string, any> = {
            status: 'online',
            last_connected_at: nowIso,
          };
          if (phone) updateData.phone_number = phone;
          await supabase.from('instances').update(updateData).eq('id', instance.id);
          setInstance(prev => prev ? {
            ...prev,
            status: 'online',
            last_connected_at: nowIso,
            phone_number: phone || prev.phone_number,
          } : prev);
        }
      } catch {}
    }, 5000);
    return () => clearInterval(poll);
  }, [showQrDialog, instance, connectionSuccess, activeProviders]);

  // Auto-close on connection success
  useEffect(() => {
    if (!connectionSuccess) return;
    setAutoCloseCountdown(3);
    const interval = setInterval(() => {
      setAutoCloseCountdown(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          setShowQrDialog(false);
          setConnectionSuccess(false);
          setQrCode(null);
          setAutoCloseCountdown(null);
          refreshInstance();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [connectionSuccess, refreshInstance]);

  const copyToClipboard = (text: string, label?: string) => {
    navigator.clipboard.writeText(text);
    notify.copied(label);
  };

  // --- Actions ---
  const handlePairQR = async () => {
    if (!instance) return;
    if (!hasActiveProviderConfig(activeProviders, instance.provider)) {
      toast.error(getProviderConfigurationError(instance.provider));
      return;
    }

    setActionLoading('qr');
    setQrCode(null);
    setConnectionSuccess(false);
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
        const normalized = qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`;
        setQrCode(normalized);
        setShowQrDialog(true);
      } else if (data?.connected || data?.jid) {
        notify.instanceConnected(instance.name);
        refreshInstance();
      } else {
        setShowQrDialog(true);
        toast.info('Abra o WhatsApp no celular para escanear o QR Code');
      }
    } catch (e: any) {
      notify.integrationError(e.message || 'Falha ao gerar QR Code');
    } finally {
      setActionLoading(null);
    }
  };

  const handleConnect = async () => {
    if (!instance) return;
    if (!hasActiveProviderConfig(activeProviders, instance.provider)) {
      toast.error(getProviderConfigurationError(instance.provider));
      return;
    }

    setActionLoading('connect');
    try {
      const providerName = getProviderInstanceName(instance);
      const webhookUrl = instance.webhook_secret
        ? getWebhookEndpoint(instance.id, instance.webhook_secret, instance.provider)
        : instance.webhook_url;
      await callProviderProxy('connect', instance.provider, providerName, {
        webhook: webhookUrl || undefined,
        events: getProviderEvents(instance.provider),
      });
      toast.success('Conexão solicitada');
      setTimeout(refreshInstance, 2000);
    } catch (e: any) {
      toast.error(e.message || 'Falha ao conectar');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDisconnect = async () => {
    if (!instance) return;
    if (!hasActiveProviderConfig(activeProviders, instance.provider)) {
      toast.error(getProviderConfigurationError(instance.provider));
      return;
    }

    setActionLoading('disconnect');
    try {
      await callProviderProxy('logout', instance.provider, getProviderInstanceName(instance));
      await supabase.from('instances').update({ status: 'offline' }).eq('id', instance.id);
      notify.instanceDisconnected(instance.name);
      setInstance(prev => prev ? { ...prev, status: 'offline' } : prev);
    } catch (e: any) {
      toast.error(e.message || 'Falha ao desconectar');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRestart = async () => {
    if (!instance) return;
    if (!hasActiveProviderConfig(activeProviders, instance.provider)) {
      toast.error(getProviderConfigurationError(instance.provider));
      return;
    }

    setActionLoading('restart');
    try {
      const providerName = getProviderInstanceName(instance);
      try { await callProviderProxy('logout', instance.provider, providerName); } catch {}
      const webhookUrl = instance.webhook_secret
        ? getWebhookEndpoint(instance.id, instance.webhook_secret, instance.provider)
        : instance.webhook_url;
      await callProviderProxy('connect', instance.provider, providerName, {
        webhook: webhookUrl || undefined,
        events: getProviderEvents(instance.provider),
      });
      notify.instanceRestarted(instance.name);
      setTimeout(refreshInstance, 3000);
    } catch (e: any) {
      toast.error(e.message || 'Falha ao reiniciar');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSaveName = async () => {
    if (!instance || !editName.trim()) return;
    const { error } = await supabase.from('instances').update({ name: editName.trim() }).eq('id', instance.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Nome atualizado');
    setInstance(prev => prev ? { ...prev, name: editName.trim() } : prev);
    setEditingName(false);
  };

  const handleSendTest = async () => {
    if (!instance || !testNumber.trim() || !testMessage.trim()) return;
    setSendingTest(true);
    try {
      const endpoint = getDeliveryEndpoint(instance.id, instance.access_token);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number: testNumber.replace(/\D/g, ''), body: testMessage }),
      });
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      toast.success('Mensagem de teste enviada!');
      setShowTestMsg(false);
      setTestNumber('');
      setTestMessage('');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSendingTest(false);
    }
  };


  // --- Loading ---
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // --- Error states ---
  if (loadError || !instance) {
    const isNotFound = loadError === 'not_found';
    const isNoPermission = loadError === 'no_permission';
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <div className={`rounded-full p-4 ${isNoPermission ? 'bg-warning/10' : 'bg-destructive/10'}`}>
          {isNoPermission ? (
            <Shield className="h-10 w-10 text-warning" />
          ) : (
            <AlertCircle className="h-10 w-10 text-destructive" />
          )}
        </div>
        <div className="text-center space-y-1 max-w-sm">
          <h2 className="text-xl font-semibold">
            {isNotFound ? 'Instância não encontrada' : isNoPermission ? 'Acesso restrito' : 'Erro ao carregar'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isNotFound
              ? 'A instância solicitada não existe ou foi removida da sua conta.'
              : isNoPermission
              ? 'Você não tem permissão para acessar esta instância. Verifique com o administrador da sua empresa.'
              : loadError || 'Não foi possível carregar os dados. Tente novamente em alguns instantes.'}
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate('/instances')}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar para Instâncias
        </Button>
      </div>
    );
  }

  const statusKey = String(instance.status || '').toLowerCase();
  const isOnline = statusKey === 'online' || statusKey === 'connected' || statusKey === 'open';
  const isOffline = !isOnline && (statusKey === 'offline' || statusKey === 'close' || statusKey === 'closed' || statusKey === 'disconnected');
  const canEdit = hasPermission('instances', 'edit') && !isReadOnly;

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

  const InfoRow = ({ icon: Icon, label, value, mono }: { icon: any; label: string; value: React.ReactNode; mono?: boolean }) => (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      <span className={`text-sm ${mono ? 'font-mono text-xs' : ''}`}>{value || '—'}</span>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Plan enforcement banner */}
      {featureBlocked && (
        <PlanStatusBanner featureBlocked featureLabel="Instâncias WhatsApp" />
      )}

      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" className="mt-1 shrink-0" onClick={() => navigate('/instances')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {editingName ? (
              <div className="flex items-center gap-2">
                <Input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="h-8 text-lg font-bold w-60"
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false); }}
                />
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleSaveName}>
                  <Check className="h-4 w-4 text-success" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingName(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <h1 className="text-2xl font-bold tracking-tight truncate">{instance.name}</h1>
                {canEdit && !actionsBlocked && (
                  <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => { setEditName(instance.name); setEditingName(true); }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <ProviderBadge provider={instance.provider} />
            <StatusBadge status={instance.status} />
            {instance.phone_number && (
              <Badge variant="outline" className="text-xs gap-1">
                <Phone className="h-3 w-3" />
                {instance.phone_number}
              </Badge>
            )}
          </div>
        </div>

        {/* Quick actions header */}
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={refreshInstance} disabled={!!actionLoading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${actionLoading ? 'animate-spin' : ''}`} /> Sync
          </Button>
        </div>
      </div>

      {/* Action buttons bar */}
      {!actionsBlocked && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={handlePairQR} disabled={!!actionLoading}>
            {actionLoading === 'qr' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <QrCode className="h-4 w-4 mr-1.5" />}
            QR Code
          </Button>
          {isOffline && (
            <Button size="sm" variant="outline" onClick={handleConnect} disabled={!!actionLoading}>
              {actionLoading === 'connect' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Power className="h-4 w-4 mr-1.5" />}
              Conectar
            </Button>
          )}
          {isOnline && (
            <Button size="sm" variant="outline" onClick={handleDisconnect} disabled={!!actionLoading}>
              {actionLoading === 'disconnect' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <PowerOff className="h-4 w-4 mr-1.5" />}
              Desconectar
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={handleRestart} disabled={!!actionLoading}>
            {actionLoading === 'restart' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-1.5" />}
            Reiniciar
          </Button>
          {isOnline && (
            <Button size="sm" variant="outline" onClick={() => setShowTestMsg(true)} disabled={!!actionLoading}>
              <Send className="h-4 w-4 mr-1.5" /> Enviar teste
            </Button>
          )}
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Visão geral</TabsTrigger>
          <TabsTrigger value="integrations">Integrações</TabsTrigger>
          <TabsTrigger value="activity">Histórico</TabsTrigger>
          <TabsTrigger value="logs">Eventos brutos</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Status card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Settings className="h-4 w-4" /> Status e conexão
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-0 divide-y divide-border/50">
                <InfoRow icon={Fingerprint} label="Status" value={<StatusBadge status={instance.status} />} />
                <InfoRow icon={Globe} label="Provider" value={<ProviderBadge provider={instance.provider} />} />
                <InfoRow icon={Phone} label="Número" value={instance.phone_number || 'Não registrado'} />
                <InfoRow icon={Shield} label="Reconexão" value={<span className="capitalize">{instance.reconnect_policy}</span>} />
                <InfoRow icon={Clock} label="Última conexão" value={
                  instance.last_connected_at
                    ? new Date(instance.last_connected_at).toLocaleString('pt-BR')
                    : 'Nunca conectou'
                } />
                <InfoRow icon={Calendar} label="Criada em" value={new Date(instance.created_at).toLocaleString('pt-BR')} />
                {instance.updated_at && (
                  <InfoRow icon={RefreshCw} label="Última sincronização" value={new Date(instance.updated_at).toLocaleString('pt-BR')} />
                )}
              </CardContent>
            </Card>

            {/* Info card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Key className="h-4 w-4" /> Identificadores
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-0 divide-y divide-border/50">
                <InfoRow icon={Fingerprint} label="Instance ID" value={
                  <button onClick={() => copyToClipboard(instance.id)} className="hover:text-primary transition-colors">
                    {instance.id.slice(0, 12)}…
                  </button>
                } mono />
                <InfoRow icon={Fingerprint} label="Session ID" value={
                  instance.provider_instance_id || instance.evolution_instance_id
                    ? <button onClick={() => copyToClipboard(instance.provider_instance_id || instance.evolution_instance_id || '')} className="hover:text-primary transition-colors truncate max-w-[180px] block">
                        {(instance.provider_instance_id || instance.evolution_instance_id || '').slice(0, 16)}…
                      </button>
                    : '—'
                } mono />
                <InfoRow icon={Globe} label="Fuso horário" value={instance.timezone} />
                <InfoRow icon={Tag} label="Tags" value={
                  instance.tags?.length
                    ? <div className="flex gap-1 flex-wrap justify-end">{instance.tags.map(t => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}</div>
                    : '—'
                } />
                <InfoRow icon={Key} label="Instância na API" value={
                  <Badge variant="outline" className="font-mono text-[10px]">{instance.name}</Badge>
                } />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Integrations */}
        <TabsContent value="integrations" className="space-y-4 mt-4">
          <InstanceIntegrations
            instance={instance}
            actionsBlocked={actionsBlocked}
            onRefreshEvents={fetchEvents}
          />
        </TabsContent>

        {/* Activity / History */}
        <TabsContent value="activity" className="space-y-4 mt-4">
          <InstanceActivityLog instanceId={instance.id} />
        </TabsContent>

        {/* Raw Logs */}
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
            emptyMessage="Nenhum evento registrado ainda. Eventos aparecerão conforme a instância for utilizada."
            pageSize={15}
          />
        </TabsContent>
      </Tabs>

      {/* QR Code Dialog */}
      <Dialog open={showQrDialog} onOpenChange={v => { if (!v) { setShowQrDialog(false); setConnectionSuccess(false); setQrCode(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Parear WhatsApp</DialogTitle>
            <DialogDescription className="flex items-center gap-2">
              Escaneie o QR Code • <ProviderBadge provider={instance.provider} />
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            {connectionSuccess ? (
              <div className="flex flex-col items-center gap-3 py-6">
                <div className="rounded-full p-4 bg-success/10">
                  <Check className="h-10 w-10 text-success" />
                </div>
                <p className="text-lg font-semibold">Conectado com sucesso!</p>
                {autoCloseCountdown !== null && (
                  <p className="text-sm text-muted-foreground">Fechando em {autoCloseCountdown}s...</p>
                )}
              </div>
            ) : (
              <>
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
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Send test message dialog */}
      <Dialog open={showTestMsg} onOpenChange={setShowTestMsg}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar mensagem de teste</DialogTitle>
            <DialogDescription>Envie uma mensagem de teste via {instance.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Número (com DDI)</Label>
              <Input placeholder="5511999999999" value={testNumber} onChange={e => setTestNumber(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Mensagem</Label>
              <Input placeholder="Olá, teste!" value={testMessage} onChange={e => setTestMessage(e.target.value)} />
            </div>
            <Button onClick={handleSendTest} disabled={sendingTest || !testNumber.trim() || !testMessage.trim()} className="w-full">
              {sendingTest ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Enviar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

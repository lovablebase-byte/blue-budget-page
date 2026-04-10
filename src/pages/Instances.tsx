import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { DataTable, Column } from '@/components/DataTable';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  Plus, RefreshCw, Trash2, QrCode, Send, Power, PowerOff,
  MoreHorizontal, Eye, Loader2, Smartphone, Wifi, WifiOff, AlertCircle,
  Copy, RotateCcw, Link, Key, CheckCircle2,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getDeliveryEndpoint } from '@/lib/instance-endpoint';

interface Instance {
  id: string;
  company_id: string;
  name: string;
  phone_number: string | null;
  status: string;
  webhook_url: string | null;
  tags: string[];
  timezone: string;
  reconnect_policy: string;
  last_connected_at: string | null;
  created_at: string;
  evolution_instance_id: string | null;
  access_token: string;
  provider: string;
  provider_instance_id: string | null;
}

interface ActiveProvider {
  provider: string;
  is_default: boolean;
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof Wifi }> = {
  online: { label: 'Online', variant: 'default', icon: Wifi },
  offline: { label: 'Offline', variant: 'secondary', icon: WifiOff },
  connecting: { label: 'Conectando', variant: 'outline', icon: RefreshCw },
  pairing: { label: 'Pareando', variant: 'outline', icon: QrCode },
  error: { label: 'Erro', variant: 'destructive', icon: AlertCircle },
};

const providerLabels: Record<string, string> = {
  evolution: 'Evolution',
  wuzapi: 'Wuzapi',
};

const TIMEZONES = [
  'America/Sao_Paulo', 'America/Manaus', 'America/Fortaleza',
  'America/Cuiaba', 'America/Belem', 'America/Recife',
  'America/Bahia', 'America/Porto_Velho', 'America/Rio_Branco',
];

export default function Instances() {
  const { company, hasPermission, isReadOnly } = useAuth();
  const navigate = useNavigate();
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showTestMsg, setShowTestMsg] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showPostCreate, setShowPostCreate] = useState(false);
  const [selectedInstance, setSelectedInstance] = useState<Instance | null>(null);
  const [createdInstance, setCreatedInstance] = useState<Instance | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Active providers
  const [activeProviders, setActiveProviders] = useState<ActiveProvider[]>([]);

  // QR Code states
  const [qrCodeBase64, setQrCodeBase64] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [connectionSuccess, setConnectionSuccess] = useState(false);
  const [autoCloseCountdown, setAutoCloseCountdown] = useState<number | null>(null);

  // Form states
  const [newName, setNewName] = useState('');
  const [newTags, setNewTags] = useState('');
  const [newTimezone, setNewTimezone] = useState('America/Sao_Paulo');
  const [newReconnect, setNewReconnect] = useState('auto');
  const [newProvider, setNewProvider] = useState('');
  const [copyFromInstance, setCopyFromInstance] = useState('');
  const [testNumber, setTestNumber] = useState('');
  const [testMessage, setTestMessage] = useState('');
  const [sendingTest, setSendingTest] = useState(false);

  // Fetch active providers
  const fetchActiveProviders = async () => {
    if (!company) return;
    const { data } = await supabase
      .from('whatsapp_api_configs')
      .select('provider, is_default')
      .eq('company_id', company.id)
      .eq('is_active', true);

    const providers = (data || []) as ActiveProvider[];

    // If no providers in new table, check legacy
    if (providers.length === 0) {
      const { data: legacy } = await supabase
        .from('evolution_api_config')
        .select('is_active')
        .eq('company_id', company.id)
        .eq('is_active', true)
        .limit(1);
      if (legacy?.length) {
        providers.push({ provider: 'evolution', is_default: true });
      }
    }

    setActiveProviders(providers);

    // Auto-select provider
    if (providers.length === 1) {
      setNewProvider(providers[0].provider);
    } else {
      const def = providers.find(p => p.is_default);
      if (def) setNewProvider(def.provider);
    }
  };

  // Helper to get instance identifier for provider calls
  const getProviderInstanceName = (instance: Instance): string => {
    return instance.provider_instance_id || instance.evolution_instance_id || instance.name;
  };

  const callProviderProxy = async (action: string, provider?: string, instanceName?: string, payload?: any) => {
    const res = await supabase.functions.invoke('whatsapp-provider-proxy', {
      body: { action, provider, instanceName, payload },
    });

    if (res.error) {
      const invokeError: any = res.error;
      const errorContext = invokeError?.context;
      let errorDetails: any = null;
      if (errorContext) {
        errorDetails = await errorContext.clone().json().catch(async () => {
          const rawText = await errorContext.text().catch(() => '');
          return rawText ? { raw: rawText } : null;
        });
      }
      throw new Error(errorDetails?.error || invokeError.message || 'Erro ao chamar proxy');
    }

    if (res.data?.error) {
      throw new Error(res.data.error);
    }

    return res.data;
  };

  const writeDeleteAuditLog = async (instanceId: string, payload: Record<string, any>) => {
    try {
      await supabase.rpc('log_audit', {
        _action: 'instance_delete_sync',
        _entity_type: 'instance',
        _entity_id: instanceId,
        _payload: payload,
      });
    } catch {
      // Do not block main flow
    }
  };

  const syncInstanceStatus = async (instance: Instance): Promise<Instance> => {
    const providerName = getProviderInstanceName(instance);
    if (!providerName || providerName === instance.name && !instance.evolution_instance_id && !instance.provider_instance_id) {
      return instance;
    }
    try {
      const res = await callProviderProxy('status', instance.provider, providerName);
      const state = res?.instance?.state || '';
      let newStatus = instance.status;
      if (state === 'open' || state === 'connected') newStatus = 'online';
      else if (state === 'close' || state === 'disconnected') newStatus = 'offline';
      else if (state === 'connecting') newStatus = 'connecting';
      else if (state === 'not_found') {
        if (instance.status !== 'error') {
          await supabase.from('instances').update({ status: 'error' }).eq('id', instance.id);
        }
        return { ...instance, status: 'error' };
      }
      if (newStatus !== instance.status) {
        const updateData: Record<string, any> = { status: newStatus };
        if (newStatus === 'online') updateData.last_connected_at = new Date().toISOString();
        await supabase.from('instances').update(updateData).eq('id', instance.id);
        return { ...instance, status: newStatus };
      }
      return instance;
    } catch {
      return instance;
    }
  };

  const fetchInstances = async () => {
    if (!company) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('instances')
      .select('*')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false });
    if (error) { toast.error(error.message); setLoading(false); return; }

    const dbInstances = (data as Instance[]) || [];
    setInstances(dbInstances);
    setLoading(false);

    // Sync status in background
    const synced = await Promise.all(dbInstances.map(syncInstanceStatus));
    const changed = synced.some((s, i) => s.status !== dbInstances[i]?.status);
    if (changed) setInstances(synced);
  };

  useEffect(() => { fetchInstances(); fetchActiveProviders(); }, [company]);
  useEffect(() => {
    const interval = setInterval(fetchInstances, 30000);
    return () => clearInterval(interval);
  }, [company]);

  // Poll connection status when QR modal is open
  useEffect(() => {
    const instanceToWatch = showPostCreate ? createdInstance : showQR ? selectedInstance : null;
    if (!instanceToWatch || connectionSuccess) return;
    const providerName = getProviderInstanceName(instanceToWatch);
    if (!providerName) return;

    const pollInterval = setInterval(async () => {
      try {
        const res = await callProviderProxy('status', instanceToWatch.provider, providerName);
        const state = res?.instance?.state || '';
        if (state === 'open' || state === 'connected') {
          setConnectionSuccess(true);
          await supabase.from('instances').update({
            status: 'online',
            last_connected_at: new Date().toISOString(),
          }).eq('id', instanceToWatch.id);
        }
      } catch {}
    }, 5000);

    return () => clearInterval(pollInterval);
  }, [showPostCreate, showQR, createdInstance, selectedInstance, connectionSuccess]);

  // Auto-close countdown
  useEffect(() => {
    if (!connectionSuccess) return;
    setAutoCloseCountdown(3);
    const countdownInterval = setInterval(() => {
      setAutoCloseCountdown(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(countdownInterval);
          setShowPostCreate(false);
          setShowQR(false);
          setConnectionSuccess(false);
          setQrCodeBase64(null);
          setQrError(null);
          setAutoCloseCountdown(null);
          fetchInstances();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(countdownInterval);
  }, [connectionSuccess]);

  const resetForm = () => {
    setNewName(''); setNewTags(''); setNewTimezone('America/Sao_Paulo');
    setNewReconnect('auto'); setCopyFromInstance('');
    // Re-select default provider
    if (activeProviders.length === 1) {
      setNewProvider(activeProviders[0].provider);
    } else {
      const def = activeProviders.find(p => p.is_default);
      setNewProvider(def?.provider || '');
    }
  };

  const handleCreate = async () => {
    if (!company || !newName.trim() || !newProvider) return;
    setCreating(true);
    try {
      const instanceName = newName.trim();
      const webhookUrl = `${window.location.origin}/api/webhooks/${company.slug}`;
      let providerInstanceId: string | null = null;
      let evolutionInstanceId: string | null = null;
      let providerActive = false;

      // Create via provider proxy
      try {
        const createData = await callProviderProxy('create', newProvider, instanceName, {
          webhook: webhookUrl,
          webhookByEvents: true,
          events: ['messages.upsert', 'send.message', 'connection.update', 'qrcode.updated', 'messages.update'],
        });

        if (newProvider === 'evolution') {
          providerInstanceId = createData?.instanceId || createData?.instanceName || instanceName;
          evolutionInstanceId = providerInstanceId;
        } else if (newProvider === 'wuzapi') {
          providerInstanceId = createData?.instanceToken || createData?.instanceId || instanceName;
        }
        providerActive = true;
        toast.success('Instância criada no provider!');
      } catch (err: any) {
        if (err.message?.includes('não configurad') || err.message?.includes('desativad')) {
          toast.info('Provider não configurado. Instância criada apenas no painel.');
        } else {
          throw err;
        }
      }

      // Save to DB
      const { data, error } = await supabase.from('instances').insert({
        company_id: company.id,
        name: instanceName,
        provider: newProvider,
        provider_instance_id: providerInstanceId,
        evolution_instance_id: evolutionInstanceId,
        webhook_url: webhookUrl,
        tags: newTags ? newTags.split(',').map(t => t.trim()) : [],
        timezone: newTimezone,
        reconnect_policy: newReconnect,
        status: providerActive ? 'pairing' : 'offline',
      }).select().single();
      if (error) throw error;

      setShowCreate(false);
      resetForm();
      setCreatedInstance(data as Instance);
      setShowPostCreate(true);
      fetchInstances();

      if (providerActive) {
        setTimeout(() => fetchQRCode(data as Instance), 500);
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedInstance) return;
    setDeleting(true);

    try {
      const { data: freshInstance, error: freshError } = await supabase
        .from('instances')
        .select('*')
        .eq('id', selectedInstance.id)
        .single();
      if (freshError) throw freshError;
      const instance = freshInstance as Instance;

      const providerName = getProviderInstanceName(instance);

      // Delete in provider first
      if (providerName) {
        try {
          await callProviderProxy('delete', instance.provider, providerName);
        } catch (err: any) {
          const isNotFound = err?.message && /404|not\s*found/i.test(err.message);
          if (!isNotFound) {
            toast.error(`Falha ao excluir no provider: ${err.message}`);
            return;
          }
        }
      }

      // Delete locally
      const { error: localErr } = await supabase.from('instances').delete().eq('id', instance.id);
      if (localErr) throw localErr;

      await writeDeleteAuditLog(instance.id, {
        provider: instance.provider,
        provider_instance_id: instance.provider_instance_id,
        name: instance.name,
        deleted_at: new Date().toISOString(),
      });

      toast.success('Instância excluída com sucesso');
      setShowDelete(false);
      setSelectedInstance(null);
      fetchInstances();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleStatusChange = async (instance: Instance, newStatus: string) => {
    if (newStatus === 'offline') {
      // Logout via provider
      try {
        await callProviderProxy('logout', instance.provider, getProviderInstanceName(instance));
      } catch {}
    }
    const { error } = await supabase.from('instances').update({ status: newStatus }).eq('id', instance.id);
    if (error) toast.error(error.message);
    else {
      toast.success(`Status alterado para ${statusConfig[newStatus]?.label || newStatus}`);
      fetchInstances();
    }
  };

  const handleRestart = async (instance: Instance) => {
    await handleStatusChange(instance, 'connecting');
    try {
      await callProviderProxy('connect', instance.provider, getProviderInstanceName(instance));
    } catch {}
    setTimeout(() => fetchInstances(), 3000);
  };

  const handleSendTest = async () => {
    if (!testNumber || !testMessage || !selectedInstance) return;
    setSendingTest(true);
    try {
      await callProviderProxy('sendText', selectedInstance.provider, getProviderInstanceName(selectedInstance), {
        number: testNumber,
        text: testMessage,
      });
      toast.success('Mensagem teste enviada!');
      setShowTestMsg(false);
      setTestNumber(''); setTestMessage('');
    } catch (e: any) {
      toast.error(e.message || 'Falha ao enviar');
    } finally {
      setSendingTest(false);
    }
  };

  const copyToClipboard = (text: string, label?: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label || 'Valor'} copiado!`);
  };

  const fetchQRCode = async (instanceOrName: Instance | string) => {
    if (!company) return;
    const instance = typeof instanceOrName === 'string'
      ? instances.find(i => i.name === instanceOrName) || createdInstance
      : instanceOrName;
    if (!instance) return;

    setQrCodeBase64(null);
    setQrError(null);
    setQrLoading(true);
    try {
      const providerName = getProviderInstanceName(instance);
      const data = await callProviderProxy('connect', instance.provider, providerName);

      const qr = data?.qrCode || data?.base64 || data?.qr?.data?.QRCode;
      if (qr) {
        setQrCodeBase64(qr);
      } else if (data?.connected || data?.jid) {
        setConnectionSuccess(true);
      } else {
        setQrError('A instância pode já estar conectada.');
      }
    } catch (err: any) {
      setQrError(err.message || 'Falha ao gerar QR Code');
    } finally {
      setQrLoading(false);
    }
  };

  const columns: Column<Instance>[] = [
    { key: 'name', label: 'Nome', sortable: true },
    { key: 'phone_number', label: 'Número', render: (r) => r.phone_number || '—' },
    {
      key: 'provider', label: 'Provider', render: (r) => (
        <Badge variant="outline" className="text-xs font-mono">
          {providerLabels[r.provider] || r.provider}
        </Badge>
      )
    },
    {
      key: 'status', label: 'Status', render: (r) => {
        const cfg = statusConfig[r.status] || statusConfig.offline;
        const Icon = cfg.icon;
        return (
          <Badge variant={cfg.variant} className="gap-1">
            <Icon className={`h-3 w-3 ${r.status === 'connecting' ? 'animate-spin' : ''}`} /> {cfg.label}
          </Badge>
        );
      }
    },
    {
      key: 'tags', label: 'Tags', render: (r) =>
        r.tags?.length ? r.tags.map(t => <Badge key={t} variant="outline" className="mr-1 text-xs">{t}</Badge>) : '—'
    },
    {
      key: 'last_connected_at', label: 'Última conexão', render: (r) =>
        r.last_connected_at ? new Date(r.last_connected_at).toLocaleString('pt-BR') : 'Nunca'
    },
  ];

  const canCreate = hasPermission('instances', 'create');
  const canDelete = hasPermission('instances', 'delete');

  const onlineCount = instances.filter(i => i.status === 'online').length;
  const offlineCount = instances.filter(i => i.status !== 'online').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Instâncias WhatsApp</h1>
          <p className="text-muted-foreground">Gerencie suas conexões do WhatsApp</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchInstances}>
            <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
          </Button>
          {canCreate && !isReadOnly && (
            <Button size="sm" onClick={() => { fetchActiveProviders(); setShowCreate(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Nova instância
            </Button>
          )}
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <Smartphone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{instances.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Online</CardTitle>
            <Wifi className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{onlineCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Offline</CardTitle>
            <WifiOff className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{offlineCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Data table */}
      <DataTable
        data={instances}
        columns={columns}
        searchKey="name"
        searchPlaceholder="Buscar instância..."
        loading={loading}
        emptyMessage="Nenhuma instância criada ainda."
        actions={(row) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => { setSelectedInstance(row); setShowQR(true); }}>
                <QrCode className="mr-2 h-4 w-4" /> Parear QR Code
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setSelectedInstance(row); setShowTestMsg(true); }}>
                <Send className="mr-2 h-4 w-4" /> Enviar teste
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {row.status === 'online' ? (
                <DropdownMenuItem onClick={() => handleStatusChange(row, 'offline')}>
                  <PowerOff className="mr-2 h-4 w-4" /> Desconectar
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => handleStatusChange(row, 'connecting')}>
                  <Power className="mr-2 h-4 w-4" /> Conectar
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => handleRestart(row)}>
                <RotateCcw className="mr-2 h-4 w-4" /> Reiniciar sessão
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(`/instances/${row.id}`)}>
                <Eye className="mr-2 h-4 w-4" /> Ver detalhes
              </DropdownMenuItem>
              {canDelete && !isReadOnly && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive" onClick={() => { setSelectedInstance(row); setShowDelete(true); }}>
                    <Trash2 className="mr-2 h-4 w-4" /> Excluir
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      />

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={(o) => { setShowCreate(o); if (!o) resetForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova instância</DialogTitle>
            <DialogDescription>Crie uma nova conexão WhatsApp</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Provider selector */}
            <div className="space-y-2">
              <Label>Provider *</Label>
              {activeProviders.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  Nenhum provider ativo. Configure em Configurações.
                </div>
              ) : (
                <Select value={newProvider} onValueChange={setNewProvider}>
                  <SelectTrigger><SelectValue placeholder="Selecione o provider" /></SelectTrigger>
                  <SelectContent>
                    {activeProviders.map(p => (
                      <SelectItem key={p.provider} value={p.provider}>
                        {providerLabels[p.provider] || p.provider}
                        {p.is_default ? ' (padrão)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label>Nome da instância *</Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ex: Suporte Principal" />
            </div>
            <div className="space-y-2">
              <Label>Fuso horário</Label>
              <Select value={newTimezone} onValueChange={setNewTimezone}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map(tz => (
                    <SelectItem key={tz} value={tz}>{tz.replace('America/', '')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {instances.length > 0 && (
              <div className="space-y-2">
                <Label>Copiar regras de outra instância</Label>
                <Select value={copyFromInstance} onValueChange={setCopyFromInstance}>
                  <SelectTrigger><SelectValue placeholder="Nenhuma (criar do zero)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma (criar do zero)</SelectItem>
                    {instances.map(inst => (
                      <SelectItem key={inst.id} value={inst.id}>{inst.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Saudações, ausência e configurações serão copiadas</p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Tags (separadas por vírgula)</Label>
              <Input value={newTags} onChange={e => setNewTags(e.target.value)} placeholder="suporte, vendas" />
            </div>
            <div className="space-y-2">
              <Label>Reconexão automática</Label>
              <Select value={newReconnect} onValueChange={setNewReconnect}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Automática</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleCreate}
              disabled={creating || !newName.trim() || !newProvider || activeProviders.length === 0}
              className="w-full"
            >
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Criar instância
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Post-creation info dialog */}
      <Dialog open={showPostCreate} onOpenChange={(o) => { setShowPostCreate(o); if (!o) { setConnectionSuccess(false); setAutoCloseCountdown(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary">
              <Smartphone className="h-5 w-5" /> Instância criada!
            </DialogTitle>
            <DialogDescription>
              Escaneie o QR Code para conectar • Provider: {providerLabels[createdInstance?.provider || ''] || createdInstance?.provider}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {connectionSuccess ? (
              <div className="flex flex-col items-center gap-4 py-8">
                <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <CheckCircle2 className="h-12 w-12 text-green-600 dark:text-green-400" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-lg font-semibold text-green-700 dark:text-green-400">WhatsApp conectado com sucesso!</p>
                  <p className="text-sm text-muted-foreground">
                    Fechando automaticamente em {autoCloseCountdown ?? 0} segundo{autoCloseCountdown !== 1 ? 's' : ''}...
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* QR Code */}
                <div className="flex flex-col items-center gap-3 py-3">
                  <div className="w-52 h-52 bg-muted rounded-lg flex items-center justify-center border-2 border-dashed border-border overflow-hidden">
                    {qrLoading ? (
                      <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
                    ) : qrCodeBase64 ? (
                      <img src={qrCodeBase64} alt="QR Code" className="w-full h-full object-contain" />
                    ) : (
                      <div className="text-center text-muted-foreground p-4">
                        <QrCode className="h-14 w-14 mx-auto mb-2" />
                        <p className="text-sm font-medium">QR Code</p>
                        <p className="text-xs">{qrError || 'Clique para gerar'}</p>
                      </div>
                    )}
                  </div>
                  {!qrLoading && !qrCodeBase64 && createdInstance && (
                    <Button variant="outline" size="sm" onClick={() => fetchQRCode(createdInstance)}>
                      <QrCode className="h-4 w-4 mr-2" /> Gerar QR Code
                    </Button>
                  )}
                  {qrCodeBase64 && createdInstance && (
                    <Button variant="outline" size="sm" onClick={() => fetchQRCode(createdInstance)}>
                      <RefreshCw className="h-4 w-4 mr-2" /> Atualizar QR Code
                    </Button>
                  )}
                </div>

                <Separator />

                {/* API endpoint */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5"><Link className="h-3.5 w-3.5" /> Endpoint de Produção (Delivery)</Label>
                  <div className="flex gap-2">
                    <Input
                      value={createdInstance ? getDeliveryEndpoint(createdInstance.id, createdInstance.access_token) : ''}
                      readOnly
                      className="font-mono text-xs"
                    />
                    <Button variant="outline" size="icon" onClick={() => createdInstance && copyToClipboard(getDeliveryEndpoint(createdInstance.id, createdInstance.access_token), 'Endpoint')}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Cole esta URL no seu sistema de delivery.</p>
                </div>

                {/* Session token */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5"><Key className="h-3.5 w-3.5" /> Token da sessão</Label>
                  <div className="flex gap-2">
                    <Input value={createdInstance?.access_token || ''} readOnly className="font-mono text-xs" />
                    <Button variant="outline" size="icon" onClick={() => copyToClipboard(createdInstance?.access_token || '', 'Token')}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button variant="outline" className="flex-1" onClick={() => setShowPostCreate(false)}>
                    Fechar
                  </Button>
                  <Button className="flex-1" onClick={() => { setShowPostCreate(false); navigate(`/instances/${createdInstance?.id}`); }}>
                    <Eye className="h-4 w-4 mr-1" /> Ver detalhes
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* QR Code dialog */}
      <Dialog open={showQR} onOpenChange={(o) => { setShowQR(o); if (!o) { setQrCodeBase64(null); setQrError(null); setConnectionSuccess(false); setAutoCloseCountdown(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Parear WhatsApp</DialogTitle>
            <DialogDescription>
              Escaneie o QR Code • Provider: {providerLabels[selectedInstance?.provider || ''] || selectedInstance?.provider}
            </DialogDescription>
          </DialogHeader>
          {connectionSuccess ? (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle2 className="h-12 w-12 text-green-600 dark:text-green-400" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-lg font-semibold text-green-700 dark:text-green-400">WhatsApp conectado com sucesso!</p>
                <p className="text-sm text-muted-foreground">
                  Fechando automaticamente em {autoCloseCountdown ?? 0} segundo{autoCloseCountdown !== 1 ? 's' : ''}...
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-64 h-64 bg-muted rounded-lg flex items-center justify-center border-2 border-dashed border-border overflow-hidden">
                {qrLoading ? (
                  <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
                ) : qrCodeBase64 ? (
                  <img src={qrCodeBase64} alt="QR Code" className="w-full h-full object-contain" />
                ) : (
                  <div className="text-center text-muted-foreground p-4">
                    <QrCode className="h-16 w-16 mx-auto mb-2" />
                    <p className="text-sm">{qrError || 'Clique abaixo para gerar'}</p>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button onClick={() => selectedInstance && fetchQRCode(selectedInstance)} disabled={qrLoading}>
                  {qrLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <QrCode className="h-4 w-4 mr-2" />}
                  {qrCodeBase64 ? 'Atualizar QR' : 'Gerar QR Code'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Instância: <strong>{selectedInstance?.name}</strong>
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Test message dialog */}
      <Dialog open={showTestMsg} onOpenChange={setShowTestMsg}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar mensagem teste</DialogTitle>
            <DialogDescription>
              Envie uma mensagem de teste via {selectedInstance?.name} ({providerLabels[selectedInstance?.provider || ''] || selectedInstance?.provider})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Número (com DDI)</Label>
              <Input value={testNumber} onChange={e => setTestNumber(e.target.value)} placeholder="5511999999999" />
            </div>
            <div className="space-y-2">
              <Label>Mensagem</Label>
              <Textarea value={testMessage} onChange={e => setTestMessage(e.target.value)} placeholder="Olá! Esta é uma mensagem de teste." rows={3} />
            </div>
            <Button onClick={handleSendTest} disabled={sendingTest || !testNumber || !testMessage} className="w-full">
              {sendingTest && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Send className="mr-2 h-4 w-4" /> Enviar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <ConfirmDialog
        open={showDelete}
        onOpenChange={setShowDelete}
        title="Excluir instância"
        description={`Tem certeza que deseja excluir "${selectedInstance?.name}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        variant="destructive"
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}

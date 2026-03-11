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
}

interface EvolutionRemoteInstance {
  instanceName: string | null;
  instanceId: string | null;
  raw: Record<string, any>;
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof Wifi }> = {
  online: { label: 'Online', variant: 'default', icon: Wifi },
  offline: { label: 'Offline', variant: 'secondary', icon: WifiOff },
  connecting: { label: 'Conectando', variant: 'outline', icon: RefreshCw },
  pairing: { label: 'Pareando', variant: 'outline', icon: QrCode },
  error: { label: 'Erro', variant: 'destructive', icon: AlertCircle },
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
  const [copyFromInstance, setCopyFromInstance] = useState('');
  const [testNumber, setTestNumber] = useState('');
  const [testMessage, setTestMessage] = useState('');
  const [sendingTest, setSendingTest] = useState(false);

  const extractEvolutionRemoteInstance = (item: any): EvolutionRemoteInstance => {
    const source = item?.instance ?? item ?? {};
    return {
      instanceName: source.instanceName ?? source.name ?? item?.instanceName ?? item?.name ?? null,
      instanceId: source.instanceId ?? source.id ?? item?.instanceId ?? item?.id ?? null,
      raw: item ?? {},
    };
  };

  const normalizeEvolutionInstances = (raw: any): EvolutionRemoteInstance[] => {
    const list = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.instances)
        ? raw.instances
        : Array.isArray(raw?.data)
          ? raw.data
          : [];

    return list
      .map(extractEvolutionRemoteInstance)
      .filter((item) => item.instanceName || item.instanceId);
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
      // Do not block main flow on audit failures
    }
  };

  const syncInstanceStatus = async (instance: Instance): Promise<Instance> => {
    // Only sync instances that were actually created in Evolution API
    if (!instance.evolution_instance_id) return instance;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return instance;

      const res = await supabase.functions.invoke('evolution-proxy', {
        body: { action: 'status', instanceName: instance.evolution_instance_id },
      });

      // Handle errors - supabase.functions.invoke puts error info in res.error for non-2xx
      if (res.error) {
        // Instance doesn't exist in Evolution API - mark as error and stop polling
        if (instance.status !== 'error') {
          await supabase.from('instances').update({ status: 'error', evolution_instance_id: null }).eq('id', instance.id);
        }
        return { ...instance, status: 'error', evolution_instance_id: null };
      }

      if (res.data?.error) {
        if (instance.status !== 'error') {
          await supabase.from('instances').update({ status: 'error', evolution_instance_id: null }).eq('id', instance.id);
        }
        return { ...instance, status: 'error', evolution_instance_id: null };
      }

      const evoState = res.data?.instance?.state || res.data?.state || '';
      let newStatus = instance.status;
      if (evoState === 'open' || evoState === 'connected') {
        newStatus = 'online';
      } else if (evoState === 'close' || evoState === 'disconnected') {
        newStatus = 'offline';
      } else if (evoState === 'connecting') {
        newStatus = 'connecting';
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

  const reconcileWithEvolution = async (localInstances: Instance[]) => {
    // Only reconcile instances that have an evolution_instance_id
    const linkedInstances = localInstances.filter(i => i.evolution_instance_id);
    if (linkedInstances.length === 0) return localInstances;

    try {
      const remoteData = await callEvolutionProxy('fetchInstances');
      const remoteInstances = normalizeEvolutionInstances(remoteData);
      const remoteKeys = new Set(
        remoteInstances.flatMap((item) => [item.instanceName, item.instanceId].filter(Boolean) as string[])
      );

      // Mark instances that no longer exist in Evolution
      const updates: Promise<any>[] = [];
      const reconciled = localInstances.map(inst => {
        if (inst.evolution_instance_id && !remoteKeys.has(inst.evolution_instance_id)) {
          console.warn('[RECONCILE] Instância órfã detectada (removida da Evolution):', {
            localId: inst.id, name: inst.name, evolutionId: inst.evolution_instance_id,
          });
          updates.push(
            Promise.resolve(supabase.from('instances').update({ status: 'error', evolution_instance_id: null }).eq('id', inst.id))
          );
          return { ...inst, status: 'error', evolution_instance_id: null };
        }
        return inst;
      });

      if (updates.length > 0) {
        await Promise.all(updates);
        toast.info(`${updates.length} instância(s) removida(s) externamente foram detectadas e atualizadas.`);
      }

      return reconciled;
    } catch {
      // If fetchInstances fails (e.g. Evolution not configured), skip reconciliation
      return localInstances;
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

    // Reconcile with Evolution API (detect orphans) then sync status
    const reconciled = await reconcileWithEvolution(dbInstances);
    const synced = await Promise.all(reconciled.map(syncInstanceStatus));
    const changed = synced.some((s, i) => s.status !== dbInstances[i]?.status || s.evolution_instance_id !== dbInstances[i]?.evolution_instance_id);
    if (changed) setInstances(synced);
  };

  useEffect(() => { fetchInstances(); }, [company]);

  // Auto-refresh status every 30s
  useEffect(() => {
    const interval = setInterval(fetchInstances, 30000);
    return () => clearInterval(interval);
  }, [company]);

  // Poll connection status when QR modal or post-create modal is open
  useEffect(() => {
    const instanceToWatch = showPostCreate ? createdInstance : showQR ? selectedInstance : null;
    if (!instanceToWatch?.evolution_instance_id || connectionSuccess) return;

    const pollInterval = setInterval(async () => {
      try {
        const res = await supabase.functions.invoke('evolution-proxy', {
          body: { action: 'status', instanceName: instanceToWatch.evolution_instance_id },
        });
        const evoState = res.data?.instance?.state || res.data?.state || '';
        if (evoState === 'open' || evoState === 'connected') {
          setConnectionSuccess(true);
          // Update DB
          await supabase.from('instances').update({
            status: 'online',
            last_connected_at: new Date().toISOString(),
          }).eq('id', instanceToWatch.id);
        }
      } catch {}
    }, 5000);

    return () => clearInterval(pollInterval);
  }, [showPostCreate, showQR, createdInstance, selectedInstance, connectionSuccess]);

  // Auto-close countdown after connection success
  useEffect(() => {
    if (!connectionSuccess) return;
    setAutoCloseCountdown(3);
    const countdownInterval = setInterval(() => {
      setAutoCloseCountdown(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(countdownInterval);
          // Close whichever modal is open
          setShowPostCreate(false);
          setShowQR(false);
          // Reset states
          setConnectionSuccess(false);
          setQrCodeBase64(null);
          setQrError(null);
          setAutoCloseCountdown(null);
          // Refresh list
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
  };

  const callEvolutionProxy = async (action: string, instanceName?: string, payload?: any) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Não autenticado');

    const requestBody = { action, instanceName, payload };
    const res = await supabase.functions.invoke('evolution-proxy', {
      body: requestBody,
    });

    if (res.error) {
      const invokeError: any = res.error;
      const errorContext = invokeError?.context;
      let errorStatus: number | undefined;
      let errorDetails: any = null;

      if (errorContext) {
        errorStatus = errorContext.status;
        errorDetails = await errorContext.clone().json().catch(async () => {
          const rawText = await errorContext.text().catch(() => '');
          return rawText ? { raw: rawText } : null;
        });
      }

      const message = errorDetails?.error || invokeError.message || 'Erro ao chamar proxy';
      const normalizedError = new Error(message) as Error & {
        status?: number;
        details?: any;
        request?: any;
      };
      normalizedError.status = errorStatus;
      normalizedError.details = errorDetails;
      normalizedError.request = requestBody;
      throw normalizedError;
    }

    if (res.data?.error) {
      const normalizedError = new Error(res.data.error) as Error & {
        status?: number;
        details?: any;
        request?: any;
      };
      normalizedError.status = res.data?._meta?.status;
      normalizedError.details = res.data;
      normalizedError.request = requestBody;
      throw normalizedError;
    }

    return res.data;
  };

  const handleCreate = async () => {
    if (!company || !newName.trim()) return;
    setCreating(true);
    try {
      const instanceName = newName.trim();
      const webhookUrl = `${window.location.origin}/api/webhooks/${company.slug}`;
      let evolutionInstanceId: string | null = null;
      let evoActive = false;

      // 1. Try to create in Evolution API via proxy
      try {
        const evoData = await callEvolutionProxy('create', instanceName, {
          webhook: webhookUrl,
          webhookByEvents: true,
          events: [
            'messages.upsert', 'send.message', 'connection.update',
            'qrcode.updated', 'messages.update',
          ],
        });
        const remoteCreated = extractEvolutionRemoteInstance(evoData?.instance ?? evoData);
        evolutionInstanceId = remoteCreated.instanceName || instanceName;
        evoActive = true;
        toast.success('Instância criada na Evolution API!');
      } catch (evoErr: any) {
        if (evoErr.message?.includes('não configurada') || evoErr.message?.includes('desativada')) {
          toast.info('Evolution API não configurada. Instância criada apenas no painel.');
        } else {
          throw evoErr;
        }
      }

      // 2. Save to database
      const { data, error } = await supabase.from('instances').insert({
        company_id: company.id,
        name: instanceName,
        evolution_instance_id: evolutionInstanceId,
        webhook_url: webhookUrl,
        tags: newTags ? newTags.split(',').map(t => t.trim()) : [],
        timezone: newTimezone,
        reconnect_policy: newReconnect,
        status: evoActive ? 'pairing' : 'offline',
      }).select().single();
      if (error) throw error;

      setShowCreate(false);
      resetForm();
      setCreatedInstance(data as Instance);
      setShowPostCreate(true);
      fetchInstances();

      // 3. Auto-fetch QR code
      if (evoActive) {
        setTimeout(() => fetchQRCode(instanceName), 500);
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

    const startedAt = new Date().toISOString();

    try {
      const { data: freshInstance, error: freshError } = await supabase
        .from('instances')
        .select('*')
        .eq('id', selectedInstance.id)
        .single();

      if (freshError) throw freshError;
      const instance = freshInstance as Instance;

      const deleteAuditLog: Record<string, any> = {
        timestamp: startedAt,
        local_instance_id: instance.id,
        local_instance_name: instance.name,
        configured_remote_identifier: instance.evolution_instance_id,
        company_id: instance.company_id,
        action: 'delete_instance_sync',
        endpoint_called: null,
        method_http: 'DELETE',
        payload_sent: null,
        status_http: null,
        response_body: null,
        error_message: null,
        final_result: 'pending',
      };

      let resolvedRemoteName: string | null = instance.evolution_instance_id ?? instance.name;
      let resolvedRemoteId: string | null = null;
      let remoteDeletionConfirmed = !instance.evolution_instance_id;

      // 1) Resolve remote identifier from current Evolution snapshot
      const remoteSnapshot = await callEvolutionProxy('fetchInstances');
      const remoteInstances = normalizeEvolutionInstances(remoteSnapshot);

      const remoteMatch = remoteInstances.find((remote) => {
        const matchesStoredIdentifier =
          !!instance.evolution_instance_id &&
          (remote.instanceName === instance.evolution_instance_id || remote.instanceId === instance.evolution_instance_id);
        const matchesLocalName = remote.instanceName === instance.name;
        return matchesStoredIdentifier || matchesLocalName;
      });

      if (remoteMatch) {
        resolvedRemoteName = remoteMatch.instanceName ?? resolvedRemoteName;
        resolvedRemoteId = remoteMatch.instanceId;
      }

      // 2) Delete in Evolution first
      if (resolvedRemoteName) {
        try {
          const deleteResponse = await callEvolutionProxy('delete', resolvedRemoteName);
          remoteDeletionConfirmed = true;
          deleteAuditLog.endpoint_called = deleteResponse?._meta?.endpoint ?? null;
          deleteAuditLog.method_http = deleteResponse?._meta?.method ?? 'DELETE';
          deleteAuditLog.payload_sent = deleteResponse?._meta?.requestBody ?? null;
          deleteAuditLog.status_http = deleteResponse?._meta?.status ?? 200;
          deleteAuditLog.response_body = deleteResponse;
        } catch (evoErr: any) {
          deleteAuditLog.endpoint_called = evoErr?.details?._meta?.endpoint ?? null;
          deleteAuditLog.method_http = evoErr?.details?._meta?.method ?? 'DELETE';
          deleteAuditLog.payload_sent = evoErr?.details?._meta?.requestBody ?? null;
          deleteAuditLog.status_http = evoErr?.status ?? evoErr?.details?._meta?.status ?? null;
          deleteAuditLog.response_body = evoErr?.details ?? null;
          deleteAuditLog.error_message = evoErr?.message ?? 'Erro desconhecido na exclusão remota';

          const isNotFound =
            evoErr?.status === 404 ||
            /404|not\s*found|does not exist|não existe/i.test(String(evoErr?.message ?? ''));

          if (isNotFound) {
            // 3) Confirm orphan to avoid false-positive deletion
            const recheckSnapshot = await callEvolutionProxy('fetchInstances');
            const recheckInstances = normalizeEvolutionInstances(recheckSnapshot);
            const stillExistsRemotely = recheckInstances.some((remote) =>
              (resolvedRemoteName && remote.instanceName === resolvedRemoteName) ||
              (resolvedRemoteId && remote.instanceId === resolvedRemoteId) ||
              (!!instance.evolution_instance_id &&
                (remote.instanceName === instance.evolution_instance_id || remote.instanceId === instance.evolution_instance_id))
            );

            if (stillExistsRemotely) {
              deleteAuditLog.final_result = 'failed_remote_identifier_mismatch';
              await writeDeleteAuditLog(instance.id, {
                ...deleteAuditLog,
                resolved_remote_name: resolvedRemoteName,
                resolved_remote_id: resolvedRemoteId,
                completed_at: new Date().toISOString(),
              });
              toast.error('Falha ao excluir na Evolution: identificador remoto inválido. A instância não foi removida no SaaS.');
              return;
            }

            remoteDeletionConfirmed = true;
            deleteAuditLog.final_result = 'orphan_remote_not_found';
          } else {
            deleteAuditLog.final_result = 'failed_remote_delete';
            await writeDeleteAuditLog(instance.id, {
              ...deleteAuditLog,
              resolved_remote_name: resolvedRemoteName,
              resolved_remote_id: resolvedRemoteId,
              completed_at: new Date().toISOString(),
            });
            toast.error(`Falha ao excluir na Evolution: ${evoErr?.message}. A instância NÃO foi removida no SaaS.`);
            return;
          }
        }
      }

      if (!remoteDeletionConfirmed) {
        toast.error('Não foi possível confirmar exclusão remota na Evolution. Operação cancelada.');
        return;
      }

      // 4) Remove local only after remote confirmed or confirmed orphan
      const { error: localDeleteError } = await supabase
        .from('instances')
        .delete()
        .eq('id', instance.id);

      if (localDeleteError) throw localDeleteError;

      deleteAuditLog.final_result =
        deleteAuditLog.final_result === 'orphan_remote_not_found'
          ? 'deleted_local_orphan_remote'
          : 'deleted_local_and_remote';

      await writeDeleteAuditLog(instance.id, {
        ...deleteAuditLog,
        resolved_remote_name: resolvedRemoteName,
        resolved_remote_id: resolvedRemoteId,
        completed_at: new Date().toISOString(),
      });

      toast.success('Instância excluída com sucesso (SaaS + Evolution)');
      setShowDelete(false);
      setSelectedInstance(null);
      fetchInstances();
    } catch (e: any) {
      if (selectedInstance?.id) {
        await writeDeleteAuditLog(selectedInstance.id, {
          timestamp: startedAt,
          local_instance_id: selectedInstance.id,
          local_instance_name: selectedInstance.name,
          configured_remote_identifier: selectedInstance.evolution_instance_id,
          company_id: selectedInstance.company_id,
          action: 'delete_instance_sync',
          error_message: e?.message ?? 'Erro inesperado',
          final_result: 'failed_unexpected',
          completed_at: new Date().toISOString(),
        });
      }
      toast.error(e.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleStatusChange = async (instance: Instance, newStatus: string) => {
    const { error } = await supabase.from('instances').update({ status: newStatus }).eq('id', instance.id);
    if (error) toast.error(error.message);
    else {
      toast.success(`Status alterado para ${statusConfig[newStatus]?.label || newStatus}`);
      fetchInstances();
    }
  };

  const handleRestart = async (instance: Instance) => {
    await handleStatusChange(instance, 'connecting');
    // Simulate reconnection cycle
    setTimeout(async () => {
      await supabase.from('instances').update({
        status: 'online',
        last_connected_at: new Date().toISOString(),
      }).eq('id', instance.id);
      toast.success(`${instance.name} reconectada`);
      fetchInstances();
    }, 3000);
  };

  const handleSendTest = async () => {
    if (!testNumber || !testMessage) return;
    setSendingTest(true);
    setTimeout(() => {
      toast.success('Mensagem teste enviada (simulação)');
      setSendingTest(false);
      setShowTestMsg(false);
      setTestNumber(''); setTestMessage('');
    }, 1000);
  };

  const copyToClipboard = (text: string, label?: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label || 'Valor'} copiado!`);
  };

  const fetchQRCode = async (instanceName: string) => {
    if (!company) return;
    setQrCodeBase64(null);
    setQrError(null);
    setQrLoading(true);
    try {
      const data = await callEvolutionProxy('connect', instanceName);

      if (data.base64) {
        setQrCodeBase64(data.base64);
      } else if (data.code) {
        setQrError('QR Code gerado, mas sem imagem base64. Verifique a versão da Evolution API.');
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
            <Button size="sm" onClick={() => setShowCreate(true)}>
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
            <Button onClick={handleCreate} disabled={creating || !newName.trim()} className="w-full">
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
            <DialogDescription>Escaneie o QR Code para conectar e use os dados abaixo para integração</DialogDescription>
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
                  {!qrLoading && !qrCodeBase64 && (
                    <Button variant="outline" size="sm" onClick={() => createdInstance && fetchQRCode(createdInstance.name)}>
                      <QrCode className="h-4 w-4 mr-2" /> Gerar QR Code
                    </Button>
                  )}
                  {qrCodeBase64 && (
                    <Button variant="outline" size="sm" onClick={() => createdInstance && fetchQRCode(createdInstance.name)}>
                      <RefreshCw className="h-4 w-4 mr-2" /> Atualizar QR Code
                    </Button>
                  )}
                </div>

                <Separator />

                {/* API endpoint */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5"><Link className="h-3.5 w-3.5" /> Endpoint da API</Label>
                  <div className="flex gap-2">
                    <Input
                      value={`${window.location.origin}/api/instance/${createdInstance?.id}`}
                      readOnly
                      className="font-mono text-xs"
                    />
                    <Button variant="outline" size="icon" onClick={() => copyToClipboard(`${window.location.origin}/api/instance/${createdInstance?.id}`, 'Endpoint')}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Session token */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5"><Key className="h-3.5 w-3.5" /> Token da sessão</Label>
                  <div className="flex gap-2">
                    <Input
                      value={createdInstance?.id || ''}
                      readOnly
                      className="font-mono text-xs"
                    />
                    <Button variant="outline" size="icon" onClick={() => copyToClipboard(createdInstance?.id || '', 'Token')}>
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
            <DialogDescription>Escaneie o QR Code com o WhatsApp no celular</DialogDescription>
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
                <Button onClick={() => selectedInstance && fetchQRCode(selectedInstance.name)} disabled={qrLoading}>
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
            <DialogDescription>Envie uma mensagem de teste via {selectedInstance?.name}</DialogDescription>
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

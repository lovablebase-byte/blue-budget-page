import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/contexts/CompanyContext';
import {
  syncSingleInstanceStatus,
  syncCompanyInstancesStatus,
  isOnlineStatus,
  isConnectingStatus,
  isDisconnectedStatus,
} from '@/services/instances-sync';
import { useResourceLimit, useFeatureEnabled } from '@/hooks/use-plan-enforcement';
import { GuardedButton } from '@/components/PlanEnforcementGuard';
import { PlanStatusBanner } from '@/components/PlanStatusBanner';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  Plus, RefreshCw, Trash2, QrCode, Send, Power, PowerOff,
  MoreHorizontal, Eye, Loader2, AlertCircle, Smartphone,
  Copy, RotateCcw, Link, Key, CheckCircle2, Phone,
} from 'lucide-react';
import { notify } from '@/lib/notifications';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { InstanceStatsCards } from '@/components/instances/InstanceStatsCards';
import { InstanceFilters, SortOption } from '@/components/instances/InstanceFilters';
import { callProviderProxy } from '@/components/instances/useProviderProxy';
import { providerLabels, TIMEZONES, getProviderEvents } from '@/components/instances/constants';

interface Instance {
  id: string;
  company_id: string;
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
  evolution_instance_id: string | null;
  access_token: string;
  provider: string;
  provider_instance_id: string | null;
}

const getProviderInstanceName = (instance: Instance): string => {
  if (instance.provider === 'evolution') {
    return instance.name;
  }
  if (instance.provider === 'evolution_go') {
    return instance.provider_instance_id || instance.name;
  }
  if (instance.provider === 'wppconnect') {
    // WPPConnect uses the session name (instance.name) as the path segment;
    // provider_instance_id can hold the generated session token for reference.
    return instance.name;
  }
  if (instance.provider === 'quepasa') {
    // QuePasa uses the session/bot username (instance.name) as identifier;
    // provider_instance_id stores the per-session token if returned by /scan.
    return instance.name;
  }
  // Wuzapi uses the token stored in provider_instance_id
  return instance.provider_instance_id || instance.name;
};

export default function Instances() {
  const { company, hasPermission, isReadOnly, isAdmin } = useAuth();
  const { allowedProviders: planProviders, isSuspended } = useCompany();
  const instanceFeature = useFeatureEnabled('instances_enabled');
  const instanceLimit = useResourceLimit('max_instances', 'instances');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showTestMsg, setShowTestMsg] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showPostCreate, setShowPostCreate] = useState(false);
  const [selectedInstance, setSelectedInstance] = useState<Instance | null>(null);

  const invalidateDashboards = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-dashboard-stats'] });
    queryClient.invalidateQueries({ queryKey: ['admin-dashboard-recent-instances'] });
    queryClient.invalidateQueries({ queryKey: ['company-dashboard'] });
  };
  const [createdInstance, setCreatedInstance] = useState<Instance | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Filters
  const [filterProvider, setFilterProvider] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('newest');

  // Active providers
  const [activeProviders, setActiveProviders] = useState<ActiveProvider[]>([]);
  const activeProvidersRef = useRef<ActiveProvider[]>([]);
  const fetchInFlightRef = useRef(false);
  const lastRefreshAtRef = useRef(0);
  const statusPollInFlightRef = useRef(false);

  // QR Code states
  const [qrCodeBase64, setQrCodeBase64] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [connectionSuccess, setConnectionSuccess] = useState(false);
  const [autoCloseCountdown, setAutoCloseCountdown] = useState<number | null>(null);
  const qrFetchInFlightRef = useRef(false);
  const qrAutoRetryRef = useRef<{ timer: any; attempts: number; cancelled: boolean } | null>(null);

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

  const fetchActiveProviders = async (): Promise<ActiveProvider[]> => {
    if (!company) return [];

    const providers = await fetchCompanyActiveProviders(company.id);
    setActiveProviders(providers);
    setNewProvider((current) => {
      if (current && providers.some((provider) => provider.provider === current)) {
        return current;
      }

      const defaultProvider = providers.find((provider) => provider.is_default)?.provider;
      return defaultProvider || providers[0]?.provider || '';
    });

    return providers;
  };

  useEffect(() => {
    activeProvidersRef.current = activeProviders;
  }, [activeProviders]);

  const syncInstanceStatus = async (instance: Instance): Promise<Instance> => {
    return syncSingleInstanceStatus(instance, activeProvidersRef.current);
  };

  const markInstanceOffline = async (instanceId: string) => {
    await supabase.from('instances').update({ status: 'offline' }).eq('id', instanceId);
    setInstances((current) => current.map((item) => (
      item.id === instanceId ? { ...item, status: 'offline' } : item
    )));
    invalidateDashboards();
  };

  const fetchInstances = async () => {
    if (!company) return;
    if (fetchInFlightRef.current) return;
    fetchInFlightRef.current = true;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('instances')
        .select('*')
        .eq('company_id', company.id)
        .order('created_at', { ascending: false });
      if (error) { toast.error(error.message); return; }

      const dbInstances = (data as Instance[]) || [];
      setInstances(dbInstances);

      const synced = await syncCompanyInstancesStatus(dbInstances, activeProvidersRef.current);
      const changed = synced.some((s, i) => s.status !== dbInstances[i]?.status);
      if (changed) {
        setInstances(synced);
        invalidateDashboards();
      }
    } finally {
      setLoading(false);
      fetchInFlightRef.current = false;
    }
  };

  const handleRefresh = () => {
    const now = Date.now();
    if (now - lastRefreshAtRef.current < 2500) return;
    lastRefreshAtRef.current = now;
    fetchInstances();
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
    if (!providerName || !hasActiveProviderConfig(activeProviders, instanceToWatch.provider)) return;

    const pollInterval = setInterval(async () => {
      if (statusPollInFlightRef.current) return;
      statusPollInFlightRef.current = true;
      try {
        const res = await callProviderProxy('status', instanceToWatch.provider, providerName);
        const state = res?.instance?.state || '';
        const rawPhone = res?.instance?.phoneNumber;
        const cleanPhone = rawPhone ? String(rawPhone).split('@')[0].replace(/\D/g, '') : '';
        if (state === 'open' || state === 'connected') {
          setConnectionSuccess(true);
          const updateData: Record<string, any> = {
            status: 'online',
            last_connected_at: new Date().toISOString(),
          };
          if (cleanPhone) updateData.phone_number = cleanPhone;
          await supabase.from('instances').update(updateData).eq('id', instanceToWatch.id);
        } else if (['close', 'closed', 'disconnected', 'logout', 'logged_out', 'not_logged', 'device_not_connected'].includes(String(state).toLowerCase())) {
          await markInstanceOffline(instanceToWatch.id);
          setQrError('Instância desconectada no provider. Gere um novo QR Code para parear.');
        }
      } catch {
        setQrError('Provider temporariamente indisponível. Tente novamente em alguns segundos.');
      } finally {
        statusPollInFlightRef.current = false;
      }
    }, 5000);

    return () => clearInterval(pollInterval);
  }, [showPostCreate, showQR, createdInstance, selectedInstance, connectionSuccess, activeProviders]);

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
    const def = activeProviders.find(p => p.is_default);
    setNewProvider(def?.provider || activeProviders[0]?.provider || '');
  };

  const handleCreate = async () => {
    if (!company || !newName.trim() || !newProvider) return;
    setCreating(true);
    try {
      const providers = await fetchActiveProviders();
      if (!hasActiveProviderConfig(providers, newProvider)) {
        throw new Error(getProviderConfigurationError(newProvider));
      }

      const instanceName = newName.trim();
      const webhookSecret = crypto.randomUUID().replace(/-/g, '').slice(0, 24);

      let providerInstanceId: string | null = null;
      let evolutionInstanceId: string | null = null;
      let providerActive = false;

      // Use SECURITY DEFINER RPC: validates plan/permission/limit/provider on the backend.
      // Bypasses direct INSERT RLS issues and ensures status starts as 'offline'.
      const { data: rpcResult, error: insertErr } = await supabase.rpc('create_instance_safe', {
        _name: instanceName,
        _provider: newProvider,
        _tags: newTags ? newTags.split(',').map(t => t.trim()).filter(Boolean) : [],
        _timezone: newTimezone,
        _reconnect_policy: newReconnect,
        _webhook_secret: webhookSecret,
      });
      if (insertErr) {
        // Map common backend errors to friendlier Portuguese messages
        const raw = String(insertErr.message || '');
        const friendly =
          raw.includes('not_authenticated') ? 'Sessão expirada. Faça login novamente.' :
          raw.includes('no_company_for_user') ? 'Usuário sem empresa associada.' :
          raw.includes('permission_denied') ? 'Você não tem permissão para criar instâncias.' :
          raw.includes('no_active_plan') ? 'Sem plano ativo para criar instâncias.' :
          raw.includes('instances_module_disabled') ? 'Módulo de instâncias não está habilitado no seu plano.' :
          raw.includes('instance_limit_reached') ? 'Limite de instâncias do plano atingido.' :
          raw.includes('provider_not_allowed_for_plan') ? 'Este provider não está liberado para o seu plano.' :
          raw.includes('provider_not_configured') ? 'O provider selecionado não está configurado/ativo.' :
          raw;
        throw new Error(friendly);
      }
      if (!rpcResult) throw new Error('Falha ao criar instância (sem retorno).');

      const instanceRecord = rpcResult as unknown as Instance;
      const webhookUrl = getWebhookEndpoint(instanceRecord.id, webhookSecret, newProvider);

      try {
        const createData = await callProviderProxy('create', newProvider, instanceName, {
          webhook: webhookUrl,
          webhookByEvents: newProvider !== 'wuzapi',
          events: getProviderEvents(newProvider),
        });

        if (newProvider === 'evolution') {
          providerInstanceId = createData?.instanceId || createData?.instanceName || instanceName;
          evolutionInstanceId = providerInstanceId;
        } else if (newProvider === 'evolution_go') {
          providerInstanceId = createData?.instanceToken || null;
          evolutionInstanceId = createData?.instanceId || null;
        } else if (newProvider === 'wuzapi') {
          if (!createData?.instanceToken) {
            throw new Error('Wuzapi não retornou o token da instância. Verifique a configuração.');
          }
          providerInstanceId = createData.instanceToken;
        } else if (newProvider === 'wppconnect') {
          // WPPConnect: store the generated per-session token (if any) for reference
          providerInstanceId = createData?.sessionToken || createData?.instanceToken || null;
        } else if (newProvider === 'quepasa') {
          // QuePasa: persist token returned by /scan if any (used in subsequent calls)
          providerInstanceId = createData?.token || createData?.instanceToken || null;
        }
        providerActive = true;
        notify.instanceCreated(instanceName);
      } catch (err: any) {
        // Best-effort cleanup; ignore RLS errors here
        await supabase.from('instances').delete().eq('id', instanceRecord.id);
        throw err;
      }

      const { data: updated, error } = await supabase.rpc('update_instance_provider_safe', {
        _instance_id: instanceRecord.id,
        _provider_instance_id: providerInstanceId,
        _evolution_instance_id: evolutionInstanceId,
        _webhook_url: webhookUrl,
        _status: providerActive ? 'pairing' : 'offline',
      });
      if (error) throw error;
      const data = updated as unknown as Instance;

      setShowCreate(false);
      resetForm();
      setCreatedInstance(data as Instance);
      setShowPostCreate(true);
      fetchInstances();

      if (providerActive) {
        // Inicia tentativas automáticas de geração do QR Code
        setTimeout(() => startQrAutoRetry(data as Instance), 400);
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
        .from('instances').select('*').eq('id', selectedInstance.id).single();
      if (freshError) throw freshError;
      const instance = freshInstance as Instance;
      const providerName = getProviderInstanceName(instance);

      let remoteAlreadyMissing = false;
      let providerFailedSoftly = false;
      if (providerName && hasActiveProviderConfig(activeProvidersRef.current, instance.provider)) {
        try {
          await callProviderProxy('delete', instance.provider, providerName);
        } catch (err: any) {
          const msg = String(err?.message || '').toLowerCase();
          const isNotFound = /404|not\s*found|deleted_already|does not exist|sess(ã|a)o inexistente|instance not found/i.test(msg);
          if (isNotFound) {
            remoteAlreadyMissing = true;
          } else {
            // Provider fora do ar / erro não-crítico: removemos localmente e logamos.
            providerFailedSoftly = true;
            console.warn('[handleDelete] provider falhou, removendo localmente:', err?.message);
          }
        }
      }

      const { error: localErr } = await supabase.from('instances').delete().eq('id', instance.id);
      if (localErr) throw localErr;

      try {
        const auditAction = remoteAlreadyMissing
          ? 'instance_delete_remote_missing'
          : providerFailedSoftly
          ? 'instance_delete_provider_failed_local_removed'
          : 'instance_deleted_local';
        await supabase.rpc('log_audit', {
          _action: auditAction,
          _entity_type: 'instance',
          _entity_id: instance.id,
          _payload: { provider: instance.provider, name: instance.name, deleted_at: new Date().toISOString() },
        });
      } catch {}

      notify.instanceDeleted(instance.name);
      setShowDelete(false);
      setSelectedInstance(null);
      fetchInstances();
      invalidateDashboards();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleStatusChange = async (instance: Instance, newStatus: string) => {
    if (newStatus === 'offline') {
      if (!hasActiveProviderConfig(activeProvidersRef.current, instance.provider)) {
        toast.error(getProviderConfigurationError(instance.provider));
        return;
      }

      try {
        await callProviderProxy('logout', instance.provider, getProviderInstanceName(instance));
        const { error } = await supabase.from('instances').update({ status: 'offline' }).eq('id', instance.id);
        if (error) { toast.error(error.message); return; }
        notify.instanceDisconnected(instance.name);
        fetchInstances();
      } catch (e: any) {
        toast.error(e.message || 'Falha ao desconectar na API do provider');
      }
      return;
    }

    if (newStatus === 'connecting') {
      if (!hasActiveProviderConfig(activeProvidersRef.current, instance.provider)) {
        toast.error(getProviderConfigurationError(instance.provider));
        return;
      }

      toast.info('Conectando ao provider...');
      try {
        const providerName = getProviderInstanceName(instance);
        const webhookUrl = instance.webhook_secret
          ? getWebhookEndpoint(instance.id, instance.webhook_secret, instance.provider)
          : instance.webhook_url;
        const data = await callProviderProxy('connect', instance.provider, providerName, {
          webhook: webhookUrl || undefined,
          events: getProviderEvents(instance.provider),
        });

        const rawQr = data?.qrCode || data?.base64 || data?.qr?.data?.QRCode;
        const remoteState = String(data?.state || data?.instance?.state || '').toLowerCase();
        const remoteOffline = ['close', 'closed', 'disconnected', 'logout', 'logged_out', 'not_logged', 'device_not_connected', 'not_found'].includes(remoteState);
        if (remoteOffline) {
          await markInstanceOffline(instance.id);
          toast.info('Provider reportou desconectado.');
        } else if (rawQr) {
          const qr = normalizeQrBase64(rawQr);
          await supabase.from('instances').update({ status: 'pairing' }).eq('id', instance.id);
          setSelectedInstance(instance);
          setQrCodeBase64(qr);
          setQrError(null);
          setConnectionSuccess(false);
          setShowQR(true);
        } else if (data?.connected === true) {
          await supabase.from('instances').update({ status: 'online', last_connected_at: new Date().toISOString() }).eq('id', instance.id);
          notify.instanceConnected(instance.name);
        } else {
          // Sem QR e sem confirmação de conexão: confiar no status remoto
          let nextStatus: 'connecting' | 'offline' = 'connecting';
          try {
            const statusRes = await callProviderProxy('status', instance.provider, providerName);
            const state = String(statusRes?.instance?.state || '').toLowerCase();
            if (['close', 'closed', 'disconnected', 'logout', 'logged_out', 'not_logged', 'device_not_connected', 'not_found'].includes(state)) {
              nextStatus = 'offline';
            }
          } catch {}
          await supabase.from('instances').update({ status: nextStatus }).eq('id', instance.id);
          setSelectedInstance(instance);
          setQrCodeBase64(null);
          setQrError(nextStatus === 'offline' ? 'Provider reportou desconectado. Tente novamente.' : null);
          setConnectionSuccess(false);
          setShowQR(true);
        }
        fetchInstances();
      } catch (e: any) {
        toast.error(e.message || 'Falha ao conectar');
        fetchInstances();
      }
      return;
    }

    const { error } = await supabase.from('instances').update({ status: newStatus }).eq('id', instance.id);
    if (error) toast.error(error.message);
    else { toast.success('Status atualizado'); fetchInstances(); }
  };

  const handleRestart = async (instance: Instance) => {
    if (!hasActiveProviderConfig(activeProvidersRef.current, instance.provider)) {
      toast.error(getProviderConfigurationError(instance.provider));
      return;
    }

    await handleStatusChange(instance, 'connecting');
    try {
      const webhookUrl = instance.webhook_secret
        ? getWebhookEndpoint(instance.id, instance.webhook_secret, instance.provider)
        : instance.webhook_url;
      await callProviderProxy('connect', instance.provider, getProviderInstanceName(instance), {
        webhook: webhookUrl || undefined,
        events: getProviderEvents(instance.provider),
      });
    } catch {}
    setTimeout(() => fetchInstances(), 3000);
  };

  const handleSendTest = async () => {
    if (!testNumber || !testMessage || !selectedInstance) return;
    if (!hasActiveProviderConfig(activeProvidersRef.current, selectedInstance.provider)) {
      toast.error(getProviderConfigurationError(selectedInstance.provider));
      return;
    }

    setSendingTest(true);
    try {
      await callProviderProxy('sendText', selectedInstance.provider, getProviderInstanceName(selectedInstance), {
        number: testNumber,
        text: testMessage,
      });
      toast.success('Mensagem de teste enviada!');
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

  const normalizeQrBase64 = (qr: string): string => {
    if (qr.startsWith('data:')) return qr;
    return `data:image/png;base64,${qr}`;
  };

  const cancelQrAutoRetry = () => {
    if (qrAutoRetryRef.current) {
      qrAutoRetryRef.current.cancelled = true;
      if (qrAutoRetryRef.current.timer) clearTimeout(qrAutoRetryRef.current.timer);
      qrAutoRetryRef.current = null;
    }
  };

  const fetchQRCode = async (instanceOrName: Instance | string, opts?: { silent?: boolean }) => {
    if (!company) return;
    const instance = typeof instanceOrName === 'string'
      ? instances.find(i => i.name === instanceOrName) || createdInstance
      : instanceOrName;
    if (!instance) return;
    if (qrFetchInFlightRef.current) return;
    qrFetchInFlightRef.current = true;

    if (!opts?.silent) {
      setQrCodeBase64(null);
      setQrError(null);
    }
    setQrLoading(true);
    try {
      if (!hasActiveProviderConfig(activeProvidersRef.current, instance.provider)) {
        throw new Error(getProviderConfigurationError(instance.provider));
      }

      const providerName = getProviderInstanceName(instance);
      const webhookUrl = instance.webhook_secret
        ? getWebhookEndpoint(instance.id, instance.webhook_secret, instance.provider)
        : instance.webhook_url;

      const data = await callProviderProxy('connect', instance.provider, providerName, {
        webhook: webhookUrl || undefined,
        events: getProviderEvents(instance.provider),
      });

      const qr = data?.qrCode || data?.base64 || data?.qr?.data?.QRCode;
      const remoteState = String(data?.state || data?.instance?.state || '').toLowerCase();
      const remoteOffline = ['close', 'closed', 'disconnected', 'logout', 'logged_out', 'not_logged', 'device_not_connected', 'not_found'].includes(remoteState);
      if (qr) {
        setQrCodeBase64(normalizeQrBase64(qr));
        setQrError(null);
        return { qr: true, connected: false, offline: false };
      }
      if (data?.connected === true || remoteState === 'open' || remoteState === 'connected') {
        setConnectionSuccess(true);
        return { qr: false, connected: true, offline: false };
      }
      if (remoteOffline) {
        // No QR yet and remote reports closed: keep silent during auto-retry
        if (!opts?.silent) {
          setQrError('Aguardando geração do QR Code pelo provider...');
        }
        return { qr: false, connected: false, offline: true };
      }
      // Sem QR e sem confirmação: ler status real do provider
      try {
        const statusData = await callProviderProxy('status', instance.provider, providerName);
        const state = String(statusData?.instance?.state || '').toLowerCase();
        if (state === 'open' || state === 'connected') {
          setConnectionSuccess(true);
          return { qr: false, connected: true, offline: false };
        }
        if (!opts?.silent) {
          setQrError(`QR Code ainda não disponível. Tente novamente em alguns segundos.`);
        }
        return { qr: false, connected: false, offline: false };
      } catch {
        if (!opts?.silent) {
          setQrError('Provider temporariamente indisponível. Tente novamente em alguns segundos.');
        }
        return { qr: false, connected: false, offline: false };
      }
    } catch (err: any) {
      const msg = err.message || 'Falha ao gerar QR Code';
      console.error('[fetchQRCode]', instance.provider, msg);
      if (!opts?.silent) setQrError(msg);
      return { qr: false, connected: false, offline: false, error: true };
    } finally {
      setQrLoading(false);
      qrFetchInFlightRef.current = false;
    }
  };

  // Polling controlado para tentar gerar o QR Code automaticamente após criação
  const startQrAutoRetry = (instance: Instance) => {
    cancelQrAutoRetry();
    const ctrl = { timer: null as any, attempts: 0, cancelled: false };
    qrAutoRetryRef.current = ctrl;
    const MAX_ATTEMPTS = 10; // ~25-30s total

    const tick = async () => {
      if (ctrl.cancelled) return;
      ctrl.attempts += 1;
      const isFirst = ctrl.attempts === 1;
      const result = await fetchQRCode(instance, { silent: !isFirst });
      if (ctrl.cancelled) return;
      if (result?.qr || result?.connected) {
        cancelQrAutoRetry();
        return;
      }
      if (ctrl.attempts >= MAX_ATTEMPTS) {
        setQrError('QR Code ainda não disponível. Clique em "Gerar QR Code" para tentar novamente.');
        cancelQrAutoRetry();
        return;
      }
      ctrl.timer = setTimeout(tick, 2500);
    };
    // Primeira tentativa imediata
    tick();
  };


  // ── Filtering & Sorting ──
  const filtered = useMemo(() => {
    let result = instances.filter(inst => {
      if (filterProvider !== 'all' && inst.provider !== filterProvider) return false;
      if (filterStatus !== 'all') {
        if (filterStatus === 'online' && inst.status !== 'online' && inst.status !== 'connected') return false;
        if (filterStatus === 'offline' && inst.status !== 'offline') return false;
        if (filterStatus === 'connecting' && inst.status !== 'connecting' && inst.status !== 'pairing') return false;
        if (filterStatus === 'error' && inst.status !== 'error') return false;
      }
      if (searchText) {
        const s = searchText.toLowerCase();
        return inst.name.toLowerCase().includes(s) || (inst.phone_number || '').includes(s);
      }
      return true;
    });
    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case 'oldest': return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'name_asc': return a.name.localeCompare(b.name);
        case 'name_desc': return b.name.localeCompare(a.name);
        default: return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
    return result;
  }, [instances, filterProvider, filterStatus, searchText, sortBy]);

  const hasFilters = filterProvider !== 'all' || filterStatus !== 'all' || searchText !== '' || sortBy !== 'newest';
  const clearFilters = () => { setFilterProvider('all'); setFilterStatus('all'); setSearchText(''); setSortBy('newest'); };

  const canCreate = hasPermission('instances', 'create');
  const canDelete = hasPermission('instances', 'delete');

  const onlineCount = instances.filter(i => isOnlineStatus(i.status)).length;
  const connectingCount = instances.filter(i => isConnectingStatus(i.status)).length;
  const offlineCount = instances.filter(i => isDisconnectedStatus(i.status)).length;

  const providerBreakdown: Record<string, number> = {};
  instances.forEach(i => {
    const label = providerLabels[i.provider] || i.provider;
    providerBreakdown[label] = (providerBreakdown[label] || 0) + 1;
  });

  const featureBlocked = !isAdmin && instanceFeature.data === false;
  const limitData = instanceLimit.data;
  const canCreateByPlan = !featureBlocked && (!limitData || limitData.allowed);

  // Fonte de verdade do modal "Nova instância":
  // - o provider precisa estar configurado e ativo para a conta
  // - admin não sofre filtro de plano
  // - usuário comum também precisa ter o provider liberado no plano
  const effectiveProviders = useMemo(() => {
    return activeProviders.filter((provider) => isAdmin || planProviders.includes(provider.provider));
  }, [isAdmin, planProviders, activeProviders]);

  return (
    <div className="space-y-5">
      <PlanStatusBanner
        featureBlocked={featureBlocked}
        featureLabel="Instâncias WhatsApp"
        resources={limitData ? [{ label: 'Instâncias', current: limitData.current, max: limitData.max }] : undefined}
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Instâncias WhatsApp</h1>
          <p className="text-sm text-muted-foreground">Gerencie suas conexões em um único painel</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
            <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
          </Button>
          {canCreate && !isReadOnly && !isSuspended && (
            <GuardedButton
              allowed={canCreateByPlan}
              reason={featureBlocked ? 'Instâncias não habilitadas no plano' : `Limite de ${limitData?.max || 0} instâncias atingido`}
              onClick={() => { fetchActiveProviders(); setShowCreate(true); }}
            >
              <Plus className="h-4 w-4 mr-1" /> Nova instância
            </GuardedButton>
          )}
        </div>
      </div>

      <InstanceStatsCards
        total={instances.length}
        online={onlineCount}
        offline={offlineCount}
        connecting={connectingCount}
        planMax={limitData?.max}
        providerBreakdown={providerBreakdown}
      />

      <InstanceFilters
        searchText={searchText}
        onSearchChange={setSearchText}
        filterProvider={filterProvider}
        onProviderChange={setFilterProvider}
        filterStatus={filterStatus}
        onStatusChange={setFilterStatus}
        sortBy={sortBy}
        onSortChange={setSortBy}
        hasFilters={hasFilters}
        onClear={clearFilters}
      />

      <div className="rounded-lg border border-border/60 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="font-semibold">Instância</TableHead>
              <TableHead className="font-semibold">Provider</TableHead>
              <TableHead className="font-semibold">Status</TableHead>
              <TableHead className="font-semibold hidden md:table-cell">Última conexão</TableHead>
              <TableHead className="font-semibold hidden lg:table-cell">Criada em</TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mt-2">Carregando instâncias...</p>
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-0">
                  {instances.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                      <div className="rounded-full p-4 bg-muted/30">
                        <Smartphone className="h-8 w-8 text-muted-foreground/40" />
                      </div>
                      <div className="text-center space-y-1 max-w-xs">
                        <p className="font-semibold">Nenhuma instância criada</p>
                        <p className="text-sm text-muted-foreground">
                          Crie sua primeira instância WhatsApp para começar a enviar mensagens.
                        </p>
                      </div>
                      {canCreate && !isReadOnly && !isSuspended && canCreateByPlan && (
                        <Button size="sm" onClick={() => { fetchActiveProviders(); setShowCreate(true); }}>
                          <Plus className="h-4 w-4 mr-1.5" /> Criar primeira instância
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 gap-2">
                      <p className="text-sm text-muted-foreground">Nenhuma instância corresponde aos filtros.</p>
                      <Button variant="ghost" size="sm" onClick={clearFilters}>Limpar filtros</Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => (
                <TableRow key={row.id} className="group">
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{row.name}</span>
                      {(() => {
                        const isOnline = row.status === 'online' || row.status === 'connected';
                        const digits = (row.phone_number || '').replace(/\D/g, '');
                        let phone: string | null = null;
                        if (digits) {
                          if (digits.length === 13 && digits.startsWith('55')) {
                            phone = `+${digits.slice(0,2)} (${digits.slice(2,4)}) ${digits.slice(4,9)}-${digits.slice(9)}`;
                          } else if (digits.length === 12 && digits.startsWith('55')) {
                            phone = `+${digits.slice(0,2)} (${digits.slice(2,4)}) ${digits.slice(4,8)}-${digits.slice(8)}`;
                          } else {
                            phone = `+${digits}`;
                          }
                        }
                        if (!phone) {
                          return <span className="text-xs text-muted-foreground/60 italic">Sem número</span>;
                        }
                        return (
                          <span className={`text-xs tabular-nums font-medium inline-flex items-center gap-1 ${isOnline ? 'text-success' : 'text-muted-foreground'}`}>
                            <Phone className="h-3 w-3" />
                            {phone}
                          </span>
                        );
                      })()}
                    </div>
                  </TableCell>
                  <TableCell><ProviderBadge provider={row.provider} /></TableCell>
                  <TableCell><StatusBadge status={row.status} /></TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                    {row.last_connected_at ? new Date(row.last_connected_at).toLocaleString('pt-BR') : 'Nunca'}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                    {new Date(row.created_at).toLocaleDateString('pt-BR')}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => navigate(`/instances/${row.id}`)}>
                          <Eye className="mr-2 h-4 w-4" /> Ver detalhes
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => { setSelectedInstance(row); setConnectionSuccess(false); setQrCodeBase64(null); setQrError(null); setShowQR(true); }}>
                          <QrCode className="mr-2 h-4 w-4" /> Parear QR Code
                        </DropdownMenuItem>
                        {row.status === 'online' || row.status === 'connected' ? (
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
                        <DropdownMenuItem onClick={() => { setSelectedInstance(row); setShowTestMsg(true); }}>
                          <Send className="mr-2 h-4 w-4" /> Enviar teste
                        </DropdownMenuItem>
                        {!isReadOnly && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive" onClick={() => { setSelectedInstance(row); setShowDelete(true); }}>
                              <Trash2 className="mr-2 h-4 w-4" /> Excluir
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={(o) => { setShowCreate(o); if (!o) resetForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova instância</DialogTitle>
            <DialogDescription>Crie uma nova conexão WhatsApp</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Provider *</Label>
              {effectiveProviders.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  {activeProviders.length === 0
                    ? 'Nenhum provider ativo configurado para esta conta.'
                    : 'Nenhum provider liberado no seu plano. Fale com o suporte.'}
                </div>
              ) : (
                <Select value={newProvider} onValueChange={setNewProvider}>
                  <SelectTrigger><SelectValue placeholder="Selecione o provider" /></SelectTrigger>
                  <SelectContent>
                    {effectiveProviders.map(p => (
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
              disabled={creating || !newName.trim() || !newProvider || effectiveProviders.length === 0 || isSuspended}
              className="w-full"
            >
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Criar instância
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Post-creation info dialog */}
      <Dialog open={showPostCreate} onOpenChange={(o) => { setShowPostCreate(o); if (!o) { cancelQrAutoRetry(); setConnectionSuccess(false); setAutoCloseCountdown(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary">
              Instância criada!
            </DialogTitle>
            <DialogDescription className="flex items-center gap-2">
              Escaneie o QR Code para conectar • <ProviderBadge provider={createdInstance?.provider || ''} />
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {connectionSuccess ? (
              <div className="flex flex-col items-center gap-4 py-8">
                <div className="w-20 h-20 rounded-full bg-primary/15 flex items-center justify-center shadow-[0_0_30px_-5px_hsl(var(--primary)/0.4)]">
                  <CheckCircle2 className="h-12 w-12 text-primary" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-lg font-semibold text-primary">WhatsApp conectado com sucesso!</p>
                  <p className="text-sm text-muted-foreground">
                    Fechando automaticamente em {autoCloseCountdown ?? 0}s...
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-col items-center gap-3 py-3">
                  <div className="w-52 h-52 bg-card rounded-lg flex items-center justify-center border border-border/60 overflow-hidden shadow-[inset_0_0_20px_-8px_hsl(var(--primary)/0.1)]">
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
                  <Button className="flex-1" onClick={() => { setShowPostCreate(false); }}>
                    <Eye className="h-4 w-4 mr-1" /> OK
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
            <DialogDescription className="flex items-center gap-2">
              Escaneie o QR Code • <ProviderBadge provider={selectedInstance?.provider || ''} />
            </DialogDescription>
          </DialogHeader>
          {connectionSuccess ? (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="w-20 h-20 rounded-full bg-primary/15 flex items-center justify-center shadow-[0_0_30px_-5px_hsl(var(--primary)/0.4)]">
                <CheckCircle2 className="h-12 w-12 text-primary" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-lg font-semibold text-primary">WhatsApp conectado com sucesso!</p>
                <p className="text-sm text-muted-foreground">
                  Fechando automaticamente em {autoCloseCountdown ?? 0}s...
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-64 h-64 bg-card rounded-lg flex items-center justify-center border border-border/60 overflow-hidden shadow-[inset_0_0_20px_-8px_hsl(var(--primary)/0.1)]">
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
            <DialogDescription className="flex items-center gap-2">
              Envie uma mensagem de teste via {selectedInstance?.name} • <ProviderBadge provider={selectedInstance?.provider || ''} />
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

/**
 * Serviço central de sincronização de instâncias WhatsApp.
 *
 * Fonte da verdade do status:
 *  1. Provider remoto (API real) — prevalece em caso de conflito.
 *  2. Webhook (atualiza o banco em tempo real).
 *  3. Banco local (cache inicial para exibição rápida).
 *
 * Status canônicos persistidos no banco (ver constraint instances_status_check):
 *   online | offline | connecting | pairing | error
 *
 * Os normalizadores aceitam variações vindas do provider (`open`, `connected`,
 * `close`, `disconnected`, `not_found`, `deleted`, ...) e convertem para o
 * vocabulário canônico antes de persistir.
 */

import { supabase } from '@/integrations/supabase/client';
import { callProviderProxy } from '@/components/instances/useProviderProxy';
import { hasActiveProviderConfig, type ActiveProvider } from '@/lib/whatsapp-provider-config';
import {
  normalizeProviderStatus,
  extractWhatsappPhone,
} from '@/lib/whatsapp-normalizers';

export type CanonicalInstanceStatus =
  | 'online'
  | 'offline'
  | 'connecting'
  | 'pairing'
  | 'error';

export interface SyncableInstance {
  id: string;
  name: string;
  provider: string;
  status: string;
  phone_number: string | null;
  evolution_instance_id: string | null;
  provider_instance_id: string | null;
  last_connected_at?: string | null;
}

/** Considera os status que indicam "desconectado" para o card "Desconectado". */
const DISCONNECTED_STATUSES = new Set([
  'offline',
  'disconnected',
  'close',
  'closed',
  'logout',
  'logged_out',
  'not_logged',
  'device_not_connected',
  'error',
  'failed',
  'not_found',
  'deleted',
]);

const ONLINE_STATUSES = new Set(['online', 'connected', 'open']);
const CONNECTING_STATUSES = new Set(['connecting', 'pairing', 'opening', 'qr', 'scan']);


/**
 * Converte qualquer status remoto/legado para o vocabulário canônico do banco.
 * Reutiliza `normalizeProviderStatus` para garantir prioridade conectado > QR.
 * Em fluxo de exclusão, o caller deve tratar `error` como sinal para remover.
 */
export function normalizeRemoteState(remoteState: string | null | undefined): CanonicalInstanceStatus | null {
  if (!remoteState) return null;
  const s = String(remoteState).toLowerCase().trim();
  if (s === 'not_found' || s === 'deleted' || s === 'error' || s === 'failed' || s === 'missing') return 'error';
  const norm = normalizeProviderStatus(s);
  if (norm.connected) return 'online';
  if (norm.status === 'pairing') return 'pairing';
  if (norm.status === 'offline') return 'offline';
  return null;
}

export function isOnlineStatus(status: string | null | undefined) {
  if (!status) return false;
  const s = String(status).toLowerCase();
  return s === 'online' || s === 'connected' || s === 'open';
}

export function isConnectingStatus(status: string | null | undefined) {
  if (!status) return false;
  const s = String(status).toLowerCase();
  return (
    s === 'connecting' ||
    s === 'pairing' ||
    s === 'qrcode' ||
    s === 'qr' ||
    s === 'scan' ||
    s === 'opening'
  );
}

/** Conta como "desconectado" qualquer status que não seja online/conectando/pairing. */
export function isDisconnectedStatus(status: string | null | undefined) {
  if (!status) return true;
  if (isOnlineStatus(status)) return false;
  if (isConnectingStatus(status)) return false;
  return true;
}

function getProviderInstanceName(instance: Pick<SyncableInstance, 'provider' | 'name' | 'provider_instance_id'>): string {
  if (instance.provider === 'evolution') return instance.name;
  if (instance.provider === 'evolution_go') return instance.provider_instance_id || instance.name;
  if (instance.provider === 'wppconnect' || instance.provider === 'quepasa') return instance.name;
  return instance.provider_instance_id || instance.name;
}

async function logSyncAudit(action: string, instanceId: string, payload: Record<string, any> = {}) {
  try {
    await supabase.rpc('log_audit', {
      _action: action,
      _entity_type: 'instance',
      _entity_id: instanceId,
      _payload: payload,
    });
  } catch {
    /* auditoria nunca pode quebrar o fluxo principal */
  }
}

/**
 * Sincroniza UMA instância contra o provider remoto.
 * - Se o provider retornar `not_found`, marca como `error`.
 * - Se já não tiver configuração ativa, retorna a instância inalterada.
 */
export async function syncSingleInstanceStatus<T extends SyncableInstance>(
  instance: T,
  activeProviders: ActiveProvider[],
): Promise<T> {
  if (!hasActiveProviderConfig(activeProviders, instance.provider)) {
    return instance;
  }

  const providerName = getProviderInstanceName(instance);
  if (!providerName) return instance;

  try {
    const res = await callProviderProxy('status', instance.provider, providerName);

    // Normalizador central: garante que conexão real (Connected/LoggedIn/jid)
    // vença qualquer sinal de QR/pareamento, e que o telefone seja extraído
    // corretamente independentemente do provider.
    const norm = normalizeProviderStatus(res, instance.provider);
    const cleanPhone = extractWhatsappPhone(res?.instance) || extractWhatsappPhone(res);

    // Sinal de "instância não existe mais no provider" continua sendo error.
    const rawTokens = String(
      res?.instance?.state ?? res?.state ?? res?.status ?? '',
    ).toLowerCase();
    const isMissing = ['not_found', 'deleted', 'missing'].includes(rawTokens);

    let normalized: CanonicalInstanceStatus | null;
    if (isMissing) normalized = 'error';
    else if (norm.connected) normalized = 'online';
    else if (norm.status === 'pairing') normalized = 'pairing';
    else if (norm.status === 'offline') normalized = 'offline';
    else normalized = null;

    if (!normalized) return instance;

    const phoneChanged = !!cleanPhone && cleanPhone !== (instance.phone_number || '').replace(/\D/g, '');
    const statusChanged = normalized !== instance.status;

    if (!statusChanged && !phoneChanged) return instance;

    const updateData: Record<string, any> = {};
    if (statusChanged) updateData.status = normalized;
    if (normalized === 'online') updateData.last_connected_at = new Date().toISOString();
    if (phoneChanged) updateData.phone_number = cleanPhone;

    const { error } = await supabase.from('instances').update(updateData).eq('id', instance.id);
    if (error) {
      console.warn('[instances-sync] update failed', error.message);
      return instance;
    }

    if (statusChanged && normalized === 'error') {
      await logSyncAudit('instance_remote_not_found', instance.id, { provider: instance.provider });
    } else if (statusChanged) {
      await logSyncAudit('instance_status_synced', instance.id, {
        provider: instance.provider,
        from: instance.status,
        to: normalized,
      });
    }

    return {
      ...instance,
      status: statusChanged ? normalized : instance.status,
      phone_number: phoneChanged ? cleanPhone : instance.phone_number,
      ...(normalized === 'online' ? { last_connected_at: new Date().toISOString() } : {}),
    } as T;
  } catch {
    return instance;
  }
}

/**
 * Sincroniza um lote de instâncias de forma sequencial com pequeno jitter,
 * para evitar cold-start em cascata no Edge Runtime (causa principal de 503
 * "SUPABASE_EDGE_RUNTIME_ERROR" quando várias instâncias são consultadas
 * em paralelo a cada poll).
 */
export async function syncCompanyInstancesStatus<T extends SyncableInstance>(
  instances: T[],
  activeProviders: ActiveProvider[],
): Promise<T[]> {
  if (!instances.length) return instances;
  const results: T[] = [];
  for (const inst of instances) {
    const synced = await syncSingleInstanceStatus(inst, activeProviders);
    results.push(synced);
    // Small jitter between calls so the edge runtime can reuse the warm worker.
    await new Promise((r) => setTimeout(r, 250 + Math.floor(Math.random() * 200)));
  }
  return results;
}

/**
 * Reconciliação leve para o Dashboard Admin: para cada instância marcada como
 * online/connecting/pairing, valida o status remoto e corrige no banco se
 * estiver divergente. Instâncias offline/error são ignoradas (não há por que
 * reativá-las sem ação do usuário).
 */
export async function reconcileActiveInstances(activeProviders: ActiveProvider[]): Promise<void> {
  const { data, error } = await supabase
    .from('instances')
    .select('id, name, provider, status, phone_number, evolution_instance_id, provider_instance_id')
    .in('status', ['online', 'connecting', 'pairing']);

  if (error || !data?.length) return;
  await syncCompanyInstancesStatus(data as SyncableInstance[], activeProviders);
}

/** Marca a instância como `error` quando o provider retorna not_found/deleted. */
export async function markInstanceAsRemoteMissing(instanceId: string) {
  const { error } = await supabase.from('instances').update({ status: 'error' }).eq('id', instanceId);
  if (!error) await logSyncAudit('instance_marked_offline', instanceId, { reason: 'remote_missing' });
}

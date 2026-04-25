import type {
  WhatsAppProvider,
  CreateInstanceResult,
  QRCodeResult,
  InstanceStatusResult,
  SendMessageResult,
  FetchInstanceItem,
} from './types';

/**
 * QuePasa provider — open-source HTTP API for WhatsApp Web
 * Reference: https://github.com/nocodeleaks/quepasa
 *
 * Auth model:
 *  - `config.apiKey` carries the QuePasa master/admin token (X-QUEPASA-TOKEN
 *    for global ops). Per-session tokens may be returned by /scan and stored
 *    on instances.provider_instance_id.
 *  - All real calls happen server-side from the `whatsapp-provider-proxy`
 *    edge function. This client adapter exists for type/contract parity.
 */

async function qpFetch(
  baseUrl: string,
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body?: Record<string, any>,
): Promise<{ ok: boolean; status: number; data: any }> {
  const url = `${baseUrl.replace(/\/+$/, '')}${path}`;
  const finalHeaders: Record<string, string> = { Accept: 'application/json', ...headers };
  if (body) finalHeaders['Content-Type'] = 'application/json';
  const res = await fetch(url, {
    method,
    headers: finalHeaders,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(async () => ({ raw: await res.text().catch(() => '') }));
  return { ok: res.ok, status: res.status, data };
}

function mapQuePasaStatus(raw: any): InstanceStatusResult['state'] {
  const s = String(raw?.status || raw?.state || raw || '').toLowerCase();
  if (s.includes('ready') || s.includes('connected') || s.includes('open')) return 'open';
  if (s.includes('qr') || s.includes('starting') || s.includes('connecting') || s.includes('scan')) return 'connecting';
  if (s.includes('disconnected') || s.includes('closed') || s.includes('logout')) return 'close';
  return 'close';
}

export const quepasaProvider: WhatsAppProvider = {
  name: 'quepasa' as any,

  async testConnection(config) {
    try {
      // Try /info or /health-style endpoint; fallback to a safe HEAD probe
      const r = await qpFetch(config.baseUrl, 'GET', '/info', {
        'X-QUEPASA-TOKEN': config.apiKey,
      });
      if (r.ok) return { success: true, data: true, raw: r.data };
      // Fallback: try /bot list
      const fb = await qpFetch(config.baseUrl, 'GET', '/bot', {
        'X-QUEPASA-TOKEN': config.apiKey,
      });
      if (fb.ok) return { success: true, data: true, raw: fb.data };
      return { success: false, error: r.data?.message || `HTTP ${r.status}`, raw: r.data };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  async createInstance(config, instanceName, payload) {
    const headers: Record<string, string> = {
      'X-QUEPASA-USER': payload?.user || instanceName,
      'X-QUEPASA-TOKEN': config.apiKey || '',
    };
    const r = await qpFetch(config.baseUrl, 'POST', '/scan', headers);
    if (!r.ok) return { success: false, error: r.data?.message || `HTTP ${r.status}`, raw: r.data };
    const newToken = r.data?.token || r.data?.bot?.token || r.data?.session?.token || null;
    const qr = r.data?.qrcode || r.data?.qr || r.data?.base64 || r.data?.image || null;
    return {
      success: true,
      data: {
        instanceId: instanceName,
        instanceName,
        qrCode: qr,
        status: r.data?.status || 'created',
      } as CreateInstanceResult,
      raw: { token: newToken, scan: r.data },
    };
  },

  async connectInstance(config, instanceName) {
    const headers: Record<string, string> = {
      'X-QUEPASA-USER': instanceName,
      'X-QUEPASA-TOKEN': config.apiKey || '',
    };
    const r = await qpFetch(config.baseUrl, 'POST', '/scan', headers);
    return {
      success: r.ok,
      data: {
        qrCode: r.data?.qrcode || r.data?.qr || r.data?.base64 || r.data?.image || undefined,
      } as QRCodeResult,
      raw: r.data,
    };
  },

  async getInstanceStatus(config, instanceName) {
    const headers: Record<string, string> = { 'X-QUEPASA-TOKEN': config.apiKey || '' };
    const r = await qpFetch(config.baseUrl, 'GET', `/info/${encodeURIComponent(instanceName)}`, headers);
    if (r.status === 404) return { success: true, data: { state: 'not_found', instanceName } };
    if (!r.ok) return { success: false, error: r.data?.message || `HTTP ${r.status}`, raw: r.data };
    return {
      success: true,
      data: { state: mapQuePasaStatus(r.data), instanceName },
      raw: r.data,
    };
  },

  async deleteInstance(config, instanceName) {
    const headers: Record<string, string> = { 'X-QUEPASA-TOKEN': config.apiKey || '' };
    const r = await qpFetch(config.baseUrl, 'DELETE', `/bot/${encodeURIComponent(instanceName)}`, headers);
    if (r.status === 404) return { success: true };
    if (!r.ok) return { success: false, error: r.data?.message || `HTTP ${r.status}`, raw: r.data };
    return { success: true };
  },

  async logoutInstance(config, instanceName) {
    const headers: Record<string, string> = { 'X-QUEPASA-TOKEN': config.apiKey || '' };
    const r = await qpFetch(config.baseUrl, 'POST', `/bot/${encodeURIComponent(instanceName)}/logout`, headers);
    if (!r.ok && r.status !== 404) {
      return { success: false, error: r.data?.message || `HTTP ${r.status}`, raw: r.data };
    }
    return { success: true };
  },

  async fetchInstances(config) {
    const headers: Record<string, string> = { 'X-QUEPASA-TOKEN': config.apiKey || '' };
    const r = await qpFetch(config.baseUrl, 'GET', '/bot', headers);
    if (!r.ok) return { success: false, error: r.data?.message || `HTTP ${r.status}`, raw: r.data };
    const list: any[] = Array.isArray(r.data?.bots) ? r.data.bots : Array.isArray(r.data) ? r.data : [];
    const items: FetchInstanceItem[] = list.map((entry: any) => ({
      instanceName: entry?.username || entry?.user || entry?.id || '',
      instanceId: entry?.id || entry?.token || entry?.username || null,
      status: mapQuePasaStatus(entry),
      raw: entry,
    }));
    return { success: true, data: items, raw: r.data };
  },

  async sendTextMessage(config, instanceName, phone, text) {
    const chatId = phone.replace(/\D/g, '');
    const headers: Record<string, string> = {
      'X-QUEPASA-TOKEN': config.apiKey || '',
      'X-QUEPASA-CHATID': `${chatId}@s.whatsapp.net`,
      'X-QUEPASA-TRACKID': instanceName,
    };
    const r = await qpFetch(config.baseUrl, 'POST', '/send', headers, { text });
    if (!r.ok) return { success: false, error: r.data?.message || `HTTP ${r.status}`, raw: r.data };
    return {
      success: true,
      data: {
        messageId: r.data?.id || r.data?.messageId,
        timestamp: r.data?.timestamp,
      } as SendMessageResult,
      raw: r.data,
    };
  },
};

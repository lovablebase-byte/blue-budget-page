import type {
  WhatsAppProvider,
  ProviderConfig,
  CreateInstanceResult,
  QRCodeResult,
  InstanceStatusResult,
  SendMessageResult,
  FetchInstanceItem,
} from './types';

/**
 * Evolution Go (Evolution API v2) provider.
 *
 * Per the official documentation:
 *  - Auth: header `apikey` carrying the GLOBAL_API_KEY (same as Evolution v1).
 *  - Endpoints mirror Evolution v1: /instance/create, /instance/connect/{name},
 *    /instance/connectionState/{name}, /instance/logout/{name},
 *    /instance/delete/{name}, /instance/fetchInstances.
 *  - sendText payload differs: { number, textMessage: { text }, options: { delay, presence } }.
 *  - Webhook events arrive UPPERCASE (MESSAGES_UPSERT, CONNECTION_UPDATE, ...) and
 *    are normalized in the webhook-receiver edge function.
 *
 * Network calls happen server-side through the whatsapp-provider-proxy edge function;
 * this file is the canonical client-side adapter used to keep types & contracts aligned.
 */

async function egoFetch(
  config: ProviderConfig,
  method: string,
  path: string,
  body?: Record<string, any>,
): Promise<{ ok: boolean; status: number; data: any }> {
  const url = `${config.baseUrl.replace(/\/+$/, '')}${path}`;
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', apikey: config.apiKey },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(async () => ({ raw: await res.text().catch(() => '') }));
  return { ok: res.ok, status: res.status, data };
}

export const evolutionGoProvider: WhatsAppProvider = {
  name: 'evolution_go',

  async testConnection(config) {
    try {
      const r = await egoFetch(config, 'GET', '/instance/fetchInstances');
      return { success: r.ok, data: r.ok, raw: r.data };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  async createInstance(config, instanceName, payload) {
    const body: Record<string, any> = {
      instanceName,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
    };
    if (payload?.token) body.token = payload.token;
    if (payload?.number) body.number = payload.number;
    if (payload?.webhook) {
      body.webhook = {
        url: payload.webhook,
        byEvents: payload.webhookByEvents ?? true,
        base64: true,
        events: payload.events || [],
      };
    }
    const r = await egoFetch(config, 'POST', '/instance/create', body);
    if (!r.ok) return { success: false, error: r.data?.message || `HTTP ${r.status}`, raw: r.data };
    return {
      success: true,
      data: {
        instanceId: r.data?.instance?.instanceId || r.data?.instanceId || '',
        instanceName: r.data?.instance?.instanceName || instanceName,
        qrCode: r.data?.qrcode?.base64 || r.data?.base64 || undefined,
        status: r.data?.instance?.status || 'created',
      } as CreateInstanceResult,
      raw: r.data,
    };
  },

  async connectInstance(config, instanceName) {
    const r = await egoFetch(config, 'GET', `/instance/connect/${instanceName}`);
    if (!r.ok) return { success: false, error: r.data?.message || `HTTP ${r.status}`, raw: r.data };
    return {
      success: true,
      data: {
        qrCode: r.data?.base64 || r.data?.qrcode?.base64 || undefined,
        pairingCode: r.data?.pairingCode || undefined,
      } as QRCodeResult,
      raw: r.data,
    };
  },

  async getInstanceStatus(config, instanceName) {
    const r = await egoFetch(config, 'GET', `/instance/connectionState/${instanceName}`);
    if (r.status === 404) {
      return { success: true, data: { state: 'not_found' as const, instanceName } };
    }
    if (!r.ok) return { success: false, error: r.data?.message || `HTTP ${r.status}`, raw: r.data };

    const raw = r.data?.instance || r.data;
    let state: InstanceStatusResult['state'] = 'close';
    const rawState = (raw?.state || raw?.status || '').toLowerCase();
    if (rawState === 'open' || rawState === 'connected') state = 'open';
    else if (rawState === 'connecting') state = 'connecting';

    return {
      success: true,
      data: { state, instanceName, phoneNumber: raw?.phoneNumber },
      raw: r.data,
    };
  },

  async deleteInstance(config, instanceName) {
    const r = await egoFetch(config, 'DELETE', `/instance/delete/${instanceName}`);
    if (r.status === 404) return { success: true };
    if (!r.ok) return { success: false, error: r.data?.message || `HTTP ${r.status}`, raw: r.data };
    return { success: true };
  },

  async logoutInstance(config, instanceName) {
    const r = await egoFetch(config, 'DELETE', `/instance/logout/${instanceName}`);
    if (!r.ok) return { success: false, error: r.data?.message || `HTTP ${r.status}`, raw: r.data };
    return { success: true };
  },

  async fetchInstances(config) {
    const r = await egoFetch(config, 'GET', '/instance/fetchInstances');
    if (!r.ok) return { success: false, error: r.data?.message || `HTTP ${r.status}`, raw: r.data };
    const list = Array.isArray(r.data) ? r.data : [];
    const items: FetchInstanceItem[] = list.map((item: any) => {
      const inst = item?.instance || item;
      return {
        instanceName: inst?.instanceName || inst?.name || null,
        instanceId: inst?.instanceId || null,
        status: inst?.status || inst?.state || 'unknown',
        raw: item,
      };
    });
    return { success: true, data: items, raw: r.data };
  },

  async sendTextMessage(config, instanceName, phone, text) {
    // Evolution Go v2 expects { number, textMessage: { text }, options: { ... } }
    const r = await egoFetch(config, 'POST', `/message/sendText/${instanceName}`, {
      number: phone,
      textMessage: { text },
      options: { delay: 1200, presence: 'composing' },
    });
    if (!r.ok) return { success: false, error: r.data?.message || `HTTP ${r.status}`, raw: r.data };
    return {
      success: true,
      data: { messageId: r.data?.key?.id, timestamp: r.data?.messageTimestamp } as SendMessageResult,
      raw: r.data,
    };
  },
};

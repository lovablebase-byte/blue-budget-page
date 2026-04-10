import type {
  WhatsAppProvider,
  ProviderConfig,
  ProviderResult,
  CreateInstanceResult,
  QRCodeResult,
  InstanceStatusResult,
  SendMessageResult,
  FetchInstanceItem,
} from './types';

async function evoFetch(
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

export const evolutionProvider: WhatsAppProvider = {
  name: 'evolution',

  async testConnection(config) {
    try {
      const r = await evoFetch(config, 'GET', '/instance/fetchInstances');
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
    if (payload?.webhook) {
      body.webhook = {
        url: payload.webhook,
        byEvents: payload.webhookByEvents ?? true,
        base64: true,
        events: payload.events || [],
      };
    }
    const r = await evoFetch(config, 'POST', '/instance/create', body);
    if (!r.ok) return { success: false, error: r.data?.message || `HTTP ${r.status}`, raw: r.data };
    return {
      success: true,
      data: {
        instanceId: r.data?.instance?.instanceId || r.data?.instanceId || '',
        instanceName: r.data?.instance?.instanceName || instanceName,
        qrCode: r.data?.qrcode?.base64 || r.data?.base64 || undefined,
        status: r.data?.instance?.status || 'created',
      },
      raw: r.data,
    };
  },

  async connectInstance(config, instanceName) {
    const r = await evoFetch(config, 'GET', `/instance/connect/${instanceName}`);
    if (!r.ok) return { success: false, error: r.data?.message || `HTTP ${r.status}`, raw: r.data };
    return {
      success: true,
      data: {
        qrCode: r.data?.base64 || r.data?.qrcode?.base64 || undefined,
        pairingCode: r.data?.pairingCode || undefined,
      },
      raw: r.data,
    };
  },

  async getInstanceStatus(config, instanceName) {
    const r = await evoFetch(config, 'GET', `/instance/connectionState/${instanceName}`);
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
    const r = await evoFetch(config, 'DELETE', `/instance/delete/${instanceName}`);
    if (r.status === 404) return { success: true };
    if (!r.ok) return { success: false, error: r.data?.message || `HTTP ${r.status}`, raw: r.data };
    return { success: true };
  },

  async logoutInstance(config, instanceName) {
    const r = await evoFetch(config, 'DELETE', `/instance/logout/${instanceName}`);
    if (!r.ok) return { success: false, error: r.data?.message || `HTTP ${r.status}`, raw: r.data };
    return { success: true };
  },

  async fetchInstances(config) {
    const r = await evoFetch(config, 'GET', '/instance/fetchInstances');
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
    const r = await evoFetch(config, 'POST', `/message/sendText/${instanceName}`, {
      number: phone,
      text,
    });
    if (!r.ok) return { success: false, error: r.data?.message || `HTTP ${r.status}`, raw: r.data };
    return {
      success: true,
      data: { messageId: r.data?.key?.id, timestamp: r.data?.messageTimestamp },
      raw: r.data,
    };
  },
};

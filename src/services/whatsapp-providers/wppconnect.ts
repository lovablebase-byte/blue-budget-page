import type {
  WhatsAppProvider,
  CreateInstanceResult,
  QRCodeResult,
  InstanceStatusResult,
  SendMessageResult,
  FetchInstanceItem,
} from './types';

/**
 * WPPConnect Server provider — REST API based on WhatsApp Web (whatsapp-web.js style).
 * Reference: https://wppconnect.io/docs/
 *
 * Auth model:
 *  - `config.apiKey` carries the WPPConnect SECRET KEY (used to generate
 *    per-session bearer tokens via POST /api/{session}/{secretkey}/generate-token).
 *  - The per-session token returned by generate-token is what authorizes all
 *    other endpoints (Authorization: Bearer <session-token>).
 *  - In our schema this session token is stored on instances.provider_instance_id
 *    so that subsequent calls don't have to regenerate it.
 *
 * IMPORTANT: this client-side adapter exists for type/contract parity with the
 * other providers. Real network calls are issued server-side from the
 * `whatsapp-provider-proxy` edge function, so secret keys never touch the browser.
 */

async function wppFetch(
  baseUrl: string,
  method: string,
  path: string,
  bearer?: string,
  body?: Record<string, any>,
): Promise<{ ok: boolean; status: number; data: any }> {
  const url = `${baseUrl.replace(/\/+$/, '')}${path}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  const res = await fetch(url, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(async () => ({ raw: await res.text().catch(() => '') }));
  return { ok: res.ok, status: res.status, data };
}

async function generateSessionToken(baseUrl: string, secretKey: string, session: string) {
  const r = await wppFetch(baseUrl, 'POST', `/api/${encodeURIComponent(session)}/${encodeURIComponent(secretKey)}/generate-token`);
  if (!r.ok) return null;
  return r.data?.token || r.data?.full || null;
}

export const wppconnectProvider: WhatsAppProvider = {
  name: 'wppconnect' as any,

  async testConnection(config) {
    try {
      // show-all-sessions requires only the secret key as bearer (when configured),
      // otherwise some deployments leave it open. Try unauthenticated first.
      const r = await wppFetch(config.baseUrl, 'GET', '/api/show-all-sessions', config.apiKey);
      if (r.ok) return { success: true, data: true, raw: r.data };
      return { success: false, error: r.data?.message || `HTTP ${r.status}`, raw: r.data };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  async createInstance(config, instanceName, payload) {
    const session = instanceName;
    const sessionToken = await generateSessionToken(config.baseUrl, config.apiKey, session);
    if (!sessionToken) {
      return { success: false, error: 'WPPConnect: falha ao gerar token da sessão (verifique Secret Key)' };
    }
    const startBody: Record<string, any> = { waitQrCode: true };
    if (payload?.webhook) startBody.webhook = payload.webhook;
    const r = await wppFetch(config.baseUrl, 'POST', `/api/${encodeURIComponent(session)}/start-session`, sessionToken, startBody);
    if (!r.ok) return { success: false, error: r.data?.message || `HTTP ${r.status}`, raw: r.data };
    return {
      success: true,
      data: {
        instanceId: session,
        instanceName: session,
        qrCode: r.data?.qrcode || r.data?.base64 || undefined,
        status: r.data?.status || 'created',
      } as CreateInstanceResult,
      raw: { token: sessionToken, start: r.data },
    };
  },

  async connectInstance(config, instanceName) {
    const session = instanceName;
    let sessionToken = await generateSessionToken(config.baseUrl, config.apiKey, session);
    if (!sessionToken) {
      return { success: false, error: 'WPPConnect: falha ao gerar token da sessão' };
    }
    await wppFetch(config.baseUrl, 'POST', `/api/${encodeURIComponent(session)}/start-session`, sessionToken, { waitQrCode: true });
    const qr = await wppFetch(config.baseUrl, 'GET', `/api/${encodeURIComponent(session)}/qrcode-session`, sessionToken);
    return {
      success: true,
      data: {
        qrCode: qr.data?.qrcode || qr.data?.base64 || undefined,
      } as QRCodeResult,
      raw: qr.data,
    };
  },

  async getInstanceStatus(config, instanceName) {
    const session = instanceName;
    const sessionToken = await generateSessionToken(config.baseUrl, config.apiKey, session);
    if (!sessionToken) {
      return { success: true, data: { state: 'not_found', instanceName } };
    }
    const r = await wppFetch(config.baseUrl, 'GET', `/api/${encodeURIComponent(session)}/status-session`, sessionToken);
    if (!r.ok) {
      if (r.status === 404) return { success: true, data: { state: 'not_found', instanceName } };
      return { success: false, error: r.data?.message || `HTTP ${r.status}`, raw: r.data };
    }
    const raw = String(r.data?.status || '').toUpperCase();
    let state: InstanceStatusResult['state'] = 'close';
    if (raw === 'CONNECTED' || raw === 'INCHAT' || raw === 'OPEN') state = 'open';
    else if (raw === 'QRCODE' || raw === 'STARTING' || raw === 'CONNECTING') state = 'connecting';
    else if (raw === 'CLOSED' || raw === 'DISCONNECTED' || raw === 'NOTLOGGED') state = 'close';
    return { success: true, data: { state, instanceName: session }, raw: r.data };
  },

  async deleteInstance(config, instanceName) {
    const session = instanceName;
    const sessionToken = await generateSessionToken(config.baseUrl, config.apiKey, session);
    if (!sessionToken) return { success: true };
    const r = await wppFetch(config.baseUrl, 'POST', `/api/${encodeURIComponent(session)}/close-session`, sessionToken);
    if (!r.ok && r.status !== 404) {
      return { success: false, error: r.data?.message || `HTTP ${r.status}`, raw: r.data };
    }
    return { success: true };
  },

  async logoutInstance(config, instanceName) {
    const session = instanceName;
    const sessionToken = await generateSessionToken(config.baseUrl, config.apiKey, session);
    if (!sessionToken) return { success: true };
    const r = await wppFetch(config.baseUrl, 'POST', `/api/${encodeURIComponent(session)}/logout-session`, sessionToken);
    if (!r.ok) return { success: false, error: r.data?.message || `HTTP ${r.status}`, raw: r.data };
    return { success: true };
  },

  async fetchInstances(config) {
    const r = await wppFetch(config.baseUrl, 'GET', '/api/show-all-sessions', config.apiKey);
    if (!r.ok) return { success: false, error: r.data?.message || `HTTP ${r.status}`, raw: r.data };
    const list: any[] = Array.isArray(r.data?.response) ? r.data.response : Array.isArray(r.data) ? r.data : [];
    const items: FetchInstanceItem[] = list.map((entry: any) => {
      const session = typeof entry === 'string' ? entry : entry?.session || entry?.name || '';
      return { instanceName: session, instanceId: session, status: 'unknown', raw: entry };
    });
    return { success: true, data: items, raw: r.data };
  },

  async sendTextMessage(config, instanceName, phone, text) {
    const session = instanceName;
    const sessionToken = await generateSessionToken(config.baseUrl, config.apiKey, session);
    if (!sessionToken) return { success: false, error: 'WPPConnect: token de sessão indisponível' };
    const r = await wppFetch(config.baseUrl, 'POST', `/api/${encodeURIComponent(session)}/send-message`, sessionToken, {
      phone: phone.replace(/\D/g, ''),
      isGroup: false,
      isNewsletter: false,
      isLid: false,
      message: text,
    });
    if (!r.ok) return { success: false, error: r.data?.message || `HTTP ${r.status}`, raw: r.data };
    return {
      success: true,
      data: {
        messageId: r.data?.response?.id || r.data?.id,
        timestamp: r.data?.response?.t,
      } as SendMessageResult,
      raw: r.data,
    };
  },
};

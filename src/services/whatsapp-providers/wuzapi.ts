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

/**
 * Wuzapi uses a per-user Token auth model.
 * In our abstraction, `config.apiKey` maps to the Admin Token (WUZAPI_ADMIN_TOKEN)
 * and individual instance tokens are stored as `provider_instance_id` in the DB.
 *
 * For actions that operate on a specific instance, we use the instance's own token
 * (passed as instanceName which is actually the user token in Wuzapi context).
 * The admin token is used for admin-level actions (create user, list users, delete user).
 */

async function wuzFetch(
  baseUrl: string,
  method: string,
  path: string,
  token: string,
  body?: Record<string, any>,
): Promise<{ ok: boolean; status: number; data: any }> {
  const url = `${baseUrl.replace(/\/+$/, '')}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: token,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(async () => ({ raw: await res.text().catch(() => '') }));
  return { ok: res.ok, status: res.status, data };
}

export const wuzapiProvider: WhatsAppProvider = {
  name: 'wuzapi',

  async testConnection(config) {
    try {
      // Use admin endpoint to list users as health check
      const r = await wuzFetch(config.baseUrl, 'GET', '/admin/users', config.apiKey);
      return { success: r.ok, data: r.ok, raw: r.data };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  async createInstance(config, instanceName, payload) {
    // Wuzapi creates "users" via admin API; each user = one instance
    const userToken = payload?.token || crypto.randomUUID().replace(/-/g, '').slice(0, 20);
    const body: Record<string, any> = {
      name: instanceName,
      token: userToken,
    };
    if (payload?.webhook) {
      body.webhook = payload.webhook;
      body.events = payload.events?.join(',') || 'Message';
    }

    const r = await wuzFetch(config.baseUrl, 'POST', '/admin/users', config.apiKey, body);
    if (!r.ok) return { success: false, error: r.data?.message || r.data?.Details || `HTTP ${r.status}`, raw: r.data };

    // After creating user, connect to generate QR
    const connectR = await wuzFetch(config.baseUrl, 'POST', '/session/connect', userToken, {
      Subscribe: ['Message'],
      Immediate: true,
    });

    // Get QR code
    let qrCode: string | undefined;
    if (connectR.ok) {
      const qrR = await wuzFetch(config.baseUrl, 'GET', '/session/qr', userToken);
      if (qrR.ok && qrR.data?.data?.QRCode) {
        qrCode = qrR.data.data.QRCode;
      }
    }

    return {
      success: true,
      data: {
        instanceId: String(r.data?.id || ''),
        instanceName,
        qrCode,
        status: 'created',
      },
      raw: { createResponse: r.data, connectResponse: connectR.data },
    };
  },

  async connectInstance(config, instanceName) {
    // instanceName here is the user token for Wuzapi
    const connectR = await wuzFetch(config.baseUrl, 'POST', '/session/connect', instanceName, {
      Subscribe: ['Message'],
      Immediate: true,
    });

    if (!connectR.ok && connectR.status !== 200) {
      return { success: false, error: connectR.data?.message || connectR.data?.data?.Details || `HTTP ${connectR.status}`, raw: connectR.data };
    }

    // If already logged in, no QR needed
    if (connectR.data?.data?.jid) {
      return { success: true, data: {}, raw: connectR.data };
    }

    // Fetch QR
    const qrR = await wuzFetch(config.baseUrl, 'GET', '/session/qr', instanceName);
    return {
      success: true,
      data: {
        qrCode: qrR.data?.data?.QRCode || undefined,
      },
      raw: { connect: connectR.data, qr: qrR.data },
    };
  },

  async getInstanceStatus(config, instanceName) {
    // instanceName = user token
    const r = await wuzFetch(config.baseUrl, 'GET', '/session/status', instanceName);
    if (!r.ok) {
      if (r.status === 404 || r.status === 401) {
        return { success: true, data: { state: 'not_found' as const, instanceName } };
      }
      return { success: false, error: r.data?.message || `HTTP ${r.status}`, raw: r.data };
    }

    const connected = r.data?.data?.Connected === true;
    const loggedIn = r.data?.data?.LoggedIn === true;

    let state: InstanceStatusResult['state'] = 'close';
    if (connected && loggedIn) state = 'open';
    else if (connected && !loggedIn) state = 'connecting';

    return {
      success: true,
      data: { state, instanceName },
      raw: r.data,
    };
  },

  async deleteInstance(config, instanceName) {
    // First disconnect, then delete the user via admin API
    // We need the user ID; instanceName might be the token
    // Try to find user by listing all
    const listR = await wuzFetch(config.baseUrl, 'GET', '/admin/users', config.apiKey);
    if (listR.ok && Array.isArray(listR.data)) {
      const user = listR.data.find((u: any) => u.token === instanceName || u.name === instanceName);
      if (user?.id) {
        // Disconnect first (ignore errors)
        await wuzFetch(config.baseUrl, 'POST', '/session/logout', user.token || instanceName).catch(() => {});
        const delR = await wuzFetch(config.baseUrl, 'DELETE', `/admin/users/${user.id}`, config.apiKey);
        if (!delR.ok && delR.status !== 404) {
          return { success: false, error: delR.data?.Details || `HTTP ${delR.status}`, raw: delR.data };
        }
        return { success: true };
      }
    }
    // If user not found, treat as already deleted
    return { success: true };
  },

  async logoutInstance(config, instanceName) {
    const r = await wuzFetch(config.baseUrl, 'POST', '/session/logout', instanceName);
    if (!r.ok) return { success: false, error: r.data?.data?.Details || `HTTP ${r.status}`, raw: r.data };
    return { success: true };
  },

  async fetchInstances(config) {
    const r = await wuzFetch(config.baseUrl, 'GET', '/admin/users', config.apiKey);
    if (!r.ok) return { success: false, error: r.data?.message || `HTTP ${r.status}`, raw: r.data };
    const list = Array.isArray(r.data) ? r.data : [];
    const items: FetchInstanceItem[] = list.map((user: any) => ({
      instanceName: user.name || user.token,
      instanceId: String(user.id || ''),
      status: user.connected ? 'open' : 'close',
      raw: user,
    }));
    return { success: true, data: items, raw: r.data };
  },

  async sendTextMessage(config, instanceName, phone, text) {
    // instanceName = user token for Wuzapi
    const r = await wuzFetch(config.baseUrl, 'POST', '/chat/send/text', instanceName, {
      Phone: phone.replace(/\D/g, ''),
      Body: text,
    });
    if (!r.ok) return { success: false, error: r.data?.data?.Details || `HTTP ${r.status}`, raw: r.data };
    return {
      success: true,
      data: {
        messageId: r.data?.data?.Id,
        timestamp: r.data?.data?.Timestamp,
      },
      raw: r.data,
    };
  },
};

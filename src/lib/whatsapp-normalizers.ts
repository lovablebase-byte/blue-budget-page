/**
 * Normalizadores centrais para status e telefone das instâncias WhatsApp.
 *
 * ETAPA 1 da refatoração: centraliza a lógica que antes vivia espalhada nos
 * proxies, no webhook receiver e nas telas. Esta etapa apenas EXPORTA as
 * funções utilitárias — ainda não altera o comportamento existente.
 *
 * Regras críticas:
 *   - Telefone: remover tudo após `:` ANTES de filtrar não numéricos.
 *   - Status: conectado SEMPRE vence QR Code. Se houver sinal real de conexão,
 *     nunca retornar pairing/qrcode.
 */

// ---------------------------------------------------------------------------
// PHONE
// ---------------------------------------------------------------------------

/**
 * Normaliza um número de telefone vindo de qualquer provider.
 *
 * Aceita formatos como:
 *   - `558796810157@s.whatsapp.net`
 *   - `558796810157:50@s.whatsapp.net`
 *   - `558796810157:58`
 *   - `+55 87 9681-0157`
 *   - `558796810157`
 *
 * Sempre remove o sufixo `:NN` (device id) ANTES de filtrar não numéricos,
 * para evitar concatenar o device id ao número (ex.: `55879681015750`).
 */
export function normalizeWhatsappPhone(input: unknown): string {
  if (input === null || input === undefined) return '';
  let raw = String(input).trim();
  if (!raw) return '';

  // Remove o sufixo "@s.whatsapp.net", "@c.us", "@g.us", etc.
  const atIdx = raw.indexOf('@');
  if (atIdx >= 0) raw = raw.slice(0, atIdx);

  // Remove tudo que vier após `:` (device id do WhatsApp Multi-Device).
  const colonIdx = raw.indexOf(':');
  if (colonIdx >= 0) raw = raw.slice(0, colonIdx);

  // Agora sim, filtra qualquer caractere não numérico.
  return raw.replace(/\D+/g, '');
}

/**
 * Tenta extrair e normalizar o telefone a partir de um objeto bruto vindo do
 * provider, testando os campos mais comuns na ordem em que aparecem nas APIs
 * (Evolution, Wuzapi, WPPConnect, QuePasa, Evolution Go).
 */
export function extractWhatsappPhone(obj: unknown): string {
  if (!obj || typeof obj !== 'object') return '';
  const o = obj as Record<string, any>;

  const candidates: unknown[] = [
    o.phoneNumber,
    o.phone_number,
    o.phone,
    o.Phone,
    o.number,
    o.Number,
    o.msisdn,
    o.wid,
    o.jid,
    o.JID,
    o.ownerJid,
    o.OwnerJid,
    o.remoteJid,
    o.user,
    o.User,
    o?.instance?.phoneNumber,
    o?.instance?.owner,
    o?.instance?.ownerJid,
    o?.instance?.user?.id,
    o?.me?.id,
    o?.user?.id,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeWhatsappPhone(candidate);
    if (normalized) return normalized;
  }
  return '';
}

// ---------------------------------------------------------------------------
// STATUS
// ---------------------------------------------------------------------------

export type CanonicalStatus = 'online' | 'offline' | 'pairing';
export type CanonicalState = 'open' | 'close' | 'qrcode';

export interface NormalizedProviderStatus {
  status: CanonicalStatus;
  state: CanonicalState;
  connected: boolean;
  /** Texto bruto detectado (apenas para debug/log). */
  raw?: string;
}

const ONLINE_TOKENS = new Set([
  'online',
  'connected',
  'open',
  'ready',
  'authenticated',
  'logged',
  'logged_in',
  'loggedin',
  'active',
  'inchat',
]);

const OFFLINE_TOKENS = new Set([
  'close',
  'closed',
  'disconnected',
  'offline',
  'logout',
  'logged_out',
  'loggedout',
  'not_logged',
  'notlogged',
  'not_connected',
  'notconnected',
  'device_not_connected',
  'not_found',
  'notfound',
  'deleted',
  'missing',
  'removed',
  'error',
  'failed',
  'failure',
]);

const PAIRING_TOKENS = new Set([
  'qr',
  'qrcode',
  'qr_code',
  'scan',
  'scanning',
  'pairing',
  'connecting',
  'opening',
  'awaiting_qr',
  'awaitingqr',
  'starting',
  'init',
  'initializing',
  'unpaired',
]);

function asLowerString(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).toLowerCase().trim();
}

function isTrueFlag(v: unknown): boolean {
  if (v === true) return true;
  if (typeof v === 'number') return v === 1;
  if (typeof v === 'string') {
    const s = v.toLowerCase().trim();
    return s === 'true' || s === '1' || s === 'yes';
  }
  return false;
}

/**
 * Coleta os "tokens de status" presentes em qualquer ponto do payload bruto
 * do provider. Cobre Evolution (instance.state), Wuzapi (Connected/LoggedIn),
 * Evolution Go (status), WPPConnect (status/state), QuePasa (status), além
 * dos shapes flat (`{state: "open"}`).
 */
function collectStatusTokens(obj: unknown): string[] {
  if (!obj) return [];
  if (typeof obj === 'string') return [asLowerString(obj)];
  if (typeof obj !== 'object') return [];
  const o = obj as Record<string, any>;
  const tokens: string[] = [];
  const push = (v: unknown) => {
    const s = asLowerString(v);
    if (s) tokens.push(s);
  };

  push(o.status);
  push(o.Status);
  push(o.state);
  push(o.State);
  push(o.connection);
  push(o.connectionStatus);
  push(o.connection_state);
  push(o.session);
  push(o.sessionStatus);
  push(o?.instance?.state);
  push(o?.instance?.status);
  push(o?.instance?.connection);
  push(o?.data?.state);
  push(o?.data?.status);
  push(o?.data?.connection);

  return tokens;
}

/**
 * Normaliza o status retornado por qualquer provider para o vocabulário
 * canônico do app.
 *
 * Prioridade:
 *   1. Conectado — qualquer flag/token de "connected" vence tudo.
 *   2. Desconectado — close/disconnected/logout/error/not_found.
 *   3. Pareamento — qr/scan/pairing/connecting.
 *
 * Regra crítica: conectado SEMPRE vence QR Code. Se a Wuzapi devolver
 * `Connected: true` junto com `status: "qr"`, o resultado é ONLINE.
 */
export function normalizeProviderStatus(
  payload: unknown,
  provider?: string,
): NormalizedProviderStatus {
  const isWuzapi = (provider || '').toLowerCase() === 'wuzapi';

  // Strong-auth signals: only these (or a real JID) can mark WuzAPI as online.
  const isStrongAuthFlag = (o: Record<string, any>) =>
    isTrueFlag(o.LoggedIn) ||
    isTrueFlag(o.loggedIn) ||
    isTrueFlag(o.IsLogged) ||
    isTrueFlag(o.isLogged) ||
    isTrueFlag(o.logged) ||
    isTrueFlag(o.authenticated) ||
    isTrueFlag(o.ready) ||
    isTrueFlag(o?.data?.LoggedIn) ||
    isTrueFlag(o?.data?.loggedIn) ||
    isTrueFlag(o?.data?.IsLogged) ||
    isTrueFlag(o?.data?.authenticated) ||
    isTrueFlag(o?.data?.ready);

  const STRONG_ONLINE_TOKENS = new Set([
    'open', 'loggedin', 'logged_in', 'ready', 'authenticated',
  ]);

  // 1) Flags booleanas explícitas vencem qualquer string.
  if (payload && typeof payload === 'object') {
    const o = payload as Record<string, any>;

    if (isWuzapi) {
      // WuzAPI: Connected/connected ALONE is NOT real WhatsApp pairing.
      // Require strong auth flag, strong-online status token, or a real JID/phone.
      const tokens = collectStatusTokens(o);
      const hasStrongToken = tokens.some((t) => STRONG_ONLINE_TOKENS.has(t));
      const jidLike = extractWhatsappPhone(o);
      if (isStrongAuthFlag(o) || hasStrongToken || jidLike) {
        return { status: 'online', state: 'open', connected: true, raw: 'wuzapi:strong' };
      }

      const explicitDisconnect = tokens.some((t) => OFFLINE_TOKENS.has(t));
      if (explicitDisconnect) {
        return { status: 'offline', state: 'close', connected: false, raw: tokens.join('|') };
      }

      // Connected websocket without login OR explicit pairing token => pairing.
      const connectedFlag =
        isTrueFlag(o.connected) ||
        isTrueFlag(o.isConnected) ||
        isTrueFlag(o.Connected) ||
        isTrueFlag(o?.instance?.connected) ||
        isTrueFlag(o?.data?.connected) ||
        isTrueFlag(o?.data?.Connected);
      const hasPairingToken = tokens.some((t) => PAIRING_TOKENS.has(t));
      const hasQr = !!(o.qrCode || o.qrcode || o.qr || o?.data?.QRCode || o?.data?.qrcode);
      if (connectedFlag || hasPairingToken || hasQr) {
        return { status: 'pairing', state: 'qrcode', connected: false, raw: 'wuzapi:pairing' };
      }
      return { status: 'offline', state: 'close', connected: false, raw: tokens.join('|') };
    }

    // Default (Evolution / Evolution Go / WPPConnect / QuePasa):
    // booleanas explícitas vencem qualquer string.
    const connectedFlags = [
      o.connected,
      o.isConnected,
      o.Connected,
      o.LoggedIn,
      o.loggedIn,
      o.isLogged,
      o.logged,
      o.authenticated,
      o.ready,
      o?.instance?.connected,
      o?.instance?.isConnected,
      o?.data?.connected,
      o?.data?.Connected,
      o?.data?.LoggedIn,
    ];
    if (connectedFlags.some(isTrueFlag)) {
      return { status: 'online', state: 'open', connected: true, raw: 'flag:connected' };
    }
  }

  const tokens = collectStatusTokens(payload);

  // 2) Conectado por token.
  if (tokens.some((t) => ONLINE_TOKENS.has(t))) {
    return { status: 'online', state: 'open', connected: true, raw: tokens.join('|') };
  }

  // 3) Desconectado.
  if (tokens.some((t) => OFFLINE_TOKENS.has(t))) {
    return { status: 'offline', state: 'close', connected: false, raw: tokens.join('|') };
  }

  // 4) Pareamento / QR.
  if (tokens.some((t) => PAIRING_TOKENS.has(t))) {
    return { status: 'pairing', state: 'qrcode', connected: false, raw: tokens.join('|') };
  }

  // 5) Default conservador: offline.
  return { status: 'offline', state: 'close', connected: false, raw: tokens.join('|') };
}

/**
 * Mapeia o status canônico para o vocabulário persistido na coluna
 * `instances.status` (constraint instances_status_check).
 *
 * Mantém compatibilidade com os valores já aceitos pelo banco:
 *   online | offline | connecting | pairing | error
 */
export function canonicalStatusToDb(
  s: CanonicalStatus,
): 'online' | 'offline' | 'pairing' {
  return s;
}

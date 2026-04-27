import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PROVIDER_TIMEOUT_MS = 9000;

async function fetchJsonWithTimeout(url: string, init: RequestInit, timeoutMs = PROVIDER_TIMEOUT_MS) {
  const controller = new AbortController();
  const startedAt = Date.now();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const data = await res.json().catch(async () => ({ raw: await res.text().catch(() => "") }));
    return { ok: res.ok, status: res.status, data, durationMs: Date.now() - startedAt };
  } catch (error: any) {
    const timedOut = error?.name === "AbortError";
    return {
      ok: false,
      status: timedOut ? 504 : 503,
      data: { error: timedOut ? "provider_timeout" : "provider_unavailable" },
      durationMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function controlledProviderFailure(provider: string, action: string, instanceName: string | undefined, status = 503, error = "Provider temporariamente indisponível") {
  return {
    ok: true,
    status: 200,
    body: {
      success: false,
      provider,
      action,
      status: "offline",
      state: "provider_unavailable",
      connected: false,
      error,
      instance: { state: "unknown", instanceName, connected: false },
      details: { status },
    },
  };
}

function safeProviderPath(provider: string, path: string) {
  if (provider === "wppconnect") {
    return path
      .replace(/^\/api\/[^/]+\/show-all-sessions$/, "/api/[secret]/show-all-sessions")
      .replace(/^\/api\/[^/]+\/[^/]+\/generate-token$/, "/api/[session]/[secret]/generate-token");
  }
  return path;
}

// ---------- Provider HTTP helpers ----------

async function evoFetch(
  baseUrl: string,
  apiKey: string,
  method: string,
  path: string,
  body?: Record<string, any>
) {
  const url = `${baseUrl}${path}`;
  const res = await fetchJsonWithTimeout(url, {
    method,
    headers: { "Content-Type": "application/json", apikey: apiKey },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { ok: res.ok, status: res.status, data: res.data };
}

function responseLooksLikeHtml(data: any) {
  const raw = typeof data === "string" ? data : data?.raw;
  return typeof raw === "string" && /^\s*<(?:!doctype|html|head|body)\b/i.test(raw);
}

function getProviderErrorText(data: any) {
  return String(data?.error || data?.message || data?.raw || "").toLowerCase();
}

function normalizeEvolutionGoSubscribe(events: any): string[] {
  if (Array.isArray(events) && events.length > 0) return events;
  return ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED", "MESSAGES_UPDATE", "PRESENCE_UPDATE"];
}

async function getEvolutionGoDbInstance(
  supabase: any,
  companyId: string,
  identifier?: string,
) {
  if (!identifier) return null;

  const { data } = await supabase
    .from("instances")
    .select("id, name, provider_instance_id, evolution_instance_id, webhook_url, webhook_secret")
    .eq("company_id", companyId)
    .eq("provider", "evolution_go")
    .or(`name.eq.${identifier},provider_instance_id.eq.${identifier},evolution_instance_id.eq.${identifier}`)
    .limit(1)
    .maybeSingle();

  return data || null;
}

async function listEvolutionGoInstances(baseUrl: string, apiKey: string) {
  const r = await evoFetch(baseUrl, apiKey, "GET", "/instance/all");
  if (!r.ok) return { ok: false, status: r.status, body: r.data, data: [] as any[] };
  const list = Array.isArray(r.data?.data) ? r.data.data : Array.isArray(r.data) ? r.data : [];
  return { ok: true, status: 200, body: r.data, data: list };
}

async function persistEvolutionGoIdentifiers(
  supabase: any,
  instanceId: string,
  remote: { id?: string | null; token?: string | null },
) {
  const update: Record<string, any> = {};
  if (remote.token) update.provider_instance_id = remote.token;
  if (remote.id) update.evolution_instance_id = remote.id;
  if (Object.keys(update).length === 0) return;
  await supabase.from("instances").update(update).eq("id", instanceId);
}

async function resolveEvolutionGoRemote(
  supabase: any,
  companyId: string,
  baseUrl: string,
  apiKey: string,
  identifier?: string,
) {
  const dbInstance = await getEvolutionGoDbInstance(supabase, companyId, identifier);
  const list = await listEvolutionGoInstances(baseUrl, apiKey);

  if (!list.ok) {
    return { dbInstance, remote: null, listError: { ok: false, status: list.status, body: list.body } };
  }

  const remote = list.data.find((item: any) => {
    const candidates = [
      identifier,
      dbInstance?.name,
      dbInstance?.provider_instance_id,
      dbInstance?.evolution_instance_id,
    ].filter(Boolean);

    return candidates.some(
      (candidate) => item?.id === candidate || item?.token === candidate || item?.name === candidate,
    );
  }) || null;

  if (dbInstance && remote) {
    await persistEvolutionGoIdentifiers(supabase, dbInstance.id, {
      id: remote.id || null,
      token: remote.token || null,
    });
  }

  return { dbInstance, remote, listError: null };
}

function mapEvolutionGoStatus(remote: any) {
  if (!remote) return "close";

  // 1) Estados remotos explícitos têm prioridade absoluta.
  // Nunca inferir conexão por jid/owner/telefone: Evolution Go pode expor proprietário mesmo em `close`.
  const rawStates = [
    remote?.status,
    remote?.state,
    remote?.remoteStatus,
    remote?.connectionStatus,
    remote?.connection,
    remote?.instance?.status,
    remote?.instance?.state,
    remote?.data?.status,
    remote?.data?.state,
  ]
    .filter((value) => value !== undefined && value !== null && String(value).trim() !== "")
    .map((value) => String(value).toLowerCase().trim().replace(/[\s-]+/g, "_"));

  const hasState = (...states: string[]) => rawStates.some((state) => states.includes(state));

  if (hasState("close", "closed", "disconnected", "disconnect", "logout", "logged_out", "not_logged", "notlogged", "device_not_connected")) {
    return "close";
  }

  if (hasState("open", "connected", "ready", "online")) {
    return "open";
  }

  if (hasState("qrcode", "qr", "pairing", "connecting", "opening", "scan")) {
    return "connecting";
  }

  // 2) Sem estado textual: usar flags booleanas explícitas
  if (remote?.connected === true || remote?.isLogged === true || remote?.loggedIn === true) {
    return "open";
  }

  if (remote?.connected === false || remote?.isLogged === false || remote?.loggedIn === false) {
    // Existe QR ativo? então está pareando, senão desconectado
    if (remote?.qrcode || remote?.qrCode || remote?.qr) return "connecting";
    return "close";
  }

  // 3) QR Code ativo sem flag explícita = pareando
  if (remote?.qrcode || remote?.qrCode || remote?.qr) return "connecting";

  // 4) Default seguro: NUNCA assumir online a partir de jid/owner
  return "close";
}

async function testEvolutionGoConnection(baseUrl: string, apiKey: string) {
  const list = await evoFetch(baseUrl, apiKey, "GET", "/instance/fetchInstances");

  if (list.ok && !responseLooksLikeHtml(list.data)) {
    return { ok: true, status: 200, body: list.data };
  }

  if (list.status === 404 || responseLooksLikeHtml(list.data)) {
    const probe = await evoFetch(baseUrl, apiKey, "POST", "/instance/create", {});
    const probeError = getProviderErrorText(probe.data);
    const isValidationProbeSuccess =
      probe.status === 400 &&
      (probeError.includes("name is required") ||
        probeError.includes("token is required") ||
        probeError.includes("instance name is required"));

    if (isValidationProbeSuccess) {
      return {
        ok: true,
        status: 200,
        body: { success: true, mode: "create_probe", raw: probe.data },
      };
    }

    if (responseLooksLikeHtml(probe.data)) {
      return {
        ok: false,
        status: 400,
        body: {
          error:
            "Evolution Go respondeu HTML em vez da API JSON. Verifique se a Base URL aponta para a raiz da API, não para o painel Manager.",
          raw: typeof probe.data === "string" ? probe.data : probe.data?.raw,
        },
      };
    }

    return { ok: probe.ok, status: probe.status, body: probe.data };
  }

  return { ok: list.ok, status: list.status, body: list.data };
}

// Admin endpoints use "Authorization" header, session endpoints use "Token" header
async function wuzFetchAdmin(
  baseUrl: string,
  adminToken: string,
  method: string,
  path: string,
  body?: Record<string, any>
) {
  const url = `${baseUrl}${path}`;
  console.log(`[wuzapi] ${method} ${path} (admin)`);
  const res = await fetchJsonWithTimeout(url, {
    method,
    headers: { "Content-Type": "application/json", Authorization: adminToken },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = res.data;
  console.log(`[wuzapi] ${method} ${path} => ${res.status}`);
  return { ok: res.ok, status: res.status, data };
}

// Session/instance endpoints use "Token" header
async function wuzFetchSession(
  baseUrl: string,
  userToken: string,
  method: string,
  path: string,
  body?: Record<string, any>
) {
  const url = `${baseUrl}${path}`;
  console.log(`[wuzapi] ${method} ${path} (session)`);
  const res = await fetchJsonWithTimeout(url, {
    method,
    headers: { "Content-Type": "application/json", Token: userToken },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = res.data;
  console.log(`[wuzapi] ${method} ${path} => ${res.status}`);
  return { ok: res.ok, status: res.status, data };
}

// Helper: normalize WuzAPI status payload — accepts many shapes/casings.
// Returns canonical { connected, state } where state ∈ "open" | "close" | "qrcode" | "connecting".
function normalizeWuzapiStatusResponse(raw: any): {
  connected: boolean;
  state: "open" | "close" | "qrcode" | "connecting";
  phoneNumber: string | null;
} {
  const root = raw || {};
  const data = root?.data?.data || root?.data || root;

  const truthy = (v: any) =>
    v === true || v === 1 || String(v).toLowerCase() === "true" || String(v).toLowerCase() === "1";

  const isConnected =
    truthy(data?.Connected) || truthy(data?.connected) ||
    truthy(data?.IsConnected) || truthy(data?.isConnected) ||
    truthy(data?.LoggedIn) || truthy(data?.loggedIn) ||
    truthy(data?.IsLogged) || truthy(data?.isLogged) ||
    truthy(root?.Connected) || truthy(root?.connected) ||
    truthy(root?.LoggedIn) || truthy(root?.loggedIn);

  const isLoggedIn =
    truthy(data?.LoggedIn) || truthy(data?.loggedIn) ||
    truthy(data?.IsLogged) || truthy(data?.isLogged) ||
    truthy(root?.LoggedIn) || truthy(root?.loggedIn);

  const rawStatus = String(data?.status || data?.state || root?.status || root?.state || "").toLowerCase();
  const offlineWords = ["close", "closed", "disconnected", "offline", "logout", "logged_out", "not_logged", "not_connected"];
  const onlineWords = ["connected", "open", "online", "ready", "logged", "authenticated"];
  const pairingWords = ["qr", "qrcode", "scan", "pairing", "awaiting_qr"];

  const jid = data?.Jid || data?.jid || data?.JID || data?.phone || data?.Phone || null;
  const phoneNumber = jid ? String(jid).split("@")[0].replace(/\D/g, "") || null : null;

  let state: "open" | "close" | "qrcode" | "connecting" = "close";

  if (isConnected && isLoggedIn) state = "open";
  else if (onlineWords.includes(rawStatus)) state = "open";
  else if (pairingWords.includes(rawStatus)) state = "qrcode";
  else if (rawStatus === "connecting") state = "connecting";
  else if (offlineWords.includes(rawStatus)) state = "close";
  else if (isConnected && !isLoggedIn) state = "connecting";

  // Final guard: if we got a real JID, the user is connected.
  if (jid && state !== "open") state = "open";

  return { connected: state === "open", state, phoneNumber };
}

// Helper: poll for QR with retries
async function wuzPollQR(baseUrl: string, userToken: string, maxAttempts = 4, delayMs = 1500): Promise<string | null> {
  for (let i = 0; i < maxAttempts; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, delayMs));
    const qrR = await wuzFetchSession(baseUrl, userToken, "GET", "/session/qr");
    const qrCode = qrR?.data?.data?.QRCode;
    if (qrCode) return qrCode;
  }
  return null;
}

// ---------- Evolution action handlers ----------

async function handleEvolution(
  baseUrl: string,
  apiKey: string,
  action: string,
  instanceName: string | undefined,
  payload: any
) {
  switch (action) {
    case "testConnection": {
      const r = await evoFetch(baseUrl, apiKey, "GET", "/instance/fetchInstances");
      return { ok: r.ok, status: r.status, body: r.data };
    }
    case "create": {
      const b: any = {
        instanceName,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
      };
      if (payload?.webhook) {
        b.webhook = {
          url: payload.webhook,
          byEvents: payload.webhookByEvents ?? true,
          base64: true,
          events: payload.events || [],
        };
      }
      const r = await evoFetch(baseUrl, apiKey, "POST", "/instance/create", b);
      if (!r.ok) return { ok: false, status: r.status, body: r.data };
      return {
        ok: true,
        status: 200,
        body: {
          instanceId: r.data?.instance?.instanceId || r.data?.instanceId || "",
          instanceName: r.data?.instance?.instanceName || instanceName,
          qrCode: r.data?.qrcode?.base64 || r.data?.base64 || null,
          status: r.data?.instance?.status || "created",
          raw: r.data,
        },
      };
    }
    case "connect":
    case "qrcode": {
      // If webhook payload is provided, update webhook config before connecting
      if (payload?.webhook) {
        await evoFetch(baseUrl, apiKey, "POST", `/webhook/set/${instanceName}`, {
          url: payload.webhook,
          webhook_by_events: true,
          webhook_base64: true,
          events: payload.events || [],
        }).catch(() => {});
      }
      const r = await evoFetch(baseUrl, apiKey, "GET", `/instance/connect/${instanceName}`);
      if (!r.ok) return { ok: false, status: r.status, body: r.data };
      return {
        ok: true,
        status: 200,
        body: {
          qrCode: r.data?.base64 || r.data?.qrcode?.base64 || null,
          pairingCode: r.data?.pairingCode || null,
          raw: r.data,
        },
      };
    }
    case "status": {
      const r = await evoFetch(baseUrl, apiKey, "GET", `/instance/connectionState/${instanceName}`);
      if (r.status === 404) {
        return {
          ok: true,
          status: 200,
          body: { instance: { state: "not_found", instanceName } },
        };
      }
      if (!r.ok) return { ok: false, status: r.status, body: r.data };
      const raw = r.data?.instance || r.data;
      let state = "close";
      const s = (raw?.state || raw?.status || "").toLowerCase();
      if (s === "open" || s === "connected") state = "open";
      else if (s === "connecting") state = "connecting";
      return {
        ok: true,
        status: 200,
        body: { instance: { state, instanceName, phoneNumber: raw?.phoneNumber }, raw: r.data },
      };
    }
    case "delete": {
      const r = await evoFetch(baseUrl, apiKey, "DELETE", `/instance/delete/${instanceName}`);
      if (r.status === 404) return { ok: true, status: 200, body: { status: "deleted_already", instanceName } };
      if (!r.ok) return { ok: false, status: r.status, body: r.data };
      return { ok: true, status: 200, body: r.data };
    }
    case "logout": {
      const r = await evoFetch(baseUrl, apiKey, "DELETE", `/instance/logout/${instanceName}`);
      if (!r.ok) return { ok: false, status: r.status, body: r.data };
      return { ok: true, status: 200, body: r.data };
    }
    case "fetchInstances": {
      const r = await evoFetch(baseUrl, apiKey, "GET", "/instance/fetchInstances");
      if (!r.ok) return { ok: false, status: r.status, body: r.data };
      return { ok: true, status: 200, body: { data: r.data } };
    }
    case "sendText": {
      const r = await evoFetch(baseUrl, apiKey, "POST", `/message/sendText/${instanceName}`, payload);
      if (!r.ok) return { ok: false, status: r.status, body: r.data };
      return { ok: true, status: 200, body: r.data };
    }
    case "sendPresence": {
      const r = await evoFetch(baseUrl, apiKey, "POST", `/chat/updatePresence/${instanceName}`, {
        number: payload?.number,
        presence: payload?.presence || "composing",
        delay: payload?.delay || 3000,
      });
      if (!r.ok) return { ok: false, status: r.status, body: r.data };
      return { ok: true, status: 200, body: r.data };
    }
    default:
      return { ok: false, status: 400, body: { error: `Ação não suportada para Evolution: ${action}` } };
  }
}

// ---------- Evolution Go (v2) action handlers ----------
// Same endpoint surface as Evolution v1 with apikey header,
// but sendText uses { number, textMessage:{text}, options:{...} }.

async function handleEvolutionGo(
  baseUrl: string,
  apiKey: string,
  action: string,
  instanceName: string | undefined,
  payload: any,
  supabase: any,
  companyId: string,
) {
  switch (action) {
    case "testConnection": {
      return await testEvolutionGoConnection(baseUrl, apiKey);
    }
    case "create": {
      const instanceToken = payload?.token || crypto.randomUUID();
      const b: any = {
        name: instanceName,
        token: instanceToken,
      };
      if (payload?.number) b.number = payload.number;
      const r = await evoFetch(baseUrl, apiKey, "POST", "/instance/create", b);
      if (!r.ok) return { ok: false, status: r.status, body: r.data };
      return {
        ok: true,
        status: 200,
        body: {
          instanceId: r.data?.data?.id || r.data?.instance?.instanceId || r.data?.instanceId || "",
          instanceToken: r.data?.data?.token || instanceToken,
          instanceName: r.data?.data?.name || r.data?.instance?.instanceName || instanceName,
          qrCode: r.data?.data?.qrcode || r.data?.qrcode?.base64 || r.data?.base64 || null,
          status: r.data?.data?.connected ? "connected" : "created",
          raw: r.data,
        },
      };
    }
    case "qrcode":
    case "connect": {
      let { dbInstance, remote, listError } = await resolveEvolutionGoRemote(
        supabase,
        companyId,
        baseUrl,
        apiKey,
        instanceName,
      );

      if (listError) {
        return listError;
      }

      if (!remote) {
        const generatedToken = dbInstance?.provider_instance_id || crypto.randomUUID();
        const createR = await evoFetch(baseUrl, apiKey, "POST", "/instance/create", {
          name: dbInstance?.name || instanceName,
          token: generatedToken,
        });

        if (!createR.ok) return { ok: false, status: createR.status, body: createR.data };

        remote = createR.data?.data || null;
        if (dbInstance && remote) {
          await persistEvolutionGoIdentifiers(supabase, dbInstance.id, {
            id: remote.id || null,
            token: remote.token || generatedToken,
          });
        }
      }

      const instanceToken = remote?.token || dbInstance?.provider_instance_id;
      if (!instanceToken) {
        return { ok: false, status: 400, body: { error: "Token da instância Evolution Go não encontrado" } };
      }

      const subscribe = normalizeEvolutionGoSubscribe(payload?.events);
      const r = await evoFetch(baseUrl, instanceToken, "POST", "/instance/connect", {
        webhookUrl: payload?.webhook || "",
        subscribe,
        rabbitmqEnable: "",
        websocketEnable: "",
        natsEnable: "",
      });
      if (!r.ok) return { ok: false, status: r.status, body: r.data };

      const qrR = await evoFetch(baseUrl, instanceToken, "GET", "/instance/qr");
      const qrCode = qrR.ok ? qrR.data?.data?.Qrcode || qrR.data?.data?.QRCode || qrR.data?.qrCode || qrR.data?.qrcode || qrR.data?.base64 || null : null;
      const pairingCode = qrR.ok ? qrR.data?.data?.Code || qrR.data?.pairingCode || null : null;
      const connectRaw = r.data?.data || r.data?.instance || r.data;
      const connectState = mapEvolutionGoStatus({
        ...connectRaw,
        status: remote?.status ?? connectRaw?.status,
        state: remote?.state ?? connectRaw?.state,
      });
      const responseState = qrCode ? "qrcode" : connectState;

      return {
        ok: true,
        status: 200,
        body: {
          success: true,
          qrCode: qrCode || null,
          qrcode: qrCode || null,
          base64: qrCode || null,
          pairingCode: qrCode ? pairingCode : null,
          connected: responseState === "open",
          status: responseState === "open" ? "online" : qrCode ? "pairing" : "offline",
          state: responseState,
          raw: { connect: r.data, qr: qrR.ok ? qrR.data : null },
        },
      };
    }
    case "status": {
      const { remote, listError } = await resolveEvolutionGoRemote(
        supabase,
        companyId,
        baseUrl,
        apiKey,
        instanceName,
      );

      if (listError) return listError;
      if (!remote?.id) {
        return { ok: true, status: 200, body: { instance: { state: "not_found", instanceName } } };
      }

      const r = await evoFetch(baseUrl, apiKey, "GET", `/instance/info/${remote.id}`);
      if (r.status === 404) {
        return { ok: true, status: 200, body: { instance: { state: "not_found", instanceName } } };
      }
      if (!r.ok) return { ok: false, status: r.status, body: r.data };

      const raw = r.data?.data || r.data?.instance || r.data;
      const state = mapEvolutionGoStatus({ ...raw, remoteStatus: remote?.status, status: remote?.status ?? raw?.status, state: remote?.state ?? raw?.state });
      return {
        ok: true, status: 200,
        body: {
          instance: {
            state,
            instanceName,
            connected: state === "open",
            phoneNumber: state === "open" ? (raw?.jid || raw?.phoneNumber || null) : null,
          },
          raw: r.data,
        },
      };
    }
    case "delete": {
      const { dbInstance, remote, listError } = await resolveEvolutionGoRemote(
        supabase,
        companyId,
        baseUrl,
        apiKey,
        instanceName,
      );

      if (listError) return listError;
      if (!remote?.id) {
        return { ok: true, status: 200, body: { status: "deleted_already", instanceName } };
      }

      const instanceToken = remote?.token || dbInstance?.provider_instance_id;
      if (instanceToken) {
        await evoFetch(baseUrl, instanceToken, "DELETE", "/instance/logout").catch(() => null);
      }

      const r = await evoFetch(baseUrl, apiKey, "DELETE", `/instance/delete/${remote.id}`);
      if (r.status === 404) return { ok: true, status: 200, body: { status: "deleted_already", instanceName } };
      if (!r.ok) return { ok: false, status: r.status, body: r.data };
      return { ok: true, status: 200, body: r.data };
    }
    case "logout": {
      const { dbInstance, remote, listError } = await resolveEvolutionGoRemote(
        supabase,
        companyId,
        baseUrl,
        apiKey,
        instanceName,
      );

      if (listError) return listError;
      const instanceToken = remote?.token || dbInstance?.provider_instance_id;
      if (!instanceToken) return { ok: true, status: 200, body: { status: "logged_out_already", instanceName } };

      const r = await evoFetch(baseUrl, instanceToken, "DELETE", "/instance/logout");
      if (!r.ok) return { ok: false, status: r.status, body: r.data };
      return { ok: true, status: 200, body: r.data };
    }
    case "fetchInstances": {
      const r = await listEvolutionGoInstances(baseUrl, apiKey);
      if (!r.ok) return { ok: false, status: r.status, body: r.body };
      const items = r.data.map((item: any) => ({
        instanceName: item?.name || null,
        instanceId: item?.id || null,
        status: mapEvolutionGoStatus(item),
        token: item?.token || null,
        raw: item,
      }));
      return { ok: true, status: 200, body: { data: items } };
    }
    case "sendText": {
      const { dbInstance, remote, listError } = await resolveEvolutionGoRemote(
        supabase,
        companyId,
        baseUrl,
        apiKey,
        instanceName,
      );

      if (listError) return listError;
      const instanceToken = remote?.token || dbInstance?.provider_instance_id;
      if (!instanceToken) {
        return { ok: false, status: 400, body: { error: "Token da instância Evolution Go não encontrado" } };
      }

      const number = payload?.number || payload?.phone || "";
      const text = payload?.text || payload?.textMessage?.text || payload?.body || "";
      const r = await evoFetch(baseUrl, instanceToken, "POST", "/send/text", {
        number,
        text,
      });
      if (!r.ok) return { ok: false, status: r.status, body: r.data };
      return { ok: true, status: 200, body: r.data };
    }
    case "sendPresence": {
      const r = await evoFetch(baseUrl, apiKey, "POST", `/chat/updatePresence/${instanceName}`, {
        number: payload?.number,
        presence: payload?.presence || "composing",
        delay: payload?.delay || 3000,
      });
      if (!r.ok) return { ok: false, status: r.status, body: r.data };
      return { ok: true, status: 200, body: r.data };
    }
    default:
      return { ok: false, status: 400, body: { error: `Ação não suportada para Evolution Go: ${action}` } };
  }
}

async function handleWuzapi(
  baseUrl: string,
  apiKey: string, // admin token (uses Authorization header)
  action: string,
  instanceName: string | undefined, // user token (uses Token header)
  payload: any
) {
  switch (action) {
    case "testConnection": {
      const r = await wuzFetchAdmin(baseUrl, apiKey, "GET", "/admin/users");
      return { ok: r.ok, status: r.status, body: r.data };
    }
    case "create": {
      const userToken = payload?.token || crypto.randomUUID().replace(/-/g, "").slice(0, 20);
      const eventList: string[] = Array.isArray(payload?.events) && payload.events.length
        ? payload.events
        : ["Message", "Connected", "Disconnected", "LoggedOut", "QRCode", "ReadReceipt", "ChatPresence"];
      const b: any = { name: instanceName, token: userToken };
      if (payload?.webhook) {
        b.webhook = payload.webhook;
        b.events = eventList.join(",");
      }
      const r = await wuzFetchAdmin(baseUrl, apiKey, "POST", "/admin/users", b);
      if (!r.ok) return { ok: false, status: r.status, body: r.data };

      // Connect session to start QR generation (uses Token header)
      const cr = await wuzFetchSession(baseUrl, userToken, "POST", "/session/connect", {
        Subscribe: eventList,
        Immediate: true,
      }).catch((e: any) => ({ ok: false, status: 0, data: { error: e.message } }));

      // If already connected with JID, no QR needed
      if (cr.data?.data?.jid) {
        return {
          ok: true, status: 200,
          body: {
            instanceId: String(r.data?.data?.id || r.data?.id || ""),
            instanceName, instanceToken: userToken,
            qrCode: null, connected: true, jid: cr.data.data.jid,
            status: "connected", raw: { create: r.data, connect: cr.data },
          },
        };
      }

      // Poll for QR
      const qrCode = await wuzPollQR(baseUrl, userToken, 3, 1000);

      return {
        ok: true, status: 200,
        body: {
          instanceId: String(r.data?.data?.id || r.data?.id || ""),
          instanceName, instanceToken: userToken,
          qrCode: qrCode || null,
          status: "created",
          raw: { create: r.data, connect: cr.data },
        },
      };
    }
    case "connect": {
      if (!instanceName) return { ok: false, status: 400, body: { error: "Token da instância obrigatório" } };
      const eventList: string[] = Array.isArray(payload?.events) && payload.events.length
        ? payload.events
        : ["Message", "Connected", "Disconnected", "LoggedOut", "QRCode", "ReadReceipt", "ChatPresence"];
      const connectBody: any = {
        Subscribe: eventList,
        Immediate: true,
      };
      if (payload?.webhook) {
        connectBody.Webhook = payload.webhook;
      }
      // Session endpoints use Token header
      console.log(`[wuzapi:connect] Calling /session/connect for token=${instanceName?.slice(0,6)}...`);
      const cr = await wuzFetchSession(baseUrl, instanceName, "POST", "/session/connect", connectBody);

      // "already connected" is not a real error — proceed to QR/status check
      if (!cr.ok) {
        const alreadyConnected = cr.data?.error === "already connected" || cr.data?.data?.Details === "already connected";
        if (!alreadyConnected) {
          console.error(`[wuzapi:connect] /session/connect failed: status=${cr.status}`, cr.data);
          const errMsg = cr.status === 401
            ? "Token da instância inválido ou expirado"
            : `Falha ao conectar sessão Wuzapi (status ${cr.status})`;
          return { ok: false, status: cr.status || 500, body: { error: errMsg, raw: cr.data } };
        }
        console.log(`[wuzapi:connect] Already connected — skipping to QR/status check`);
      }

      console.log(`[wuzapi:connect] /session/connect OK`, JSON.stringify(cr.data).slice(0, 200));

      // If already logged in with JID
      if (cr.data?.data?.jid) {
        return { ok: true, status: 200, body: { connected: true, jid: cr.data.data.jid, raw: cr.data } };
      }

      // Poll for QR with retries
      console.log(`[wuzapi:connect] Polling QR...`);
      const qrCode = await wuzPollQR(baseUrl, instanceName, 4, 1500);

      if (qrCode) {
        console.log(`[wuzapi:connect] QR obtained successfully`);
        return { ok: true, status: 200, body: { qrCode, raw: { connect: cr.data } } };
      }

      // No QR returned - check status to see if already connected
      console.log(`[wuzapi:connect] No QR, checking /session/status...`);
      const sr = await wuzFetchSession(baseUrl, instanceName, "GET", "/session/status");
      const norm = normalizeWuzapiStatusResponse(sr.data);
      if (norm.connected) {
        console.log(`[wuzapi:connect] Already connected & logged in`);
        return { ok: true, status: 200, body: { connected: true, raw: { connect: cr.data, status: sr.data } } };
      }

      // Return error — not success with null QR
      console.warn(`[wuzapi:connect] No QR and not connected`, sr.data);
      return {
        ok: false, status: 502,
        body: {
          error: "QR não disponível e sessão não conectada. Tente novamente em alguns segundos.",
          raw: { connect: cr.data, status: sr.data },
        },
      };
    }
    case "qrcode":
    case "status": {
      if (!instanceName) return { ok: false, status: 400, body: { error: "Token obrigatório" } };
      const r = await wuzFetchSession(baseUrl, instanceName, "GET", "/session/status");
      if (!r.ok) {
        if (r.status === 404 || r.status === 401) {
          return { ok: true, status: 200, body: { instance: { state: "not_found", instanceName }, connected: false, status: "offline", state: "close" } };
        }
        return { ok: false, status: r.status, body: r.data };
      }
      const norm = normalizeWuzapiStatusResponse(r.data);
      const statusOut = norm.state === "open" ? "online" : norm.state === "qrcode" ? "pairing" : norm.state === "connecting" ? "connecting" : "offline";
      return {
        ok: true,
        status: 200,
        body: {
          connected: norm.connected,
          status: statusOut,
          state: norm.state,
          instance: { state: norm.state, instanceName, phoneNumber: norm.phoneNumber },
          raw: r.data,
        },
      };
    }
    case "delete": {
      const listR = await wuzFetchAdmin(baseUrl, apiKey, "GET", "/admin/users");
      const users = listR.ok && Array.isArray(listR.data?.data) ? listR.data.data : (listR.ok && Array.isArray(listR.data) ? listR.data : []);
      const user = users.find(
        (u: any) => u.token === instanceName || u.name === instanceName
      );
      if (user?.id) {
        await wuzFetchSession(baseUrl, user.token || instanceName!, "POST", "/session/logout").catch(() => {});
        const delR = await wuzFetchAdmin(baseUrl, apiKey, "DELETE", `/admin/users/${user.id}`);
        if (!delR.ok && delR.status !== 404) return { ok: false, status: delR.status, body: delR.data };
      }
      return { ok: true, status: 200, body: { status: "deleted" } };
    }
    case "logout": {
      if (!instanceName) return { ok: false, status: 400, body: { error: "Token obrigatório" } };
      const r = await wuzFetchSession(baseUrl, instanceName, "POST", "/session/logout");
      if (!r.ok) return { ok: false, status: r.status, body: r.data };
      return { ok: true, status: 200, body: r.data };
    }
    case "fetchInstances": {
      const r = await wuzFetchAdmin(baseUrl, apiKey, "GET", "/admin/users");
      if (!r.ok) return { ok: false, status: r.status, body: r.data };
      const list = Array.isArray(r.data?.data) ? r.data.data : (Array.isArray(r.data) ? r.data : []);
      const items = list.map((u: any) => ({
        instanceName: u.name || u.token,
        instanceId: String(u.id || ""),
        status: u.connected ? "open" : "close",
        token: u.token,
        raw: u,
      }));
      return { ok: true, status: 200, body: { data: items } };
    }
    case "sendText": {
      if (!instanceName) return { ok: false, status: 400, body: { error: "Token obrigatório" } };
      const phone = (payload?.number || payload?.phone || "").replace(/\D/g, "");
      const text = payload?.text || payload?.body || "";
      const r = await wuzFetchSession(baseUrl, instanceName, "POST", "/chat/send/text", {
        Phone: phone,
        Body: text,
      });
      if (!r.ok) return { ok: false, status: r.status, body: r.data };
      return { ok: true, status: 200, body: r.data };
    }
    case "sendPresence": {
      if (!instanceName) return { ok: false, status: 400, body: { error: "Token obrigatório" } };
      const r = await wuzFetchSession(baseUrl, instanceName, "POST", "/chat/presence", {
        Phone: (payload?.number || "").replace(/\D/g, ""),
        State: payload?.presence || "composing",
        Media: payload?.media || "",
      });
      if (!r.ok) return { ok: false, status: r.status, body: r.data };
      return { ok: true, status: 200, body: r.data };
    }
    default:
      return { ok: false, status: 400, body: { error: `Ação não suportada para Wuzapi: ${action}` } };
  }
}

// ---------- WPPConnect action handlers ----------
// Reference: https://wppconnect.io/docs/
// Auth: secret key generates a per-session bearer token via
// POST /api/{session}/{secretkey}/generate-token, then all session
// endpoints use Authorization: Bearer <token>.

async function wppFetch(
  baseUrl: string,
  method: string,
  path: string,
  bearer: string | null,
  body?: Record<string, any>,
) {
  const url = `${baseUrl}${path}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  console.log(`[wppconnect] ${method} ${safeProviderPath("wppconnect", path)}`);
  const res = await fetchJsonWithTimeout(url, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = res.data;
  console.log(`[wppconnect] ${method} ${safeProviderPath("wppconnect", path)} => ${res.status}`);
  return { ok: res.ok, status: res.status, data };
}

async function wppGenerateToken(baseUrl: string, secretKey: string, session: string): Promise<string | null> {
  const r = await wppFetch(
    baseUrl,
    "POST",
    `/api/${encodeURIComponent(session)}/${encodeURIComponent(secretKey)}/generate-token`,
    null,
  );
  if (!r.ok) return null;
  return r.data?.token || r.data?.full || null;
}

function mapWppConnectStatus(raw: string | undefined): string {
  const s = String(raw || "").toUpperCase();
  if (s === "CONNECTED" || s === "INCHAT" || s === "OPEN") return "open";
  if (s === "QRCODE" || s === "STARTING" || s === "CONNECTING") return "connecting";
  if (s === "CLOSED" || s === "DISCONNECTED" || s === "NOTLOGGED") return "close";
  return "close";
}

async function handleWppConnect(
  baseUrl: string,
  secretKey: string,
  action: string,
  instanceName: string | undefined,
  payload: any,
) {
  switch (action) {
    case "testConnection": {
      // WPPConnect: secret key vai na URL, não como bearer
      const r = await wppFetch(baseUrl, "GET", `/api/${encodeURIComponent(secretKey)}/show-all-sessions`, null);
      if (r.ok) return { ok: true, status: 200, body: r.data };
      // Fallback probe: try generating a token for a throwaway session name
      const probe = await wppGenerateToken(baseUrl, secretKey, "lovable_probe");
      if (probe) return { ok: true, status: 200, body: { mode: "token_probe" } };
      return { ok: false, status: r.status, body: r.data };
    }
    case "create": {
      if (!instanceName) return { ok: false, status: 400, body: { error: "instanceName obrigatório" } };
      const sessionToken = await wppGenerateToken(baseUrl, secretKey, instanceName);
      if (!sessionToken) {
        return { ok: false, status: 401, body: { error: "WPPConnect: falha ao gerar token (verifique Secret Key)" } };
      }
      const startBody: any = { waitQrCode: true };
      if (payload?.webhook) startBody.webhook = payload.webhook;
      const r = await wppFetch(baseUrl, "POST", `/api/${encodeURIComponent(instanceName)}/start-session`, sessionToken, startBody);
      if (!r.ok) return { ok: false, status: r.status, body: r.data };
      return {
        ok: true,
        status: 200,
        body: {
          instanceId: instanceName,
          instanceName,
          sessionToken,
          qrCode: r.data?.qrcode || r.data?.base64 || null,
          status: r.data?.status || "created",
          raw: r.data,
        },
      };
    }
    case "connect": {
      if (!instanceName) return { ok: false, status: 400, body: { error: "instanceName obrigatório" } };
      const sessionToken = await wppGenerateToken(baseUrl, secretKey, instanceName);
      if (!sessionToken) {
        return { ok: false, status: 401, body: { error: "WPPConnect: falha ao gerar token de sessão" } };
      }
      const startBody: any = { waitQrCode: true };
      if (payload?.webhook) startBody.webhook = payload.webhook;
      await wppFetch(baseUrl, "POST", `/api/${encodeURIComponent(instanceName)}/start-session`, sessionToken, startBody);
      const qr = await wppFetch(baseUrl, "GET", `/api/${encodeURIComponent(instanceName)}/qrcode-session`, sessionToken);
      return {
        ok: true,
        status: 200,
        body: {
          qrCode: qr.data?.qrcode || qr.data?.base64 || null,
          pairingCode: null,
          raw: qr.data,
        },
      };
    }
    case "status": {
      if (!instanceName) return { ok: false, status: 400, body: { error: "instanceName obrigatório" } };
      const sessionToken = await wppGenerateToken(baseUrl, secretKey, instanceName);
      if (!sessionToken) {
        return { ok: true, status: 200, body: { instance: { state: "not_found", instanceName } } };
      }
      const r = await wppFetch(baseUrl, "GET", `/api/${encodeURIComponent(instanceName)}/status-session`, sessionToken);
      if (r.status === 404) {
        return { ok: true, status: 200, body: { instance: { state: "not_found", instanceName } } };
      }
      if (!r.ok) return { ok: false, status: r.status, body: r.data };
      const state = mapWppConnectStatus(r.data?.status);
      return { ok: true, status: 200, body: { instance: { state, instanceName }, raw: r.data } };
    }
    case "delete": {
      if (!instanceName) return { ok: true, status: 200, body: { status: "deleted_already" } };
      const sessionToken = await wppGenerateToken(baseUrl, secretKey, instanceName);
      if (!sessionToken) return { ok: true, status: 200, body: { status: "deleted_already" } };
      const r = await wppFetch(baseUrl, "POST", `/api/${encodeURIComponent(instanceName)}/close-session`, sessionToken);
      if (r.status === 404) return { ok: true, status: 200, body: { status: "deleted_already" } };
      if (!r.ok) return { ok: false, status: r.status, body: r.data };
      return { ok: true, status: 200, body: r.data };
    }
    case "logout": {
      if (!instanceName) return { ok: false, status: 400, body: { error: "instanceName obrigatório" } };
      const sessionToken = await wppGenerateToken(baseUrl, secretKey, instanceName);
      if (!sessionToken) return { ok: true, status: 200, body: { status: "logged_out_already" } };
      const r = await wppFetch(baseUrl, "POST", `/api/${encodeURIComponent(instanceName)}/logout-session`, sessionToken);
      if (!r.ok) return { ok: false, status: r.status, body: r.data };
      return { ok: true, status: 200, body: r.data };
    }
    case "fetchInstances": {
      // WPPConnect: secret key vai na URL, não como bearer
      const r = await wppFetch(baseUrl, "GET", `/api/${encodeURIComponent(secretKey)}/show-all-sessions`, null);
      if (!r.ok) return { ok: false, status: r.status, body: r.data };
      const list: any[] = Array.isArray(r.data?.response) ? r.data.response : Array.isArray(r.data) ? r.data : [];
      const items = list.map((entry: any) => {
        const session = typeof entry === "string" ? entry : entry?.session || entry?.name || "";
        return { instanceName: session, instanceId: session, status: "unknown", raw: entry };
      });
      return { ok: true, status: 200, body: { data: items } };
    }
    case "sendText": {
      if (!instanceName) return { ok: false, status: 400, body: { error: "instanceName obrigatório" } };
      const sessionToken = await wppGenerateToken(baseUrl, secretKey, instanceName);
      if (!sessionToken) return { ok: false, status: 401, body: { error: "WPPConnect: token de sessão indisponível" } };
      const phone = (payload?.number || payload?.phone || "").replace(/\D/g, "");
      const text = payload?.text || payload?.textMessage?.text || payload?.message || payload?.body || "";
      const r = await wppFetch(baseUrl, "POST", `/api/${encodeURIComponent(instanceName)}/send-message`, sessionToken, {
        phone,
        isGroup: false,
        isNewsletter: false,
        isLid: false,
        message: text,
      });
      if (!r.ok) return { ok: false, status: r.status, body: r.data };
      return { ok: true, status: 200, body: r.data };
    }
    default:
      return { ok: false, status: 400, body: { error: `Ação não suportada para WPPConnect: ${action}` } };
  }
}

// ---------- QuePasa action handlers ----------
// Reference: https://github.com/nocodeleaks/quepasa
// Auth: X-QUEPASA-TOKEN (master/admin), X-QUEPASA-USER for /scan,
// X-QUEPASA-CHATID + X-QUEPASA-TRACKID for /send.

async function qpFetch(
  baseUrl: string,
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body?: Record<string, any>,
) {
  const url = `${baseUrl}${path}`;
  const finalHeaders: Record<string, string> = { Accept: "application/json", ...headers };
  if (body) finalHeaders["Content-Type"] = "application/json";
  console.log(`[quepasa] ${method} ${path}`);
  const res = await fetchJsonWithTimeout(url, {
    method,
    headers: finalHeaders,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = res.data;
  console.log(`[quepasa] ${method} ${path} => ${res.status}`);
  return { ok: res.ok, status: res.status, data };
}

function mapQuePasaState(raw: any): string {
  const s = String(raw?.status || raw?.state || raw || "").toLowerCase();
  if (s.includes("ready") || s.includes("connected") || s.includes("open") || s.includes("logged")) return "open";
  if (s.includes("qr") || s.includes("starting") || s.includes("scan") || s.includes("connecting")) return "connecting";
  if (s.includes("disconnect") || s.includes("closed") || s.includes("logout") || s.includes("notlogged")) return "close";
  return "close";
}

async function handleQuePasa(
  baseUrl: string,
  apiKey: string,
  action: string,
  instanceName: string | undefined,
  payload: any,
) {
  const baseHeaders = { "X-QUEPASA-TOKEN": apiKey || "" };

  switch (action) {
    case "testConnection": {
      const r = await qpFetch(baseUrl, "GET", "/info", baseHeaders);
      if (r.ok) return { ok: true, status: 200, body: r.data };
      const fb = await qpFetch(baseUrl, "GET", "/bot", baseHeaders);
      if (fb.ok) return { ok: true, status: 200, body: fb.data };
      return { ok: false, status: r.status || fb.status, body: r.data || fb.data };
    }
    case "create": {
      if (!instanceName) return { ok: false, status: 400, body: { error: "instanceName obrigatório" } };
      const headers = { ...baseHeaders, "X-QUEPASA-USER": payload?.user || instanceName };
      const r = await qpFetch(baseUrl, "POST", "/scan", headers);
      if (!r.ok) return { ok: false, status: r.status, body: r.data };
      const newToken = r.data?.token || r.data?.bot?.token || r.data?.session?.token || null;
      const qrCode = r.data?.qrcode || r.data?.qr || r.data?.base64 || r.data?.image || null;

      // Try to set webhook if provided (best-effort)
      if (payload?.webhook && newToken) {
        await qpFetch(baseUrl, "POST", "/webhook", { ...baseHeaders, "X-QUEPASA-TOKEN": newToken }, {
          url: payload.webhook,
          forwardinternal: true,
          trackid: instanceName,
          extra: { provider: "quepasa", instanceName },
        }).catch(() => null);
      }

      return {
        ok: true,
        status: 200,
        body: {
          instanceId: instanceName,
          instanceName,
          token: newToken,
          qrCode,
          status: r.data?.status || "created",
          raw: r.data,
        },
      };
    }
    case "connect": {
      if (!instanceName) return { ok: false, status: 400, body: { error: "instanceName obrigatório" } };
      const headers = { ...baseHeaders, "X-QUEPASA-USER": instanceName };
      const r = await qpFetch(baseUrl, "POST", "/scan", headers);
      if (!r.ok) return { ok: false, status: r.status, body: r.data };
      return {
        ok: true,
        status: 200,
        body: {
          qrCode: r.data?.qrcode || r.data?.qr || r.data?.base64 || r.data?.image || null,
          pairingCode: null,
          raw: r.data,
        },
      };
    }
    case "status": {
      if (!instanceName) return { ok: false, status: 400, body: { error: "instanceName obrigatório" } };
      const r = await qpFetch(baseUrl, "GET", `/info/${encodeURIComponent(instanceName)}`, baseHeaders);
      if (r.status === 404) return { ok: true, status: 200, body: { instance: { state: "not_found", instanceName } } };
      if (!r.ok) return { ok: false, status: r.status, body: r.data };
      const state = mapQuePasaState(r.data);
      return { ok: true, status: 200, body: { instance: { state, instanceName }, raw: r.data } };
    }
    case "delete": {
      if (!instanceName) return { ok: true, status: 200, body: { status: "deleted_already" } };
      const r = await qpFetch(baseUrl, "DELETE", `/bot/${encodeURIComponent(instanceName)}`, baseHeaders);
      if (r.status === 404) return { ok: true, status: 200, body: { status: "deleted_already" } };
      if (!r.ok) return { ok: false, status: r.status, body: r.data };
      return { ok: true, status: 200, body: r.data };
    }
    case "logout": {
      if (!instanceName) return { ok: false, status: 400, body: { error: "instanceName obrigatório" } };
      const r = await qpFetch(baseUrl, "POST", `/bot/${encodeURIComponent(instanceName)}/logout`, baseHeaders);
      if (r.status === 404) return { ok: true, status: 200, body: { status: "logged_out_already" } };
      if (!r.ok) return { ok: false, status: r.status, body: r.data };
      return { ok: true, status: 200, body: r.data };
    }
    case "fetchInstances": {
      const r = await qpFetch(baseUrl, "GET", "/bot", baseHeaders);
      if (!r.ok) return { ok: false, status: r.status, body: r.data };
      const list: any[] = Array.isArray(r.data?.bots) ? r.data.bots : Array.isArray(r.data) ? r.data : [];
      const items = list.map((entry: any) => ({
        instanceName: entry?.username || entry?.user || entry?.id || "",
        instanceId: entry?.id || entry?.token || entry?.username || null,
        status: mapQuePasaState(entry),
        raw: entry,
      }));
      return { ok: true, status: 200, body: { data: items } };
    }
    case "sendText": {
      if (!instanceName) return { ok: false, status: 400, body: { error: "instanceName obrigatório" } };
      const phone = (payload?.number || payload?.phone || payload?.chatid || "").replace(/\D/g, "");
      const text = payload?.text || payload?.textMessage?.text || payload?.message || payload?.body || "";
      const headers = {
        ...baseHeaders,
        "X-QUEPASA-CHATID": phone.includes("@") ? phone : `${phone}@s.whatsapp.net`,
        "X-QUEPASA-TRACKID": instanceName,
      };
      const r = await qpFetch(baseUrl, "POST", "/send", headers, { text });
      if (!r.ok) return { ok: false, status: r.status, body: r.data };
      return { ok: true, status: 200, body: r.data };
    }
    default:
      return { ok: false, status: 400, body: { error: `Ação não suportada para QuePasa: ${action}` } };
  }
}

// ---------- Main handler ----------

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // --- Auth ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("Não autorizado");

    const token = authHeader.replace("Bearer ", "");
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsErr } = await authClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      console.error("[whatsapp-provider-proxy] ERROR", claimsErr?.message || "Não autorizado");
      throw new Error("Não autorizado");
    }
    const userId = claimsData.claims.sub;

    // Service-role client for DB queries
    const supabase = createClient(supabaseUrl, serviceKey);

    // --- Company ---
    const { data: userRole } = await supabase
      .from("user_roles")
      .select("company_id")
      .eq("user_id", userId)
      .single();
    if (!userRole?.company_id) throw new Error("Empresa não encontrada");
    const companyId = userRole.company_id;

    // --- Parse request ---
    const body = await req.json();
    const { action, provider: requestedProvider, instanceName, payload } = body;

    if (!action) throw new Error("Campo 'action' obrigatório");

    // --- Resolve provider ---
    // Priority: explicit provider > instance DB record > default 'evolution'
    let resolvedProvider: string = requestedProvider || "evolution";

    // If instanceName provided and no explicit provider, try to resolve from DB
    if (!requestedProvider && instanceName) {
      const { data: inst } = await supabase
        .from("instances")
        .select("provider, provider_instance_id, evolution_instance_id")
        .eq("company_id", companyId)
        .or(`name.eq.${instanceName},provider_instance_id.eq.${instanceName},evolution_instance_id.eq.${instanceName}`)
        .limit(1)
        .single();
      if (inst?.provider) {
        resolvedProvider = inst.provider;
      }
    }

    if (resolvedProvider !== "evolution" && resolvedProvider !== "wuzapi" && resolvedProvider !== "evolution_go" && resolvedProvider !== "wppconnect" && resolvedProvider !== "quepasa") {
      throw new Error(`Provider desconhecido: ${resolvedProvider}`);
    }

    // --- Resolve config ---
    let baseUrl = "";
    let apiKey = "";

    // Try new whatsapp_api_configs table first
    const { data: newConfig } = await supabase
      .from("whatsapp_api_configs")
      .select("base_url, api_key, is_active")
      .eq("company_id", companyId)
      .eq("provider", resolvedProvider)
      .single();

    if (newConfig?.is_active && newConfig.base_url) {
      baseUrl = newConfig.base_url.replace(/\/+$/, "");
      apiKey = newConfig.api_key || "";
    } else if (resolvedProvider === "evolution") {
      // Fallback to legacy evolution_api_config
      const { data: legacyConfig } = await supabase
        .from("evolution_api_config")
        .select("base_url, api_key, is_active")
        .eq("company_id", companyId)
        .single();

      if (legacyConfig?.is_active && legacyConfig.base_url) {
        baseUrl = legacyConfig.base_url.replace(/\/+$/, "");
        apiKey = legacyConfig.api_key || "";
      }
    }

    if (!baseUrl) {
      throw new Error(
        `Provider '${resolvedProvider}' não configurado ou desativado para esta empresa`
      );
    }

    // --- Execute action ---
    console.log(`[whatsapp-provider-proxy] ${resolvedProvider}/${action}`, {
      company_id: companyId,
      user_id: userId,
      instanceName,
    });

    let result: { ok: boolean; status: number; body: any };

    const startedAt = Date.now();
    try {
      if (resolvedProvider === "evolution") {
        result = await handleEvolution(baseUrl, apiKey, action, instanceName, payload);
      } else if (resolvedProvider === "evolution_go") {
        result = await handleEvolutionGo(baseUrl, apiKey, action, instanceName, payload, supabase, companyId);
      } else if (resolvedProvider === "wppconnect") {
        result = await handleWppConnect(baseUrl, apiKey, action, instanceName, payload);
      } else if (resolvedProvider === "quepasa") {
        result = await handleQuePasa(baseUrl, apiKey, action, instanceName, payload);
      } else {
        result = await handleWuzapi(baseUrl, apiKey, action, instanceName, payload);
      }
    } catch (handlerError: any) {
      console.error(`[whatsapp-provider-proxy] PROVIDER_EXCEPTION`, {
        provider: resolvedProvider,
        action,
        instanceName,
        message: handlerError?.message,
        durationMs: Date.now() - startedAt,
      });
      result = controlledProviderFailure(resolvedProvider, action, instanceName, 503);
    }

    // Add metadata
    const meta = {
      provider: resolvedProvider,
      action,
      instanceName,
      timestamp: new Date().toISOString(),
    };

    if (!result.ok) {
      const providerError = result.body?.error || result.body?.message || `${resolvedProvider}: HTTP ${result.status}`;
      console.error(`[whatsapp-provider-proxy] FAILED`, {
        ...meta,
        status: result.status,
        error: providerError,
      });

      if (result.status >= 500 || result.status === 0) {
        const controlled = controlledProviderFailure(resolvedProvider, action, instanceName, result.status, providerError);
        return new Response(JSON.stringify({ ...controlled.body, _meta: meta }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          error: providerError,
          details: result.body,
          _meta: meta,
        }),
        {
          status: result.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`[whatsapp-provider-proxy] OK`, meta);

    const responseBody =
      typeof result.body === "object" && result.body !== null
        ? { ...result.body, _meta: meta }
        : { data: result.body, _meta: meta };

    return new Response(JSON.stringify(responseBody), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[whatsapp-provider-proxy] ERROR", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

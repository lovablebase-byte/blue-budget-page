import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ---------- Provider HTTP helpers ----------

async function evoFetch(
  baseUrl: string,
  apiKey: string,
  method: string,
  path: string,
  body?: Record<string, any>
) {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", apikey: apiKey },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res
    .json()
    .catch(async () => ({ raw: await res.text().catch(() => "") }));
  return { ok: res.ok, status: res.status, data };
}

function responseLooksLikeHtml(data: any) {
  const raw = typeof data === "string" ? data : data?.raw;
  return typeof raw === "string" && /^\s*<(?:!doctype|html|head|body)\b/i.test(raw);
}

function getProviderErrorText(data: any) {
  return String(data?.error || data?.message || data?.raw || "").toLowerCase();
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
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", Authorization: adminToken },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res
    .json()
    .catch(async () => ({ raw: await res.text().catch(() => "") }));
  console.log(`[wuzapi] ${method} ${path} => ${res.status}`, JSON.stringify(data).slice(0, 500));
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
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", Token: userToken },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res
    .json()
    .catch(async () => ({ raw: await res.text().catch(() => "") }));
  console.log(`[wuzapi] ${method} ${path} => ${res.status}`, JSON.stringify(data).slice(0, 500));
  return { ok: res.ok, status: res.status, data };
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
    case "connect": {
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
  payload: any
) {
  switch (action) {
    case "testConnection": {
      return await testEvolutionGoConnection(baseUrl, apiKey);
    }
    case "create": {
      // Evolution Go expects `name`; keep `instanceName` for cross-version compatibility.
      const b: any = {
        name: instanceName,
        instanceName,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
      };
      if (payload?.token) b.token = payload.token;
      if (payload?.number) b.number = payload.number;
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
    case "connect": {
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
        return { ok: true, status: 200, body: { instance: { state: "not_found", instanceName } } };
      }
      if (!r.ok) return { ok: false, status: r.status, body: r.data };
      const raw = r.data?.instance || r.data;
      let state = "close";
      const s = (raw?.state || raw?.status || "").toLowerCase();
      if (s === "open" || s === "connected") state = "open";
      else if (s === "connecting") state = "connecting";
      return {
        ok: true, status: 200,
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
      // v2 payload shape
      const number = payload?.number || payload?.phone || "";
      const text = payload?.text || payload?.textMessage?.text || payload?.body || "";
      const r = await evoFetch(baseUrl, apiKey, "POST", `/message/sendText/${instanceName}`, {
        number,
        textMessage: { text },
        options: { delay: payload?.delay ?? 1200, presence: payload?.presence || "composing" },
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
      const b: any = { name: instanceName, token: userToken };
      if (payload?.webhook) {
        b.webhook = payload.webhook;
        b.events = payload.events?.join?.(",") || "Message";
      }
      const r = await wuzFetchAdmin(baseUrl, apiKey, "POST", "/admin/users", b);
      if (!r.ok) return { ok: false, status: r.status, body: r.data };

      // Connect session to start QR generation (uses Token header)
      const cr = await wuzFetchSession(baseUrl, userToken, "POST", "/session/connect", {
        Subscribe: ["Message"],
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
      const connectBody: any = {
        Subscribe: ["Message", "ReadReceipt", "ChatPresence", "Connected", "Disconnected"],
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
      const connected = sr.data?.data?.Connected === true;
      const loggedIn = sr.data?.data?.LoggedIn === true;
      if (connected && loggedIn) {
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
    case "status": {
      if (!instanceName) return { ok: false, status: 400, body: { error: "Token obrigatório" } };
      const r = await wuzFetchSession(baseUrl, instanceName, "GET", "/session/status");
      if (!r.ok) {
        if (r.status === 404 || r.status === 401) {
          return { ok: true, status: 200, body: { instance: { state: "not_found", instanceName } } };
        }
        return { ok: false, status: r.status, body: r.data };
      }
      const connected = r.data?.data?.Connected === true;
      const loggedIn = r.data?.data?.LoggedIn === true;
      let state = "close";
      if (connected && loggedIn) state = "open";
      else if (connected) state = "connecting";
      return { ok: true, status: 200, body: { instance: { state, instanceName }, raw: r.data } };
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

    if (resolvedProvider !== "evolution" && resolvedProvider !== "wuzapi" && resolvedProvider !== "evolution_go") {
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

    if (resolvedProvider === "evolution") {
      result = await handleEvolution(baseUrl, apiKey, action, instanceName, payload);
    } else if (resolvedProvider === "evolution_go") {
      result = await handleEvolutionGo(baseUrl, apiKey, action, instanceName, payload);
    } else {
      result = await handleWuzapi(baseUrl, apiKey, action, instanceName, payload);
    }

    // Add metadata
    const meta = {
      provider: resolvedProvider,
      action,
      instanceName,
      timestamp: new Date().toISOString(),
    };

    if (!result.ok) {
      console.error(`[whatsapp-provider-proxy] FAILED`, { ...meta, status: result.status, body: result.body });
      return new Response(
        JSON.stringify({
          error: result.body?.error || result.body?.message || `${resolvedProvider}: HTTP ${result.status}`,
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

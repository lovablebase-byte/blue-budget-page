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

async function wuzFetch(
  baseUrl: string,
  token: string,
  method: string,
  path: string,
  body?: Record<string, any>
) {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", Authorization: token },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res
    .json()
    .catch(async () => ({ raw: await res.text().catch(() => "") }));
  return { ok: res.ok, status: res.status, data };
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

// ---------- Wuzapi action handlers ----------

async function handleWuzapi(
  baseUrl: string,
  apiKey: string, // admin token
  action: string,
  instanceName: string | undefined, // user token
  payload: any
) {
  switch (action) {
    case "testConnection": {
      const r = await wuzFetch(baseUrl, apiKey, "GET", "/admin/users");
      return { ok: r.ok, status: r.status, body: r.data };
    }
    case "create": {
      const userToken = payload?.token || crypto.randomUUID().replace(/-/g, "").slice(0, 20);
      const b: any = { name: instanceName, token: userToken };
      if (payload?.webhook) {
        b.webhook = payload.webhook;
        b.events = payload.events?.join?.(",") || "Message";
      }
      const r = await wuzFetch(baseUrl, apiKey, "POST", "/admin/users", b);
      if (!r.ok) return { ok: false, status: r.status, body: r.data };

      // Connect to start QR generation
      await wuzFetch(baseUrl, userToken, "POST", "/session/connect", {
        Subscribe: ["Message"],
        Immediate: true,
      }).catch(() => {});

      const qrR = await wuzFetch(baseUrl, userToken, "GET", "/session/qr").catch(() => null);

      return {
        ok: true,
        status: 200,
        body: {
          instanceId: String(r.data?.id || ""),
          instanceName: instanceName,
          instanceToken: userToken,
          qrCode: qrR?.data?.data?.QRCode || null,
          status: "created",
          raw: r.data,
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
      const cr = await wuzFetch(baseUrl, instanceName, "POST", "/session/connect", connectBody);
      if (cr.data?.data?.jid) {
        return { ok: true, status: 200, body: { connected: true, jid: cr.data.data.jid } };
      }
      const qrR = await wuzFetch(baseUrl, instanceName, "GET", "/session/qr");
      return {
        ok: true,
        status: 200,
        body: { qrCode: qrR?.data?.data?.QRCode || null, raw: { connect: cr.data, qr: qrR?.data } },
      };
    }
    case "status": {
      if (!instanceName) return { ok: false, status: 400, body: { error: "Token obrigatório" } };
      const r = await wuzFetch(baseUrl, instanceName, "GET", "/session/status");
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
      return { ok: true, status: 200, body: { instance: { state, instanceName } } };
    }
    case "delete": {
      // Find user by token/name and delete via admin API
      const listR = await wuzFetch(baseUrl, apiKey, "GET", "/admin/users");
      if (listR.ok && Array.isArray(listR.data)) {
        const user = listR.data.find(
          (u: any) => u.token === instanceName || u.name === instanceName
        );
        if (user?.id) {
          await wuzFetch(baseUrl, user.token || instanceName!, "POST", "/session/logout").catch(() => {});
          const delR = await wuzFetch(baseUrl, apiKey, "DELETE", `/admin/users/${user.id}`);
          if (!delR.ok && delR.status !== 404) return { ok: false, status: delR.status, body: delR.data };
        }
      }
      return { ok: true, status: 200, body: { status: "deleted" } };
    }
    case "logout": {
      if (!instanceName) return { ok: false, status: 400, body: { error: "Token obrigatório" } };
      const r = await wuzFetch(baseUrl, instanceName, "POST", "/session/logout");
      if (!r.ok) return { ok: false, status: r.status, body: r.data };
      return { ok: true, status: 200, body: r.data };
    }
    case "fetchInstances": {
      const r = await wuzFetch(baseUrl, apiKey, "GET", "/admin/users");
      if (!r.ok) return { ok: false, status: r.status, body: r.data };
      const list = Array.isArray(r.data) ? r.data : [];
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
      const r = await wuzFetch(baseUrl, instanceName, "POST", "/chat/send/text", {
        Phone: phone,
        Body: text,
      });
      if (!r.ok) return { ok: false, status: r.status, body: r.data };
      return { ok: true, status: 200, body: r.data };
    }
    case "sendPresence": {
      if (!instanceName) return { ok: false, status: 400, body: { error: "Token obrigatório" } };
      const r = await wuzFetch(baseUrl, instanceName, "POST", "/chat/presence", {
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
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // --- Auth ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Não autorizado");

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) throw new Error("Não autorizado");

    // --- Company ---
    const { data: userRole } = await supabase
      .from("user_roles")
      .select("company_id")
      .eq("user_id", user.id)
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

    if (resolvedProvider !== "evolution" && resolvedProvider !== "wuzapi") {
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
      user_id: user.id,
      instanceName,
    });

    let result: { ok: boolean; status: number; body: any };

    if (resolvedProvider === "evolution") {
      result = await handleEvolution(baseUrl, apiKey, action, instanceName, payload);
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

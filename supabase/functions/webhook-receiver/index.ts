import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ---------- Evolution event normalization (v1 lowercase, v2/Go UPPERCASE) ----------

function normalizeEvolutionEvent(body: any): {
  eventType: string;
  direction: string;
  remoteJid: string | null;
  messageId: string | null;
  connectionState: string | null;
  qrCode: string | null;
} {
  const rawEvent = body?.event || "";
  // Normalize Evolution Go uppercase events to v1 dot-notation for downstream consistency
  const event = String(rawEvent).toLowerCase().replace(/_/g, ".");

  const eventMap: Record<string, string> = {
    "messages.upsert": "message.received",
    "send.message": "message.sent",
    "connection.update": "connection.update",
    "qrcode.updated": "qr.updated",
    "messages.update": "delivery.status",
    "status.instance": "connection.update",
    "presence.update": "presence.update",
    // Eventos de topo emitidos por algumas integrações Evolution/Go
    "disconnected": "connection.update",
    "close": "connection.update",
    "closed": "connection.update",
    "offline": "connection.update",
    "logout": "connection.update",
    "logged_out": "connection.update",
    "loggedout": "connection.update",
    "not_logged": "connection.update",
    "not_connected": "connection.update",
    "connected": "connection.update",
    "open": "connection.update",
    "online": "connection.update",
    "ready": "connection.update",
  };

  const eventType = eventMap[event] || event || "unknown";
  const data = body?.data || body;

  let direction = "inbound";
  if (event === "send.message") direction = "outbound";
  else if (event === "messages.upsert") {
    direction = data?.key?.fromMe ? "outbound" : "inbound";
  }

  let connectionState: string | null = null;
  if (event === "connection.update" || event === "status.instance") {
    const state = String(data?.state || data?.status || "").toLowerCase();
    connectionState = state;
  }
  // Evolution / Evolution Go: alguns providers enviam o estado como evento
  // de topo (ex: "disconnected", "logout", "close") sem wrapper de connection.update.
  const DIRECT_DISCONNECT = new Set([
    "disconnected", "close", "closed", "offline", "logout", "logged_out",
    "loggedout", "not_logged", "not_connected",
  ]);
  const DIRECT_CONNECT = new Set(["connected", "open", "online", "ready", "authenticated"]);
  if (!connectionState) {
    if (DIRECT_DISCONNECT.has(event)) connectionState = "close";
    else if (DIRECT_CONNECT.has(event)) connectionState = "open";
  }

  return {
    eventType,
    direction,
    remoteJid: data?.key?.remoteJid || data?.remoteJid || null,
    messageId: data?.key?.id || data?.messageId || null,
    connectionState,
    qrCode: event === "qrcode.updated" ? (data?.qrcode?.base64 || data?.base64 || null) : null,
  };
}

// ---------- Wuzapi event normalization ----------

function normalizeWuzapiEvent(body: any): {
  eventType: string;
  direction: string;
  remoteJid: string | null;
  messageId: string | null;
  connectionState: string | null;
  qrCode: string | null;
} {
  // Wuzapi sends events with different structure / casing
  const rawEventType = body?.type || body?.event || body?.Event || "unknown";
  const eventType = String(rawEventType);
  const lowered = eventType.toLowerCase();

  // Map wuzapi event types (case-insensitive)
  let normalizedType = "unknown";
  if (lowered === "message") normalizedType = "message.received";
  else if (lowered === "readreceipt" || lowered === "read_receipt") normalizedType = "delivery.status";
  else if (lowered === "historysync" || lowered === "history_sync") normalizedType = "history.sync";
  else if (lowered === "chatpresence" || lowered === "chat_presence") normalizedType = "presence.update";
  else if (
    lowered === "connected" || lowered === "disconnected" ||
    lowered === "loggedout" || lowered === "logged_out" || lowered === "logout" ||
    lowered === "connection.update" || lowered === "connection_update"
  ) normalizedType = "connection.update";
  else if (lowered === "qrcode" || lowered === "qr" || lowered === "qr.updated") normalizedType = "qr.updated";
  else normalizedType = eventType;

  let direction = "inbound";
  if (body?.data?.Info?.IsFromMe || body?.Info?.IsFromMe) direction = "outbound";

  const data = body?.data || body;

  let connectionState: string | null = null;
  if (lowered === "connected" || lowered === "connection.update" || lowered === "connection_update") {
    // Some payloads may be a generic connection update with explicit state
    const innerState = String(data?.state || data?.State || data?.status || "").toLowerCase();
    if (innerState === "close" || innerState === "closed" || innerState === "disconnected" || innerState === "logout") {
      connectionState = "close";
    } else {
      connectionState = "open";
    }
  } else if (lowered === "disconnected" || lowered === "loggedout" || lowered === "logged_out" || lowered === "logout") {
    connectionState = "close";
  }

  return {
    eventType: normalizedType,
    direction,
    remoteJid: data?.Info?.RemoteJid || data?.RemoteJid || data?.Phone || null,
    messageId: data?.Info?.Id || data?.Id || null,
    connectionState,
    qrCode: (lowered === "qrcode" || lowered === "qr") ? (data?.QRCode || data?.qrcode || data?.qr || data?.data?.QRCode || null) : null,
  };
}

// ---------- WPPConnect event normalization ----------
// Reference: https://wppconnect.io/docs/
// WPPConnect emits events such as: onmessage, onack, onstatuschange,
// status-find, qrcode, incomingcall, etc. The exact key may be `event`,
// `type`, or inferred from the payload shape.
function normalizeWppConnectEvent(body: any): {
  eventType: string;
  direction: string;
  remoteJid: string | null;
  messageId: string | null;
  connectionState: string | null;
  qrCode: string | null;
} {
  const rawEvent = String(body?.event || body?.type || "").toLowerCase();
  const data = body?.data || body?.response || body;

  // Map WPPConnect events to internal vocabulary
  const eventMap: Record<string, string> = {
    onmessage: "message.received",
    "message-received": "message.received",
    "incoming-call": "call.received",
    onack: "delivery.status",
    ack: "delivery.status",
    onstatuschange: "connection.update",
    "status-find": "connection.update",
    qrcode: "qr.updated",
    "qrcode-updated": "qr.updated",
    onstatefind: "connection.update",
    onpresencechanged: "presence.update",
  };

  // Detect message events when event key is missing but body looks like a message
  let detected = rawEvent;
  if (!detected && (data?.body || data?.content || data?.message) && (data?.from || data?.chatId || data?.to)) {
    detected = "onmessage";
  }
  if (!detected && (data?.qrcode || data?.qr || body?.qrcode)) {
    detected = "qrcode";
  }

  const eventType = eventMap[detected] || detected || "unknown";

  // WPPConnect status-find/onstatuschange status values:
  // CONNECTED, isLogged, qrReadSuccess, qrReadFail, autocloseCalled,
  // desconnectedMobile, deleteToken, chatsAvailable, deviceNotConnected,
  // serverWssNotConnected, noOpenBrowser, browserClose
  let connectionState: string | null = null;
  if (eventType === "connection.update") {
    const statusVal = String(
      data?.status || data?.state || body?.status || body?.statusFind || ""
    ).toLowerCase();

    // CRÍTICO: termos NEGATIVOS primeiro — `disconnected`/`notconnected`
    // contêm a substring `connected` e seriam capturados pelo branch positivo.
    if (
      statusVal.includes("disconnect") ||
      statusVal.includes("desconnect") ||
      statusVal.includes("notlogged") ||
      statusVal.includes("notconnected") ||
      statusVal.includes("not_connected") ||
      statusVal.includes("devicenotconnected") ||
      statusVal.includes("browserclose") ||
      statusVal.includes("autoclose") ||
      statusVal.includes("deletetoken") ||
      statusVal.includes("logout") ||
      statusVal === "close" ||
      statusVal === "closed"
    ) {
      connectionState = "close";
    } else if (
      statusVal.includes("qr") ||
      statusVal.includes("scan") ||
      statusVal.includes("opening") ||
      statusVal.includes("pairing") ||
      statusVal === "connecting"
    ) {
      connectionState = "connecting";
    } else if (
      statusVal.includes("connected") ||
      statusVal.includes("islogged") ||
      statusVal.includes("inchat") ||
      statusVal.includes("chatsavailable") ||
      statusVal === "open" ||
      statusVal === "ready"
    ) {
      connectionState = "open";
    }
  }

  // Direction: WPPConnect's onmessage uses fromMe boolean
  let direction = "inbound";
  if (data?.fromMe === true || data?.from?.fromMe === true) direction = "outbound";

  const qrCode =
    eventType === "qr.updated"
      ? (data?.qrcode || data?.qr || data?.base64Qrimg || body?.qrcode || null)
      : null;

  return {
    eventType,
    direction,
    remoteJid:
      data?.from || data?.chatId || data?.to || data?.chat?.id || null,
    messageId: data?.id || data?.messageId || null,
    connectionState,
    qrCode,
  };
}

// ---------- QuePasa event normalization ----------
// Reference: https://github.com/nocodeleaks/quepasa
// QuePasa emits events like: message, receipt, status, qrcode, system,
// disconnected, ready. The exact key may live in `event`, `type`, `eventname`
// or be inferred from the payload shape. Direction is taken from `fromme`.
function normalizeQuePasaEvent(body: any): {
  eventType: string;
  direction: string;
  remoteJid: string | null;
  messageId: string | null;
  connectionState: string | null;
  qrCode: string | null;
} {
  const rawEvent = String(
    body?.event || body?.eventname || body?.type || body?.kind || ""
  ).toLowerCase();
  const data = body?.message || body?.data || body?.payload || body;

  const eventMap: Record<string, string> = {
    message: "message.received",
    "message.received": "message.received",
    receipt: "delivery.status",
    ack: "delivery.status",
    status: "connection.update",
    system: "connection.update",
    ready: "connection.update",
    connected: "connection.update",
    disconnected: "connection.update",
    logout: "connection.update",
    qrcode: "qr.updated",
    qr: "qr.updated",
  };

  // Detect message events when the key is missing but body looks like a message
  let detected = rawEvent;
  if (!detected && (data?.text || data?.body || data?.content)
      && (data?.chatid || data?.chat?.id || data?.from || data?.sender)) {
    detected = "message";
  }
  if (!detected && (data?.qrcode || body?.qrcode)) {
    detected = "qrcode";
  }

  const eventType = eventMap[detected] || detected || "unknown";

  // Direction: QuePasa uses fromme/FromMe boolean
  const fromMe =
    data?.fromme === true || data?.FromMe === true ||
    body?.fromme === true || body?.FromMe === true;
  const direction = fromMe ? "outbound" : "inbound";

  // Connection state mapping
  let connectionState: string | null = null;
  if (eventType === "connection.update") {
    const statusVal = String(
      data?.status || data?.state || body?.status || body?.state || rawEvent || ""
    ).toLowerCase();

    // CRÍTICO: termos NEGATIVOS primeiro (disconnected contém "connected").
    if (
      statusVal.includes("disconnect") ||
      statusVal.includes("logout") ||
      statusVal.includes("logged_out") ||
      statusVal.includes("loggedout") ||
      statusVal.includes("notconnected") ||
      statusVal.includes("not_connected") ||
      statusVal.includes("closed") ||
      statusVal === "close"
    ) {
      connectionState = "close";
    } else if (
      statusVal.includes("qr") ||
      statusVal.includes("scan") ||
      statusVal.includes("starting") ||
      statusVal.includes("pairing") ||
      statusVal.includes("connecting")
    ) {
      connectionState = "connecting";
    } else if (
      statusVal.includes("ready") ||
      statusVal.includes("connected") ||
      statusVal.includes("logged") ||
      statusVal === "open"
    ) {
      connectionState = "open";
    }
  }

  const qrCode =
    eventType === "qr.updated"
      ? (data?.qrcode || data?.qr || data?.base64 || body?.qrcode || null)
      : null;

  return {
    eventType,
    direction,
    remoteJid:
      data?.chatid || data?.chat?.id || data?.from || data?.sender ||
      data?.remoteJid || null,
    messageId: data?.id || data?.messageid || data?.MessageId || null,
    connectionState,
    qrCode,
  };
}

// ---------- Phone normalization (mirror of src/lib/whatsapp-normalizers.ts) ----------

function normalizeWhatsappPhone(input: unknown): string {
  if (input === null || input === undefined) return "";
  let raw = String(input).trim();
  if (!raw) return "";
  const at = raw.indexOf("@");
  if (at >= 0) raw = raw.slice(0, at);
  const colon = raw.indexOf(":");
  if (colon >= 0) raw = raw.slice(0, colon);
  return raw.replace(/\D+/g, "");
}

function extractPhoneFromPayload(body: any): string {
  const data = body?.data || body;
  const candidates = [
    data?.phoneNumber, data?.phone_number, data?.Phone, data?.phone,
    data?.number, data?.Number,
    data?.ownerJid, data?.owner_jid, data?.OwnerJid,
    data?.jid, data?.JID, data?.Jid,
    data?.wid, data?.WID,
    data?.remoteJid, data?.RemoteJid, data?.remote_jid,
    data?.user, data?.User,
    data?.profile?.wid, data?.profile?.phoneNumber, data?.profile?.number,
    data?.instance?.phoneNumber, data?.instance?.user, data?.instance?.ownerJid,
    data?.Info?.Sender, data?.Info?.RemoteJid,
    body?.sender, body?.from,
  ];
  for (const c of candidates) {
    const n = normalizeWhatsappPhone(c);
    if (n && n.length >= 8) return n;
  }
  return "";
}

// ---------- Main handler ----------

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Only accept POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // --- Parse query params for identification ---
    const url = new URL(req.url);
    const instanceId = url.searchParams.get("instance_id");
    const secret = url.searchParams.get("secret");
    const providerHint = url.searchParams.get("provider");

    // Parse body
    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[webhook-receiver] Received", {
      instanceId,
      providerHint,
      hasSecret: !!secret,
      event: body?.event || body?.type || body?.Event || "unknown",
    });

    // --- Identify instance ---
    let instance: any = null;

    if (instanceId) {
      // Primary: lookup by instance_id from query param
      const { data } = await supabase
        .from("instances")
        .select("id, company_id, provider, provider_instance_id, evolution_instance_id, name, webhook_secret, status")
        .eq("id", instanceId)
        .single();
      instance = data;
    }

    // Fallback: try to identify by Evolution's instance field in payload
    if (!instance && body?.instance) {
      const evoInstanceName = body.instance;
      const { data } = await supabase
        .from("instances")
        .select("id, company_id, provider, provider_instance_id, evolution_instance_id, name, webhook_secret, status")
        .or(
          `name.eq.${evoInstanceName},provider_instance_id.eq.${evoInstanceName},evolution_instance_id.eq.${evoInstanceName}`
        )
        .limit(1)
        .single();
      instance = data;
    }

    if (!instance) {
      console.warn("[webhook-receiver] Instance not found", { instanceId, bodyInstance: body?.instance });
      // Still return 200 to prevent provider from retrying
      return new Response(JSON.stringify({ status: "ignored", reason: "instance_not_found" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Validate secret ---
    if (instance.webhook_secret && secret !== instance.webhook_secret) {
      console.warn("[webhook-receiver] Invalid secret for instance", instance.id);
      return new Response(JSON.stringify({ status: "ignored", reason: "invalid_secret" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Detect provider ---
    const provider = providerHint || instance.provider || "evolution";

    // --- Normalize event ---
    let normalized;
    if (provider === "wuzapi") {
      normalized = normalizeWuzapiEvent(body);
    } else if (provider === "wppconnect") {
      normalized = normalizeWppConnectEvent(body);
    } else if (provider === "quepasa") {
      normalized = normalizeQuePasaEvent(body);
    } else {
      // evolution + evolution_go share normalization (v2 events are uppercased upstream)
      normalized = normalizeEvolutionEvent(body);
    }

    console.log("[webhook-receiver] Normalized", {
      instanceId: instance.id,
      provider,
      eventType: normalized.eventType,
      direction: normalized.direction,
    });

    // --- Update instance status on connection events ---
    // Canonical mapping with "Connected-Wins" rule:
    //   open/connected/authenticated/ready/online -> online
    //   close/closed/disconnected/logout/logged_out/offline -> offline
    //   qr/qrcode/scan/pairing/connecting -> pairing (only if not already online)
    const stateRaw = String(normalized.connectionState || "").toLowerCase();
    const ONLINE_TOKENS = new Set([
      "open", "connected", "authenticated", "ready", "online", "inchat", "islogged",
    ]);
    const OFFLINE_TOKENS = new Set([
      "close", "closed", "disconnected", "logout", "logged_out", "loggedout", "offline",
    ]);
    const PAIRING_TOKENS = new Set([
      "connecting", "qr", "qrcode", "scan", "pairing", "opening",
    ]);

    let newStatus: string | null = null;
    if (ONLINE_TOKENS.has(stateRaw)) newStatus = "online";
    else if (OFFLINE_TOKENS.has(stateRaw)) newStatus = "offline";
    else if (PAIRING_TOKENS.has(stateRaw)) newStatus = "pairing";

    // QR/pairing event MUST NOT downgrade an instance that is already online
    const isQrEvent = normalized.eventType === "qr.updated" || stateRaw === "qr" || stateRaw === "qrcode" || stateRaw === "scan" || stateRaw === "pairing";
    if (isQrEvent && instance.status === "online") {
      newStatus = null;
      console.log("[webhook-receiver] Skipping QR downgrade for online instance", instance.id);
    }

    // WuzAPI specific: the "Connected" event fires when the websocket session
    // opens — BEFORE actual WhatsApp pairing. Without a real JID/phone in the
    // payload, this is NOT real online — treat as pairing.
    if (
      provider === "wuzapi" &&
      newStatus === "online" &&
      normalized.eventType === "connection.update"
    ) {
      const phoneCheck = extractPhoneFromPayload(body);
      if (!phoneCheck) {
        console.log("[webhook-receiver] WuzAPI Connected without JID — downgrading online -> pairing");
        newStatus = instance.status === "online" ? null : "pairing";
      }
    }

    if (newStatus && newStatus !== instance.status) {
      const updateData: Record<string, any> = { status: newStatus, updated_at: new Date().toISOString() };
      if (newStatus === "online") {
        updateData.last_connected_at = new Date().toISOString();
        const phone = extractPhoneFromPayload(body);
        if (phone) updateData.phone_number = phone;
      }
      const { error: updErr } = await supabase.from("instances").update(updateData).eq("id", instance.id);
      if (updErr) console.error("[webhook-receiver] Failed to update instance", updErr.message);
      else console.log("[webhook-receiver] Updated instance status", { id: instance.id, newStatus, phone: updateData.phone_number || null });
    } else if (newStatus === "online") {
      // Already online — still try to fill phone_number if we don't have it yet
      const phone = extractPhoneFromPayload(body);
      if (phone) {
        await supabase
          .from("instances")
          .update({ phone_number: phone, last_connected_at: new Date().toISOString() })
          .eq("id", instance.id)
          .is("phone_number", null);
      }
    }

    // --- Insert into webhook_events ---
    const eventPayload = {
      company_id: instance.company_id,
      instance_id: instance.id,
      event_type: normalized.eventType,
      direction: normalized.direction,
      status: "processed",
      payload: {
        provider,
        normalized: {
          remoteJid: normalized.remoteJid,
          messageId: normalized.messageId,
          connectionState: normalized.connectionState,
          qrCode: normalized.qrCode ? "[present]" : null,
        },
        raw: body,
      },
    };

    const { error: insertError } = await supabase
      .from("webhook_events")
      .insert(eventPayload);

    if (insertError) {
      console.error("[webhook-receiver] Failed to insert event", insertError.message);
    }

    return new Response(
      JSON.stringify({ status: "ok", eventType: normalized.eventType }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("[webhook-receiver] ERROR", error.message);
    // Always return 200 to prevent provider retries
    return new Response(
      JSON.stringify({ status: "error", message: error.message }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

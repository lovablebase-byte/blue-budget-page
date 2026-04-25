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
    "status.instance": "instance.status",
    "presence.update": "presence.update",
  };

  const eventType = eventMap[event] || event || "unknown";
  const data = body?.data || body;

  let direction = "inbound";
  if (event === "send.message") direction = "outbound";
  else if (event === "messages.upsert") {
    direction = data?.key?.fromMe ? "outbound" : "inbound";
  }

  let connectionState: string | null = null;
  if (event === "connection.update") {
    const state = (data?.state || "").toLowerCase();
    connectionState = state;
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
  // Wuzapi sends events with different structure
  const eventType = body?.type || body?.event || body?.Event || "unknown";

  // Map wuzapi event types
  const eventMap: Record<string, string> = {
    Message: "message.received",
    ReadReceipt: "delivery.status",
    HistorySync: "history.sync",
    ChatPresence: "presence.update",
    Connected: "connection.update",
    Disconnected: "connection.update",
    LoggedOut: "connection.update",
    QRCode: "qr.updated",
  };

  const normalizedType = eventMap[eventType] || eventType;

  let direction = "inbound";
  if (body?.data?.Info?.IsFromMe || body?.Info?.IsFromMe) direction = "outbound";

  const data = body?.data || body;

  let connectionState: string | null = null;
  if (eventType === "Connected") connectionState = "open";
  else if (eventType === "Disconnected" || eventType === "LoggedOut") connectionState = "close";

  return {
    eventType: normalizedType,
    direction,
    remoteJid: data?.Info?.RemoteJid || data?.RemoteJid || data?.Phone || null,
    messageId: data?.Info?.Id || data?.Id || null,
    connectionState,
    qrCode: eventType === "QRCode" ? (data?.QRCode || data?.data?.QRCode || null) : null,
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
    if (
      statusVal.includes("connected") ||
      statusVal.includes("islogged") ||
      statusVal.includes("inchat") ||
      statusVal.includes("chatsavailable") ||
      statusVal === "open"
    ) {
      connectionState = "open";
    } else if (
      statusVal.includes("disconnected") ||
      statusVal.includes("notlogged") ||
      statusVal.includes("desconnected") ||
      statusVal.includes("browserclose") ||
      statusVal.includes("autoclose") ||
      statusVal.includes("deletetoken") ||
      statusVal === "close"
    ) {
      connectionState = "close";
    } else if (
      statusVal.includes("qr") ||
      statusVal.includes("notconnected") ||
      statusVal.includes("opening") ||
      statusVal === "connecting"
    ) {
      connectionState = "connecting";
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
    if (normalized.connectionState) {
      let newStatus: string | null = null;
      if (normalized.connectionState === "open" || normalized.connectionState === "connected") {
        newStatus = "online";
      } else if (normalized.connectionState === "close" || normalized.connectionState === "disconnected") {
        newStatus = "offline";
      } else if (normalized.connectionState === "connecting") {
        newStatus = "connecting";
      }

      if (newStatus && newStatus !== instance.status) {
        const updateData: Record<string, any> = { status: newStatus };
        if (newStatus === "online") updateData.last_connected_at = new Date().toISOString();
        await supabase.from("instances").update(updateData).eq("id", instance.id);
        console.log("[webhook-receiver] Updated instance status", { id: instance.id, newStatus });
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

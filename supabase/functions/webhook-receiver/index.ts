import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ---------- Redaction Helper ----------

function redactSensitiveData(obj: any): any {
  if (!obj || typeof obj !== "object") return obj;
  const copy = Array.isArray(obj) ? [...obj] : { ...obj };
  const sensitiveKeys = new Set([
    "token", "secret", "authorization", "apikey", "api_key", "secret_key", 
    "webhook_secret", "service_role", "password", "auth", "key", "pass", "cred"
  ]);

  for (const key in copy) {
    const lowerKey = key.toLowerCase();
    const isSensitive = [...sensitiveKeys].some(s => lowerKey.includes(s));

    if (typeof copy[key] === "object" && copy[key] !== null) {
      copy[key] = redactSensitiveData(copy[key]);
    } else if (isSensitive) {
      if (typeof copy[key] === "string" && copy[key].length > 10) {
        copy[key] = `${copy[key].substring(0, 4)}...[REDACTED]`;
      } else {
        copy[key] = "[REDACTED]";
      }
    }
  }
  return copy;
}

// ---------- Phone normalization ----------

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

// ---------- Unified Normalizer ----------

interface NormalizedEvent {
  provider: string;
  eventType: string; // standard internal type
  rawEventType: string;
  direction: "inbound" | "outbound" | null;
  remoteJid: string | null;
  messageId: string | null;
  connectionState: "open" | "close" | "connecting" | "unknown" | null;
  qrCode: string | null;
  text: string | null;
  from: string | null;
  to: string | null;
  raw: any;
}

function normalizeProviderWebhookEvent(body: any, provider: string): NormalizedEvent {
  const rawEventType = String(body?.event || body?.type || body?.Event || body?.eventname || "unknown");
  const event = rawEventType.toLowerCase().replace(/_/g, ".");
  const data = body?.data || body?.message || body?.payload || body;

  let eventType = "provider.unknown";
  let direction: "inbound" | "outbound" | null = null;
  let connectionState: NormalizedEvent["connectionState"] = null;
  let remoteJid: string | null = null;
  let messageId: string | null = null;
  let text: string | null = null;
  let from: string | null = null;
  let to: string | null = null;

  // 1. Identify Event Type & State
  if (provider === "evolution" || provider === "evolution_go") {
    const eventMap: Record<string, string> = {
      "messages.upsert": "message.received",
      "send.message": "message.sent",
      "messages.update": "message.delivered", // can be read/delivered
      "connection.update": "connection.update",
      "qrcode.updated": "connection.qrcode",
      "status.instance": "connection.update",
    };
    eventType = eventMap[event] || "provider.unknown";
    
    // Check if it's actually read status
    if (event === "messages.update" && data?.status === "READ") eventType = "message.read";

    if (eventType.startsWith("message.")) {
      direction = data?.key?.fromMe ? "outbound" : "inbound";
      remoteJid = data?.key?.remoteJid || data?.remoteJid || null;
      messageId = data?.key?.id || data?.messageId || null;
      text = data?.message?.conversation || data?.message?.extendedTextMessage?.text || null;
    }
    
    // Connection states
    const state = String(data?.state || data?.status || "").toLowerCase();
    if (["open", "connected", "online", "ready", "authenticated"].includes(state)) connectionState = "open";
    else if (["close", "closed", "disconnected", "logout", "offline"].includes(state)) connectionState = "close";
    else if (["qr", "qrcode", "scan", "pairing", "connecting"].includes(state)) connectionState = "connecting";
    
    // Direct states outside connection.update
    if (!connectionState) {
      if (["disconnected", "close", "closed", "offline", "logout"].includes(event)) connectionState = "close";
      else if (["connected", "open", "online", "ready"].includes(event)) connectionState = "open";
    }
  } else if (provider === "wuzapi") {
    if (event === "message") eventType = "message.received";
    else if (event === "readreceipt" || event === "read_receipt") eventType = "message.read";
    else if (event === "connection.update" || event === "connected" || event === "disconnected") eventType = "connection.update";
    else if (event === "qrcode" || event === "qr") eventType = "connection.qrcode";

    direction = (data?.Info?.IsFromMe || data?.IsFromMe) ? "outbound" : "inbound";
    remoteJid = data?.Info?.RemoteJid || data?.RemoteJid || null;
    messageId = data?.Info?.Id || data?.Id || null;
    text = data?.Text || data?.text || null;

    // Structured strong-signal extraction for WuzAPI (no broad stringify)
    const stateRaw = String(data?.state ?? data?.State ?? data?.status ?? data?.Status ?? "").toLowerCase();
    const loggedIn =
      data?.LoggedIn === true || data?.loggedIn === true ||
      data?.IsLogged === true || data?.isLogged === true ||
      data?.Authenticated === true || data?.authenticated === true ||
      data?.Ready === true || data?.ready === true;
    const strongOpenState = ["open", "loggedin", "logged_in", "logged-in", "authenticated", "ready"].includes(stateRaw);
    const closedState =
      ["disconnected", "logout", "logged_out", "closed", "close", "offline"].includes(stateRaw) ||
      data?.LoggedIn === false || data?.loggedIn === false;
    const hasJid = !!(data?.JID || data?.Jid || data?.jid || data?.wid || data?.WID);

    if (eventType === "connection.qrcode") {
      connectionState = "connecting";
    } else if (closedState) {
      connectionState = "close";
    } else if (loggedIn || strongOpenState) {
      connectionState = "open";
    } else if (
      stateRaw === "connected" ||
      data?.Connected === true || data?.connected === true
    ) {
      // Weak signal: Connected=true alone (without LoggedIn/JID) -> NOT online
      connectionState = hasJid ? "open" : "connecting";
    } else if (["qr", "qrcode", "scan", "pairing", "connecting"].includes(stateRaw)) {
      connectionState = "connecting";
    }
  } else if (provider === "wppconnect") {
    if (event === "onmessage" || event === "message-received") eventType = "message.received";
    else if (event === "onack" || event === "ack") eventType = "message.delivered";
    else if (event === "onstatuschange" || event === "status-find") eventType = "connection.update";
    else if (event === "qrcode" || event === "qrcode-updated") eventType = "connection.qrcode";

    direction = (data?.fromMe || data?.from?.fromMe) ? "outbound" : "inbound";
    remoteJid = data?.from || data?.chatId || null;
    messageId = data?.id || null;
    text = data?.body || data?.content || null;

    const state = String(data?.status || data?.state || "").toLowerCase();
    if (state.includes("connected") || state.includes("islogged") || state === "open") connectionState = "open";
    else if (state.includes("disconnect") || state.includes("logout") || state === "close") connectionState = "close";
    else if (state.includes("qr") || state.includes("pairing")) connectionState = "connecting";
  } else if (provider === "quepasa") {
    if (event === "message") eventType = "message.received";
    else if (event === "receipt" || event === "ack") eventType = "message.delivered";
    else if (event === "status" || event === "ready" || event === "connected" || event === "disconnected") eventType = "connection.update";
    else if (event === "qrcode" || event === "qr") eventType = "connection.qrcode";

    direction = (data?.fromme || body?.fromme) ? "outbound" : "inbound";
    remoteJid = data?.chatid || data?.from || null;
    messageId = data?.id || null;
    text = data?.text || data?.body || null;

    const state = String(data?.status || data?.state || event).toLowerCase();
    if (["ready", "connected", "open", "logged"].includes(state)) connectionState = "open";
    else if (["disconnected", "logout", "close"].includes(state)) connectionState = "close";
    else if (["qr", "scan", "pairing", "connecting"].includes(state)) connectionState = "connecting";
  }

  // Final Mapping Fixes
  if (eventType === "connection.qrcode") connectionState = "connecting";

  // Phone Normalization for from/to
  if (remoteJid) {
    const normalizedJid = normalizeWhatsappPhone(remoteJid);
    if (direction === "inbound") {
      from = normalizedJid;
    } else {
      to = normalizedJid;
    }
  }

  return {
    provider,
    eventType,
    rawEventType,
    direction,
    remoteJid,
    messageId,
    connectionState,
    qrCode: eventType === "connection.qrcode" ? (data?.qrcode || data?.qr || data?.base64 || null) : null,
    text,
    from,
    to,
    raw: body,
  };
}

// ---------- Main handler ----------

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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

    const url = new URL(req.url);
    const instanceId = url.searchParams.get("instance_id");
    const secret = url.searchParams.get("secret");
    const providerHint = url.searchParams.get("provider");
    const hmacHeader = req.headers.get("x-webhook-signature") || req.headers.get("X-Webhook-Signature") || "";

    const rawBody = await req.text();
    let body: any;
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Identification ---
    let instance: any = null;

    if (instanceId) {
      const { data } = await supabase
        .from("instances")
        .select("*")
        .eq("id", instanceId)
        .single();
      instance = data;
    }

    // Fallback search by provider instance ID or name
    if (!instance && (body?.instance || body?.instanceName || body?.instance_id)) {
      const searchName = body.instance || body.instanceName || body.instance_id;
      const { data } = await supabase
        .from("instances")
        .select("*")
        .or(`name.eq."${searchName}",provider_instance_id.eq."${searchName}",evolution_instance_id.eq."${searchName}"`)
        .limit(1)
        .maybeSingle();
      instance = data;
    }

    if (!instance) {
      console.warn("[webhook-receiver] Instance not found for payload", { 
        instanceId, 
        bodyInstance: body?.instance || body?.instanceName 
      });
      return new Response(JSON.stringify({ success: true, received: true, matched: false }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Security ---
    if (instance.webhook_secret) {
      let authorized = false;
      if (hmacHeader) {
        try {
          const enc = new TextEncoder();
          const key = await crypto.subtle.importKey(
            "raw", enc.encode(instance.webhook_secret),
            { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
          );
          const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
          const sigHex = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, "0")).join("");
          const provided = hmacHeader.replace(/^sha256=/i, "").trim().toLowerCase();
          if (provided === sigHex) authorized = true;
        } catch (e) {
          console.warn("[webhook-receiver] HMAC validation error", e.message);
        }
      }
      if (!authorized && secret === instance.webhook_secret) authorized = true;

      if (!authorized) {
        console.warn("[webhook-receiver] Unauthorized access attempt for instance", instance.id);
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // --- Normalize ---
    const provider = providerHint || instance.provider || "evolution";
    const normalized = normalizeProviderWebhookEvent(body, provider);

    // --- Handle Test Events (detect in nested locations) ---
    const isTestEvent =
      body?._test === true || body?.test === true ||
      body?.data?._test === true || body?.data?.test === true ||
      body?.payload?._test === true || body?.payload?.test === true ||
      body?.event?._test === true || body?.event?.test === true ||
      String(body?.event || "").toLowerCase() === "webhook.test" ||
      String(body?.type || "").toLowerCase() === "webhook.test";

    if (isTestEvent) {
      console.log("[webhook-receiver] Test event received", { instanceId: instance.id, provider });
      // Register the test event without touching instance state
      const sanitizedTest = redactSensitiveData(body);
      const { error: testInsertErr } = await supabase.from("webhook_events").insert({
        instance_id: instance.id,
        company_id: instance.company_id,
        event_type: "webhook.test",
        raw_event_type: String(body?.event || body?.type || "test"),
        provider: provider,
        direction: null,
        message_id: null,
        from_number: null,
        to_number: null,
        text_preview: null,
        connection_state: null,
        payload: { provider, test: true, raw: sanitizedTest },
        status: "processed",
        processed: true,
      });
      if (testInsertErr) {
        console.error("[webhook-receiver] Failed to register test event", testInsertErr.message);
      }
      return new Response(
        JSON.stringify({ success: true, received: true, test: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Update Instance Status ---
    let newStatus: "online" | "offline" | "pairing" | null = null;
    if (normalized.connectionState === "open") newStatus = "online";
    else if (normalized.connectionState === "close") newStatus = "offline";
    else if (normalized.connectionState === "connecting") newStatus = "pairing";

    // QR / connecting must NEVER downgrade an online instance
    if ((newStatus === "pairing" || newStatus === "offline" && normalized.eventType === "connection.qrcode")
        && instance.status === "online") {
      newStatus = null;
      console.log("[webhook-receiver] QR/connecting ignored to prevent online downgrade", instance.id);
    }
    if (normalized.eventType === "connection.qrcode" && instance.status === "online") {
      newStatus = null;
    }

    // WuzAPI Logic: Connected != Online
    if (provider === "wuzapi" && newStatus === "online" && !extractPhoneFromPayload(body)) {
      const strongSignals = ["LoggedIn", "isLogged", "authenticated", "ready", "open"];
      const rawBodyString = JSON.stringify(body);
      const hasStrongSignal = strongSignals.some(s => rawBodyString.includes(s));
      
      if (!hasStrongSignal) {
        console.log("[webhook-receiver] WuzAPI weak connection signal — treating as pairing");
        newStatus = instance.status === "online" ? null : "pairing";
      }
    }

    if (newStatus && newStatus !== instance.status) {
      const updateData: any = { status: newStatus, updated_at: new Date().toISOString() };
      if (newStatus === "online") {
        updateData.last_connected_at = new Date().toISOString();
        const phone = extractPhoneFromPayload(body);
        if (phone) updateData.phone_number = phone;
      }
      await supabase.from("instances").update(updateData).eq("id", instance.id);
      console.log("[webhook-receiver] Instance status updated", { id: instance.id, newStatus });
    } else if (newStatus === "online") {
      // Sync phone if missing
      const phone = extractPhoneFromPayload(body);
      if (phone && !instance.phone_number) {
        await supabase.from("instances").update({ phone_number: phone }).eq("id", instance.id);
      }
    }

    // --- Register Event ---
    const sanitizedBody = redactSensitiveData(body);
    const { error: insertErr } = await supabase.from("webhook_events").insert({
      instance_id: instance.id,
      company_id: instance.company_id,
      event_type: normalized.eventType,
      raw_event_type: normalized.rawEventType,
      provider: provider,
      direction: normalized.direction || null,
      message_id: normalized.messageId,
      from_number: normalized.from,
      to_number: normalized.to,
      text_preview: normalized.text ? normalized.text.substring(0, 200) : null,
      connection_state: normalized.connectionState,
      payload: {
        provider,
        normalized: {
          remoteJid: normalized.remoteJid,
          messageId: normalized.messageId,
          connectionState: normalized.connectionState,
          text: normalized.text,
          from: normalized.from,
          to: normalized.to,
          qrCode: normalized.qrCode ? "[PRESENT]" : null
        },
        raw: sanitizedBody
      },
      status: "processed",
      processed: true
    });

    if (insertErr) {
      console.error("[webhook-receiver] Database insert error", insertErr.message);
    }

    return new Response(JSON.stringify({ success: true, received: true, event: normalized.eventType }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("[webhook-receiver] Critical error", error.message);
    return new Response(JSON.stringify({ success: false, error: "Internal server error" }), {
      status: 200, // Still return 200 to prevent retries
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

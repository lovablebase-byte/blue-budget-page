// Customer Webhook Dispatcher
// Sends pending/retrying customer_webhook_deliveries to client URLs.
// Protected by CUSTOMER_WEBHOOK_DISPATCHER_SECRET (header X-Internal-Secret or
// Authorization: Bearer <secret>). Designed to be invoked by pg_cron / scheduler
// or manually for the "Test webhook" button (with action=test in body).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

const SEND_TIMEOUT_MS = 5_000;
const MAX_BATCH = 50;
const RETRY_SCHEDULE_MIN = [1, 5, 15]; // minutes
const MAX_ATTEMPTS = RETRY_SCHEDULE_MIN.length + 1; // 4 attempts total

function nowIso() {
  return new Date().toISOString();
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function sanitizeOutboundPayload(payload: any): any {
  if (!payload || typeof payload !== "object") return payload;
  const banned = new Set([
    "access_token", "authorization", "apikey", "api_key", "secret",
    "webhook_secret", "service_role", "password", "token", "secret_key",
  ]);
  const walk = (val: any): any => {
    if (Array.isArray(val)) return val.map(walk);
    if (val && typeof val === "object") {
      const out: any = {};
      for (const [k, v] of Object.entries(val)) {
        if (banned.has(k.toLowerCase())) continue;
        out[k] = walk(v);
      }
      return out;
    }
    return val;
  };
  return walk(payload);
}

async function sendOne(
  supabase: any,
  delivery: any,
  webhook: any,
): Promise<void> {
  const attempts = (delivery.attempts || 0) + 1;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const safePayload = sanitizeOutboundPayload(delivery.payload || {});
  const bodyJson = JSON.stringify(safePayload);
  const signature = await hmacSha256Hex(webhook.secret, `${timestamp}.${bodyJson}`);
  const deliveryId = delivery.id;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

  let httpStatus: number | null = null;
  let errorMsg: string | null = null;
  let success = false;

  try {
    const resp = await fetch(webhook.url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "LovableWebhook/1.0",
        "X-Webhook-Signature": `sha256=${signature}`,
        "X-Webhook-Event": String(delivery.event_type || "unknown"),
        "X-Webhook-Delivery": deliveryId,
        "X-Webhook-Timestamp": timestamp,
      },
      body: bodyJson,
    });
    httpStatus = resp.status;
    // Consume body to free socket
    try { await resp.text(); } catch (_) { /* ignore */ }
    success = resp.status >= 200 && resp.status < 300;
    if (!success) errorMsg = `http_${resp.status}`;
  } catch (e: any) {
    errorMsg = e?.name === "AbortError" ? "timeout" : (e?.message || "fetch_error").slice(0, 500);
  } finally {
    clearTimeout(timer);
  }

  if (success) {
    await supabase.from("customer_webhook_deliveries").update({
      status: "delivered",
      http_status: httpStatus,
      attempts,
      delivered_at: nowIso(),
      next_retry_at: null,
      last_error: null,
    }).eq("id", deliveryId);
  } else if (attempts >= MAX_ATTEMPTS) {
    await supabase.from("customer_webhook_deliveries").update({
      status: "failed",
      http_status: httpStatus,
      attempts,
      next_retry_at: null,
      last_error: errorMsg,
    }).eq("id", deliveryId);
  } else {
    const minutes = RETRY_SCHEDULE_MIN[attempts - 1] ?? 15;
    const nextRetry = new Date(Date.now() + minutes * 60_000).toISOString();
    await supabase.from("customer_webhook_deliveries").update({
      status: "retrying",
      http_status: httpStatus,
      attempts,
      next_retry_at: nextRetry,
      last_error: errorMsg,
    }).eq("id", deliveryId);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // --- Internal auth ---
  const expectedSecret = Deno.env.get("CUSTOMER_WEBHOOK_DISPATCHER_SECRET") || "";
  const headerSecret = req.headers.get("x-internal-secret") || "";
  const authHeader = req.headers.get("authorization") || "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";

  if (!expectedSecret) {
    return new Response(
      JSON.stringify({ error: "dispatcher_not_configured" }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  if (headerSecret !== expectedSecret && bearer !== expectedSecret) {
    return new Response(
      JSON.stringify({ error: "unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // --- Body (optional) ---
  let body: any = {};
  try {
    if (req.method === "POST") {
      const text = await req.text();
      if (text) body = JSON.parse(text);
    }
  } catch {
    // ignore body parse errors; treat as drain run
  }

  // --- Mode 1: single delivery (test or targeted) ---
  if (body?.delivery_id) {
    const { data: del, error: derr } = await supabase
      .from("customer_webhook_deliveries")
      .select("*")
      .eq("id", body.delivery_id)
      .maybeSingle();

    if (derr || !del) {
      return new Response(JSON.stringify({ error: "delivery_not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: hook } = await supabase
      .from("customer_webhooks")
      .select("*")
      .eq("id", del.customer_webhook_id)
      .maybeSingle();

    if (!hook) {
      await supabase.from("customer_webhook_deliveries").update({
        status: "failed",
        last_error: "webhook_missing",
        attempts: (del.attempts || 0) + 1,
      }).eq("id", del.id);
      return new Response(JSON.stringify({ error: "webhook_missing" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await sendOne(supabase, del, hook);

    return new Response(JSON.stringify({ ok: true, delivery_id: del.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // --- Mode 2: drain pending/retrying batch ---
  const nowSql = nowIso();
  const { data: pending, error: perr } = await supabase
    .from("customer_webhook_deliveries")
    .select("*")
    .in("status", ["pending", "retrying"])
    .or(`next_retry_at.is.null,next_retry_at.lte.${nowSql}`)
    .order("created_at", { ascending: true })
    .limit(MAX_BATCH);

  if (perr) {
    return new Response(JSON.stringify({ error: "query_failed", details: perr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!pending || pending.length === 0) {
    return new Response(JSON.stringify({ ok: true, processed: 0 }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Batch-load related webhooks
  const hookIds = Array.from(new Set(pending.map((d: any) => d.customer_webhook_id)));
  const { data: hooks } = await supabase
    .from("customer_webhooks")
    .select("id, url, secret, enabled")
    .in("id", hookIds);
  const hookMap = new Map<string, any>();
  for (const h of hooks || []) hookMap.set(h.id, h);

  let processed = 0;
  for (const del of pending) {
    const hook = hookMap.get(del.customer_webhook_id);
    if (!hook || !hook.enabled) {
      await supabase.from("customer_webhook_deliveries").update({
        status: "failed",
        last_error: hook ? "webhook_disabled" : "webhook_missing",
        attempts: (del.attempts || 0) + 1,
        next_retry_at: null,
      }).eq("id", del.id);
      continue;
    }
    try {
      await sendOne(supabase, del, hook);
    } catch (e: any) {
      console.error("[customer-webhook-dispatcher] sendOne error", del.id, e?.message);
    }
    processed++;
  }

  return new Response(JSON.stringify({ ok: true, processed }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

/**
 * public-api — API pública comercial v1, multiuso (chatbots, CRMs, ERPs,
 * sistemas próprios, notificações, cobranças, agendamentos, delivery, etc).
 *
 * Roteamento interno via path:
 *   GET  /v1/health
 *   GET|POST /v1/instances/status
 *   POST /v1/messages/text
 *
 * Autenticação padrão: `Authorization: Bearer <TOKEN_DA_INSTANCIA>`
 * (exceto /v1/health que é público).
 *
 * Compatibilidade: NÃO substitui o legado api-send-text — apenas o
 * complementa com superfície versionada e estável para clientes externos.
 */
// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// ---------- Log redaction ----------
const SENSITIVE_KEYS = new Set([
  "access_token", "accesstoken", "token", "session_token",
  "api_key", "apikey", "x-api-key", "secret", "webhook_secret",
  "password", "authorization", "service_role", "service_role_key", "bearer",
]);

function redactObject(value: any, depth = 0): any {
  if (depth > 6 || value == null) return value;
  if (Array.isArray(value)) return value.map(v => redactObject(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEYS.has(k.toLowerCase()) ? "***REDACTED***" : redactObject(v, depth + 1);
    }
    return out;
  }
  return value;
}

function maskToken(t: string): string {
  if (!t) return "";
  if (t.length <= 8) return "***";
  return `${t.slice(0, 4)}...${t.slice(-4)}`;
}

function jsonOk(data: any, status = 200) {
  return new Response(JSON.stringify({ success: true, ...data }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonError(error: string, message: string, status: number, requestId?: string) {
  const body: any = { success: false, error, message };
  if (requestId) body.request_id = requestId;
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------- Body parsing (json | form-data | x-www-form-urlencoded) ----------
async function parseBody(req: Request): Promise<Record<string, any>> {
  const ct = (req.headers.get("content-type") || "").toLowerCase();
  if (!req.body) return {};
  try {
    if (ct.includes("application/json")) {
      return await req.json();
    }
    if (ct.includes("application/x-www-form-urlencoded")) {
      const text = await req.text();
      const out: Record<string, any> = {};
      new URLSearchParams(text).forEach((v, k) => { out[k] = v; });
      return out;
    }
    if (ct.includes("multipart/form-data")) {
      const fd = await req.formData();
      const out: Record<string, any> = {};
      fd.forEach((v, k) => { out[k] = typeof v === "string" ? v : ""; });
      return out;
    }
    // Fallback: try JSON
    const text = await req.text();
    if (!text) return {};
    try { return JSON.parse(text); } catch { return {}; }
  } catch {
    return {};
  }
}

function pickFirst(obj: Record<string, any>, keys: string[]): string {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

// ---------- Auth ----------
async function authenticate(req: Request, supabase: any) {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = m?.[1]?.trim();
  if (!token) return { error: jsonError("missing_token", "Token de autenticação obrigatório.", 401) };

  const { data: instance, error } = await supabase
    .from("instances")
    .select("id, name, company_id, provider, provider_instance_id, evolution_instance_id, status, phone_number, access_token")
    .eq("access_token", token)
    .maybeSingle();

  if (error || !instance) {
    return { error: jsonError("invalid_token", "Token inválido.", 401) };
  }
  return { instance, token };
}

// ---------- Plan & limits ----------
async function checkPlanAndLimits(supabase: any, instance: any, resourceType: string = "text") {
  // Admin bypass: company has any admin user → no limits
  const { data: adminCheck } = await supabase
    .from("user_roles")
    .select("id")
    .eq("company_id", instance.company_id)
    .in("role", ["admin", "super_admin"])
    .limit(1);
  const isAdminCompany = (adminCheck?.length ?? 0) > 0;
  if (isAdminCompany) return { ok: true };

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("plan_id, status, expires_at, plans:plan_id(*)")
    .eq("company_id", instance.company_id)
    .maybeSingle();

  if (!sub) {
    return { ok: false, resp: jsonError("plan_not_found", "Nenhum plano ativo foi encontrado.", 403) };
  }

  const plan = (sub as any)?.plans;
  if (!plan) {
    return { ok: false, resp: jsonError("plan_not_found", "Nenhum plano ativo foi encontrado.", 403) };
  }

  // Check subscription status
  const validStatuses = ["active", "trialing"];
  if (!validStatuses.includes(sub.status)) {
    return { ok: false, resp: jsonError("subscription_inactive", "A assinatura está inativa.", 403) };
  }

  // Check expiration if applicable
  if (sub.expires_at && new Date(sub.expires_at) < new Date()) {
    return { ok: false, resp: jsonError("subscription_expired", "Sua assinatura expirou.", 403) };
  }

  // Check API Access
  if (!plan.api_access) {
    return { ok: false, resp: jsonError("api_access_not_allowed", "Seu plano não permite uso da API externa.", 403) };
  }

  // Check Provider Access
  const allowedProviders = plan.allowed_providers;
  if (allowedProviders && Array.isArray(allowedProviders) && allowedProviders.length > 0) {
    const instProvider = instance.provider || "evolution";
    if (!allowedProviders.includes(instProvider)) {
      return { ok: false, resp: jsonError("provider_not_allowed", "Este provider não está disponível no seu plano.", 403) };
    }
  }

  // Check Resource specific permissions
  if (resourceType === "image" && plan.image_sending_enabled === false) return { ok: false, resp: jsonError("feature_not_allowed", "Envio de imagem não permitido no seu plano.", 403) };
  if (resourceType === "audio" && plan.audio_sending_enabled === false) return { ok: false, resp: jsonError("feature_not_allowed", "Envio de áudio não permitido no seu plano.", 403) };
  if (resourceType === "document" && plan.document_sending_enabled === false) return { ok: false, resp: jsonError("feature_not_allowed", "Envio de documento não permitido no seu plano.", 403) };
  if (resourceType === "video" && plan.video_sending_enabled === false) return { ok: false, resp: jsonError("feature_not_allowed", "Envio de vídeo não permitido no seu plano.", 403) };
  if (resourceType === "text" && plan.text_sending_enabled === false) return { ok: false, resp: jsonError("feature_not_allowed", "Envio de texto não permitido no seu plano.", 403) };

  // Monthly Limit
  const maxMonth = Number(plan.max_messages_month || 0);
  if (maxMonth > 0) {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const { count } = await supabase
      .from("messages_log")
      .select("id", { count: "exact", head: true })
      .eq("company_id", instance.company_id)
      .gte("created_at", monthStart.toISOString());
    if ((count ?? 0) >= maxMonth) {
      return { ok: false, resp: jsonError("monthly_message_limit_reached", "Limite mensal de mensagens atingido.", 429) };
    }
  }
  return { ok: true };
}

async function checkRateLimit(supabase: any, instanceId: string) {
  const { data: lim } = await supabase
    .from("instance_limits")
    .select("*")
    .eq("instance_id", instanceId)
    .maybeSingle();
  if (!lim) return { ok: true };

  const now = new Date();
  const minuteAgo = new Date(now.getTime() - 60_000);
  const hourAgo = new Date(now.getTime() - 3_600_000);
  const dayAgo = new Date(now.getTime() - 86_400_000);

  const curMin = new Date(lim.last_reset_minute) < minuteAgo ? 0 : (lim.messages_sent_minute || 0);
  const curHour = new Date(lim.last_reset_hour) < hourAgo ? 0 : (lim.messages_sent_hour || 0);
  const curDay = new Date(lim.last_reset_day) < dayAgo ? 0 : (lim.messages_sent_day || 0);

  if (
    curMin >= (lim.max_per_minute || 10) ||
    curHour >= (lim.max_per_hour || 200) ||
    curDay >= (lim.max_per_day || 2000)
  ) {
    return { ok: false, resp: jsonError("rate_limit_exceeded", "Limite de envio excedido. Tente novamente em instantes.", 429) };
  }
  return { ok: true };
}

// ---------- Provider sender (reusa lógica validada do api-send-text) ----------
async function resolveProviderConfig(supabase: any, companyId: string, provider: string) {
  const { data: cfg } = await supabase
    .from("whatsapp_api_configs")
    .select("base_url, api_key, is_active")
    .eq("company_id", companyId)
    .eq("provider", provider)
    .maybeSingle();
  if (cfg?.is_active && cfg.base_url) {
    return { baseUrl: cfg.base_url.replace(/\/+$/, ""), apiKey: cfg.api_key || "" };
  }
  if (provider === "evolution") {
    const { data: legacy } = await supabase
      .from("evolution_api_config")
      .select("base_url, api_key, is_active")
      .eq("company_id", companyId)
      .maybeSingle();
    if (legacy?.is_active && legacy.base_url) {
      return { baseUrl: legacy.base_url.replace(/\/+$/, ""), apiKey: legacy.api_key || "" };
    }
  }
  return null;
}

async function wppGenerateToken(baseUrl: string, secretKey: string, session: string): Promise<string | null> {
  try {
    const r = await fetch(`${baseUrl}/api/${encodeURIComponent(session)}/${encodeURIComponent(secretKey)}/generate-token`, {
      method: "POST", headers: { "Content-Type": "application/json" },
    });
    const data = await r.json().catch(() => ({}));
    return data?.token || data?.full || null;
  } catch { return null; }
}

async function sendText(supabase: any, instance: any, phone: string, text: string) {
  const provider = instance.provider || "evolution";
  const cfg = await resolveProviderConfig(supabase, instance.company_id, provider);
  if (!cfg) {
    return { ok: false, status: 400, response: { error: `Provider '${provider}' não configurado` }, provider, providerMessageId: null };
  }
  const { baseUrl, apiKey } = cfg;
  const phoneDigits = phone.replace(/\D/g, "");

  try {
    let res: Response, url: string, data: any;
    if (provider === "evolution") {
      const evoName = instance.evolution_instance_id || instance.name;
      url = `${baseUrl}/message/sendText/${evoName}`;
      res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", apikey: apiKey }, body: JSON.stringify({ number: phoneDigits, text }) });
    } else if (provider === "evolution_go") {
      const t = instance.provider_instance_id || "";
      if (!t) return { ok: false, status: 400, response: { error: "Token Evolution Go ausente" }, provider, providerMessageId: null };
      url = `${baseUrl}/send/text`;
      res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", apikey: t }, body: JSON.stringify({ number: phoneDigits, text }) });
    } else if (provider === "wuzapi") {
      const t = instance.provider_instance_id || "";
      if (!t) return { ok: false, status: 400, response: { error: "Token Wuzapi ausente" }, provider, providerMessageId: null };
      url = `${baseUrl}/chat/send/text`;
      res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Token: t }, body: JSON.stringify({ Phone: phoneDigits, Body: text }) });
    } else if (provider === "wppconnect") {
      const session = instance.name;
      const sessionToken = await wppGenerateToken(baseUrl, apiKey, session);
      if (!sessionToken) return { ok: false, status: 401, response: { error: "WPPConnect: falha ao gerar token de sessão" }, provider, providerMessageId: null };
      url = `${baseUrl}/api/${encodeURIComponent(session)}/send-message`;
      res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionToken}` }, body: JSON.stringify({ phone: phoneDigits, isGroup: false, isNewsletter: false, isLid: false, message: text }) });
    } else if (provider === "quepasa") {
      const sessionToken = instance.provider_instance_id || apiKey;
      url = `${baseUrl}/send`;
      res = await fetch(url, {
        method: "POST",
        headers: {
          Accept: "application/json", "Content-Type": "application/json",
          "X-QUEPASA-TOKEN": sessionToken,
          "X-QUEPASA-CHATID": phoneDigits.includes("@") ? phoneDigits : `${phoneDigits}@s.whatsapp.net`,
          "X-QUEPASA-TRACKID": instance.name,
        },
        body: JSON.stringify({ text }),
      });
    } else {
      return { ok: false, status: 400, response: { error: `provider_not_supported` }, provider, providerMessageId: null };
    }
    data = await res.json().catch(() => ({ status: res.status }));
    const providerMessageId =
      data?.key?.id || data?.id || data?.messageId || data?.MessageId ||
      data?.message_id || data?.data?.id || data?.data?.key?.id || null;
    return { ok: res.ok, status: res.status, response: data, provider, providerMessageId };
  } catch (err: any) {
    return { ok: false, status: 500, response: { error: err?.message || "network_error" }, provider, providerMessageId: null };
  }
}

// ---------- Handlers ----------
async function handleHealth() {
  return jsonOk({ service: "public-api", version: "v1" });
}

async function handleStatus(req: Request, supabase: any) {
  const auth = await authenticate(req, supabase);
  if ("error" in auth) return auth.error;
  const inst = auth.instance;
  const connected = inst.status === "online" || inst.status === "connected";

  console.log(`[public-api] status instance=${inst.id} provider=${inst.provider} status=${inst.status} token=${maskToken(auth.token!)}`);

  return jsonOk({
    instance_id: inst.id,
    provider: inst.provider,
    status: inst.status,
    connected,
    phone_number: inst.phone_number || null,
  });
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function handleSendText(req: Request, supabase: any, requestId: string) {
  const auth = await authenticate(req, supabase);
  if ("error" in auth) return auth.error;
  const inst = auth.instance;

  const idemHeader = (req.headers.get("idempotency-key") || req.headers.get("Idempotency-Key") || "").trim() || null;

  const body = await parseBody(req);
  const safeBody = redactObject(body);

  const to = pickFirst(body, ["to", "phone", "phone_number", "number", "destination", "recipient"]);
  const text = pickFirst(body, ["text", "message", "body"]);
  const externalId = pickFirst(body, ["external_id", "externalId", "client_message_id"]) || null;

  console.log(`[public-api] send instance=${inst.id} provider=${inst.provider} to=${to ? to.replace(/\d(?=\d{4})/g, "*") : ""} ext=${externalId} idem=${idemHeader ? "yes" : "no"} body=${JSON.stringify(safeBody)}`);

  if (!to) return jsonError("missing_recipient", "Informe o número de destino.", 400, requestId);
  if (!text) return jsonError("missing_message", "Informe o texto da mensagem.", 400, requestId);

  // Plan / limits / rate-limit
  const planCheck = await checkPlanAndLimits(supabase, inst, "text");
  if (!planCheck.ok) return planCheck.resp!;

  const rl = await checkRateLimit(supabase, inst.id);
  if (!rl.ok) return rl.resp!;

  if (inst.status !== "online" && inst.status !== "connected") {
    return jsonError("instance_offline", "A instância está desconectada.", 409, requestId);
  }

  // ---------- Idempotency ----------
  // Priority: Idempotency-Key header > external_id field
  const idemKey = idemHeader || null;
  const idemExternal = idemHeader ? null : externalId; // only use external_id for unique constraint when no header
  const hasIdem = !!(idemKey || idemExternal);

  const recipientDigits = to.replace(/\D/g, "");
  const requestHash = await sha256Hex(JSON.stringify({ to: recipientDigits, text, endpoint: "/v1/messages/text" }));
  const messagePreview = text.length > 255 ? text.slice(0, 255) : text;

  if (hasIdem) {
    // Lookup existing record
    let query = supabase
      .from("public_api_idempotency_keys")
      .select("id, request_hash, provider, provider_message_id, response_status, response_body")
      .eq("instance_id", inst.id);
    if (idemKey) query = query.eq("idempotency_key", idemKey);
    else query = query.eq("external_id", idemExternal).is("idempotency_key", null);
    const { data: existing } = await query.maybeSingle();

    if (existing) {
      if (existing.request_hash !== requestHash) {
        console.log(`[public-api] idempotency_conflict instance=${inst.id} key=${idemKey ? "***" : "(ext)"}`);
        return jsonError("idempotency_conflict", "A mesma chave de idempotência já foi usada com outro conteúdo.", 409, requestId);
      }
      console.log(`[public-api] duplicate_ignored instance=${inst.id} prev_msg=${existing.provider_message_id}`);
      return jsonOk({
        status: "duplicate_ignored",
        message: "Esta solicitação já foi processada anteriormente.",
        provider: existing.provider || inst.provider,
        instance_id: inst.id,
        message_id: existing.provider_message_id,
        external_id: externalId,
      });
    }

    // Reserve key (insert with unique index → race condition fallback)
    const { error: reserveErr } = await supabase
      .from("public_api_idempotency_keys")
      .insert({
        instance_id: inst.id,
        company_id: inst.company_id,
        idempotency_key: idemKey,
        external_id: idemExternal,
        endpoint: "/v1/messages/text",
        request_hash: requestHash,
        provider: inst.provider,
        recipient: recipientDigits,
        message_preview: messagePreview,
        response_status: null,
      });

    if (reserveErr) {
      // Race condition: another request already reserved the key — return duplicate
      console.log(`[public-api] race_condition_dup instance=${inst.id} err=${reserveErr.code}`);
      return jsonOk({
        status: "duplicate_ignored",
        message: "Esta solicitação já está sendo processada.",
        provider: inst.provider,
        instance_id: inst.id,
        message_id: null,
        external_id: externalId,
      });
    }
  }

  const result = await sendText(supabase, inst, to, text);

  // Log message + bump counters (best-effort)
  try {
    await supabase.from("messages_log").insert({
      company_id: inst.company_id,
      instance_id: inst.id,
      contact_number: recipientDigits,
      message: text,
      direction: "outgoing",
      status: result.ok ? "sent" : "failed",
      sent_at: result.ok ? new Date().toISOString() : null,
    });
  } catch (e) { console.log(`[public-api] log_insert_error ${(e as any)?.message}`); }

  if (result.ok) {
    try {
      await supabase.rpc("increment_instance_counters" as any, { _instance_id: inst.id }).catch(() => {});
    } catch { /* ignore */ }
  }

  // Update idempotency record with final result
  if (hasIdem) {
    try {
      let upd = supabase
        .from("public_api_idempotency_keys")
        .update({
          provider_message_id: result.providerMessageId,
          response_status: result.status,
          response_body: redactObject(result.response),
        })
        .eq("instance_id", inst.id);
      if (idemKey) upd = upd.eq("idempotency_key", idemKey);
      else upd = upd.eq("external_id", idemExternal).is("idempotency_key", null);
      await upd;
    } catch (e) { console.log(`[public-api] idem_update_err ${(e as any)?.message}`); }
  }

  if (!result.ok) {
    if (result.response?.error === "provider_not_supported") {
      return jsonError("provider_not_supported", "Este provider ainda não suporta esta ação pela API pública.", 400, requestId);
    }
    return jsonError("send_failed", typeof result.response?.error === "string" ? result.response.error : "Falha ao enviar mensagem.", result.status >= 400 && result.status < 600 ? result.status : 502, requestId);
  }

  return jsonOk({
    status: "sent",
    provider: result.provider,
    instance_id: inst.id,
    message_id: result.providerMessageId,
    external_id: externalId,
  });
}

// ---------- Media capabilities ----------
const PROVIDER_MEDIA_CAPS: Record<string, Set<string>> = {
  evolution:    new Set(["image", "audio", "document", "video"]),
  evolution_go: new Set(["image", "audio", "document", "video"]),
  wuzapi:       new Set(["image", "audio", "document", "video"]),
  wppconnect:   new Set(["image", "audio", "document", "video"]),
  quepasa:      new Set(["image", "document"]),
};

const ALLOWED_MEDIA_TYPES = new Set(["image", "audio", "document", "video"]);

function detectMediaType(url: string): string | null {
  try {
    const u = new URL(url);
    const path = u.pathname.toLowerCase();
    const ext = path.split(".").pop() || "";
    if (["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(ext)) return "image";
    if (["mp3", "ogg", "oga", "m4a", "wav", "aac", "opus"].includes(ext)) return "audio";
    if (["mp4", "mov", "webm", "mkv", "avi", "3gp"].includes(ext)) return "video";
    if (["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv", "zip", "rar"].includes(ext)) return "document";
    return null;
  } catch { return null; }
}

function isValidHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch { return false; }
}

async function sendMedia(
  supabase: any, instance: any,
  phone: string, mediaType: string, mediaUrl: string,
  caption: string | null, filename: string | null,
) {
  const provider = instance.provider || "evolution";
  const cfg = await resolveProviderConfig(supabase, instance.company_id, provider);
  if (!cfg) {
    return { ok: false, status: 400, response: { error: `Provider '${provider}' não configurado` }, provider, providerMessageId: null };
  }
  const { baseUrl, apiKey } = cfg;
  const phoneDigits = phone.replace(/\D/g, "");

  try {
    let res: Response, url: string, data: any;

    if (provider === "evolution") {
      const evoName = instance.evolution_instance_id || instance.name;
      url = `${baseUrl}/message/sendMedia/${evoName}`;
      const body: any = { number: phoneDigits, mediatype: mediaType, media: mediaUrl };
      if (caption) body.caption = caption;
      if (filename && mediaType === "document") body.fileName = filename;
      res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", apikey: apiKey }, body: JSON.stringify(body) });

    } else if (provider === "evolution_go") {
      const t = instance.provider_instance_id || "";
      if (!t) return { ok: false, status: 400, response: { error: "Token Evolution Go ausente" }, provider, providerMessageId: null };
      // Evolution Go path varies: image/audio/document/video
      const pathMap: Record<string, string> = { image: "image", audio: "audio", document: "document", video: "video" };
      url = `${baseUrl}/send/${pathMap[mediaType]}`;
      const body: any = { number: phoneDigits, url: mediaUrl };
      if (caption) body.caption = caption;
      if (filename && mediaType === "document") body.fileName = filename;
      res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", apikey: t }, body: JSON.stringify(body) });

    } else if (provider === "wuzapi") {
      const t = instance.provider_instance_id || "";
      if (!t) return { ok: false, status: 400, response: { error: "Token Wuzapi ausente" }, provider, providerMessageId: null };
      const pathMap: Record<string, string> = { image: "/chat/send/image", audio: "/chat/send/audio", document: "/chat/send/document", video: "/chat/send/video" };
      url = `${baseUrl}${pathMap[mediaType]}`;
      const body: any = { Phone: phoneDigits, Image: undefined };
      // Wuzapi expects field name per type
      if (mediaType === "image") { body.Image = mediaUrl; if (caption) body.Caption = caption; }
      else if (mediaType === "audio") { body.Audio = mediaUrl; }
      else if (mediaType === "video") { body.Video = mediaUrl; if (caption) body.Caption = caption; }
      else if (mediaType === "document") { body.Document = mediaUrl; if (filename) body.FileName = filename; if (caption) body.Caption = caption; }
      res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Token: t }, body: JSON.stringify(body) });

    } else if (provider === "wppconnect") {
      const session = instance.name;
      const sessionToken = await wppGenerateToken(baseUrl, apiKey, session);
      if (!sessionToken) return { ok: false, status: 401, response: { error: "WPPConnect: falha ao gerar token de sessão" }, provider, providerMessageId: null };
      const endpointMap: Record<string, string> = { image: "send-image", audio: "send-voice", document: "send-file", video: "send-file" };
      url = `${baseUrl}/api/${encodeURIComponent(session)}/${endpointMap[mediaType]}`;
      const body: any = { phone: phoneDigits, isGroup: false, path: mediaUrl };
      if (caption) body.caption = caption;
      if (filename) body.filename = filename;
      res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionToken}` }, body: JSON.stringify(body) });

    } else if (provider === "quepasa") {
      const sessionToken = instance.provider_instance_id || apiKey;
      url = `${baseUrl}/sendurl`;
      res = await fetch(url, {
        method: "POST",
        headers: {
          Accept: "application/json", "Content-Type": "application/json",
          "X-QUEPASA-TOKEN": sessionToken,
          "X-QUEPASA-CHATID": phoneDigits.includes("@") ? phoneDigits : `${phoneDigits}@s.whatsapp.net`,
          "X-QUEPASA-TRACKID": instance.name,
        },
        body: JSON.stringify({ url: mediaUrl, text: caption || "", filename: filename || undefined }),
      });

    } else {
      return { ok: false, status: 400, response: { error: "provider_not_supported" }, provider, providerMessageId: null };
    }

    data = await res.json().catch(() => ({ status: res.status }));
    const providerMessageId =
      data?.key?.id || data?.id || data?.messageId || data?.MessageId ||
      data?.message_id || data?.data?.id || data?.data?.key?.id || null;
    return { ok: res.ok, status: res.status, response: data, provider, providerMessageId };
  } catch (err: any) {
    return { ok: false, status: 500, response: { error: err?.message || "network_error" }, provider, providerMessageId: null };
  }
}

async function handleSendMedia(
  req: Request, supabase: any, requestId: string,
  forcedType: string | null, // null = generic /messages/media; else "image"|"audio"|"document"
) {
  const auth = await authenticate(req, supabase);
  if ("error" in auth) return auth.error;
  const inst = auth.instance;

  const idemHeader = (req.headers.get("idempotency-key") || req.headers.get("Idempotency-Key") || "").trim() || null;

  const body = await parseBody(req);
  const safeBody = redactObject(body);

  const to = pickFirst(body, ["to", "phone", "phone_number", "number", "destination", "recipient"]);
  const mediaUrl = pickFirst(body, ["media_url", "url", "file_url", "attachment_url"]);
  const caption = pickFirst(body, ["caption", "text", "message", "body"]) || null;
  const filename = pickFirst(body, ["filename", "file_name", "name"]) || null;
  const externalId = pickFirst(body, ["external_id", "externalId", "client_message_id"]) || null;
  const bodyMediaType = pickFirst(body, ["media_type", "mediaType", "type"]) || null;

  // Resolve media type: forced (path) > body > URL extension
  let mediaType = forcedType || bodyMediaType || (mediaUrl ? detectMediaType(mediaUrl) : null);
  if (mediaType) mediaType = mediaType.toLowerCase();

  console.log(`[public-api] media instance=${inst.id} provider=${inst.provider} type=${mediaType} to=${to ? to.replace(/\d(?=\d{4})/g, "*") : ""} ext=${externalId} idem=${idemHeader ? "yes" : "no"} body=${JSON.stringify(safeBody)}`);

  if (!to) return jsonError("missing_recipient", "Informe o número de destino.", 400, requestId);
  if (!mediaUrl) return jsonError("missing_media_url", "Informe a URL da mídia.", 400, requestId);
  if (!isValidHttpUrl(mediaUrl)) return jsonError("invalid_media_url", "URL de mídia inválida.", 400, requestId);
  if (!mediaType) return jsonError("missing_media_type", "Informe o tipo da mídia.", 400, requestId);
  if (!ALLOWED_MEDIA_TYPES.has(mediaType)) return jsonError("unsupported_media_type", "Tipo de mídia não suportado.", 400, requestId);

  // Provider capability
  const caps = PROVIDER_MEDIA_CAPS[inst.provider] || new Set();
  if (!caps.has(mediaType)) {
    return jsonError("feature_not_supported", "Este recurso não é suportado pelo provider desta instância.", 400, requestId);
  }

  // Plan / limits / rate-limit
  const planCheck = await checkPlanAndLimits(supabase, inst, mediaType);
  if (!planCheck.ok) return planCheck.resp!;
  const rl = await checkRateLimit(supabase, inst.id);
  if (!rl.ok) return rl.resp!;

  if (inst.status !== "online" && inst.status !== "connected") {
    return jsonError("instance_offline", "A instância está desconectada.", 409, requestId);
  }

  // Idempotency
  const idemKey = idemHeader || null;
  const idemExternal = idemHeader ? null : externalId;
  const hasIdem = !!(idemKey || idemExternal);
  const recipientDigits = to.replace(/\D/g, "");
  const endpointTag = `/v1/messages/${forcedType || "media"}`;
  const requestHash = await sha256Hex(JSON.stringify({ to: recipientDigits, mediaType, mediaUrl, caption, filename, endpoint: endpointTag }));
  const messagePreview = (caption || `[${mediaType}] ${mediaUrl}`).slice(0, 255);

  if (hasIdem) {
    let query = supabase
      .from("public_api_idempotency_keys")
      .select("id, request_hash, provider, provider_message_id, response_status, response_body")
      .eq("instance_id", inst.id);
    if (idemKey) query = query.eq("idempotency_key", idemKey);
    else query = query.eq("external_id", idemExternal).is("idempotency_key", null);
    const { data: existing } = await query.maybeSingle();

    if (existing) {
      if (existing.request_hash !== requestHash) {
        return jsonError("idempotency_conflict", "A mesma chave de idempotência já foi usada com outro conteúdo.", 409, requestId);
      }
      return jsonOk({
        status: "duplicate_ignored",
        message: "Esta solicitação já foi processada anteriormente.",
        provider: existing.provider || inst.provider,
        instance_id: inst.id,
        message_id: existing.provider_message_id,
        media_type: mediaType,
        external_id: externalId,
      });
    }

    const { error: reserveErr } = await supabase
      .from("public_api_idempotency_keys")
      .insert({
        instance_id: inst.id,
        company_id: inst.company_id,
        idempotency_key: idemKey,
        external_id: idemExternal,
        endpoint: endpointTag,
        request_hash: requestHash,
        provider: inst.provider,
        recipient: recipientDigits,
        message_preview: messagePreview,
        response_status: null,
      });

    if (reserveErr) {
      return jsonOk({
        status: "duplicate_ignored",
        message: "Esta solicitação já está sendo processada.",
        provider: inst.provider,
        instance_id: inst.id,
        message_id: null,
        media_type: mediaType,
        external_id: externalId,
      });
    }
  }

  const result = await sendMedia(supabase, inst, to, mediaType, mediaUrl, caption, filename);

  // Log to messages_log (best-effort)
  try {
    await supabase.from("messages_log").insert({
      company_id: inst.company_id,
      instance_id: inst.id,
      contact_number: recipientDigits,
      message: caption || `[${mediaType}]`,
      media_url: mediaUrl,
      direction: "outgoing",
      status: result.ok ? "sent" : "failed",
      sent_at: result.ok ? new Date().toISOString() : null,
    });
  } catch (e) { console.log(`[public-api] media_log_err ${(e as any)?.message}`); }

  if (result.ok) {
    try { await supabase.rpc("increment_instance_counters" as any, { _instance_id: inst.id }).catch(() => {}); } catch {}
  }

  if (hasIdem) {
    try {
      let upd = supabase
        .from("public_api_idempotency_keys")
        .update({
          provider_message_id: result.providerMessageId,
          response_status: result.status,
          response_body: redactObject(result.response),
        })
        .eq("instance_id", inst.id);
      if (idemKey) upd = upd.eq("idempotency_key", idemKey);
      else upd = upd.eq("external_id", idemExternal).is("idempotency_key", null);
      await upd;
    } catch (e) { console.log(`[public-api] idem_upd_err ${(e as any)?.message}`); }
  }

  if (!result.ok) {
    if (result.response?.error === "provider_not_supported") {
      return jsonError("feature_not_supported", "Este recurso não é suportado pelo provider desta instância.", 400, requestId);
    }
    return jsonError("send_failed", typeof result.response?.error === "string" ? result.response.error : "Falha ao enviar mídia.", result.status >= 400 && result.status < 600 ? result.status : 502, requestId);
  }

  return jsonOk({
    status: "sent",
    provider: result.provider,
    instance_id: inst.id,
    message_id: result.providerMessageId,
    media_type: mediaType,
    external_id: externalId,
  });
}

// ---------- Router ----------
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const requestId = crypto.randomUUID();
  const url = new URL(req.url);
  // Path arrives as /public-api/... when called via /functions/v1/public-api/...
  // Normalize to "/v1/..."
  let path = url.pathname.replace(/^\/+/, "/");
  // Strip leading "/public-api"
  path = path.replace(/^\/public-api/, "");
  if (!path.startsWith("/")) path = "/" + path;

  try {
    if (req.method === "GET" && (path === "/v1/health" || path === "/v1/health/")) {
      return handleHealth();
    }
    if ((req.method === "GET" || req.method === "POST") && (path === "/v1/instances/status" || path === "/v1/instances/status/")) {
      return handleStatus(req, getSupabase());
    }
    if (req.method === "POST" && (path === "/v1/messages/text" || path === "/v1/messages/text/")) {
      return handleSendText(req, getSupabase(), requestId);
    }
    if (req.method === "POST" && (path === "/v1/messages/media" || path === "/v1/messages/media/")) {
      return handleSendMedia(req, getSupabase(), requestId, null);
    }
    if (req.method === "POST" && (path === "/v1/messages/image" || path === "/v1/messages/image/")) {
      return handleSendMedia(req, getSupabase(), requestId, "image");
    }
    if (req.method === "POST" && (path === "/v1/messages/audio" || path === "/v1/messages/audio/")) {
      return handleSendMedia(req, getSupabase(), requestId, "audio");
    }
    if (req.method === "POST" && (path === "/v1/messages/document" || path === "/v1/messages/document/")) {
      return handleSendMedia(req, getSupabase(), requestId, "document");
    }
    if (req.method === "POST" && (path === "/v1/messages/video" || path === "/v1/messages/video/")) {
      return handleSendMedia(req, getSupabase(), requestId, "video");
    }
    return jsonError("not_found", "Rota não encontrada.", 404, requestId);
  } catch (err: any) {
    console.error(`[public-api] internal_error req=${requestId} msg=${err?.message}`);
    return jsonError("internal_error", "Erro interno ao processar a solicitação.", 500, requestId);
  }
});

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

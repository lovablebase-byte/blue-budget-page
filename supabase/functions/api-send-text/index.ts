import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizePhone(phone: string, countryPrefix = "55"): string {
  const digits = phone.replace(/\D/g, "");
  if (!digits.startsWith(countryPrefix) && digits.length >= 10 && digits.length <= 11) {
    return countryPrefix + digits;
  }
  return digits;
}

function processTemplate(template: string, data: Record<string, any>): string {
  let result = template;
  result = result.replace(/\$\{foreach_item\}([\s\S]*?)\$\{endforeach_item\}/g, (_, block) => {
    const items = data.items || [];
    if (!Array.isArray(items)) return "";
    return items.map((item: any) => {
      let b = block;
      for (const [k, v] of Object.entries(item)) {
        b = b.replace(new RegExp(`\\$\\{item_${k}\\}`, "g"), String(v ?? ""));
      }
      return b;
    }).join("");
  });
  result = result.replace(/\$\{foreach_additional\}([\s\S]*?)\$\{endforeach_additional\}/g, (_, block) => {
    const additionals = data.additionals || [];
    if (!Array.isArray(additionals)) return "";
    return additionals.map((add: any) => {
      let b = block;
      for (const [k, v] of Object.entries(add)) {
        b = b.replace(new RegExp(`\\$\\{additional_${k}\\}`, "g"), String(v ?? ""));
      }
      return b;
    }).join("");
  });
  result = result.replace(/\$\{if_(\w+)\}([\s\S]*?)\$\{endif_\1\}/g, (_, key, content) => {
    return data[key] ? content : "";
  });
  result = result.replace(/\$\{(\w+)\}/g, (_, key) => String(data[key] ?? ""));
  result = result.replace(/\{\{(\w+)\}\}/g, (_, key) => String(data[key] ?? ""));
  result = result.replace(/\n{3,}/g, "\n\n");
  return result.trim();
}

function getDefaultStatusTemplate(statusKey: string): string {
  const templates: Record<string, string> = {
    aceito: `✅ Seu pedido foi aceito!\n\n🧾 Pedido: {{order_code}}\n\n📅 Data/Hora: {{date_created_order}} às {{time_created_order}}\n\n👤 Cliente:\n▫️ Nome: {{client_name}}\n▫️ Telefone: {{client_phone}}\n\n🍽️ Itens do pedido:\n{{order_items_formatted}}\n\n💰 Valores:\nPedido: {{order_subtotal}}\nTotal: {{order_total}}\n\nForma de Pagamento: {{payment_method}}\n\n{{delivery_or_pickup_text}}\n\n🔗 Acompanhe seu pedido no link:\n{{order_link}}`,
    preparando: `👨‍🍳 Seu pedido está em preparo!\n\n🧾 Pedido: {{order_code}}\n\n📅 Data/Hora: {{date_created_order}} às {{time_created_order}}\n\n👤 Cliente:\n▫️ Nome: {{client_name}}\n▫️ Telefone: {{client_phone}}\n\n🍽️ Itens do pedido:\n{{order_items_formatted}}\n\n💰 Valores:\nPedido: {{order_subtotal}}\nTotal: {{order_total}}\n\nForma de Pagamento: {{payment_method}}\n\n{{delivery_or_pickup_text}}\n\n🔗 Acompanhe seu pedido no link:\n{{order_link}}`,
    cancelado: `❌ Seu pedido foi cancelado.\n\n🧾 Pedido: {{order_code}}\n\n📅 Data/Hora: {{date_created_order}} às {{time_created_order}}\n\n👤 Cliente:\n▫️ Nome: {{client_name}}\n▫️ Telefone: {{client_phone}}\n\nSe precisar, entre em contato com a loja para mais informações.\n\n🔗 Acompanhe seu pedido no link:\n{{order_link}}`,
    pronto: `🎉 Seu pedido está pronto!\n\n🧾 Pedido: {{order_code}}\n\n📅 Data/Hora: {{date_created_order}} às {{time_created_order}}\n\n👤 Cliente:\n▫️ Nome: {{client_name}}\n▫️ Telefone: {{client_phone}}\n\n{{delivery_ready_text}}\n\n🔗 Acompanhe seu pedido no link:\n{{order_link}}`,
    saiu_entrega: `🛵 Seu pedido saiu para entrega!\n\n🧾 Pedido: {{order_code}}\n\n📅 Data/Hora: {{date_created_order}} às {{time_created_order}}\n\n👤 Cliente:\n▫️ Nome: {{client_name}}\n▫️ Telefone: {{client_phone}}\n\n📍 Endereço de entrega:\n{{delivery_address}}\n\n🔗 Acompanhe seu pedido no link:\n{{order_link}}`,
    entregue_pendente: `📦 Seu pedido foi entregue!\n\n🧾 Pedido: {{order_code}}\n\n⚠️ Status do pagamento: pendente\n\n💰 Total do pedido: {{order_total}}\n\nSe houver pendência, entre em contato com a loja.\n\n🔗 Acompanhe seu pedido no link:\n{{order_link}}`,
    entregue_pago: `✅ Pedido entregue e pagamento confirmado!\n\n🧾 Pedido: {{order_code}}\n\n💰 Total pago: {{order_total}}\n\nObrigado pela preferência! 🙏\n\n🔗 Acompanhe seu pedido no link:\n{{order_link}}`,
  };
  return templates[statusKey] || "";
}

function formatOrderItems(items: any): string {
  if (!items) return "";
  if (typeof items === "string") return items;
  if (!Array.isArray(items)) return "";
  const lines: string[] = [];
  for (const item of items) {
    const name = item.name || item.item_name || "";
    const qty = item.quantity || item.item_quantity || 1;
    const price = item.price || item.item_price || "";
    const sizeName = item.size_name || item.item_size_name || "";
    let itemLine = `🍽️ ${name}`;
    if (sizeName) itemLine += ` (${sizeName})`;
    itemLine += `\nQuantidade: ${qty}x`;
    if (price) itemLine += `, Valor: ${price}`;
    lines.push(itemLine);
    const additionals = item.additionals || item.complements || item.extras || [];
    if (Array.isArray(additionals) && additionals.length > 0) {
      lines.push("", "Adicionais:");
      const grouped: Record<string, any[]> = {};
      for (const add of additionals) {
        const cat = add.category_name || add.additional_category_name || add.group || "Extras";
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(add);
      }
      for (const [cat, adds] of Object.entries(grouped)) {
        lines.push("", cat.toUpperCase());
        for (const add of adds) {
          const addName = add.name || add.additional_name || "";
          const addQty = add.amount || add.additional_amount || add.quantity || 1;
          const addPrice = add.price_total || add.additional_price_total || add.price || "";
          if (addPrice && addPrice !== "0" && addPrice !== "R$ 0,00" && addPrice !== "Grátis") {
            lines.push(`* ${addName}\n  ${addQty}x | ${addPrice}`);
          } else {
            lines.push(`${addName}\n${addQty}x | Grátis`);
          }
        }
      }
    }
    const flavors = item.flavors || [];
    if (Array.isArray(flavors) && flavors.length > 0) {
      lines.push("", "Sabores:");
      for (const f of flavors) {
        lines.push(`* ${f.name || f.flavor_name || ""} (${f.amount || f.quantity || 1}x)`);
      }
    }
    const note = item.note || item.item_note || "";
    if (note) lines.push(`📝 Obs: ${note}`);
  }
  return lines.join("\n");
}

function jsonResponse(body: Record<string, any>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Sanitize message text for WhatsApp:
 * 1. Convert literal \n (escaped newlines from delivery) to real newlines
 * 2. Fix broken WhatsApp bold markers (asterisks spanning across lines)
 * 3. Clean up excessive blank lines
 */
function sanitizeMessage(text: string): string {
  let msg = String(text);

  // Convert literal escaped newlines to real newlines
  msg = msg.replace(/\\\\n/g, "\n");
  msg = msg.replace(/\\n/g, "\n");

  // Fix bold markers that span across line breaks.
  // WhatsApp bold requires *text* on the SAME line.
  // Strategy: go line by line, if a line has an odd number of *, fix it.
  const lines = msg.split("\n");
  const fixedLines = lines.map(line => {
    const count = (line.match(/\*/g) || []).length;
    if (count === 0 || count % 2 === 0) return line; // balanced or none

    // Odd asterisks — fix based on position
    const trimmed = line.trim();

    // Case: line starts with * but doesn't close → add * at end
    // e.g. "*💰 Valores:" → "*💰 Valores:*"
    if (trimmed.startsWith("*") && !trimmed.endsWith("*")) {
      return line.replace(/^(\s*\*.+?)(\s*)$/, "$1*$2");
    }

    // Case: line ends with * but doesn't start with * → orphan closer
    // e.g. "▫️ Nome:* Cliente" → "▫️ *Nome:* Cliente" or strip the orphan
    if (trimmed.endsWith("*") && !trimmed.startsWith("*")) {
      // Remove trailing orphan asterisk
      return line.replace(/\*\s*$/, "");
    }

    // Case: orphan * in the middle of the line — remove it
    // Find the orphan and strip it (keep paired ones)
    // Simple: if only 1 asterisk, remove it
    if (count === 1) {
      return line.replace(/\*/, "");
    }

    return line;
  });
  msg = fixedLines.join("\n");

  // Clean up more than 3 consecutive newlines → 2
  msg = msg.replace(/\n{4,}/g, "\n\n\n");
  msg = msg.split("\n").map(l => l.trimEnd()).join("\n");

  return msg.trim();
}

function tryParseJson(raw: string): any | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function parseFormEncoded(raw: string): Record<string, any> {
  const params = new URLSearchParams(raw);
  const out: Record<string, any> = {};

  for (const [key, value] of params.entries()) {
    const parsedValue = value.trim().startsWith("{") || value.trim().startsWith("[")
      ? tryParseJson(value) ?? value
      : value;

    if (out[key] === undefined) {
      out[key] = parsedValue;
    } else if (Array.isArray(out[key])) {
      out[key].push(parsedValue);
    } else {
      out[key] = [out[key], parsedValue];
    }
  }

  return out;
}

function parseMultipartFormData(rawBody: string, boundary: string): Record<string, any> {
  const out: Record<string, any> = {};
  // The boundary delimiter in the body is "--" + boundary
  const delimiter = `--${boundary}`;
  const parts = rawBody.split(delimiter);
  for (const part of parts) {
    if (part.trim() === "" || part.trim() === "--") continue;
    // Handle both \r\n and \n line endings
    const headerBodySplit = part.indexOf("\r\n\r\n") !== -1
      ? part.indexOf("\r\n\r\n")
      : part.indexOf("\n\n");
    if (headerBodySplit === -1) continue;
    const headers = part.slice(0, headerBodySplit);
    const separatorLength = part.indexOf("\r\n\r\n") !== -1 ? 4 : 2;
    const value = part.slice(headerBodySplit + separatorLength);
    // Remove trailing \r\n or \n
    const cleanValue = value.replace(/\r?\n$/, "");
    const nameMatch = headers.match(/name="([^"]+)"/);
    if (nameMatch) {
      const key = nameMatch[1];
      const trimmedValue = cleanValue.trim();
      const parsedValue = trimmedValue.startsWith("{") || trimmedValue.startsWith("[")
        ? tryParseJson(trimmedValue) ?? trimmedValue
        : trimmedValue;
      out[key] = parsedValue;
    }
  }
  return out;
}

function extractObject(input: unknown): Record<string, any> {
  if (input == null) return {};

  if (typeof input === "string") {
    const raw = input.trim();
    if (!raw) return {};

    const parsedJson = tryParseJson(raw);
    if (parsedJson && typeof parsedJson === "object" && !Array.isArray(parsedJson)) {
      return parsedJson as Record<string, any>;
    }

    if (raw.includes("=")) {
      const parsedForm = parseFormEncoded(raw);
      if (Object.keys(parsedForm).length > 0) return parsedForm;
    }

    return {};
  }

  if (Array.isArray(input)) {
    return { items: input };
  }

  if (typeof input === "object") {
    return input as Record<string, any>;
  }

  return {};
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeStatusKey(statusRaw: unknown, statusLabelRaw: unknown, paymentStatusRaw: unknown): string {
  const status = normalizeText(statusRaw);
  const label = normalizeText(statusLabelRaw);
  const paymentStatus = normalizeText(paymentStatusRaw);
  const combined = [status, label].filter(Boolean).join("_");

  if (/(aceit|accept|aprov)/.test(combined)) return "aceito";
  if (/(prepar|kitchen|cooking|em_preparo)/.test(combined)) return "preparando";
  if (/(cancel|recus|declin)/.test(combined)) return "cancelado";
  if (/(pront|ready|aguardando_retirada)/.test(combined)) return "pronto";
  if (/(saiu.*entrega|out_for_delivery|em_rota|delivery_running)/.test(combined)) return "saiu_entrega";

  if (/(entreg|deliver)/.test(combined)) {
    if (/(pend|unpaid|awaiting|open)/.test(paymentStatus) || /(pend)/.test(combined)) return "entregue_pendente";
    if (/(paid|pago|confirm|approved)/.test(paymentStatus) || /(pago|paid)/.test(combined)) return "entregue_pago";
  }

  return status || label || "";
}

function detectAction(payload: Record<string, any>): string | undefined {
  const explicit = normalizeText(
    payload.action ?? payload.event ?? payload.event_type ?? payload.type ?? payload.hook_event ?? payload.topic
  );

  const hasPhone = Boolean(
    payload.phone ||
    payload.phone_number ||
    payload.number ||
    payload.customer_phone ||
    payload.client_phone ||
    payload.customer?.phone ||
    payload.order_data?.customer_phone_number ||
    payload.order?.customer?.phone ||
    payload.to
  );

  const hasMessage = Boolean(
    payload.message ||
    payload.text ||
    payload.msg ||
    payload.content ||
    payload.body ||
    payload.order_message ||
    payload.notification_message
  );

  const hasOrderSignals = Boolean(
    payload.status ||
    payload.status_key ||
    payload.status_label ||
    payload.order_status ||
    payload.order_code ||
    payload.order_id ||
    payload.order?.id ||
    payload.order?.code
  );

  if (explicit === "health" || explicit === "ping") return "health";
  if (explicit.includes("status")) return "order_status_updated";
  if (explicit.includes("send") && explicit.includes("text")) return "send_text";
  if (hasOrderSignals) return "order_status_updated";
  if (hasPhone && hasMessage) return "send_text";

  return undefined;
}

function sanitizeHeaders(headers: Headers): Record<string, string> {
  const sensitive = new Set(["authorization", "apikey", "x-api-key", "cookie", "set-cookie"]);
  const out: Record<string, string> = {};

  headers.forEach((value, key) => {
    out[key] = sensitive.has(key.toLowerCase()) ? "***" : value;
  });

  return out;
}

function truncate(value: string, limit = 4000): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}...[truncated ${value.length - limit} chars]`;
}

// ============================================================
// Multi-provider sender — abstracts evolution / evolution_go /
// wuzapi / wppconnect / quepasa so api-send-text works with
// any active provider configured for the company.
// Returns { ok, status, response } and never throws.
// ============================================================
async function resolveProviderConfig(
  supabase: any,
  companyId: string,
  provider: string,
): Promise<{ baseUrl: string; apiKey: string } | null> {
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

async function wppGenerateTokenLocal(baseUrl: string, secretKey: string, session: string): Promise<string | null> {
  try {
    const r = await fetch(`${baseUrl}/api/${encodeURIComponent(session)}/${encodeURIComponent(secretKey)}/generate-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const data = await r.json().catch(() => ({}));
    return data?.token || data?.full || null;
  } catch {
    return null;
  }
}

async function sendViaProvider(
  supabase: any,
  instance: { id: string; name: string; company_id: string; provider: string; provider_instance_id: string | null; evolution_instance_id: string | null },
  phone: string,
  text: string,
): Promise<{ ok: boolean; status: number; response: any; endpoint: string; provider: string }> {
  const provider = instance.provider || "evolution";
  const cfg = await resolveProviderConfig(supabase, instance.company_id, provider);
  if (!cfg) {
    return { ok: false, status: 400, response: { error: `Provider '${provider}' não configurado ou inativo` }, endpoint: "", provider };
  }
  const { baseUrl, apiKey } = cfg;
  const phoneDigits = phone.replace(/\D/g, "");

  try {
    if (provider === "evolution") {
      const evoName = instance.evolution_instance_id || instance.name;
      const url = `${baseUrl}/message/sendText/${evoName}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: apiKey },
        body: JSON.stringify({ number: phoneDigits, text }),
      });
      const data = await res.json().catch(() => ({ status: res.status }));
      return { ok: res.ok, status: res.status, response: data, endpoint: url, provider };
    }
    if (provider === "evolution_go") {
      const instanceToken = instance.provider_instance_id || "";
      if (!instanceToken) return { ok: false, status: 400, response: { error: "Token Evolution Go ausente" }, endpoint: "", provider };
      const url = `${baseUrl}/send/text`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: instanceToken },
        body: JSON.stringify({ number: phoneDigits, text }),
      });
      const data = await res.json().catch(() => ({ status: res.status }));
      return { ok: res.ok, status: res.status, response: data, endpoint: url, provider };
    }
    if (provider === "wuzapi") {
      const userToken = instance.provider_instance_id || "";
      if (!userToken) return { ok: false, status: 400, response: { error: "Token Wuzapi ausente" }, endpoint: "", provider };
      const url = `${baseUrl}/chat/send/text`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Token: userToken },
        body: JSON.stringify({ Phone: phoneDigits, Body: text }),
      });
      const data = await res.json().catch(() => ({ status: res.status }));
      return { ok: res.ok, status: res.status, response: data, endpoint: url, provider };
    }
    if (provider === "wppconnect") {
      const session = instance.name;
      const sessionToken = await wppGenerateTokenLocal(baseUrl, apiKey, session);
      if (!sessionToken) return { ok: false, status: 401, response: { error: "WPPConnect: falha ao gerar token de sessão" }, endpoint: "", provider };
      const url = `${baseUrl}/api/${encodeURIComponent(session)}/send-message`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify({ phone: phoneDigits, isGroup: false, isNewsletter: false, isLid: false, message: text }),
      });
      const data = await res.json().catch(() => ({ status: res.status }));
      return { ok: res.ok, status: res.status, response: data, endpoint: url, provider };
    }
    if (provider === "quepasa") {
      const sessionToken = instance.provider_instance_id || apiKey;
      const url = `${baseUrl}/send`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-QUEPASA-TOKEN": sessionToken,
          "X-QUEPASA-CHATID": phoneDigits.includes("@") ? phoneDigits : `${phoneDigits}@s.whatsapp.net`,
          "X-QUEPASA-TRACKID": instance.name,
        },
        body: JSON.stringify({ text }),
      });
      const data = await res.json().catch(() => ({ status: res.status }));
      return { ok: res.ok, status: res.status, response: data, endpoint: url, provider };
    }
    return { ok: false, status: 400, response: { error: `Provider desconhecido: ${provider}` }, endpoint: "", provider };
  } catch (err: any) {
    return { ok: false, status: 500, response: { error: err.message }, endpoint: "", provider };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const url = new URL(req.url);
    const contentType = (req.headers.get("content-type") || "").toLowerCase();
    const rawBody = await req.text();

    let parsedBody: Record<string, any> = {};
    let parserUsed = "empty";

    if (rawBody.trim()) {
      if (contentType.includes("application/json")) {
        const parsed = tryParseJson(rawBody);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          parsedBody = parsed as Record<string, any>;
          parserUsed = "json";
        } else {
          parsedBody = parseFormEncoded(rawBody);
          parserUsed = "json_fallback_form";
        }
      } else if (contentType.includes("multipart/form-data")) {
        // Extract the full boundary value (including dashes) from content-type header
        const boundaryMatch = req.headers.get("content-type")?.match(/boundary=([^\s;]+)/i);
        if (boundaryMatch) {
          parsedBody = parseMultipartFormData(rawBody, boundaryMatch[1]);
          parserUsed = "multipart";
        } else {
          parserUsed = "multipart_no_boundary";
        }
      } else if (contentType.includes("application/x-www-form-urlencoded")) {
        parsedBody = parseFormEncoded(rawBody);
        parserUsed = "form_urlencoded";
      } else {
        const parsed = tryParseJson(rawBody);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          parsedBody = parsed as Record<string, any>;
          parserUsed = "json_loose";
        } else if (rawBody.includes("=")) {
          parsedBody = parseFormEncoded(rawBody);
          parserUsed = "form_loose";
        } else {
          parserUsed = "raw_text";
        }
      }
    }

    let body: Record<string, any> = { ...parsedBody };

    for (const nestedKey of ["payload", "data", "body", "request_body", "event_data", "order_data", "order"]) {
      const nested = extractObject(body[nestedKey]);
      if (Object.keys(nested).length > 0) {
        body = { ...nested, ...body };
      }
    }

    const queryPayload: Record<string, any> = {};
    url.searchParams.forEach((value, key) => {
      if (key !== "uuid" && key !== "access_token") {
        queryPayload[key] = value;
      }
    });

    body = { ...queryPayload, ...body };

    console.log(`[api-send-text] Request id=${requestId}`);
    console.log(`[api-send-text] URL=${url.origin}${url.pathname} query=${url.search}`);
    console.log(`[api-send-text] Method=${req.method} content_type=${contentType || "unknown"}`);
    console.log(`[api-send-text] Headers=${JSON.stringify(sanitizeHeaders(req.headers))}`);
    console.log(`[api-send-text] Raw body=${truncate(rawBody)}`);
    console.log(`[api-send-text] Parser used: ${parserUsed}, parsed keys: ${JSON.stringify(Object.keys(body))}`);
    const uuid = url.searchParams.get("uuid") || body.uuid || body.instance_id || body.instanceId || "";
    const accessToken =
      url.searchParams.get("access_token") ||
      body.access_token ||
      body.token ||
      body.session_token ||
      "";

    console.log(`[api-send-text] Received auth params uuid=${uuid || "missing"}, access_token=${accessToken ? "***" : "missing"}`);

    // ============================================================
    // Auth: validate uuid + access_token
    // ============================================================
    if (!uuid) {
      return jsonResponse({ error: "uuid is required as query parameter", request_id: requestId }, 400);
    }
    if (!accessToken) {
      return jsonResponse({ error: "access_token is required as query parameter", request_id: requestId }, 400);
    }

    const { data: instance, error: instErr } = await supabase
      .from("instances")
      .select("id, name, company_id, provider, provider_instance_id, evolution_instance_id, status, access_token")
      .eq("id", uuid)
      .single();

    if (instErr || !instance) {
      console.error(`[api-send-text] Instance not found: uuid=${uuid}`, instErr?.message);
      return jsonResponse({ error: "Instance not found", uuid, request_id: requestId }, 404);
    }

    if (instance.access_token !== accessToken) {
      console.error(`[api-send-text] Invalid access_token for uuid=${uuid}`);
      return jsonResponse({ error: "Invalid access_token", request_id: requestId }, 401);
    }

    console.log(`[api-send-text] Instance validated: id=${instance.id}, name=${instance.name}, provider=${instance.provider}, company=${instance.company_id}`);

    // ============================================================
    // Auto-detect action
    // ============================================================
    const action = detectAction(body);
    console.log(`[api-send-text] Detected action: ${action}`);

    // ============================================================
    // ACTION: simple send text (direct message)
    // ============================================================
    if (action === "send_text" || action === "test") {
      const phone =
        body.phone ||
        body.phone_number ||
        body.number ||
        body.customer_phone ||
        body.client_phone ||
        body.customer?.phone ||
        body.order_data?.customer_phone_number ||
        body.order?.customer?.phone ||
        body.to ||
        "";

      const text =
        body.message ||
        body.text ||
        body.msg ||
        body.content ||
        body.body ||
        body.order_message ||
        body.notification_message ||
        "";

      if (!phone) {
        return jsonResponse({
          error: "phone/number is required",
          request_id: requestId,
          received_fields: Object.keys(body),
        }, 400);
      }

      if (!text) {
        return jsonResponse({
          error: "message/text is required",
          request_id: requestId,
          received_fields: Object.keys(body),
        }, 400);
      }

      const normalizedPhone = normalizePhone(String(phone));
      const normalizedText = sanitizeMessage(text);
      const sendPayload = { number: normalizedPhone, text: normalizedText };

      console.log(`[api-send-text] Sending direct text via ${instance.provider} to ${normalizedPhone}`);

      try {
        const sent = await sendViaProvider(supabase, instance as any, normalizedPhone, normalizedText);
        console.log(`[api-send-text] ${sent.provider} response status=${sent.status}`);

        await supabase.from("delivery_send_logs").insert({
          company_id: instance.company_id,
          event_key: normalizeText(body.event || action || "send_text") || "send_text",
          phone: normalizedPhone,
          message: normalizedText,
          status: sent.ok ? "sent" : "failed",
          error: sent.ok ? null : `HTTP ${sent.status}`,
          api_response: {
            request_id: requestId,
            parser_used: parserUsed,
            raw_body: truncate(rawBody),
            parsed_body: body,
            provider: sent.provider,
            provider_response: sent.response,
            endpoint: sent.endpoint,
            payload_sent: sendPayload,
            elapsed_ms: Date.now() - startTime,
          },
        });

        return jsonResponse({
          success: sent.ok,
          status: sent.ok ? "sent" : "failed",
          response: sent.response,
          provider: sent.provider,
          instance: instance.name,
          request_id: requestId,
          elapsed_ms: Date.now() - startTime,
        });
      } catch (err: any) {
        console.error(`[api-send-text] Send error:`, err.message, err.stack);
        return jsonResponse({ success: false, error: err.message, request_id: requestId }, 500);
      }
    }

    // ============================================================
    // ACTION: order_status_updated / send_status_change
    // ============================================================
    if (action === "order_status_updated" || action === "send_status_change") {
      const rawStatus = body.status_key || body.status || body.order_status || body.state || "";
      const statusLabel = body.status_label || body.order_status_label || body.status || body.order_status || "";
      const paymentStatus =
        body.payment_status ||
        body.order_data?.payment_status ||
        body.order?.payment_status ||
        body.payment?.status ||
        "";

      const statusKey =
        normalizeStatusKey(rawStatus, statusLabel, paymentStatus) ||
        normalizeText(rawStatus) ||
        "unknown";

      const orderId = body.order_id || body.order?.id || "";
      const orderCode = body.order_code || body.order?.code || body.code || "";
      const customerName =
        body.customer_name ||
        body.client_name ||
        body.customer?.name ||
        body.order_data?.customer_name ||
        body.order?.customer?.name ||
        "";

      const customerPhone =
        body.customer_phone ||
        body.client_phone ||
        body.phone ||
        body.phone_number ||
        body.number ||
        body.customer?.phone ||
        body.order_data?.customer_phone_number ||
        body.order?.customer?.phone ||
        body.to ||
        "";

      const storeName = body.store_name || body.store?.name || body.order_data?.store_name || body.order?.store_name || "";
      const externalMessage = body.message || body.text || body.msg || "";

      console.log(`[api-send-text] Order status request order=${orderCode || orderId} status=${statusKey} phone=${customerPhone}`);

      if (!customerPhone) {
        return jsonResponse({
          error: "customer_phone is required",
          request_id: requestId,
          received_fields: Object.keys(body),
        }, 400);
      }

      const normalizedPhone = normalizePhone(String(customerPhone));
      const eventKey = `status_${statusKey}`;

      // Get template
      const { data: tmpl } = await supabase
        .from("delivery_message_templates")
        .select("*")
        .eq("company_id", instance.company_id)
        .eq("event_key", eventKey)
        .single();

      let statusTmpl = null;
      if (!tmpl) {
        const { data: st } = await supabase
          .from("status_templates")
          .select("*")
          .eq("company_id", instance.company_id)
          .ilike("name", `%${statusLabel || rawStatus}%`)
          .limit(1)
          .maybeSingle();
        statusTmpl = st;
      }

      const itemsRaw =
        body.items ||
        body.order_items ||
        body.products ||
        body.order_data?.items ||
        body.order_data?.items_text ||
        body.order?.items ||
        body.order?.products ||
        "";

      const orderItemsFormatted = formatOrderItems(itemsRaw) || body.order_data?.items_text || "";
      const deliveryType = body.delivery_type || body.order_data?.delivery_type || body.order?.delivery_type || "";
      const deliveryAddress =
        body.delivery_address ||
        body.address ||
        body.customer_address ||
        body.order_data?.address ||
        body.order_data?.delivery_details ||
        body.order?.delivery_address ||
        "";

      const normalizedDeliveryType = normalizeText(deliveryType);
      const isPickup = normalizedDeliveryType.includes("retirada") || normalizedDeliveryType.includes("pickup") || deliveryType === "0";

      let deliveryOrPickupText = "";
      if (isPickup) {
        deliveryOrPickupText = "🏪 O cliente fará a retirada no local.";
      } else if (deliveryAddress) {
        deliveryOrPickupText = `🛵 Entrega em:\n${deliveryAddress}`;
      }

      const deliveryReadyText = isPickup
        ? "🏪 Seu pedido está pronto para retirada no local!"
        : "🛵 Seu pedido está pronto e em breve sairá para entrega!";

      const orderTotal = body.total || body.order_total || body.order_data?.total || body.order_data?.order_price_total || body.order?.total || "";
      const orderSubtotal = body.subtotal || body.order_subtotal || body.order_data?.subtotal || body.order_data?.order_price_order || body.order?.subtotal || orderTotal;
      const paymentMethod = body.payment_method || body.order_data?.payment_method || body.order_data?.order_payment_method || body.order?.payment_method || "";
      const dateCreated = body.date_created_order || body.order_data?.date_created_order || body.order?.date_created_order || body.created_at || "";
      const timeCreated = body.time_created_order || body.order_data?.time_created_order || body.order?.time_created_order || "";
      const orderLink = body.order_link || body.link || body.order_data?.order_link || body.order?.order_link || body.order?.link || "";

      const templateData: Record<string, any> = {
        order_id: orderId,
        order_code: orderCode,
        order_link: orderLink,
        status: rawStatus,
        status_key: statusKey,
        status_label: statusLabel,
        customer_name: customerName,
        client_name: customerName,
        customer_phone: customerPhone,
        client_phone: customerPhone,
        store_name: storeName,
        items: itemsRaw,
        order_items_formatted: orderItemsFormatted,
        items_text: body.order_data?.items_text || orderItemsFormatted,
        total: orderTotal,
        order_total: orderTotal,
        subtotal: orderSubtotal,
        order_subtotal: orderSubtotal,
        order_price_delivery: body.order_data?.order_price_delivery || body.delivery_fee || body.order?.delivery_fee || "",
        order_price_discount: body.order_data?.order_price_discount || body.discount || body.order?.discount || "",
        payment_method: paymentMethod,
        order_payment_method: paymentMethod,
        delivery_type: deliveryType,
        delivery_address: deliveryAddress,
        delivery_or_pickup_text: deliveryOrPickupText,
        delivery_ready_text: deliveryReadyText,
        date_created_order: dateCreated,
        time_created_order: timeCreated,
        datetime_now: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
        notes: body.notes || body.order_data?.notes || body.order_data?.order_note || body.order?.note || "",
        ...(body.order_data || {}),
      };

      let renderedMessage = "";
      let messageSource = "";

      if (tmpl?.is_enabled && tmpl.message_template) {
        renderedMessage = processTemplate(tmpl.message_template, templateData);
        messageSource = `delivery_message_template (${eventKey})`;
      } else if (statusTmpl?.message) {
        renderedMessage = processTemplate(statusTmpl.message, templateData);
        messageSource = `status_template (${statusTmpl.name})`;
      } else if (externalMessage) {
        renderedMessage = processTemplate(String(externalMessage), templateData);
        messageSource = "external message";
      } else {
        const defaultTmpl = getDefaultStatusTemplate(statusKey);
        if (defaultTmpl) {
          renderedMessage = processTemplate(defaultTmpl, templateData);
          messageSource = `default_template (${statusKey})`;
        } else {
          renderedMessage = `Atualização do pedido ${orderCode || orderId || ""}: ${statusLabel || rawStatus || "atualizado"}`;
          messageSource = "fallback";
        }
      }

      if (!renderedMessage?.trim()) {
        renderedMessage = `Atualização do pedido ${orderCode || orderId || ""}: ${statusLabel || rawStatus || "atualizado"}`;
        messageSource = "safety_fallback";
      }

      console.log(`[api-send-text] Message source: ${messageSource}, length: ${renderedMessage.length}`);
      console.log(`[api-send-text] Destination phone: ${normalizedPhone}`);

      renderedMessage = sanitizeMessage(renderedMessage);
      const sendPayload = { number: normalizedPhone, text: renderedMessage };

      console.log(`[api-send-text] Sending order status via ${instance.provider} to ${normalizedPhone}`);

      let apiResponse: any = null;
      let sendStatus = "sent";
      let sendError: string | null = null;
      let endpointUsed = "";
      let providerUsed = instance.provider;

      try {
        const sent = await sendViaProvider(supabase, instance as any, normalizedPhone, renderedMessage);
        apiResponse = sent.response;
        endpointUsed = sent.endpoint;
        providerUsed = sent.provider;
        console.log(`[api-send-text] ${sent.provider} response status=${sent.status}`);

        if (!sent.ok) {
          sendStatus = "failed";
          sendError = `${sent.provider} HTTP ${sent.status}: ${JSON.stringify(apiResponse)}`;
          console.error(`[api-send-text] SEND FAILED:`, sendError);
        } else {
          console.log(`[api-send-text] SEND SUCCESS to ${normalizedPhone}`);
        }
      } catch (err: any) {
        sendStatus = "failed";
        sendError = `Network error: ${err.message}`;
        console.error(`[api-send-text] SEND EXCEPTION:`, err.message, err.stack);
      }

      await supabase.from("delivery_send_logs").insert({
        company_id: instance.company_id,
        order_code: orderCode || null,
        event_key: eventKey,
        phone: normalizedPhone,
        message: renderedMessage,
        status: sendStatus,
        error: sendError,
        api_response: {
          request_id: requestId,
          parser_used: parserUsed,
          raw_body: truncate(rawBody),
          parsed_body: body,
          provider: providerUsed,
          provider_response: apiResponse,
          endpoint_used: endpointUsed,
          payload_sent: sendPayload,
          message_source: messageSource,
          elapsed_ms: Date.now() - startTime,
        },
      });

      return jsonResponse({
        status: sendStatus,
        error: sendError,
        message_sent: renderedMessage,
        message_source: messageSource,
        phone: normalizedPhone,
        event_key: eventKey,
        instance: instance.name,
        request_id: requestId,
        elapsed_ms: Date.now() - startTime,
      });
    }

    // ============================================================
    // ACTION: health
    // ============================================================
    if (action === "health") {
      return jsonResponse({ status: "ok", instance: instance.name, request_id: requestId, timestamp: new Date().toISOString() });
    }

    return jsonResponse({
      error: "Could not determine action from payload",
      hint: "Send phone+message for text, or status+customer_phone for order updates",
      request_id: requestId,
      parser_used: parserUsed,
      raw_body: truncate(rawBody),
      received_fields: Object.keys(body),
    }, 400);

  } catch (err: any) {
    console.error(`[api-send-text] Fatal error:`, err.message, err.stack);
    return new Response(JSON.stringify({ error: err.message, stack: err.stack }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

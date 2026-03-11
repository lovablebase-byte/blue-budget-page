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
      .select("id, name, company_id, evolution_instance_id, status, access_token")
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

    console.log(`[api-send-text] Instance validated: id=${instance.id}, name=${instance.name}, company=${instance.company_id}`);

    // ============================================================
    // Get Evolution API config
    // ============================================================
    const { data: evoConfig } = await supabase
      .from("evolution_api_config")
      .select("base_url, api_key, is_active")
      .eq("company_id", instance.company_id)
      .single();

    if (!evoConfig?.is_active || !evoConfig.base_url || !evoConfig.api_key) {
      return jsonResponse({ error: "Evolution API not configured or inactive", request_id: requestId }, 400);
    }

    // ============================================================
    // Auto-detect action
    // ============================================================
    const action = detectAction(body);
    console.log(`[api-send-text] Detected action: ${action}`);

    const evoBaseUrl = evoConfig.base_url.replace(/\/+$/, "");
    const evoInstanceName = instance.evolution_instance_id || instance.name;

    // ============================================================
    // ACTION: simple send text (direct message)
    // ============================================================
    if (action === "send_text" || action === "test") {
      const phone =
        body.phone ||
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
      const normalizedText = String(text).trim();
      const sendUrl = `${evoBaseUrl}/message/sendText/${evoInstanceName}`;
      const sendPayload = { number: normalizedPhone, text: normalizedText };

      console.log(`[api-send-text] Sending direct text to ${normalizedPhone}`);
      console.log(`[api-send-text] Evolution endpoint: ${sendUrl}`);
      console.log(`[api-send-text] Evolution payload: ${JSON.stringify(sendPayload)}`);

      try {
        const res = await fetch(sendUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: evoConfig.api_key },
          body: JSON.stringify(sendPayload),
        });
        const data = await res.json().catch(() => ({ status: res.status }));

        console.log(`[api-send-text] Evolution response status=${res.status} body=${JSON.stringify(data)}`);

        await supabase.from("delivery_send_logs").insert({
          company_id: instance.company_id,
          event_key: normalizeText(body.event || action || "send_text") || "send_text",
          phone: normalizedPhone,
          message: normalizedText,
          status: res.ok ? "sent" : "failed",
          error: res.ok ? null : `HTTP ${res.status}`,
          api_response: {
            request_id: requestId,
            parser_used: parserUsed,
            raw_body: truncate(rawBody),
            parsed_body: body,
            evo_response: data,
            endpoint: sendUrl,
            payload_sent: sendPayload,
            elapsed_ms: Date.now() - startTime,
          },
        });

        return jsonResponse({
          success: res.ok,
          status: res.ok ? "sent" : "failed",
          response: data,
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

      const sendUrl = `${evoBaseUrl}/message/sendText/${evoInstanceName}`;
      const sendPayload = { number: normalizedPhone, text: renderedMessage };

      console.log(`[api-send-text] Evolution endpoint: ${sendUrl}`);
      console.log(`[api-send-text] Evolution payload: ${JSON.stringify(sendPayload)}`);

      let apiResponse: any = null;
      let sendStatus = "sent";
      let sendError: string | null = null;

      try {
        const res = await fetch(sendUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: evoConfig.api_key },
          body: JSON.stringify(sendPayload),
        });
        apiResponse = await res.json().catch(() => ({ status: res.status }));
        console.log(`[api-send-text] Evolution response status=${res.status} body=${JSON.stringify(apiResponse)}`);

        if (!res.ok) {
          sendStatus = "failed";
          sendError = `Evolution HTTP ${res.status}: ${JSON.stringify(apiResponse)}`;
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
          evo_response: apiResponse,
          endpoint_used: sendUrl,
          payload_sent: sendPayload,
          evo_instance_name: evoInstanceName,
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

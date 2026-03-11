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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startTime = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const url = new URL(req.url);
    const uuid = url.searchParams.get("uuid");
    const accessToken = url.searchParams.get("access_token");

    console.log(`[api-send-text] Received request: uuid=${uuid}, access_token=${accessToken ? "***" : "missing"}, method=${req.method}`);

    // ============================================================
    // Auth: validate uuid + access_token
    // ============================================================
    if (!uuid) {
      return jsonResponse({ error: "uuid is required as query parameter" }, 400);
    }
    if (!accessToken) {
      return jsonResponse({ error: "access_token is required as query parameter" }, 400);
    }

    const { data: instance, error: instErr } = await supabase
      .from("instances")
      .select("id, name, company_id, evolution_instance_id, status, access_token")
      .eq("id", uuid)
      .single();

    if (instErr || !instance) {
      console.error(`[api-send-text] Instance not found: uuid=${uuid}`, instErr?.message);
      return jsonResponse({ error: "Instance not found", uuid }, 404);
    }

    if (instance.access_token !== accessToken) {
      console.error(`[api-send-text] Invalid access_token for uuid=${uuid}`);
      return jsonResponse({ error: "Invalid access_token" }, 401);
    }

    console.log(`[api-send-text] Instance validated: name=${instance.name}, company=${instance.company_id}`);

    // ============================================================
    // Get Evolution API config
    // ============================================================
    const { data: evoConfig } = await supabase
      .from("evolution_api_config")
      .select("base_url, api_key, is_active")
      .eq("company_id", instance.company_id)
      .single();

    if (!evoConfig?.is_active || !evoConfig.base_url || !evoConfig.api_key) {
      return jsonResponse({ error: "Evolution API not configured or inactive" }, 400);
    }

    // ============================================================
    // Parse body
    // ============================================================
    const body = await req.json().catch(() => ({}));

    console.log(`[api-send-text] Payload:`, JSON.stringify(body));

    // Auto-detect action
    let action = body.action;
    if (!action) {
      if (body.status || body.order_code || body.order_id || body.customer_phone || body.customer?.phone) {
        action = "order_status_updated";
      } else if (body.phone && (body.message || body.text)) {
        action = "send_text";
      } else if (body.number && (body.message || body.text)) {
        action = "send_text";
      }
    }

    console.log(`[api-send-text] Detected action: ${action}`);

    const evoBaseUrl = evoConfig.base_url.replace(/\/+$/, "");
    const evoInstanceName = instance.evolution_instance_id || instance.name;

    // ============================================================
    // ACTION: simple send text (direct message)
    // ============================================================
    if (action === "send_text" || action === "test" || (!action && (body.phone || body.number))) {
      const phone = body.phone || body.number || body.customer_phone || "";
      const text = body.message || body.text || "";

      if (!phone) return jsonResponse({ error: "phone/number is required" }, 400);
      if (!text) return jsonResponse({ error: "message/text is required" }, 400);

      const normalizedPhone = normalizePhone(phone);
      const sendUrl = `${evoBaseUrl}/message/sendText/${evoInstanceName}`;

      console.log(`[api-send-text] Sending text to ${normalizedPhone} via ${sendUrl}`);

      try {
        const res = await fetch(sendUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: evoConfig.api_key },
          body: JSON.stringify({ number: normalizedPhone, text }),
        });
        const data = await res.json().catch(() => ({ status: res.status }));

        console.log(`[api-send-text] Evolution response: ${res.status}`, JSON.stringify(data));

        // Log
        await supabase.from("delivery_send_logs").insert({
          company_id: instance.company_id,
          event_key: "send_text",
          phone: normalizedPhone,
          message: text,
          status: res.ok ? "sent" : "failed",
          error: res.ok ? null : `HTTP ${res.status}`,
          api_response: { evo_response: data, endpoint: sendUrl, elapsed_ms: Date.now() - startTime },
        });

        return jsonResponse({
          success: res.ok,
          status: res.ok ? "sent" : "failed",
          response: data,
          elapsed_ms: Date.now() - startTime,
        });
      } catch (err: any) {
        console.error(`[api-send-text] Send error:`, err.message);
        return jsonResponse({ success: false, error: err.message }, 500);
      }
    }

    // ============================================================
    // ACTION: order_status_updated / send_status_change
    // ============================================================
    if (action === "order_status_updated" || action === "send_status_change") {
      const status = body.status || body.status_key || "";
      const statusKey = body.status_key || body.status || "";
      const statusLabel = body.status_label || body.status || "";
      const orderId = body.order_id || "";
      const orderCode = body.order_code || "";
      const customerName = body.customer_name || body.client_name || body.customer?.name || body.order_data?.customer_name || "";
      const customerPhone = body.customer_phone || body.client_phone || body.phone
        || body.customer?.phone || body.order_data?.customer_phone_number || "";
      const storeName = body.store_name || body.store?.name || body.order_data?.store_name || "";
      const externalMessage = body.message || "";

      console.log(`[api-send-text] Order: code=${orderCode}, status=${status}, phone=${customerPhone}`);

      if (!customerPhone) {
        return jsonResponse({ error: "customer_phone is required", received_fields: Object.keys(body) }, 400);
      }

      const normalizedPhone = normalizePhone(customerPhone);
      const eventKey = `status_${statusKey || "unknown"}`;

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
          .ilike("name", `%${statusLabel}%`)
          .limit(1)
          .maybeSingle();
        statusTmpl = st;
      }

      const itemsRaw = body.items || body.order_data?.items || body.order_data?.items_text || "";
      const orderItemsFormatted = formatOrderItems(itemsRaw);
      const deliveryType = body.delivery_type || body.order_data?.delivery_type || "";
      const deliveryAddress = body.delivery_address || body.address || body.order_data?.address || body.order_data?.delivery_details || "";
      const isPickup = deliveryType.toLowerCase().includes("retirada") || deliveryType === "0" || deliveryType.toLowerCase().includes("pickup");

      let deliveryOrPickupText = "";
      if (isPickup) {
        deliveryOrPickupText = "🏪 O cliente fará a retirada no local.";
      } else if (deliveryAddress) {
        deliveryOrPickupText = `🛵 Entrega em:\n${deliveryAddress}`;
      }

      let deliveryReadyText = isPickup
        ? "🏪 Seu pedido está pronto para retirada no local!"
        : "🛵 Seu pedido está pronto e em breve sairá para entrega!";

      const orderTotal = body.total || body.order_total || body.order_data?.total || body.order_data?.order_price_total || "";
      const orderSubtotal = body.subtotal || body.order_subtotal || body.order_data?.subtotal || body.order_data?.order_price_order || orderTotal;
      const paymentMethod = body.payment_method || body.order_data?.payment_method || body.order_data?.order_payment_method || "";
      const dateCreated = body.date_created_order || body.order_data?.date_created_order || "";
      const timeCreated = body.time_created_order || body.order_data?.time_created_order || "";
      const orderLink = body.order_link || body.order_data?.order_link || "";

      const templateData: Record<string, any> = {
        order_id: orderId, order_code: orderCode, order_link: orderLink,
        status, status_key: statusKey, status_label: statusLabel,
        customer_name: customerName, client_name: customerName,
        customer_phone: customerPhone, client_phone: customerPhone,
        store_name: storeName,
        items: itemsRaw, order_items_formatted: orderItemsFormatted,
        items_text: body.order_data?.items_text || orderItemsFormatted,
        total: orderTotal, order_total: orderTotal, subtotal: orderSubtotal, order_subtotal: orderSubtotal,
        order_price_delivery: body.order_data?.order_price_delivery || body.delivery_fee || "",
        order_price_discount: body.order_data?.order_price_discount || body.discount || "",
        payment_method: paymentMethod, order_payment_method: paymentMethod,
        delivery_type: deliveryType, delivery_address: deliveryAddress,
        delivery_or_pickup_text: deliveryOrPickupText, delivery_ready_text: deliveryReadyText,
        date_created_order: dateCreated, time_created_order: timeCreated,
        datetime_now: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
        notes: body.notes || body.order_data?.notes || body.order_data?.order_note || "",
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
        renderedMessage = processTemplate(externalMessage, templateData);
        messageSource = "external message";
      } else {
        const defaultTmpl = getDefaultStatusTemplate(statusKey);
        if (defaultTmpl) {
          renderedMessage = processTemplate(defaultTmpl, templateData);
          messageSource = `default_template (${statusKey})`;
        } else {
          renderedMessage = `Atualização do pedido ${orderCode || orderId || ""}: ${statusLabel || status || "atualizado"}`;
          messageSource = "fallback";
        }
      }

      console.log(`[api-send-text] Message source: ${messageSource}, length: ${renderedMessage.length}`);

      const sendUrl = `${evoBaseUrl}/message/sendText/${evoInstanceName}`;
      const sendPayload = { number: normalizedPhone, text: renderedMessage };

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
        console.error(`[api-send-text] SEND EXCEPTION:`, err.message);
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
          evo_response: apiResponse,
          endpoint_used: sendUrl,
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
        elapsed_ms: Date.now() - startTime,
      });
    }

    // ============================================================
    // ACTION: health
    // ============================================================
    if (action === "health") {
      return jsonResponse({ status: "ok", instance: instance.name, timestamp: new Date().toISOString() });
    }

    // ============================================================
    // Fallback: if body has phone+message, treat as send_text
    // ============================================================
    const fallbackPhone = body.phone || body.number || body.customer_phone || "";
    const fallbackText = body.message || body.text || "";
    if (fallbackPhone && fallbackText) {
      const normalizedPhone = normalizePhone(fallbackPhone);
      const sendUrl = `${evoBaseUrl}/message/sendText/${evoInstanceName}`;

      console.log(`[api-send-text] Fallback send to ${normalizedPhone}`);

      try {
        const res = await fetch(sendUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: evoConfig.api_key },
          body: JSON.stringify({ number: normalizedPhone, text: fallbackText }),
        });
        const data = await res.json().catch(() => ({ status: res.status }));

        await supabase.from("delivery_send_logs").insert({
          company_id: instance.company_id,
          event_key: "fallback_send",
          phone: normalizedPhone,
          message: fallbackText,
          status: res.ok ? "sent" : "failed",
          error: res.ok ? null : `HTTP ${res.status}`,
          api_response: { evo_response: data, elapsed_ms: Date.now() - startTime },
        });

        return jsonResponse({ success: res.ok, status: res.ok ? "sent" : "failed", response: data });
      } catch (err: any) {
        return jsonResponse({ success: false, error: err.message }, 500);
      }
    }

    return jsonResponse({
      error: "Could not determine action from payload",
      hint: "Send phone+message for text, or status+customer_phone for order updates",
      received_fields: Object.keys(body),
    }, 400);

  } catch (err: any) {
    console.error(`[api-send-text] Fatal error:`, err.message, err.stack);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

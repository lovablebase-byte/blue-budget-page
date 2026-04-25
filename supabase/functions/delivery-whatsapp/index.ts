import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function normalizePhone(phone: string, countryPrefix = '55'): string {
  const digits = phone.replace(/\D/g, '');
  if (!digits.startsWith(countryPrefix) && digits.length >= 10 && digits.length <= 11) {
    return countryPrefix + digits;
  }
  return digits;
}

function processTemplate(template: string, data: Record<string, any>): string {
  let result = template;

  // Process foreach blocks for items
  result = result.replace(/\$\{foreach_item\}([\s\S]*?)\$\{endforeach_item\}/g, (_, block) => {
    const items = data.items || [];
    if (!Array.isArray(items)) return '';
    return items.map((item: any) => {
      let b = block;
      for (const [k, v] of Object.entries(item)) {
        b = b.replace(new RegExp(`\\$\\{item_${k}\\}`, 'g'), String(v ?? ''));
      }
      return b;
    }).join('');
  });

  // Process foreach blocks for additionals
  result = result.replace(/\$\{foreach_additional\}([\s\S]*?)\$\{endforeach_additional\}/g, (_, block) => {
    const additionals = data.additionals || [];
    if (!Array.isArray(additionals)) return '';
    return additionals.map((add: any) => {
      let b = block;
      for (const [k, v] of Object.entries(add)) {
        b = b.replace(new RegExp(`\\$\\{additional_${k}\\}`, 'g'), String(v ?? ''));
      }
      return b;
    }).join('');
  });

  // Process conditionals
  result = result.replace(/\$\{if_(\w+)\}([\s\S]*?)\$\{endif_\1\}/g, (_, key, content) => {
    return data[key] ? content : '';
  });

  // Replace ${var} style variables
  result = result.replace(/\$\{(\w+)\}/g, (_, key) => String(data[key] ?? ''));

  // Replace {{var}} style variables
  result = result.replace(/\{\{(\w+)\}\}/g, (_, key) => String(data[key] ?? ''));

  // Clean up multiple blank lines (max 2 consecutive)
  result = result.replace(/\n{3,}/g, '\n\n');

  return result.trim();
}

// ============================================================
// Rich default templates per status
// ============================================================
function getDefaultStatusTemplate(statusKey: string): string {
  const templates: Record<string, string> = {
    aceito: `✅ Seu pedido foi aceito!

🧾 Pedido: {{order_code}}

📅 Data/Hora: {{date_created_order}} às {{time_created_order}}

👤 Cliente:
▫️ Nome: {{client_name}}
▫️ Telefone: {{client_phone}}

🍽️ Itens do pedido:
{{order_items_formatted}}

💰 Valores:
Pedido: {{order_subtotal}}
Total: {{order_total}}

Forma de Pagamento: {{payment_method}}

{{delivery_or_pickup_text}}

🔗 Acompanhe seu pedido no link:
{{order_link}}`,

    preparando: `👨‍🍳 Seu pedido está em preparo!

🧾 Pedido: {{order_code}}

📅 Data/Hora: {{date_created_order}} às {{time_created_order}}

👤 Cliente:
▫️ Nome: {{client_name}}
▫️ Telefone: {{client_phone}}

🍽️ Itens do pedido:
{{order_items_formatted}}

💰 Valores:
Pedido: {{order_subtotal}}
Total: {{order_total}}

Forma de Pagamento: {{payment_method}}

{{delivery_or_pickup_text}}

🔗 Acompanhe seu pedido no link:
{{order_link}}`,

    cancelado: `❌ Seu pedido foi cancelado.

🧾 Pedido: {{order_code}}

📅 Data/Hora: {{date_created_order}} às {{time_created_order}}

👤 Cliente:
▫️ Nome: {{client_name}}
▫️ Telefone: {{client_phone}}

Se precisar, entre em contato com a loja para mais informações.

🔗 Acompanhe seu pedido no link:
{{order_link}}`,

    pronto: `🎉 Seu pedido está pronto!

🧾 Pedido: {{order_code}}

📅 Data/Hora: {{date_created_order}} às {{time_created_order}}

👤 Cliente:
▫️ Nome: {{client_name}}
▫️ Telefone: {{client_phone}}

{{delivery_ready_text}}

🔗 Acompanhe seu pedido no link:
{{order_link}}`,

    saiu_entrega: `🛵 Seu pedido saiu para entrega!

🧾 Pedido: {{order_code}}

📅 Data/Hora: {{date_created_order}} às {{time_created_order}}

👤 Cliente:
▫️ Nome: {{client_name}}
▫️ Telefone: {{client_phone}}

📍 Endereço de entrega:
{{delivery_address}}

🔗 Acompanhe seu pedido no link:
{{order_link}}`,

    entregue_pendente: `📦 Seu pedido foi entregue!

🧾 Pedido: {{order_code}}

⚠️ Status do pagamento: pendente

💰 Total do pedido: {{order_total}}

Se houver pendência, entre em contato com a loja.

🔗 Acompanhe seu pedido no link:
{{order_link}}`,

    entregue_pago: `✅ Pedido entregue e pagamento confirmado!

🧾 Pedido: {{order_code}}

💰 Total pago: {{order_total}}

Obrigado pela preferência! 🙏

🔗 Acompanhe seu pedido no link:
{{order_link}}`,
  };

  return templates[statusKey] || '';
}

// ============================================================
// Build order_items_formatted from items array
// ============================================================
function formatOrderItems(items: any): string {
  if (!items) return '';
  if (typeof items === 'string') return items; // already formatted text

  if (!Array.isArray(items)) return '';

  const lines: string[] = [];
  for (const item of items) {
    const name = item.name || item.item_name || '';
    const qty = item.quantity || item.item_quantity || 1;
    const price = item.price || item.item_price || '';
    const sizeName = item.size_name || item.item_size_name || '';

    let itemLine = `🍽️ ${name}`;
    if (sizeName) itemLine += ` (${sizeName})`;
    itemLine += `\nQuantidade: ${qty}x`;
    if (price) itemLine += `, Valor: ${price}`;

    lines.push(itemLine);

    // Additionals / complements
    const additionals = item.additionals || item.complements || item.extras || [];
    if (Array.isArray(additionals) && additionals.length > 0) {
      lines.push('');
      lines.push('Adicionais:');

      // Group by category if available
      const grouped: Record<string, any[]> = {};
      for (const add of additionals) {
        const cat = add.category_name || add.additional_category_name || add.group || 'Extras';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(add);
      }

      for (const [cat, adds] of Object.entries(grouped)) {
        lines.push('');
        lines.push(cat.toUpperCase());
        for (const add of adds) {
          const addName = add.name || add.additional_name || '';
          const addQty = add.amount || add.additional_amount || add.quantity || 1;
          const addPrice = add.price_total || add.additional_price_total || add.price || '';
          if (addPrice && addPrice !== '0' && addPrice !== 'R$ 0,00' && addPrice !== 'Grátis') {
            lines.push(`* ${addName}\n  ${addQty}x | ${addPrice}`);
          } else {
            lines.push(`${addName}\n${addQty}x | Grátis`);
          }
        }
      }
    }

    // Flavors
    const flavors = item.flavors || [];
    if (Array.isArray(flavors) && flavors.length > 0) {
      lines.push('');
      lines.push('Sabores:');
      for (const f of flavors) {
        const fName = f.name || f.flavor_name || '';
        const fQty = f.amount || f.quantity || 1;
        lines.push(`* ${fName} (${fQty}x)`);
      }
    }

    // Item note
    const note = item.note || item.item_note || '';
    if (note) {
      lines.push(`📝 Obs: ${note}`);
    }
  }

  return lines.join('\n');
}

function jsonResponse(body: Record<string, any>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function resolveProviderConfig(
  supabase: any,
  companyId: string,
  provider: string,
): Promise<{ baseUrl: string; apiKey: string } | null> {
  const { data: cfg } = await supabase
    .from('whatsapp_api_configs')
    .select('base_url, api_key, is_active')
    .eq('company_id', companyId)
    .eq('provider', provider)
    .maybeSingle();
  if (cfg?.is_active && cfg.base_url) {
    return { baseUrl: cfg.base_url.replace(/\/+$/, ''), apiKey: cfg.api_key || '' };
  }
  if (provider === 'evolution') {
    const { data: legacy } = await supabase
      .from('evolution_api_config')
      .select('base_url, api_key, is_active')
      .eq('company_id', companyId)
      .maybeSingle();
    if (legacy?.is_active && legacy.base_url) {
      return { baseUrl: legacy.base_url.replace(/\/+$/, ''), apiKey: legacy.api_key || '' };
    }
  }
  return null;
}

async function wppGenerateTokenLocal(baseUrl: string, secretKey: string, session: string): Promise<string | null> {
  try {
    const r = await fetch(`${baseUrl}/api/${encodeURIComponent(session)}/${encodeURIComponent(secretKey)}/generate-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
  const provider = instance.provider || 'evolution';
  const cfg = await resolveProviderConfig(supabase, instance.company_id, provider);
  if (!cfg) {
    return { ok: false, status: 400, response: { error: `Provider '${provider}' não configurado ou inativo` }, endpoint: '', provider };
  }
  const { baseUrl, apiKey } = cfg;
  const phoneDigits = phone.replace(/\D/g, '');
  try {
    if (provider === 'evolution') {
      const evoName = instance.evolution_instance_id || instance.name;
      const url = `${baseUrl}/message/sendText/${evoName}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: apiKey },
        body: JSON.stringify({ number: phoneDigits, text }),
      });
      const data = await res.json().catch(() => ({ status: res.status }));
      return { ok: res.ok, status: res.status, response: data, endpoint: url, provider };
    }
    if (provider === 'evolution_go') {
      const instanceToken = instance.provider_instance_id || '';
      if (!instanceToken) return { ok: false, status: 400, response: { error: 'Token Evolution Go ausente' }, endpoint: '', provider };
      const url = `${baseUrl}/send/text`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: instanceToken },
        body: JSON.stringify({ number: phoneDigits, text }),
      });
      const data = await res.json().catch(() => ({ status: res.status }));
      return { ok: res.ok, status: res.status, response: data, endpoint: url, provider };
    }
    if (provider === 'wuzapi') {
      const userToken = instance.provider_instance_id || '';
      if (!userToken) return { ok: false, status: 400, response: { error: 'Token Wuzapi ausente' }, endpoint: '', provider };
      const url = `${baseUrl}/chat/send/text`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Token: userToken },
        body: JSON.stringify({ Phone: phoneDigits, Body: text }),
      });
      const data = await res.json().catch(() => ({ status: res.status }));
      return { ok: res.ok, status: res.status, response: data, endpoint: url, provider };
    }
    if (provider === 'wppconnect') {
      const session = instance.name;
      const sessionToken = await wppGenerateTokenLocal(baseUrl, apiKey, session);
      if (!sessionToken) return { ok: false, status: 401, response: { error: 'WPPConnect: falha ao gerar token de sessão' }, endpoint: '', provider };
      const url = `${baseUrl}/api/${encodeURIComponent(session)}/send-message`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify({ phone: phoneDigits, isGroup: false, isNewsletter: false, isLid: false, message: text }),
      });
      const data = await res.json().catch(() => ({ status: res.status }));
      return { ok: res.ok, status: res.status, response: data, endpoint: url, provider };
    }
    if (provider === 'quepasa') {
      const sessionToken = instance.provider_instance_id || apiKey;
      const url = `${baseUrl}/send`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-QUEPASA-TOKEN': sessionToken,
          'X-QUEPASA-CHATID': phoneDigits.includes('@') ? phoneDigits : `${phoneDigits}@s.whatsapp.net`,
          'X-QUEPASA-TRACKID': instance.name,
        },
        body: JSON.stringify({ text }),
      });
      const data = await res.json().catch(() => ({ status: res.status }));
      return { ok: res.ok, status: res.status, response: data, endpoint: url, provider };
    }
    return { ok: false, status: 400, response: { error: `Provider desconhecido: ${provider}` }, endpoint: '', provider };
  } catch (err: any) {
    return { ok: false, status: 500, response: { error: err.message }, endpoint: '', provider };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const startTime = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body = await req.json().catch(() => ({}));
    const url = new URL(req.url);
    const queryInstanceId = url.searchParams.get('instance_id') || url.searchParams.get('token');

    let action = body.action;
    if (!action) {
      if (body.status || body.order_code || body.order_id || body.customer_phone || body.customer?.phone) {
        action = 'order_status_updated';
      } else if (body.phone && body.message && !body.order_code) {
        action = 'test';
      }
    }

    const resolvedInstanceId = queryInstanceId || body.instance_id || body.token;

    console.log(`[delivery-whatsapp] action="${action}" instance_id="${resolvedInstanceId}" at ${new Date().toISOString()}`);
    console.log(`[delivery-whatsapp] Full payload:`, JSON.stringify(body));

    // ============================================================
    // ACTION: health
    // ============================================================
    if (action === 'health') {
      return jsonResponse({ status: 'ok', timestamp: new Date().toISOString() });
    }

    // ============================================================
    // ACTION: order_status_updated / send_status_change
    // ============================================================
    if (action === 'order_status_updated' || action === 'send_status_change') {
      const status = body.status || body.status_key || '';
      const statusKey = body.status_key || body.status || '';
      const statusLabel = body.status_label || body.status || '';
      const orderId = body.order_id || '';
      const orderCode = body.order_code || '';

      const customerName = body.customer_name || body.client_name || body.customer?.name || body.order_data?.customer_name || '';
      const customerPhone = body.customer_phone || body.client_phone || body.phone
        || body.customer?.phone || body.order_data?.customer_phone_number || '';

      const storeName = body.store_name || body.store?.name || body.order_data?.store_name || '';
      const externalMessage = body.message || '';

      console.log(`[delivery-whatsapp] Parsed: order=${orderCode}, status=${status}, phone=${customerPhone}, customer=${customerName}`);

      if (!customerPhone) {
        return jsonResponse({ error: 'customer_phone is required', received_fields: Object.keys(body) }, 400);
      }

      if (!resolvedInstanceId) {
        return jsonResponse({ error: 'instance_id is required', received_fields: Object.keys(body) }, 400);
      }

      const { data: instance, error: instErr } = await supabase
        .from('instances')
        .select('id, name, company_id, provider, provider_instance_id, evolution_instance_id, status')
        .eq('id', resolvedInstanceId)
        .single();

      if (instErr || !instance) {
        return jsonResponse({ error: 'Instance not found', instance_id: resolvedInstanceId }, 404);
      }

      const normalizedPhone = normalizePhone(customerPhone);
      const eventKey = `status_${statusKey || 'unknown'}`;

      // Get message template for this status
      const { data: tmpl } = await supabase
        .from('delivery_message_templates')
        .select('*')
        .eq('company_id', instance.company_id)
        .eq('event_key', eventKey)
        .single();

      // Fallback to status_templates
      let statusTmpl = null;
      if (!tmpl) {
        const { data: st } = await supabase
          .from('status_templates')
          .select('*')
          .eq('company_id', instance.company_id)
          .ilike('name', `%${statusLabel}%`)
          .limit(1)
          .maybeSingle();
        statusTmpl = st;
      }

      // Build formatted items text
      const itemsRaw = body.items || body.order_data?.items || body.order_data?.items_text || '';
      const orderItemsFormatted = formatOrderItems(itemsRaw);

      // Delivery / pickup texts
      const deliveryType = body.delivery_type || body.order_data?.delivery_type || '';
      const deliveryAddress = body.delivery_address || body.address || body.order_data?.address || body.order_data?.delivery_details || '';
      const isPickup = deliveryType.toLowerCase().includes('retirada') || deliveryType === '0' || deliveryType.toLowerCase().includes('pickup');

      let deliveryOrPickupText = '';
      if (isPickup) {
        deliveryOrPickupText = '🏪 O cliente fará a retirada no local.';
      } else if (deliveryAddress) {
        deliveryOrPickupText = `🛵 Entrega em:\n${deliveryAddress}`;
      }

      let deliveryReadyText = '';
      if (isPickup) {
        deliveryReadyText = '🏪 Seu pedido está pronto para retirada no local!';
      } else {
        deliveryReadyText = '🛵 Seu pedido está pronto e em breve sairá para entrega!';
      }

      // Resolve subtotal / total
      const orderTotal = body.total || body.order_total || body.order_data?.total || body.order_data?.order_price_total || '';
      const orderSubtotal = body.subtotal || body.order_subtotal || body.order_data?.subtotal || body.order_data?.order_price_order || orderTotal;
      const paymentMethod = body.payment_method || body.order_data?.payment_method || body.order_data?.order_payment_method || '';

      // Date / time
      const dateCreated = body.date_created_order || body.order_data?.date_created_order || '';
      const timeCreated = body.time_created_order || body.order_data?.time_created_order || '';

      // Order link
      const orderLink = body.order_link || body.order_data?.order_link || '';

      // Build template data with all supported variables
      const templateData: Record<string, any> = {
        // Core
        order_id: orderId,
        order_code: orderCode,
        order_link: orderLink,
        status,
        status_key: statusKey,
        status_label: statusLabel,

        // Client
        customer_name: customerName,
        client_name: customerName,
        customer_phone: customerPhone,
        client_phone: customerPhone,
        customer_phone_number: customerPhone,

        // Store
        store_name: storeName,

        // Items
        items: itemsRaw,
        order_items_formatted: orderItemsFormatted,
        items_text: body.order_data?.items_text || orderItemsFormatted,

        // Values
        total: orderTotal,
        order_total: orderTotal,
        order_price_total: orderTotal,
        subtotal: orderSubtotal,
        order_subtotal: orderSubtotal,
        order_price_order: orderSubtotal,
        order_price_delivery: body.order_data?.order_price_delivery || body.delivery_fee || '',
        order_price_discount: body.order_data?.order_price_discount || body.discount || '',
        payment_method: paymentMethod,
        order_payment_method: paymentMethod,

        // Delivery
        delivery_type: deliveryType,
        delivery_address: deliveryAddress,
        delivery_details: deliveryAddress,
        address: deliveryAddress,
        delivery_or_pickup_text: deliveryOrPickupText,
        delivery_ready_text: deliveryReadyText,

        // Date/time
        date_created_order: dateCreated,
        time_created_order: timeCreated,
        datetime_now: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),

        // Notes
        notes: body.notes || body.order_data?.notes || body.order_data?.order_note || '',
        order_note: body.order_data?.order_note || body.notes || '',

        // Extra data from order_data
        ...(body.order_data || {}),
      };

      // Build rendered message
      let renderedMessage = '';
      let messageSource = '';

      if (tmpl?.is_enabled && tmpl.message_template) {
        renderedMessage = processTemplate(tmpl.message_template, templateData);
        messageSource = `delivery_message_template (event: ${eventKey})`;
      } else if (statusTmpl?.message) {
        renderedMessage = processTemplate(statusTmpl.message, templateData);
        messageSource = `status_template (${statusTmpl.name})`;
      } else if (externalMessage) {
        renderedMessage = processTemplate(externalMessage, templateData);
        messageSource = 'external message from payload';
      } else {
        // Use rich default template
        const defaultTmpl = getDefaultStatusTemplate(statusKey);
        if (defaultTmpl) {
          renderedMessage = processTemplate(defaultTmpl, templateData);
          messageSource = `default_rich_template (status: ${statusKey})`;
        } else {
          renderedMessage = `Atualização do pedido ${orderCode || orderId || ''}: ${statusLabel || status || 'atualizado'}`;
          messageSource = 'fallback default message';
        }
      }

      console.log(`[delivery-whatsapp] Message source: ${messageSource}`);
      console.log(`[delivery-whatsapp] Rendered (${renderedMessage.length} chars): ${renderedMessage.substring(0, 300)}`);

      // Send via Evolution API
      const evoInstanceName = instance.evolution_instance_id || instance.name;
      const evoBaseUrl = evoConfig.base_url.replace(/\/+$/, '');
      const sendUrl = `${evoBaseUrl}/message/sendText/${evoInstanceName}`;
      const sendPayload = { number: normalizedPhone, text: renderedMessage };

      console.log(`[delivery-whatsapp] POST ${sendUrl}`);

      let apiResponse: any = null;
      let sendStatus = 'sent';
      let sendError: string | null = null;

      try {
        const res = await fetch(sendUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': evoConfig.api_key },
          body: JSON.stringify(sendPayload),
        });
        apiResponse = await res.json().catch(() => ({ status: res.status, statusText: res.statusText }));
        if (!res.ok) {
          sendStatus = 'failed';
          sendError = `Evolution API HTTP ${res.status}: ${JSON.stringify(apiResponse)}`;
          console.error(`[delivery-whatsapp] SEND FAILED: ${sendError}`);
        } else {
          console.log(`[delivery-whatsapp] SEND SUCCESS`);
        }
      } catch (err: any) {
        sendStatus = 'failed';
        sendError = `Network error: ${err.message}`;
        console.error(`[delivery-whatsapp] SEND EXCEPTION:`, err.message);
      }

      // Log
      const logPayload = {
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
          payload_sent: sendPayload,
          original_payload: body,
          elapsed_ms: Date.now() - startTime,
        },
      };

      const { error: logErr } = await supabase.from('delivery_send_logs').insert(logPayload);
      if (logErr) console.error(`[delivery-whatsapp] Log save error:`, logErr.message);

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
    // ACTION: test
    // ============================================================
    if (action === 'test') {
      const phone = body.phone || body.customer_phone;
      const testMessage = body.message;

      if (!resolvedInstanceId || !phone) {
        return jsonResponse({ error: 'instance_id and phone are required' }, 400);
      }

      const { data: instance } = await supabase
        .from('instances')
        .select('name, company_id, evolution_instance_id')
        .eq('id', resolvedInstanceId)
        .single();

      if (!instance) {
        return jsonResponse({ error: 'Instance not found' }, 404);
      }

      const { data: evoConfig } = await supabase
        .from('evolution_api_config')
        .select('base_url, api_key, is_active')
        .eq('company_id', instance.company_id)
        .single();

      if (!evoConfig?.is_active) {
        return jsonResponse({ error: 'Evolution API not configured' }, 400);
      }

      const evoBaseUrl = evoConfig.base_url.replace(/\/+$/, '');
      const evoInstanceName = instance.evolution_instance_id || instance.name;
      const normalizedPhone = normalizePhone(phone);

      try {
        const res = await fetch(`${evoBaseUrl}/message/sendText/${evoInstanceName}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': evoConfig.api_key },
          body: JSON.stringify({
            number: normalizedPhone,
            text: testMessage || '✅ Teste de integração WhatsApp - Delivery',
          }),
        });
        const data = await res.json().catch(() => ({ status: res.status }));
        return jsonResponse({ success: res.ok, response: data });
      } catch (err: any) {
        return jsonResponse({ success: false, error: err.message }, 500);
      }
    }

    // ============================================================
    // No action detected
    // ============================================================
    return jsonResponse({
      error: 'Could not determine action from payload',
      hint: 'Send: status, customer_phone, and instance_id',
      valid_actions: ['order_status_updated', 'send_status_change', 'test', 'health'],
      received_fields: Object.keys(body),
    }, 400);

  } catch (err: any) {
    console.error(`[delivery-whatsapp] Fatal error:`, err.message, err.stack);
    return new Response(JSON.stringify({ error: err.message, stack: err.stack }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
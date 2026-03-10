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

  // Process foreach blocks
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

  // Process conditionals
  result = result.replace(/\$\{if_(\w+)\}([\s\S]*?)\$\{endif_\1\}/g, (_, key, content) => {
    return data[key] ? content : '';
  });

  // Replace ${var} style variables
  result = result.replace(/\$\{(\w+)\}/g, (_, key) => String(data[key] ?? ''));

  // Replace {{var}} style variables
  result = result.replace(/\{\{(\w+)\}\}/g, (_, key) => String(data[key] ?? ''));

  return result.trim();
}

function jsonResponse(body: Record<string, any>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const startTime = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Parse body
    const body = await req.json().catch(() => ({}));

    // Extract instance_id from query params OR body
    const url = new URL(req.url);
    const queryInstanceId = url.searchParams.get('instance_id') || url.searchParams.get('token');

    // Determine action - auto-detect if not provided
    let action = body.action;
    if (!action) {
      // Auto-detect: if payload has status/order fields, treat as order webhook
      if (body.status || body.order_code || body.order_id || body.customer_phone || body.customer?.phone) {
        action = 'order_status_updated';
      } else if (body.phone && body.message && !body.order_code) {
        action = 'test';
      }
    }

    // Resolve instance_id: query param > body.instance_id > body.token
    const resolvedInstanceId = queryInstanceId || body.instance_id || body.token;

    console.log(`[delivery-whatsapp] Received action="${action}" instance_id="${resolvedInstanceId}" at ${new Date().toISOString()}`);
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
      // Extract fields - support both flat and nested formats
      const status = body.status || body.status_key || '';
      const statusKey = body.status_key || body.status || '';
      const statusLabel = body.status_label || body.status || '';
      const orderId = body.order_id || '';
      const orderCode = body.order_code || '';

      // Customer: support flat (customer_name, customer_phone) AND nested (customer.name, customer.phone)
      const customerName = body.customer_name || body.customer?.name || body.order_data?.customer_name || '';
      const customerPhone = body.customer_phone || body.client_phone || body.phone
        || body.customer?.phone || body.order_data?.customer_phone_number || '';

      const storeName = body.store_name || body.store?.name || body.order_data?.store_name || '';
      const externalMessage = body.message || '';

      console.log(`[delivery-whatsapp] Parsed: order=${orderCode}, status=${status}, phone=${customerPhone}, customer=${customerName}`);

      // Validate required fields
      if (!customerPhone) {
        console.error('[delivery-whatsapp] VALIDATION ERROR: No customer phone provided');
        return jsonResponse({
          error: 'customer_phone is required',
          hint: 'Send customer_phone at root level or nested in customer.phone',
          received_fields: Object.keys(body),
        }, 400);
      }

      if (!resolvedInstanceId) {
        console.error('[delivery-whatsapp] VALIDATION ERROR: No instance_id provided');
        return jsonResponse({
          error: 'instance_id is required',
          hint: 'Send instance_id in the body OR as a query parameter: ?instance_id=YOUR_UUID',
          received_fields: Object.keys(body),
        }, 400);
      }

      // Look up instance
      const { data: instance, error: instErr } = await supabase
        .from('instances')
        .select('id, name, company_id, evolution_instance_id, status')
        .eq('id', resolvedInstanceId)
        .single();

      if (instErr || !instance) {
        console.error(`[delivery-whatsapp] Instance not found: ${resolvedInstanceId}`, instErr?.message);
        return jsonResponse({
          error: 'Instance not found',
          instance_id: resolvedInstanceId,
          detail: instErr?.message || 'No instance with this ID',
        }, 404);
      }

      console.log(`[delivery-whatsapp] Instance found: ${instance.name} (company: ${instance.company_id}, status: ${instance.status})`);

      // Get Evolution API config
      const { data: evoConfig } = await supabase
        .from('evolution_api_config')
        .select('base_url, api_key, is_active')
        .eq('company_id', instance.company_id)
        .single();

      if (!evoConfig?.is_active || !evoConfig.base_url || !evoConfig.api_key) {
        console.error('[delivery-whatsapp] Evolution API not configured or inactive for company:', instance.company_id);

        // Log the failure
        await supabase.from('delivery_send_logs').insert({
          company_id: instance.company_id,
          order_code: orderCode,
          event_key: `status_${statusKey}`,
          phone: customerPhone,
          message: null,
          status: 'failed',
          error: 'Evolution API not configured or inactive',
          api_response: { received_payload: body },
        });

        return jsonResponse({ error: 'Evolution API not configured or inactive' }, 400);
      }

      const normalizedPhone = normalizePhone(customerPhone);
      const eventKey = `status_${statusKey || 'unknown'}`;
      console.log(`[delivery-whatsapp] Processing event: ${eventKey}, normalized phone: ${normalizedPhone}`);

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

      // Build template data
      const templateData: Record<string, any> = {
        order_id: orderId,
        order_code: orderCode,
        order_link: body.order_link || body.order_data?.order_link || '',
        status,
        status_key: statusKey,
        status_label: statusLabel,
        customer_name: customerName,
        customer_phone: customerPhone,
        store_name: storeName,
        total: body.total || body.order_data?.total || body.order_data?.order_price_total || '',
        payment_method: body.payment_method || body.order_data?.payment_method || '',
        delivery_type: body.delivery_type || body.order_data?.delivery_type || '',
        address: body.address || body.order_data?.address || body.order_data?.delivery_details || '',
        items: body.items || body.order_data?.items_text || '',
        notes: body.notes || body.order_data?.notes || body.order_data?.order_note || '',
        datetime_now: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
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
        renderedMessage = `Atualização do pedido ${orderCode || orderId || ''}: ${statusLabel || status || 'atualizado'}`;
        messageSource = 'fallback default message';
      }

      console.log(`[delivery-whatsapp] Message source: ${messageSource}`);
      console.log(`[delivery-whatsapp] Rendered message (${renderedMessage.length} chars): ${renderedMessage.substring(0, 200)}`);

      // Send via Evolution API
      const evoInstanceName = instance.evolution_instance_id || instance.name;
      const evoBaseUrl = evoConfig.base_url.replace(/\/+$/, '');
      const sendUrl = `${evoBaseUrl}/message/sendText/${evoInstanceName}`;
      const sendPayload = { number: normalizedPhone, text: renderedMessage };

      console.log(`[delivery-whatsapp] Sending POST to: ${sendUrl}`);
      console.log(`[delivery-whatsapp] Send payload:`, JSON.stringify(sendPayload));

      let apiResponse: any = null;
      let sendStatus = 'sent';
      let sendError: string | null = null;

      try {
        const res = await fetch(sendUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': evoConfig.api_key,
          },
          body: JSON.stringify(sendPayload),
        });

        apiResponse = await res.json().catch(() => ({ status: res.status, statusText: res.statusText }));

        if (!res.ok) {
          sendStatus = 'failed';
          sendError = `Evolution API HTTP ${res.status}: ${JSON.stringify(apiResponse)}`;
          console.error(`[delivery-whatsapp] SEND FAILED: ${sendError}`);
        } else {
          console.log(`[delivery-whatsapp] SEND SUCCESS! Response:`, JSON.stringify(apiResponse));
        }
      } catch (err: any) {
        sendStatus = 'failed';
        sendError = `Network error: ${err.message}`;
        console.error(`[delivery-whatsapp] SEND EXCEPTION:`, err.message, err.stack);
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
        return jsonResponse({
          error: 'instance_id and phone are required',
          hint: 'Use ?instance_id=UUID in the URL and send phone in body',
        }, 400);
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
    console.error(`[delivery-whatsapp] Could not determine action from payload. Fields: ${Object.keys(body).join(', ')}`);
    return jsonResponse({
      error: 'Could not determine action from payload',
      hint: 'Send at minimum: status, customer_phone, and instance_id (in body or as ?instance_id=UUID query param)',
      valid_actions: ['order_status_updated', 'send_status_change', 'test', 'health'],
      received_fields: Object.keys(body),
      example_payload: {
        order_code: 'PED-123',
        status: 'accepted',
        status_label: 'Aceito',
        customer_name: 'João',
        customer_phone: '5521999999999',
        message: 'Seu pedido PED-123 foi aceito!',
      },
      example_url: 'https://rmswpurvnqqayemvuocv.supabase.co/functions/v1/delivery-whatsapp?instance_id=YOUR_INSTANCE_UUID',
    }, 400);

  } catch (err: any) {
    console.error(`[delivery-whatsapp] Fatal error:`, err.message, err.stack);
    return new Response(JSON.stringify({ error: err.message, stack: err.stack }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

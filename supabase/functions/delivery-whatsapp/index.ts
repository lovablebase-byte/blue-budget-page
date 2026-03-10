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

  // Replace {{var}} style variables (common in user templates)
  result = result.replace(/\{\{(\w+)\}\}/g, (_, key) => String(data[key] ?? ''));

  return result.trim();
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
    const { action, instance_id } = body;

    console.log(`[delivery-whatsapp] Received action="${action}" instance_id="${instance_id}" at ${new Date().toISOString()}`);

    // ============================================================
    // ACTION: order_status_updated / send_status_change
    // ============================================================
    if (action === 'order_status_updated' || action === 'send_status_change') {
      const {
        status, status_key, status_label,
        order_id, order_code,
        customer, order_data,
        store, message: externalMessage,
      } = body;

      // Resolve instance
      const resolvedInstanceId = instance_id || body.token;
      if (!resolvedInstanceId) {
        console.error('[delivery-whatsapp] No instance_id or token provided');
        return new Response(JSON.stringify({ error: 'instance_id or token is required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Look up instance
      const { data: instance, error: instErr } = await supabase
        .from('instances')
        .select('id, name, company_id, evolution_instance_id, status')
        .eq('id', resolvedInstanceId)
        .single();

      if (instErr || !instance) {
        console.error(`[delivery-whatsapp] Instance not found: ${resolvedInstanceId}`, instErr);
        return new Response(JSON.stringify({ error: 'Instance not found', instance_id: resolvedInstanceId }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log(`[delivery-whatsapp] Found instance: ${instance.name} (company: ${instance.company_id})`);

      // Get Evolution API config
      const { data: evoConfig } = await supabase
        .from('evolution_api_config')
        .select('base_url, api_key, is_active')
        .eq('company_id', instance.company_id)
        .single();

      if (!evoConfig?.is_active || !evoConfig.base_url || !evoConfig.api_key) {
        console.error('[delivery-whatsapp] Evolution API not configured or inactive');
        return new Response(JSON.stringify({ error: 'Evolution API not configured or inactive' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Get customer phone
      const customerPhone = customer?.phone || order_data?.customer_phone_number || body.client_phone || body.phone;
      if (!customerPhone) {
        console.error('[delivery-whatsapp] No customer phone number provided');
        await supabase.from('delivery_send_logs').insert({
          company_id: instance.company_id,
          order_code: order_code || order_data?.order_code || '',
          event_key: `status_${status_key || status || 'unknown'}`,
          phone: '',
          message: null,
          status: 'failed',
          error: 'No customer phone number provided',
          api_response: body,
        });
        return new Response(JSON.stringify({ error: 'Customer phone number is required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const normalizedPhone = normalizePhone(customerPhone);
      const eventKey = `status_${status_key || status || 'unknown'}`;
      console.log(`[delivery-whatsapp] Processing event: ${eventKey}, phone: ${normalizedPhone}`);

      // Get message template for this status
      const { data: tmpl } = await supabase
        .from('delivery_message_templates')
        .select('*')
        .eq('company_id', instance.company_id)
        .eq('event_key', eventKey)
        .single();

      // Also try status_templates as fallback
      let statusTmpl = null;
      if (!tmpl) {
        const statusName = status_label || status_key || status || '';
        const { data: st } = await supabase
          .from('status_templates')
          .select('*')
          .eq('company_id', instance.company_id)
          .ilike('name', `%${statusName}%`)
          .limit(1)
          .maybeSingle();
        statusTmpl = st;
      }

      // Build message
      const templateData = {
        order_id: order_id || '',
        order_code: order_code || '',
        order_link: body.order_link || order_data?.order_link || '',
        status: status || '',
        status_key: status_key || '',
        status_label: status_label || status || '',
        customer_name: customer?.name || order_data?.customer_name || '',
        customer_phone: customerPhone,
        customer_phone_number: customerPhone,
        store_name: store?.name || order_data?.store_name || '',
        total: order_data?.total || order_data?.order_price_total || '',
        order_price_total: order_data?.order_price_total || order_data?.total || '',
        order_price_order: order_data?.order_price_order || '',
        order_price_delivery: order_data?.order_price_delivery || '',
        payment_method: order_data?.payment_method || order_data?.order_payment_method || '',
        order_payment_method: order_data?.order_payment_method || order_data?.payment_method || '',
        delivery_type: order_data?.delivery_type || '',
        address: order_data?.address || order_data?.delivery_details || '',
        delivery_details: order_data?.delivery_details || order_data?.address || '',
        items: order_data?.items_text || (order_data?.items ? JSON.stringify(order_data.items) : ''),
        notes: order_data?.notes || order_data?.order_note || '',
        order_note: order_data?.order_note || order_data?.notes || '',
        datetime_now: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        date_created_order: order_data?.date_created_order || '',
        time_created_order: order_data?.time_created_order || '',
        employee_name: order_data?.employee_name || '',
        ...order_data,
      };

      let renderedMessage = '';
      if (tmpl?.is_enabled && tmpl.message_template) {
        renderedMessage = processTemplate(tmpl.message_template, templateData);
        console.log(`[delivery-whatsapp] Using delivery_message_template for event: ${eventKey}`);
      } else if (statusTmpl?.message) {
        renderedMessage = processTemplate(statusTmpl.message, templateData);
        console.log(`[delivery-whatsapp] Using status_template fallback: ${statusTmpl.name}`);
      } else if (externalMessage) {
        renderedMessage = processTemplate(externalMessage, templateData);
        console.log(`[delivery-whatsapp] Using external message from payload`);
      } else {
        renderedMessage = `Atualização do pedido ${order_code || order_id || ''}: ${status_label || status || 'atualizado'}`;
        console.log(`[delivery-whatsapp] Using fallback message`);
      }

      // Send via Evolution API
      const evoInstanceName = instance.evolution_instance_id || instance.name;
      const evoBaseUrl = evoConfig.base_url.replace(/\/+$/, '');
      const sendUrl = `${evoBaseUrl}/message/sendText/${evoInstanceName}`;
      let apiResponse: any = null;
      let sendStatus = 'sent';
      let sendError: string | null = null;

      console.log(`[delivery-whatsapp] Sending to ${sendUrl} | phone: ${normalizedPhone} | message length: ${renderedMessage.length}`);

      try {
        const res = await fetch(sendUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': evoConfig.api_key,
          },
          body: JSON.stringify({
            number: normalizedPhone,
            text: renderedMessage,
          }),
        });
        apiResponse = await res.json().catch(() => ({ status: res.status }));
        if (!res.ok) {
          sendStatus = 'failed';
          sendError = `Evolution API HTTP ${res.status}: ${JSON.stringify(apiResponse)}`;
          console.error(`[delivery-whatsapp] Send failed:`, sendError);
        } else {
          console.log(`[delivery-whatsapp] Message sent successfully!`);
        }
      } catch (err: any) {
        sendStatus = 'failed';
        sendError = err.message;
        console.error(`[delivery-whatsapp] Send exception:`, err.message);
      }

      // Log the send attempt
      const logPayload = {
        company_id: instance.company_id,
        order_code: order_code || order_data?.order_code || '',
        event_key: eventKey,
        phone: normalizedPhone,
        message: renderedMessage,
        status: sendStatus,
        api_response: {
          evo_response: apiResponse,
          endpoint_used: sendUrl,
          evo_instance_name: evoInstanceName,
          payload_sent: { number: normalizedPhone, text: renderedMessage },
          original_request: {
            order_id, order_code, status, status_key, status_label,
            customer_name: customer?.name,
            store_name: store?.name,
          },
          elapsed_ms: Date.now() - startTime,
        },
        error: sendError,
      };

      const { error: logErr } = await supabase.from('delivery_send_logs').insert(logPayload);
      if (logErr) console.error(`[delivery-whatsapp] Failed to save log:`, logErr);

      return new Response(JSON.stringify({
        status: sendStatus,
        error: sendError,
        message_sent: renderedMessage,
        phone: normalizedPhone,
        event_key: eventKey,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ============================================================
    // ACTION: test
    // ============================================================
    if (action === 'test') {
      const { phone, message: testMessage } = body;
      const resolvedInstanceId = instance_id || body.token;

      if (!resolvedInstanceId || !phone) {
        return new Response(JSON.stringify({ error: 'instance_id and phone required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { data: instance } = await supabase
        .from('instances')
        .select('name, company_id, evolution_instance_id')
        .eq('id', resolvedInstanceId)
        .single();

      if (!instance) {
        return new Response(JSON.stringify({ error: 'Instance not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { data: evoConfig } = await supabase
        .from('evolution_api_config')
        .select('base_url, api_key, is_active')
        .eq('company_id', instance.company_id)
        .single();

      if (!evoConfig?.is_active) {
        return new Response(JSON.stringify({ error: 'Evolution API not configured' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const evoBaseUrl = evoConfig.base_url.replace(/\/+$/, '');
      const evoInstanceName = instance.evolution_instance_id || instance.name;

      try {
        const res = await fetch(`${evoBaseUrl}/message/sendText/${evoInstanceName}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': evoConfig.api_key,
          },
          body: JSON.stringify({
            number: normalizePhone(phone),
            text: testMessage || '✅ Teste de integração WhatsApp - Delivery',
          }),
        });
        const data = await res.json().catch(() => ({ status: res.status }));
        return new Response(JSON.stringify({ success: res.ok, response: data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ============================================================
    // ACTION: health - check if function is alive
    // ============================================================
    if (action === 'health') {
      return new Response(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.error(`[delivery-whatsapp] Unknown action: ${action}`);
    return new Response(JSON.stringify({
      error: 'Unknown action',
      valid_actions: ['order_status_updated', 'send_status_change', 'test', 'health'],
      received: action,
    }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error(`[delivery-whatsapp] Fatal error:`, err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

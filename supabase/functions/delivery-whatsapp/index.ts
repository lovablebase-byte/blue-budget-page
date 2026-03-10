import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Template engine: interpolate variables, conditionals, and foreach blocks
function processTemplate(template: string, data: Record<string, any>): string {
  let result = template;

  // 1. Process foreach blocks: ${foreach_item} ... ${endforeach_item}
  result = result.replace(/\$\{foreach_item\}([\s\S]*?)\$\{endforeach_item\}/g, (_, block) => {
    const items = data.items || [];
    return items.map((item: any) => {
      let itemBlock = block;
      itemBlock = itemBlock.replace(/\$\{item_name\}/g, item.name || '');
      itemBlock = itemBlock.replace(/\$\{item_description\}/g, item.description || '');
      itemBlock = itemBlock.replace(/\$\{item_quantity\}/g, String(item.quantity || ''));
      itemBlock = itemBlock.replace(/\$\{item_price\}/g, item.price || '');
      itemBlock = itemBlock.replace(/\$\{item_size_name\}/g, item.size_name || '');
      itemBlock = itemBlock.replace(/\$\{item_note\}/g, item.note || '');
      itemBlock = itemBlock.replace(/\$\{item_flavor_name\}/g, item.flavor_name || '');
      itemBlock = itemBlock.replace(/\$\{item_flavor_amount\}/g, String(item.flavor_amount || ''));

      itemBlock = processConditional(itemBlock, 'if_item_size', !!item.size_name);
      itemBlock = processConditional(itemBlock, 'if_item_note', !!item.note);
      itemBlock = processConditional(itemBlock, 'if_item_flavors', !!(item.flavors && item.flavors.length > 0));
      itemBlock = processConditional(itemBlock, 'if_item_additionals', !!(item.additionals && item.additionals.length > 0));

      if (item.additionals && item.additionals.length > 0) {
        itemBlock = itemBlock.replace(/\$\{additional_category_name\}/g, item.additional_category_name || '');
        itemBlock = itemBlock.replace(/\$\{foreach_additional\}([\s\S]*?)\$\{endforeach_additional\}/g, (_, addBlock) => {
          return (item.additionals || []).map((add: any) => {
            let a = addBlock;
            a = a.replace(/\$\{additional_name\}/g, add.name || '');
            a = a.replace(/\$\{additional_amount\}/g, String(add.amount || ''));
            a = a.replace(/\$\{additional_price_total\}/g, add.price_total || '');
            return a;
          }).join('');
        });
      }
      return itemBlock;
    }).join('');
  });

  // 2. Process conditionals
  const conditionals = [
    ['if_datetime_date_created_order', !!data.date_created_order],
    ['if_datetime_schedule_order', !!data.date_schedule_order],
    ['if_employee', !!data.employee_name],
    ['if_customer', !!data.customer_name],
    ['if_order_note', !!data.order_note],
    ['if_delivery_type_0', data.delivery_type === 0 || !!data.order_price_delivery],
    ['if_card_rate', !!data.order_card_rate],
    ['if_waiter_rate', !!data.order_waiter_rate],
    ['if_coin', !!data.order_coin],
    ['if_price_discount', !!data.order_price_discount],
    ['if_coupon', !!data.order_coupons],
    ['if_exchanged', !!data.order_exchanged],
  ];

  for (const [key, condition] of conditionals) {
    result = processConditional(result, key as string, condition as boolean);
  }

  // 3. Replace simple variables
  const vars: Record<string, string> = {
    order_code: data.order_code || '',
    order_link: data.order_link || '',
    date_created_order: data.date_created_order || '',
    time_created_order: data.time_created_order || '',
    date_schedule_order: data.date_schedule_order || '',
    time_schedule_order: data.time_schedule_order || '',
    employee_name: data.employee_name || '',
    customer_name: data.customer_name || '',
    customer_phone_number: data.customer_phone_number || '',
    order_note: data.order_note || '',
    delivery_details: data.delivery_details || '',
    order_price_order: data.order_price_order || '',
    order_price_delivery: data.order_price_delivery || '',
    order_card_rate: data.order_card_rate || '',
    order_price_total: data.order_price_total || '',
    order_waiter_rate: data.order_waiter_rate || '',
    order_coin: data.order_coin || '',
    order_price_discount: data.order_price_discount || '',
    order_coupons: data.order_coupons || '',
    order_exchanged: data.order_exchanged || '',
    order_exchanged_value: data.order_exchanged_value || '',
    order_payment_method: data.order_payment_method || '',
    store_name: data.store_name || '',
    status_label: data.status_label || '',
  };

  for (const [k, v] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\$\\{${k}\\}`, 'g'), v);
  }

  return result.trim();
}

function processConditional(text: string, key: string, condition: boolean): string {
  const regex = new RegExp(`\\$\\{${key}\\}([\\s\\S]*?)\\$\\{end${key}\\}`, 'g');
  return text.replace(regex, (_, content) => condition ? content : '');
}

function normalizePhone(phone: string, countryPrefix = '55'): string {
  const digits = phone.replace(/\D/g, '');
  // If it doesn't start with the country prefix and has 10-11 digits (BR format), add prefix
  if (!digits.startsWith(countryPrefix) && digits.length >= 10 && digits.length <= 11) {
    return countryPrefix + digits;
  }
  return digits;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body = await req.json().catch(() => ({}));
    const { action, instance_id, company_id } = body;

    // ============================================================
    // ACTION: order_status_updated
    // Called by external delivery systems when order status changes.
    // Sends WhatsApp message via Evolution API using instance config.
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
        return new Response(JSON.stringify({ error: 'Instance not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Get Evolution API config for the company
      const { data: evoConfig } = await supabase
        .from('evolution_api_config')
        .select('base_url, api_key, is_active')
        .eq('company_id', instance.company_id)
        .single();

      if (!evoConfig?.is_active || !evoConfig.base_url || !evoConfig.api_key) {
        return new Response(JSON.stringify({ error: 'Evolution API not configured or inactive' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Get customer phone
      const customerPhone = customer?.phone || order_data?.customer_phone_number || body.client_phone || body.phone;
      if (!customerPhone) {
        // Log the attempt without phone
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

      // Get message template for this status
      const { data: tmpl } = await supabase
        .from('delivery_message_templates')
        .select('*')
        .eq('company_id', instance.company_id)
        .eq('event_key', eventKey)
        .single();

      // Build message: use template if available, otherwise use external message
      let renderedMessage = '';
      if (tmpl?.is_enabled && tmpl.message_template) {
        // Merge all order data for template rendering
        const templateData = {
          order_code: order_code || '',
          order_id: order_id || '',
          status_label: status_label || status || '',
          customer_name: customer?.name || '',
          customer_phone_number: customerPhone,
          store_name: store?.name || '',
          ...order_data,
        };
        renderedMessage = processTemplate(tmpl.message_template, templateData);
      } else if (externalMessage) {
        renderedMessage = externalMessage;
      } else {
        // Fallback message
        renderedMessage = `Atualização do pedido ${order_code || ''}: ${status_label || status || 'atualizado'}`;
      }

      // Send via Evolution API
      const evoInstanceName = instance.evolution_instance_id || instance.name;
      const evoBaseUrl = evoConfig.base_url.replace(/\/+$/, '');
      let apiResponse: any = null;
      let sendStatus = 'sent';
      let sendError: string | null = null;

      try {
        const res = await fetch(`${evoBaseUrl}/message/sendText/${evoInstanceName}`, {
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
        }
      } catch (err: any) {
        sendStatus = 'failed';
        sendError = err.message;
      }

      // Log the send attempt
      await supabase.from('delivery_send_logs').insert({
        company_id: instance.company_id,
        order_code: order_code || order_data?.order_code || '',
        event_key: eventKey,
        phone: normalizedPhone,
        message: renderedMessage,
        status: sendStatus,
        api_response: {
          evo_response: apiResponse,
          endpoint_used: `${evoBaseUrl}/message/sendText/${evoInstanceName}`,
          payload_sent: { number: normalizedPhone, text: renderedMessage },
          original_request: {
            order_id, order_code, status, status_key, status_label,
            customer_name: customer?.name,
            store_name: store?.name,
          },
        },
        error: sendError,
      });

      return new Response(JSON.stringify({
        status: sendStatus,
        error: sendError,
        message_sent: renderedMessage,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ============================================================
    // ACTION: send - generic send for a specific event (legacy support)
    // ============================================================
    if (action === 'send') {
      const { event_key, phone, order_data, order_code } = body;

      if (!company_id || !event_key || !phone) {
        return new Response(JSON.stringify({ error: 'company_id, event_key, and phone required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Resolve instance for this company (use first active one or specified)
      let evoInstanceName = '';
      let evoBaseUrl = '';
      let evoApiKey = '';

      const { data: evoConfig } = await supabase
        .from('evolution_api_config')
        .select('base_url, api_key, is_active')
        .eq('company_id', company_id)
        .single();

      if (!evoConfig?.is_active) {
        return new Response(JSON.stringify({ error: 'Evolution API not configured' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      evoBaseUrl = evoConfig.base_url.replace(/\/+$/, '');
      evoApiKey = evoConfig.api_key;

      // Get an active instance for this company
      if (instance_id) {
        const { data: inst } = await supabase
          .from('instances')
          .select('name, evolution_instance_id')
          .eq('id', instance_id)
          .single();
        evoInstanceName = inst?.evolution_instance_id || inst?.name || '';
      } else {
        const { data: inst } = await supabase
          .from('instances')
          .select('name, evolution_instance_id')
          .eq('company_id', company_id)
          .eq('status', 'online')
          .limit(1)
          .single();
        evoInstanceName = inst?.evolution_instance_id || inst?.name || '';
      }

      if (!evoInstanceName) {
        return new Response(JSON.stringify({ error: 'No active instance found' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Get template
      const { data: tmpl } = await supabase
        .from('delivery_message_templates')
        .select('*')
        .eq('company_id', company_id)
        .eq('event_key', event_key)
        .single();

      if (!tmpl?.is_enabled || !tmpl.message_template) {
        return new Response(JSON.stringify({ error: 'No template configured for this event' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const message = processTemplate(tmpl.message_template, order_data || {});
      const normalizedPhone = normalizePhone(phone);

      let apiResponse: any = null;
      let sendStatus = 'sent';
      let sendError: string | null = null;

      try {
        const res = await fetch(`${evoBaseUrl}/message/sendText/${evoInstanceName}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': evoApiKey,
          },
          body: JSON.stringify({ number: normalizedPhone, text: message }),
        });
        apiResponse = await res.json().catch(() => ({ status: res.status }));
        if (!res.ok) {
          sendStatus = 'failed';
          sendError = `Evolution API HTTP ${res.status}: ${JSON.stringify(apiResponse)}`;
        }
      } catch (err: any) {
        sendStatus = 'failed';
        sendError = err.message;
      }

      await supabase.from('delivery_send_logs').insert({
        company_id,
        order_code: order_code || order_data?.order_code || '',
        event_key,
        phone: normalizedPhone,
        message,
        status: sendStatus,
        api_response: apiResponse,
        error: sendError,
      });

      return new Response(JSON.stringify({ status: sendStatus, error: sendError }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ============================================================
    // ACTION: send_new_order - send to both store and client
    // ============================================================
    if (action === 'send_new_order') {
      const { order_data, store_phone, client_phone, order_code } = body;

      if (!company_id) {
        return new Response(JSON.stringify({ error: 'company_id required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const results: any[] = [];

      if (store_phone) {
        const storeRes = await fetch(req.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'send', company_id, instance_id, event_key: 'new_order_store',
            phone: store_phone, order_data, order_code,
          }),
        });
        results.push({ target: 'store', ...(await storeRes.json()) });
      }

      if (client_phone) {
        const clientRes = await fetch(req.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'send', company_id, instance_id, event_key: 'new_order_client',
            phone: client_phone, order_data, order_code,
          }),
        });
        results.push({ target: 'client', ...(await clientRes.json()) });
      }

      return new Response(JSON.stringify({ results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ============================================================
    // ACTION: test - test sending a message
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

    return new Response(JSON.stringify({ error: 'Unknown action. Valid actions: order_status_updated, send, send_new_order, test' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

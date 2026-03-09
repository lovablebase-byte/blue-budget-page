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
      // Replace item variables
      itemBlock = itemBlock.replace(/\$\{item_name\}/g, item.name || '');
      itemBlock = itemBlock.replace(/\$\{item_description\}/g, item.description || '');
      itemBlock = itemBlock.replace(/\$\{item_quantity\}/g, String(item.quantity || ''));
      itemBlock = itemBlock.replace(/\$\{item_price\}/g, item.price || '');
      itemBlock = itemBlock.replace(/\$\{item_size_name\}/g, item.size_name || '');
      itemBlock = itemBlock.replace(/\$\{item_note\}/g, item.note || '');
      itemBlock = itemBlock.replace(/\$\{item_flavor_name\}/g, item.flavor_name || '');
      itemBlock = itemBlock.replace(/\$\{item_flavor_amount\}/g, String(item.flavor_amount || ''));

      // Item conditionals
      itemBlock = processConditional(itemBlock, 'if_item_size', !!item.size_name);
      itemBlock = processConditional(itemBlock, 'if_item_note', !!item.note);
      itemBlock = processConditional(itemBlock, 'if_item_flavors', !!(item.flavors && item.flavors.length > 0));

      // Item additionals
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

function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body = await req.json().catch(() => ({}));
    const { action, company_id } = body;

    // ACTION: send - send a message for a specific event
    if (action === 'send') {
      const { event_key, phone, order_data, order_code } = body;

      if (!company_id || !event_key || !phone) {
        return new Response(JSON.stringify({ error: 'company_id, event_key, and phone required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (!isValidPhone(phone)) {
        return new Response(JSON.stringify({ error: 'Invalid phone number' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Get config
      const { data: config } = await supabase
        .from('delivery_whatsapp_config')
        .select('*')
        .eq('company_id', company_id)
        .single();

      if (!config?.is_enabled || !config.endpoint_url) {
        return new Response(JSON.stringify({ error: 'WhatsApp integration disabled or no endpoint' }), {
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

      // Process template
      const message = processTemplate(tmpl.message_template, order_data || {});

      // Send via endpoint
      let apiResponse: any = null;
      let sendStatus = 'sent';
      let sendError: string | null = null;

      try {
        const res = await fetch(config.endpoint_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ number: phone.replace(/\D/g, ''), text: message }),
        });
        apiResponse = await res.json().catch(() => ({ status: res.status }));
        if (!res.ok) {
          sendStatus = 'failed';
          sendError = `HTTP ${res.status}: ${JSON.stringify(apiResponse)}`;
        }
      } catch (err: any) {
        sendStatus = 'failed';
        sendError = err.message;
      }

      // Log
      await supabase.from('delivery_send_logs').insert({
        company_id,
        order_code: order_code || order_data?.order_code || '',
        event_key,
        phone,
        message,
        status: sendStatus,
        api_response: apiResponse,
        error: sendError,
      });

      return new Response(JSON.stringify({ status: sendStatus, error: sendError }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ACTION: send_new_order - convenience to send both store and client messages
    if (action === 'send_new_order') {
      const { order_data, store_phone, client_phone, order_code } = body;

      if (!company_id) {
        return new Response(JSON.stringify({ error: 'company_id required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const results: any[] = [];

      // Send to store
      if (store_phone && isValidPhone(store_phone)) {
        const storeRes = await fetch(req.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'send', company_id, event_key: 'new_order_store',
            phone: store_phone, order_data, order_code,
          }),
        });
        results.push({ target: 'store', ...(await storeRes.json()) });
      }

      // Send to client
      if (client_phone && isValidPhone(client_phone)) {
        const clientRes = await fetch(req.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'send', company_id, event_key: 'new_order_client',
            phone: client_phone, order_data, order_code,
          }),
        });
        results.push({ target: 'client', ...(await clientRes.json()) });
      }

      return new Response(JSON.stringify({ results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ACTION: send_status_change
    if (action === 'send_status_change') {
      const { status_key, client_phone, order_data, order_code } = body;

      if (!company_id || !status_key || !client_phone) {
        return new Response(JSON.stringify({ error: 'company_id, status_key, client_phone required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Reuse send action
      const event_key = `status_${status_key}`;
      const sendRes = await fetch(req.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send', company_id, event_key,
          phone: client_phone, order_data, order_code,
        }),
      });
      const result = await sendRes.json();

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ACTION: test - test endpoint with a simple message
    if (action === 'test') {
      const { endpoint_url, phone, message } = body;

      if (!endpoint_url || !phone) {
        return new Response(JSON.stringify({ error: 'endpoint_url and phone required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      try {
        const res = await fetch(endpoint_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            number: phone.replace(/\D/g, ''),
            text: message || '✅ Teste de integração WhatsApp - Delivery',
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

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

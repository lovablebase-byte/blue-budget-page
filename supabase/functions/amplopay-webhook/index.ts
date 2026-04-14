import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Parse body
    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate webhook secret from query params
    const url = new URL(req.url);
    const secret = url.searchParams.get("secret");

    // Get gateway config to validate secret
    const { data: gateway } = await supabase
      .from("payment_gateways")
      .select("config")
      .eq("provider", "amplopay")
      .limit(1)
      .single();

    const config = (gateway?.config || {}) as Record<string, any>;
    const expectedSecret = config.webhook_secret || "";

    if (expectedSecret && secret !== expectedSecret) {
      console.warn("[amplopay-webhook] Invalid secret");
      return new Response(
        JSON.stringify({ status: "ignored", reason: "invalid_secret" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("[amplopay-webhook] Received event:", JSON.stringify(body).substring(0, 500));

    // Extract event info — adapt field names to actual Amplo Pay payload
    const eventType = body?.event || body?.type || body?.action || "unknown";
    const externalId =
      body?.charge_id ||
      body?.data?.charge_id ||
      body?.data?.id ||
      body?.id ||
      null;
    const paymentStatus =
      body?.status ||
      body?.data?.status ||
      null;

    // Idempotency check: look for existing event with same external_id and event_type
    if (externalId) {
      const { data: existing } = await supabase
        .from("payment_events")
        .select("id")
        .eq("external_id", externalId)
        .eq("event_type", eventType)
        .limit(1)
        .single();

      if (existing) {
        console.log("[amplopay-webhook] Duplicate event ignored:", externalId);
        return new Response(
          JSON.stringify({ status: "ok", reason: "duplicate" }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // Find matching charge
    let charge: any = null;
    if (externalId) {
      const { data } = await supabase
        .from("payment_charges")
        .select("*")
        .eq("external_id", externalId)
        .limit(1)
        .single();
      charge = data;
    }

    // Persist event
    const { error: insertErr } = await supabase.from("payment_events").insert({
      charge_id: charge?.id || null,
      external_id: externalId,
      event_type: eventType,
      payload: body,
      result: "received",
      received_at: new Date().toISOString(),
    });

    if (insertErr) {
      console.error("[amplopay-webhook] Insert event error:", insertErr.message);
    }

    // Process payment confirmation
    const isPaid =
      paymentStatus === "paid" ||
      paymentStatus === "approved" ||
      paymentStatus === "confirmed" ||
      eventType === "payment.confirmed" ||
      eventType === "charge.paid";

    if (isPaid && charge) {
      // Update charge status
      await supabase
        .from("payment_charges")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
        })
        .eq("id", charge.id);

      // Activate subscription
      if (charge.subscription_id) {
        await supabase
          .from("subscriptions")
          .update({
            status: "active",
            started_at: new Date().toISOString(),
          })
          .eq("id", charge.subscription_id);

        console.log(
          "[amplopay-webhook] Subscription activated:",
          charge.subscription_id
        );
      }

      // Update event result
      await supabase
        .from("payment_events")
        .update({
          result: "processed",
          processed_at: new Date().toISOString(),
        })
        .eq("external_id", externalId)
        .eq("event_type", eventType);
    }

    return new Response(
      JSON.stringify({ status: "ok", event_type: eventType }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("[amplopay-webhook] ERROR:", error.message);
    return new Response(
      JSON.stringify({ status: "error", message: error.message }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

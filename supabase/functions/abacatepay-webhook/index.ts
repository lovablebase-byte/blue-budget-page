// AbacatePay webhook — Pix-only
// Aceita notificações da AbacatePay, garante idempotência por id do pagamento,
// e ativa plano apenas para eventos de pagamento aprovado.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret, x-abacatepay-signature",
};

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonRes({ error: "Method not allowed" }, 405);

  const svc = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const url = new URL(req.url);
    const headerSecret = req.headers.get("x-webhook-secret") || "";
    const querySecret = url.searchParams.get("webhookSecret") || url.searchParams.get("secret") || "";

    const { data: gateway } = await svc
      .from("payment_gateways")
      .select("*")
      .eq("provider", "abacatepay")
      .limit(1)
      .maybeSingle();

    const cfg = (gateway?.config || {}) as Record<string, any>;
    const expectedSecret = (cfg.webhook_secret || "").trim();

    // Validação de secret obrigatória se configurado
    if (expectedSecret) {
      const provided = headerSecret || querySecret;
      if (provided !== expectedSecret) {
        await svc.from("payment_events").insert({
          gateway: "abacatepay",
          event_type: "auth_failure",
          payload: { reason: "secret_mismatch" },
          result: "failure",
          processed: true,
          processed_at: new Date().toISOString(),
        });
        return jsonRes({ error: "Invalid webhook secret" }, 401);
      }
    }

    const payload = await req.json().catch(() => ({}));

    // AbacatePay envia eventos com formato: { event, data: {...} }
    const eventType =
      payload?.event ||
      payload?.event_type ||
      payload?.type ||
      "payment.notification";

    const data = payload?.data || payload || {};
    const metadata = data?.metadata || {};

    const paymentId = data?.id || data?.payment_id || data?.transaction_id || null;
    const subscriptionId = metadata?.subscription_id || null;
    const externalRef = metadata?.external_reference || null;

    const status = (data?.status || "").toString().toLowerCase();
    const isPaid =
      status === "paid" ||
      status === "approved" ||
      status === "completed" ||
      eventType === "transparent.completed" ||
      eventType === "checkout.completed" ||
      eventType === "billing.paid" ||
      eventType === "payment.paid";

    const isRejected =
      status === "expired" ||
      status === "cancelled" ||
      status === "canceled" ||
      status === "failed" ||
      status === "rejected";

    const captureMethod = (data?.method || data?.payment_method || "pix").toString().toLowerCase();
    const isPix = captureMethod === "pix";

    const rawEventId = paymentId || crypto.randomUUID();

    // Idempotência: já processado?
    const { data: existing } = await svc
      .from("payment_events")
      .select("id, result")
      .eq("gateway", "abacatepay")
      .eq("raw_event_id", String(rawEventId))
      .eq("result", "processed")
      .limit(1)
      .maybeSingle();

    if (existing) {
      await svc.from("payment_events").insert({
        gateway: "abacatepay",
        event_type: eventType,
        external_id: paymentId ? String(paymentId) : null,
        raw_event_id: String(rawEventId),
        payload,
        result: "duplicate",
        processed: true,
        processed_at: new Date().toISOString(),
      });
      return jsonRes({ ok: true, duplicate: true });
    }

    // Localiza cobrança por gateway_payment_id (preferência) ou external_reference
    let charge: any = null;
    if (paymentId) {
      const { data: c } = await svc
        .from("payment_charges")
        .select("*")
        .eq("gateway", "abacatepay")
        .eq("gateway_payment_id", String(paymentId))
        .maybeSingle();
      charge = c;
    }
    if (!charge && externalRef) {
      const { data: c } = await svc
        .from("payment_charges")
        .select("*")
        .eq("gateway", "abacatepay")
        .eq("external_reference", externalRef)
        .maybeSingle();
      charge = c;
    }
    if (!charge && subscriptionId) {
      const { data: c } = await svc
        .from("payment_charges")
        .select("*")
        .eq("gateway", "abacatepay")
        .eq("subscription_id", subscriptionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      charge = c;
    }

    if (!charge) {
      await svc.from("payment_events").insert({
        gateway: "abacatepay",
        event_type: eventType,
        external_id: paymentId ? String(paymentId) : null,
        raw_event_id: String(rawEventId),
        payload,
        result: "received",
        processed: true,
        processed_at: new Date().toISOString(),
      });
      return jsonRes({ ok: true, charge_found: false });
    }

    // Registra evento bruto
    const { data: insertedEvent } = await svc.from("payment_events").insert({
      gateway: "abacatepay",
      event_type: eventType,
      external_id: paymentId ? String(paymentId) : null,
      charge_id: charge.id,
      raw_event_id: String(rawEventId),
      payload,
      result: "received",
    }).select().single();

    const wasPaidBefore = charge.status === "paid";

    // Pago + Pix → ativa plano
    if (isPaid && isPix && !wasPaidBefore) {
      await svc.from("payment_charges").update({
        status: "paid",
        paid_at: new Date().toISOString(),
        capture_method: "pix",
        status_detail: status || "paid",
        raw_response: payload,
      }).eq("id", charge.id);

      if (charge.subscription_id) {
        const { data: confirmRes } = await svc.rpc("confirm_pending_plan_change", {
          _subscription_id: charge.subscription_id,
        });
        if (!confirmRes || (confirmRes as any).success === false) {
          const now = new Date();
          const next = new Date(now); next.setMonth(next.getMonth() + 1);
          await svc.from("subscriptions").update({
            status: "active",
            started_at: now.toISOString(),
            expires_at: next.toISOString(),
            canceled_at: null,
            suspended_at: null,
          }).eq("id", charge.subscription_id);
        }
      }

      if (insertedEvent) {
        await svc.from("payment_events").update({
          result: "processed",
          processed: true,
          processed_at: new Date().toISOString(),
        }).eq("id", insertedEvent.id);
      }

      return jsonRes({ ok: true, charge_id: charge.id, status: "paid", capture_method: "pix" });
    }

    // Pago mas não Pix → não ativa
    if (isPaid && !isPix) {
      if (insertedEvent) {
        await svc.from("payment_events").update({
          result: "value_mismatch",
          processed: true,
          processed_at: new Date().toISOString(),
        }).eq("id", insertedEvent.id);
      }
      return jsonRes({
        ok: true,
        charge_id: charge.id,
        status: charge.status,
        warning: "Pagamento recebido com método diferente de Pix. Ativação manual necessária.",
        capture_method: captureMethod,
      });
    }

    // Cancelado/expirado → marca cobrança
    if (isRejected && !wasPaidBefore) {
      await svc.from("payment_charges").update({
        status: "rejected",
        status_detail: status,
        raw_response: payload,
      }).eq("id", charge.id);

      if (insertedEvent) {
        await svc.from("payment_events").update({
          result: "rejected",
          processed: true,
          processed_at: new Date().toISOString(),
        }).eq("id", insertedEvent.id);
      }
      return jsonRes({ ok: true, charge_id: charge.id, status: "rejected" });
    }

    // Pendente / outro → apenas marca como recebido
    if (insertedEvent) {
      await svc.from("payment_events").update({
        result: "received",
        processed: true,
        processed_at: new Date().toISOString(),
      }).eq("id", insertedEvent.id);
    }

    return jsonRes({ ok: true, charge_id: charge.id, status: charge.status });
  } catch (error: any) {
    console.error("[abacatepay-webhook] ERROR:", error.message);
    await svc.from("payment_events").insert({
      gateway: "abacatepay",
      event_type: "processing_error",
      payload: { error: error.message },
      result: "error",
      processed: true,
      processed_at: new Date().toISOString(),
    });
    return jsonRes({ error: error.message }, 500);
  }
});

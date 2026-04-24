import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Webhook receiver Amplo Pay — PDF seção 6.4 e 7
 *
 * Fluxo:
 * 1. Recepção + parse do payload
 * 2. Validação de autenticidade (webhook_secret via header ou query)
 * 3. Idempotência (external_id + event_type)
 * 4. Vínculo com payment_charges
 * 5. Conciliação de valor (PDF seção 7.2)
 * 6. Atualização de assinatura
 * 7. Auditoria
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonRes({ error: "Method not allowed" }, 405);
  }

  const svc = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    /* ── 1. Parse body ── */
    let body: any;
    try {
      body = await req.json();
    } catch {
      return jsonRes({ error: "Invalid JSON" }, 400);
    }

    /* ── 2. Validação de autenticidade (PDF seção 7 — etapa Autenticidade) ── */
    const url = new URL(req.url);
    // Aceitar secret via header OU query param
    const secret = req.headers.get("x-webhook-secret") || url.searchParams.get("secret");

    const { data: gateway } = await svc
      .from("payment_gateways")
      .select("config")
      .eq("provider", "amplopay")
      .limit(1)
      .single();

    const config = (gateway?.config || {}) as Record<string, any>;
    const expectedSecret = config.webhook_secret || "";

    if (expectedSecret && secret !== expectedSecret) {
      console.warn("[amplopay-webhook] Invalid secret received");
      await svc.from("payment_events").insert({
        event_type: "auth_failure",
        payload: { reason: "invalid_secret", body_excerpt: JSON.stringify(body).substring(0, 200) },
        result: "rejected",
        received_at: new Date().toISOString(),
        processed_at: new Date().toISOString(),
      });
      return jsonRes({ status: "ignored", reason: "invalid_secret" });
    }

    console.log("[amplopay-webhook] Received:", JSON.stringify(body).substring(0, 500));

    /* ── 3. Extrair dados do evento ── */
    const eventType = body?.event || body?.type || body?.action || "unknown";
    const externalId =
      body?.charge_id || body?.data?.charge_id || body?.data?.id || body?.id || null;
    const paymentStatus = body?.status || body?.data?.status || null;
    const paidAmount = body?.amount || body?.data?.amount || body?.data?.amount_cents || null;

    /* ── 4. Idempotência (PDF seção 7.1) ── */
    if (externalId) {
      const { data: existing } = await svc
        .from("payment_events")
        .select("id")
        .eq("external_id", externalId)
        .eq("event_type", eventType)
        .eq("result", "processed")
        .limit(1)
        .maybeSingle();

      if (existing) {
        console.log("[amplopay-webhook] Duplicate event ignored:", externalId, eventType);
        return jsonRes({ status: "ok", reason: "duplicate" });
      }
    }

    /* ── 5. Localizar cobrança interna ── */
    let charge: any = null;
    if (externalId) {
      const { data } = await svc
        .from("payment_charges")
        .select("*")
        .eq("external_id", externalId)
        .limit(1)
        .maybeSingle();
      charge = data;
    }

    /* ── 6. Persistir evento bruto ── */
    const { data: eventRow } = await svc.from("payment_events").insert({
      charge_id: charge?.id || null,
      external_id: externalId,
      event_type: eventType,
      payload: body,
      result: "received",
      received_at: new Date().toISOString(),
    }).select("id").single();

    const eventId = eventRow?.id;

    /* ── 7. Processar confirmação de pagamento ── */
    const isPaid =
      paymentStatus === "paid" ||
      paymentStatus === "approved" ||
      paymentStatus === "confirmed" ||
      eventType === "payment.confirmed" ||
      eventType === "charge.paid";

    if (isPaid && charge) {
      // Conciliação de valor (PDF seção 7.2)
      if (paidAmount && charge.amount_cents && paidAmount !== charge.amount_cents) {
        console.warn(
          `[amplopay-webhook] Divergência de valor: esperado=${charge.amount_cents}, recebido=${paidAmount}`
        );
        await svc.from("payment_events").update({
          result: "value_mismatch",
          processed_at: new Date().toISOString(),
        }).eq("id", eventId);

        // Mesmo com divergência, registrar mas NÃO ativar assinatura automaticamente
        return jsonRes({ status: "ok", warning: "value_mismatch", event_type: eventType });
      }

      // Atualizar cobrança para paga
      await svc
        .from("payment_charges")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("id", charge.id);

      // Ativar/renovar assinatura (PDF seção 5.4)
      if (charge.subscription_id) {
        const now = new Date();
        const nextMonth = new Date(now);
        nextMonth.setMonth(nextMonth.getMonth() + 1);

        await svc
          .from("subscriptions")
          .update({
            status: "active",
            started_at: now.toISOString(),
            expires_at: nextMonth.toISOString(),
            canceled_at: null,
            suspended_at: null,
          })
          .eq("id", charge.subscription_id);

        console.log("[amplopay-webhook] Subscription activated:", charge.subscription_id);
      }

      // Marcar evento como processado
      await svc.from("payment_events").update({
        result: "processed",
        processed_at: new Date().toISOString(),
      }).eq("id", eventId);
    }

    return jsonRes({ status: "ok", event_type: eventType });
  } catch (error: any) {
    console.error("[amplopay-webhook] ERROR:", error.message);

    // Registrar falha
    try {
      await svc.from("payment_events").insert({
        event_type: "processing_error",
        payload: { error: error.message },
        result: "error",
        received_at: new Date().toISOString(),
        processed_at: new Date().toISOString(),
      });
    } catch {}

    return jsonRes({ status: "error", message: error.message });
  }
});

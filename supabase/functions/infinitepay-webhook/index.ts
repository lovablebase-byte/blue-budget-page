// InfinitePay webhook — Pix-only
// Aceita notificações da InfinitePay, garante idempotência por transaction_nsu/order_nsu,
// valida capture_method=pix antes de ativar plano. Outros métodos são apenas registrados.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret",
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
    // Validação opcional do webhook secret (header ou query)
    const url = new URL(req.url);
    const headerSecret = req.headers.get("x-webhook-secret") || "";
    const querySecret = url.searchParams.get("secret") || "";

    const { data: gateway } = await svc
      .from("payment_gateways")
      .select("*")
      .eq("provider", "infinitepay")
      .limit(1)
      .maybeSingle();

    const cfg = (gateway?.config || {}) as Record<string, any>;
    const expectedSecret = (cfg.webhook_secret || "").trim();

    if (expectedSecret) {
      const provided = headerSecret || querySecret;
      if (provided !== expectedSecret) {
        await svc.from("payment_events").insert({
          gateway: "infinitepay",
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

    // Campos esperados (InfinitePay envia variações conforme evento)
    const eventType =
      payload?.event ||
      payload?.event_type ||
      payload?.type ||
      "payment.notification";

    const orderNsu =
      payload?.order_nsu ||
      payload?.data?.order_nsu ||
      payload?.invoice?.order_nsu ||
      null;

    const transactionNsu =
      payload?.transaction_nsu ||
      payload?.nsu ||
      payload?.data?.transaction_nsu ||
      null;

    const invoiceSlug =
      payload?.invoice_slug ||
      payload?.slug ||
      payload?.data?.slug ||
      null;

    const captureMethod = (
      payload?.capture_method ||
      payload?.payment_method ||
      payload?.data?.capture_method ||
      ""
    ).toString().toLowerCase();

    const paid =
      payload?.paid === true ||
      payload?.success === true ||
      payload?.status === "paid" ||
      payload?.status === "approved";

    const receiptUrl = payload?.receipt_url || payload?.data?.receipt_url || null;

    const rawEventId = transactionNsu || orderNsu || invoiceSlug || crypto.randomUUID();

    // Idempotência: já processado?
    const { data: existing } = await svc
      .from("payment_events")
      .select("id, result")
      .eq("gateway", "infinitepay")
      .eq("raw_event_id", rawEventId)
      .eq("result", "processed")
      .limit(1)
      .maybeSingle();

    if (existing) {
      await svc.from("payment_events").insert({
        gateway: "infinitepay",
        event_type: eventType,
        external_id: orderNsu || transactionNsu,
        raw_event_id: rawEventId,
        payload,
        result: "duplicate",
        processed: true,
        processed_at: new Date().toISOString(),
      });
      return jsonRes({ ok: true, duplicate: true });
    }

    // Localiza cobrança por order_nsu (preferência) ou transaction_nsu / invoice_slug
    let charge: any = null;
    if (orderNsu) {
      const { data } = await svc
        .from("payment_charges")
        .select("*")
        .eq("order_nsu", orderNsu)
        .maybeSingle();
      charge = data;
    }
    if (!charge && invoiceSlug) {
      const { data } = await svc
        .from("payment_charges")
        .select("*")
        .eq("invoice_slug", invoiceSlug)
        .maybeSingle();
      charge = data;
    }
    if (!charge && transactionNsu) {
      const { data } = await svc
        .from("payment_charges")
        .select("*")
        .eq("transaction_nsu", transactionNsu)
        .maybeSingle();
      charge = data;
    }

    if (!charge) {
      await svc.from("payment_events").insert({
        gateway: "infinitepay",
        event_type: eventType,
        external_id: orderNsu || transactionNsu,
        raw_event_id: rawEventId,
        payload,
        result: "received",
        processed: true,
        processed_at: new Date().toISOString(),
      });
      return jsonRes({ ok: true, charge_found: false });
    }

    // Registra evento bruto antes de processar
    const { data: insertedEvent } = await svc.from("payment_events").insert({
      gateway: "infinitepay",
      event_type: eventType,
      external_id: orderNsu || transactionNsu,
      charge_id: charge.id,
      raw_event_id: rawEventId,
      payload,
      result: "received",
    }).select().single();

    // Pix-only: só ativa se capture_method = pix (ou ausente — fallback conservador
    // SOMENTE quando o registro original já é Pix por construção)
    const isPix = captureMethod === "pix" || (!captureMethod && charge.payment_method === "pix");
    const wasPaidBefore = charge.status === "paid";

    if (paid && isPix && !wasPaidBefore) {
      await svc.from("payment_charges").update({
        status: "paid",
        paid_at: new Date().toISOString(),
        capture_method: captureMethod || "pix",
        transaction_nsu: transactionNsu,
        receipt_url: receiptUrl || charge.receipt_url,
        raw_response: payload,
      }).eq("id", charge.id);

      // Marca fatura associada (se houver) como paga
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

    // Pago mas NÃO é Pix → registra como divergência, não ativa plano
    if (paid && !isPix) {
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
    console.error("[infinitepay-webhook] ERROR:", error.message);
    await svc.from("payment_events").insert({
      gateway: "infinitepay",
      event_type: "processing_error",
      payload: { error: error.message },
      result: "error",
      processed: true,
      processed_at: new Date().toISOString(),
    });
    return jsonRes({ error: error.message }, 500);
  }
});

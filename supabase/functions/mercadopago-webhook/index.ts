// Mercado Pago webhook — recebe notificações, busca pagamento real, ativa plano se aprovado.
// Idempotente via UNIQUE(gateway, raw_event_id) em payment_events.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-signature, x-request-id",
};

const MP_BASE = "https://api.mercadopago.com";

function ok(body: unknown = { received: true }) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const svc = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let raw: any = null;
  try { raw = await req.json(); } catch { raw = {}; }
  const url = new URL(req.url);
  const queryType = url.searchParams.get("type") || url.searchParams.get("topic");
  const queryId = url.searchParams.get("id") || url.searchParams.get("data.id");

  // Carrega gateway
  const { data: gateway } = await svc
    .from("payment_gateways")
    .select("*")
    .eq("provider", "mercadopago")
    .maybeSingle();

  if (!gateway) {
    return ok({ received: true, ignored: "gateway_not_configured" });
  }

  const config = (gateway.config || {}) as Record<string, any>;
  const accessToken = config.access_token || "";

  // Identifica tipo + payment id
  const eventType = raw?.type || raw?.action || queryType || "unknown";
  const paymentId = raw?.data?.id || raw?.resource || queryId || null;
  // raw_event_id estável para idempotência
  const rawEventId = String(raw?.id || `${eventType}:${paymentId || crypto.randomUUID()}`);

  // Tenta inserir o evento (UNIQUE evita duplicatas)
  const { error: insertEvtErr } = await svc.from("payment_events").insert({
    gateway: "mercadopago",
    event_type: eventType,
    external_id: paymentId ? String(paymentId) : null,
    raw_event_id: rawEventId,
    payload: raw,
    result: "received",
    processed: false,
    received_at: new Date().toISOString(),
  });

  if (insertEvtErr && !String(insertEvtErr.message).includes("duplicate")) {
    console.error("[mp-webhook] insert event error:", insertEvtErr.message);
  }
  if (insertEvtErr && String(insertEvtErr.message).includes("duplicate")) {
    return ok({ received: true, idempotent: true });
  }

  // Só processamos eventos de pagamento
  if (!paymentId || !accessToken) {
    return ok({ received: true, skipped: "no_payment_id_or_token" });
  }

  if (!String(eventType).includes("payment")) {
    return ok({ received: true, skipped: "non_payment_event", type: eventType });
  }

  try {
    // Busca real na API (não confia no payload)
    const resp = await fetch(`${MP_BASE}/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!resp.ok) {
      await svc.from("payment_events").update({
        result: "error",
        processed: true,
        processed_at: new Date().toISOString(),
        payload: { ...raw, fetch_error: resp.status },
      }).eq("gateway", "mercadopago").eq("raw_event_id", rawEventId);
      return ok({ received: true, error: "fetch_failed", status: resp.status });
    }

    const payment = await resp.json();
    const mpStatus = payment?.status; // approved | pending | in_process | rejected | cancelled | refunded | charged_back
    const statusDetail = payment?.status_detail || null;
    const externalRef = payment?.external_reference || null;

    // Busca a charge (por gateway_payment_id ou external_reference)
    let { data: charge } = await svc
      .from("payment_charges")
      .select("*")
      .eq("gateway", "mercadopago")
      .eq("gateway_payment_id", String(paymentId))
      .maybeSingle();

    if (!charge && externalRef) {
      const found = await svc
        .from("payment_charges")
        .select("*")
        .eq("gateway", "mercadopago")
        .eq("external_reference", externalRef)
        .maybeSingle();
      charge = found.data;
    }

    const newStatus =
      mpStatus === "approved" ? "paid" :
      mpStatus === "rejected" || mpStatus === "cancelled" ? "rejected" :
      mpStatus === "refunded" || mpStatus === "charged_back" ? "refunded" :
      "pending";

    if (charge) {
      const update: Record<string, any> = {
        status: newStatus,
        status_detail: statusDetail,
        gateway_payment_id: String(paymentId),
        raw_response: payment,
      };
      if (newStatus === "paid" && !charge.paid_at) {
        update.paid_at = new Date().toISOString();
      }
      await svc.from("payment_charges").update(update).eq("id", charge.id);

      // Ativa assinatura se pago
      if (newStatus === "paid" && charge.subscription_id) {
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

      // Atualiza fatura se houver
      if (newStatus === "paid" && charge.subscription_id) {
        await svc.from("invoices").update({
          status: "paid",
          paid_at: new Date().toISOString(),
          gateway: "mercadopago",
          gateway_reference: String(paymentId),
        }).eq("subscription_id", charge.subscription_id).eq("status", "pending");
      }
    }

    await svc.from("payment_events").update({
      result: newStatus === "paid" ? "processed" : newStatus,
      processed: true,
      processed_at: new Date().toISOString(),
      charge_id: charge?.id || null,
      payload: { ...raw, payment_status: mpStatus, status_detail: statusDetail },
    }).eq("gateway", "mercadopago").eq("raw_event_id", rawEventId);

    return ok({ received: true, processed: true, status: newStatus });
  } catch (err: any) {
    console.error("[mp-webhook] ERROR:", err.message);
    await svc.from("payment_events").update({
      result: "error",
      processed: true,
      processed_at: new Date().toISOString(),
    }).eq("gateway", "mercadopago").eq("raw_event_id", rawEventId);
    return ok({ received: true, error: err.message });
  }
});

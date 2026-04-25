// Mercado Pago proxy — Pix avulso por fatura via /v1/payments
// Mantém Amplo Pay intacto. Usa tabelas existentes (payment_charges, payment_events, payment_gateways).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const MP_BASE = "https://api.mercadopago.com";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonRes({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseUser = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !userData?.user) return jsonRes({ error: "Unauthorized" }, 401);

    const svc = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Carrega gateway Mercado Pago
    const { data: gateway } = await svc
      .from("payment_gateways")
      .select("*")
      .eq("provider", "mercadopago")
      .limit(1)
      .maybeSingle();

    if (!gateway) return jsonRes({ error: "Gateway Mercado Pago não configurado" }, 404);

    const config = (gateway.config || {}) as Record<string, any>;
    const accessToken = config.access_token || "";
    const environment = (gateway as any).environment || "production";

    if (!accessToken) return jsonRes({ error: "Access Token do Mercado Pago não configurado" }, 400);

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    const apiHeaders = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };

    const logEvent = (data: Record<string, any>) =>
      svc.from("payment_events").insert({
        gateway: "mercadopago",
        received_at: new Date().toISOString(),
        ...data,
      });

    /* ─────────────── ACTION: test ─────────────── */
    if (action === "test") {
      try {
        // Endpoint leve de validação de credencial
        const resp = await fetch(`${MP_BASE}/users/me`, { method: "GET", headers: apiHeaders });
        const ok = resp.ok;
        let respBody: any = null;
        try { respBody = await resp.json(); } catch { /* noop */ }

        await logEvent({
          event_type: "connection_test",
          payload: { http_status: resp.status, environment, site_id: respBody?.site_id },
          result: ok ? "success" : "failure",
          processed: true,
          processed_at: new Date().toISOString(),
        });

        await svc.from("payment_gateways").update({
          config: {
            ...config,
            last_test_at: new Date().toISOString(),
            last_test_status: ok ? "connected" : "error",
          },
        }).eq("id", gateway.id);

        if (!ok) {
          return jsonRes({
            ok: false,
            provider: "mercadopago",
            status: resp.status === 401 ? "invalid_token" : "error",
            http_status: resp.status,
            error: respBody?.message || "Access Token inválido ou sem permissão",
          });
        }

        return jsonRes({
          ok: true,
          provider: "mercadopago",
          status: "connected",
          environment,
          site_id: respBody?.site_id,
          checked_at: new Date().toISOString(),
        });
      } catch (err: any) {
        await logEvent({
          event_type: "connection_test",
          payload: { error: err.message },
          result: "error",
          processed: true,
          processed_at: new Date().toISOString(),
        });
        return jsonRes({ ok: false, provider: "mercadopago", status: "unreachable", error: err.message });
      }
    }

    /* ─────────────── ACTION: create-charge ─────────────── */
    if (action === "create-charge" && req.method === "POST") {
      const body = await req.json();
      const { subscription_id, company_id, amount_cents, description, expires_at, payer_email, payer_name } = body;

      if (!subscription_id || !amount_cents) {
        return jsonRes({ error: "subscription_id e amount_cents obrigatórios" }, 400);
      }

      // Webhook URL da própria edge function mercadopago-webhook
      const webhookUrl = `${supabaseUrl}/functions/v1/mercadopago-webhook`;

      const externalRef = `sub:${subscription_id}`;
      const idempotencyKey = `${subscription_id}-${Date.now()}-${crypto.randomUUID()}`;

      const payload: Record<string, any> = {
        transaction_amount: Number((amount_cents / 100).toFixed(2)),
        description: description || "Cobrança de assinatura",
        payment_method_id: "pix",
        payer: {
          email: payer_email || userData.user.email || "comprador@example.com",
          first_name: payer_name || (userData.user.email?.split("@")[0]) || "Cliente",
        },
        external_reference: externalRef,
        notification_url: webhookUrl,
      };
      if (expires_at) payload.date_of_expiration = expires_at;

      let resp: Response;
      let respBody: any;
      try {
        resp = await fetch(`${MP_BASE}/v1/payments`, {
          method: "POST",
          headers: { ...apiHeaders, "X-Idempotency-Key": idempotencyKey },
          body: JSON.stringify(payload),
        });
        respBody = await resp.json();
      } catch (err: any) {
        await logEvent({
          event_type: "charge_creation_failed",
          payload: { error: err.message, request: payload },
          result: "error",
          processed: true,
          processed_at: new Date().toISOString(),
        });
        return jsonRes({ ok: false, error: "Falha ao conectar Mercado Pago: " + err.message }, 502);
      }

      const extId = respBody?.id ? String(respBody.id) : null;
      const status = respBody?.status || "pending";
      const statusDetail = respBody?.status_detail || null;

      await logEvent({
        event_type: "charge_created",
        external_id: extId,
        payload: { http_status: resp.status, status, status_detail: statusDetail, request: { ...payload, payer: undefined } },
        result: resp.ok ? "success" : "error",
        processed: true,
        processed_at: new Date().toISOString(),
      });

      if (!resp.ok) {
        return jsonRes({ ok: false, error: "Erro do Mercado Pago", details: respBody }, resp.status);
      }

      const txData = respBody?.point_of_interaction?.transaction_data || {};
      const qrCode = txData.qr_code || null;
      const qrCodeBase64 = txData.qr_code_base64 || null;
      const ticketUrl = txData.ticket_url || null;
      const dateOfExpiration = respBody?.date_of_expiration || expires_at || null;

      const { data: charge, error: insertErr } = await svc
        .from("payment_charges")
        .insert({
          subscription_id,
          company_id,
          gateway: "mercadopago",
          gateway_payment_id: extId,
          external_id: extId,
          external_reference: externalRef,
          amount_cents,
          status: status === "approved" ? "paid" : status === "rejected" ? "rejected" : "pending",
          status_detail: statusDetail,
          qr_code: qrCode,
          qr_code_base64: qrCodeBase64,
          ticket_url: ticketUrl,
          pix_copy_paste: qrCode,
          description,
          expires_at: dateOfExpiration,
          paid_at: status === "approved" ? new Date().toISOString() : null,
          raw_response: respBody,
        })
        .select()
        .single();

      if (insertErr) console.error("[mercadopago-proxy] insert charge:", insertErr.message);

      // Vincula gateway à assinatura
      if (extId) {
        await svc.from("subscriptions")
          .update({ gateway: "mercadopago", gateway_reference: extId })
          .eq("id", subscription_id);
      }

      // Se já veio aprovado (raro com Pix), ativa plano
      if (status === "approved" && subscription_id) {
        await svc.rpc("confirm_pending_plan_change", { _subscription_id: subscription_id });
      }

      return jsonRes({
        ok: true,
        provider: "mercadopago",
        charge_id: charge?.id,
        gateway_payment_id: extId,
        status: charge?.status,
        qr_code: qrCode,
        qr_code_base64: qrCodeBase64,
        pix_copy_paste: qrCode,
        ticket_url: ticketUrl,
        expires_at: dateOfExpiration,
      });
    }

    /* ─────────────── ACTION: query-charge ─────────────── */
    if (action === "query-charge") {
      const chargeId = url.searchParams.get("charge_id");
      if (!chargeId) return jsonRes({ error: "charge_id obrigatório" }, 400);

      const { data: charge } = await svc
        .from("payment_charges")
        .select("*")
        .eq("id", chargeId)
        .maybeSingle();

      if (!charge) return jsonRes({ error: "Cobrança não encontrada" }, 404);

      // Consulta ativa no MP (fallback)
      if (charge.gateway_payment_id && charge.status !== "paid") {
        try {
          const resp = await fetch(`${MP_BASE}/v1/payments/${charge.gateway_payment_id}`, {
            method: "GET",
            headers: apiHeaders,
          });
          if (resp.ok) {
            const body = await resp.json();
            const mpStatus = body?.status || charge.status;
            const newStatus =
              mpStatus === "approved" ? "paid" :
              mpStatus === "rejected" || mpStatus === "cancelled" ? "rejected" :
              mpStatus === "refunded" ? "refunded" :
              "pending";

            if (newStatus !== charge.status) {
              const updateData: Record<string, any> = {
                status: newStatus,
                status_detail: body?.status_detail,
                raw_response: body,
              };
              if (newStatus === "paid" && !charge.paid_at) {
                updateData.paid_at = new Date().toISOString();
              }
              await svc.from("payment_charges").update(updateData).eq("id", charge.id);

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
                await logEvent({
                  event_type: "fallback_reconciliation",
                  external_id: charge.gateway_payment_id,
                  charge_id: charge.id,
                  payload: { mp_status: mpStatus, confirm_result: confirmRes },
                  result: "processed",
                  processed: true,
                  processed_at: new Date().toISOString(),
                });
              }

              charge.status = newStatus;
              charge.paid_at = updateData.paid_at || charge.paid_at;
            }
          }
        } catch { /* mantém estado local */ }
      }

      return jsonRes({
        ok: true,
        provider: "mercadopago",
        charge_id: charge.id,
        gateway_payment_id: charge.gateway_payment_id,
        status: charge.status,
        status_detail: charge.status_detail,
        paid_at: charge.paid_at,
        amount_cents: charge.amount_cents,
        qr_code: charge.qr_code,
        qr_code_base64: charge.qr_code_base64,
        ticket_url: charge.ticket_url,
        pix_copy_paste: charge.pix_copy_paste,
      });
    }

    return jsonRes({ error: "Ação não reconhecida. Use: test, create-charge, query-charge" }, 400);
  } catch (error: any) {
    console.error("[mercadopago-proxy] ERROR:", error.message);
    return jsonRes({ error: error.message }, 500);
  }
});

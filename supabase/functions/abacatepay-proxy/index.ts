// AbacatePay proxy — Pix Transparente via /v2/transparents/create
// Mantém Amplo Pay, Mercado Pago e InfinitePay intactos.
// Usa tabelas existentes (payment_charges, payment_events, payment_gateways).
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

const ABACATE_BASE = "https://api.abacatepay.com/v2";

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

    const { data: gateway } = await svc
      .from("payment_gateways")
      .select("*")
      .eq("provider", "abacatepay")
      .limit(1)
      .maybeSingle();

    if (!gateway) return jsonRes({ error: "Gateway AbacatePay não configurado" }, 404);

    const config = (gateway.config || {}) as Record<string, any>;
    const apiKey = (config.api_key || "").trim();
    const baseUrl = (config.base_url || ABACATE_BASE).replace(/\/+$/, "");
    const environment = (gateway as any).environment || config.environment || "production";

    if (!apiKey) return jsonRes({ error: "API Key da AbacatePay não configurada" }, 400);

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    const apiHeaders = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };

    const logEvent = (data: Record<string, any>) =>
      svc.from("payment_events").insert({
        gateway: "abacatepay",
        received_at: new Date().toISOString(),
        ...data,
      });

    /* ─────────────── ACTION: test ───────────────
       AbacatePay não documenta um endpoint público leve para validar credenciais
       sem criar cobrança. Validamos a configuração local e marcamos como
       "configured". A validação real ocorre na primeira cobrança Pix. */
    if (action === "test") {
      await logEvent({
        event_type: "connection_test",
        payload: { environment, base_url: baseUrl, has_api_key: !!apiKey },
        result: "success",
        processed: true,
        processed_at: new Date().toISOString(),
      });

      await svc.from("payment_gateways").update({
        config: {
          ...config,
          last_test_at: new Date().toISOString(),
          last_test_status: "configured",
        },
      }).eq("id", gateway.id);

      return jsonRes({
        ok: true,
        provider: "abacatepay",
        status: "configured",
        environment,
        message:
          "Configuração salva. O teste real ocorrerá ao gerar a primeira cobrança Pix.",
        checked_at: new Date().toISOString(),
      });
    }

    /* ─────────────── ACTION: create-charge ─────────────── */
    if (action === "create-charge" && req.method === "POST") {
      const body = await req.json();
      const {
        subscription_id,
        company_id,
        amount_cents,
        description,
        expires_in,
        customer_name,
        customer_email,
        customer_cellphone,
        customer_tax_id,
        plan_id,
        invoice_id,
      } = body;

      if (!subscription_id || !amount_cents) {
        return jsonRes({ error: "subscription_id e amount_cents obrigatórios" }, 400);
      }

      const externalRef = `sub:${subscription_id}`;
      const expiresInSeconds = typeof expires_in === "number" && expires_in > 0
        ? expires_in
        : 86400; // 24h default

      const payload: Record<string, any> = {
        method: "PIX",
        data: {
          amount: Number(amount_cents), // valor em centavos conforme docs
          description: description || "Cobrança de assinatura",
          expiresIn: expiresInSeconds,
          customer: {
            name: customer_name || (userData.user.email?.split("@")[0]) || "Cliente",
            email: customer_email || userData.user.email || "comprador@example.com",
            ...(customer_cellphone ? { cellphone: customer_cellphone } : {}),
            ...(customer_tax_id ? { taxId: customer_tax_id } : {}),
          },
          metadata: {
            invoice_id: invoice_id || null,
            subscription_id,
            plan_id: plan_id || null,
            user_id: userData.user.id,
            gateway: "abacatepay",
            external_reference: externalRef,
          },
        },
      };

      let resp: Response;
      let respBody: any;
      try {
        resp = await fetch(`${baseUrl}/transparents/create`, {
          method: "POST",
          headers: apiHeaders,
          body: JSON.stringify(payload),
        });
        respBody = await resp.json();
      } catch (err: any) {
        await logEvent({
          event_type: "charge_creation_failed",
          payload: {
            error: err.message,
            request: { ...payload, data: { ...payload.data, customer: undefined } },
          },
          result: "error",
          processed: true,
          processed_at: new Date().toISOString(),
        });
        return jsonRes({ ok: false, error: "Falha ao conectar AbacatePay: " + err.message }, 502);
      }

      // Normaliza resposta — AbacatePay envelopa em "data" em alguns casos
      const data = respBody?.data || respBody || {};
      const extId = data?.id ? String(data.id) : null;
      const status = (data?.status || "PENDING").toString().toLowerCase();
      const brCode = data?.brCode || data?.pix?.brCode || null;
      const brCodeBase64 = data?.brCodeBase64 || data?.pix?.brCodeBase64 || null;
      const expiresAt = data?.expiresAt || data?.expires_at || null;
      const platformFee = data?.platformFee ?? data?.platform_fee ?? null;

      await logEvent({
        event_type: "charge_created",
        external_id: extId,
        payload: {
          http_status: resp.status,
          status,
          environment,
          request: { ...payload, data: { ...payload.data, customer: undefined } },
        },
        result: resp.ok ? "success" : "error",
        processed: true,
        processed_at: new Date().toISOString(),
      });

      if (!resp.ok) {
        return jsonRes({ ok: false, error: "Erro do AbacatePay", details: respBody }, resp.status);
      }

      const normalizedStatus =
        status === "paid" || status === "approved" || status === "completed"
          ? "paid"
          : status === "expired" || status === "cancelled" || status === "canceled"
            ? "rejected"
            : "pending";

      const { data: charge, error: insertErr } = await svc
        .from("payment_charges")
        .insert({
          subscription_id,
          company_id,
          gateway: "abacatepay",
          gateway_payment_id: extId,
          external_id: extId,
          external_reference: externalRef,
          amount_cents,
          status: normalizedStatus,
          status_detail: status,
          payment_method: "pix",
          capture_method: "pix",
          qr_code: brCode,
          pix_copy_paste: brCode,
          qr_code_base64: brCodeBase64,
          description,
          expires_at: expiresAt,
          paid_at: normalizedStatus === "paid" ? new Date().toISOString() : null,
          raw_response: { ...respBody, _platform_fee: platformFee },
        })
        .select()
        .single();

      if (insertErr) console.error("[abacatepay-proxy] insert charge:", insertErr.message);

      // Vincula gateway à assinatura
      if (extId) {
        await svc.from("subscriptions")
          .update({ gateway: "abacatepay", gateway_reference: extId })
          .eq("id", subscription_id);
      }

      // Caso já venha pago (raríssimo no Pix), confirma plano
      if (normalizedStatus === "paid" && subscription_id) {
        await svc.rpc("confirm_pending_plan_change", { _subscription_id: subscription_id });
      }

      return jsonRes({
        ok: true,
        provider: "abacatepay",
        charge_id: charge?.id,
        gateway_payment_id: extId,
        status: charge?.status,
        qr_code: brCode,
        qr_code_base64: brCodeBase64,
        pix_copy_paste: brCode,
        expires_at: expiresAt,
        platform_fee: platformFee,
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

      // Tenta consulta ativa na AbacatePay (endpoint não-destrutivo)
      // Documentação não expõe endpoint público de leitura confiável para Pix Transparente,
      // por isso o webhook é a fonte primária. Mantemos retorno do estado local.
      if (charge.gateway_payment_id && charge.status !== "paid") {
        try {
          const resp = await fetch(`${baseUrl}/transparents/${charge.gateway_payment_id}`, {
            method: "GET",
            headers: apiHeaders,
          });
          if (resp.ok) {
            const body = await resp.json();
            const data = body?.data || body || {};
            const apiStatus = (data?.status || "").toString().toLowerCase();
            const newStatus =
              apiStatus === "paid" || apiStatus === "approved" || apiStatus === "completed"
                ? "paid"
                : apiStatus === "expired" || apiStatus === "cancelled" || apiStatus === "canceled"
                  ? "rejected"
                  : charge.status;

            if (newStatus !== charge.status) {
              const updateData: Record<string, any> = {
                status: newStatus,
                status_detail: apiStatus,
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
                  payload: { abacate_status: apiStatus, confirm_result: confirmRes },
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
        provider: "abacatepay",
        charge_id: charge.id,
        gateway_payment_id: charge.gateway_payment_id,
        status: charge.status,
        status_detail: charge.status_detail,
        paid_at: charge.paid_at,
        amount_cents: charge.amount_cents,
        qr_code: charge.qr_code,
        qr_code_base64: charge.qr_code_base64,
        pix_copy_paste: charge.pix_copy_paste,
        expires_at: charge.expires_at,
      });
    }

    return jsonRes({ error: "Ação não reconhecida. Use: test, create-charge, query-charge" }, 400);
  } catch (error: any) {
    console.error("[abacatepay-proxy] ERROR:", error.message);
    return jsonRes({ error: error.message }, 500);
  }
});

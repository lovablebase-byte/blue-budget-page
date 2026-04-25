// InfinitePay proxy — Pix-only checkout via /invoices/public/checkout/links
// Mantém Amplo Pay e Mercado Pago intactos. Usa tabelas existentes
// (payment_charges, payment_events, payment_gateways) com colunas adicionais.
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

const IP_BASE = "https://api.infinitepay.io";
const CHECKOUT_LINKS_PATH = "/invoices/public/checkout/links";

// Sanitiza handle (remove $, espaços, @)
function sanitizeHandle(raw: string): string {
  return (raw || "").trim().replace(/^[\$@]+/, "").replace(/\s+/g, "");
}

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

    // Carrega gateway InfinitePay
    const { data: gateway } = await svc
      .from("payment_gateways")
      .select("*")
      .eq("provider", "infinitepay")
      .limit(1)
      .maybeSingle();

    if (!gateway) return jsonRes({ error: "Gateway InfinitePay não configurado" }, 404);

    const config = (gateway.config || {}) as Record<string, any>;
    const handle = sanitizeHandle(config.handle || "");
    const baseUrl = (config.base_url || IP_BASE).replace(/\/+$/, "");

    if (!handle) return jsonRes({ error: "InfiniteTag (handle) não configurado" }, 400);

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    const logEvent = (data: Record<string, any>) =>
      svc.from("payment_events").insert({
        gateway: "infinitepay",
        received_at: new Date().toISOString(),
        ...data,
      });

    /* ─────────────── ACTION: test ─────────────── */
    if (action === "test") {
      // O Checkout Integrado da InfinitePay não exige autenticação por token,
      // ele usa o handle (InfiniteTag) público. Testamos criando uma simulação
      // mínima e validando o handle via tentativa de geração com valor mínimo.
      // Como não há endpoint público "ping", validamos formato do handle.
      try {
        if (handle.length < 3) {
          await logEvent({
            event_type: "connection_test",
            payload: { handle_length: handle.length },
            result: "failure",
            processed: true,
            processed_at: new Date().toISOString(),
          });
          await svc.from("payment_gateways").update({
            config: { ...config, last_test_at: new Date().toISOString(), last_test_status: "error" },
          }).eq("id", gateway.id);
          return jsonRes({ ok: false, provider: "infinitepay", status: "invalid_handle", error: "InfiniteTag inválida" });
        }

        // Tenta um HEAD/GET na base — só validação de alcance
        const probe = await fetch(`${baseUrl}/`, { method: "GET" }).catch(() => null);
        const reachable = !!probe;

        await logEvent({
          event_type: "connection_test",
          payload: { handle, reachable, http_status: probe?.status },
          result: reachable ? "success" : "failure",
          processed: true,
          processed_at: new Date().toISOString(),
        });

        await svc.from("payment_gateways").update({
          config: {
            ...config,
            last_test_at: new Date().toISOString(),
            last_test_status: reachable ? "connected" : "error",
          },
        }).eq("id", gateway.id);

        if (!reachable) {
          return jsonRes({
            ok: false,
            provider: "infinitepay",
            status: "unreachable",
            error: "Não foi possível conectar à API InfinitePay",
          });
        }

        return jsonRes({
          ok: true,
          provider: "infinitepay",
          status: "connected",
          handle,
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
        return jsonRes({ ok: false, provider: "infinitepay", status: "unreachable", error: err.message });
      }
    }

    /* ─────────────── ACTION: create-charge ─────────────── */
    if (action === "create-charge" && req.method === "POST") {
      const body = await req.json();
      const {
        subscription_id,
        company_id,
        amount_cents,
        description,
        redirect_url,
      } = body;

      if (!subscription_id || !amount_cents) {
        return jsonRes({ error: "subscription_id e amount_cents obrigatórios" }, 400);
      }

      const webhookUrl = `${supabaseUrl}/functions/v1/infinitepay-webhook`;
      // order_nsu é o identificador interno (até 32 chars). Usa subscription + timestamp
      const orderNsu = `sub${subscription_id.replace(/-/g, "").slice(0, 12)}${Date.now().toString(36)}`;

      // Payload Checkout Integrado InfinitePay — Pix-only
      // Doc: POST /invoices/public/checkout/links
      const payload: Record<string, any> = {
        handle,
        order_nsu: orderNsu,
        items: [
          {
            name: description || "Cobrança de assinatura",
            quantity: 1,
            price: amount_cents, // valor em centavos
          },
        ],
        // Restringe explicitamente a Pix (quando suportado pela API)
        payment_method: "pix",
        capture_method: "pix",
        webhook_url: webhookUrl,
        ...(redirect_url ? { redirect_url } : {}),
      };

      let resp: Response;
      let respBody: any;
      try {
        resp = await fetch(`${baseUrl}${CHECKOUT_LINKS_PATH}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        respBody = await resp.json().catch(() => ({}));
      } catch (err: any) {
        await logEvent({
          event_type: "charge_creation_failed",
          payload: { error: err.message, order_nsu: orderNsu },
          result: "error",
          processed: true,
          processed_at: new Date().toISOString(),
        });
        return jsonRes({ ok: false, error: "Falha ao conectar InfinitePay: " + err.message }, 502);
      }

      const checkoutUrl =
        respBody?.url || respBody?.checkout_url || respBody?.payment_url || null;
      const invoiceSlug = respBody?.slug || respBody?.invoice_slug || null;

      await logEvent({
        event_type: "charge_created",
        external_id: orderNsu,
        payload: {
          http_status: resp.status,
          order_nsu: orderNsu,
          invoice_slug: invoiceSlug,
          has_checkout_url: !!checkoutUrl,
        },
        result: resp.ok ? "success" : "error",
        processed: true,
        processed_at: new Date().toISOString(),
      });

      if (!resp.ok || !checkoutUrl) {
        return jsonRes({ ok: false, error: "Erro ao criar checkout InfinitePay", details: respBody }, resp.status || 502);
      }

      const { data: charge, error: insertErr } = await svc
        .from("payment_charges")
        .insert({
          subscription_id,
          company_id,
          gateway: "infinitepay",
          gateway_payment_id: orderNsu,
          external_id: orderNsu,
          external_reference: `sub:${subscription_id}`,
          order_nsu: orderNsu,
          invoice_slug: invoiceSlug,
          checkout_url: checkoutUrl,
          payment_method: "pix",
          capture_method: "pix",
          amount_cents,
          status: "pending",
          description,
          raw_response: respBody,
        })
        .select()
        .single();

      if (insertErr) console.error("[infinitepay-proxy] insert charge:", insertErr.message);

      // Vincula gateway à assinatura (não ativa plano)
      await svc.from("subscriptions")
        .update({ gateway: "infinitepay", gateway_reference: orderNsu })
        .eq("id", subscription_id);

      return jsonRes({
        ok: true,
        provider: "infinitepay",
        charge_id: charge?.id,
        order_nsu: orderNsu,
        invoice_slug: invoiceSlug,
        checkout_url: checkoutUrl,
        payment_url: checkoutUrl,
        status: "pending",
        payment_method: "pix",
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

      // Fallback de consulta — InfinitePay expõe payment_check via slug
      if (charge.invoice_slug && charge.status !== "paid" && charge.status !== "rejected") {
        try {
          const checkUrl = `${baseUrl}/invoices/public/checkout/payment_check/${charge.invoice_slug}`;
          const resp = await fetch(checkUrl, { method: "GET" });
          if (resp.ok) {
            const body: any = await resp.json().catch(() => ({}));
            const paid = body?.paid === true || body?.success === true;
            const captureMethod = (body?.capture_method || body?.payment_method || "").toLowerCase();
            const transactionNsu = body?.transaction_nsu || body?.nsu || null;
            const receiptUrl = body?.receipt_url || null;

            // Pix-only: só ativa se capture_method = pix (ou ausente, conservador)
            if (paid && (captureMethod === "pix" || captureMethod === "")) {
              await svc.from("payment_charges").update({
                status: "paid",
                paid_at: new Date().toISOString(),
                capture_method: captureMethod || "pix",
                transaction_nsu: transactionNsu,
                receipt_url: receiptUrl,
                raw_response: body,
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
                await logEvent({
                  event_type: "fallback_reconciliation",
                  external_id: charge.order_nsu,
                  charge_id: charge.id,
                  payload: { capture_method: captureMethod, transaction_nsu: transactionNsu },
                  result: "processed",
                  processed: true,
                  processed_at: new Date().toISOString(),
                });
              }

              charge.status = "paid";
              charge.paid_at = new Date().toISOString();
            } else if (paid && captureMethod && captureMethod !== "pix") {
              // Pago, mas não-Pix → registra evento sem ativar
              await logEvent({
                event_type: "non_pix_payment_received",
                external_id: charge.order_nsu,
                charge_id: charge.id,
                payload: { capture_method: captureMethod, paid: true },
                result: "value_mismatch",
                processed: true,
                processed_at: new Date().toISOString(),
              });
            }
          }
        } catch { /* mantém estado local */ }
      }

      return jsonRes({
        ok: true,
        provider: "infinitepay",
        charge_id: charge.id,
        order_nsu: charge.order_nsu,
        invoice_slug: charge.invoice_slug,
        status: charge.status,
        paid_at: charge.paid_at,
        amount_cents: charge.amount_cents,
        checkout_url: charge.checkout_url,
        payment_url: charge.checkout_url,
        receipt_url: charge.receipt_url,
        capture_method: charge.capture_method,
      });
    }

    return jsonRes({ error: "Ação não reconhecida. Use: test, create-charge, query-charge" }, 400);
  } catch (error: any) {
    console.error("[infinitepay-proxy] ERROR:", error.message);
    return jsonRes({ error: error.message }, 500);
  }
});

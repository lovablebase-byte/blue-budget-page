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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    /* ── Auth ── */
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonRes({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseUser = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !userData?.user) {
      return jsonRes({ error: "Unauthorized" }, 401);
    }

    /* ── Service client ── */
    const svc = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    /* ── Gateway config ── */
    const { data: gateway } = await svc
      .from("payment_gateways")
      .select("*")
      .eq("provider", "amplopay")
      .limit(1)
      .single();

    if (!gateway) {
      return jsonRes({ error: "Gateway Amplo Pay não configurado" }, 404);
    }

    const config = (gateway.config || {}) as Record<string, any>;
    const baseUrl = (config.base_url || "").replace(/\/+$/, "");
    const apiKey = config.api_key || "";

    if (!baseUrl || !apiKey) {
      return jsonRes({ error: "Credenciais da Amplo Pay incompletas" }, 400);
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    /* ─── Helpers ─── */
    const logEvent = (data: Record<string, any>) =>
      svc.from("payment_events").insert({
        received_at: new Date().toISOString(),
        ...data,
      });

    const apiHeaders = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };

    /* ═══════════════════════════════════════════════
       ACTION: test  (PDF seção 6.1)
       ═══════════════════════════════════════════════ */
    if (action === "test") {
      try {
        const testResp = await fetch(`${baseUrl}/health`, {
          method: "GET",
          headers: apiHeaders,
        });
        const testBody = await testResp.text();

        await logEvent({
          event_type: "connection_test",
          payload: { http_status: testResp.status, response: testBody.substring(0, 500) },
          result: testResp.ok ? "success" : "failure",
          processed_at: new Date().toISOString(),
        });

        await svc
          .from("payment_gateways")
          .update({
            config: {
              ...config,
              last_test_at: new Date().toISOString(),
              last_test_status: testResp.ok ? "connected" : "error",
            },
          })
          .eq("id", gateway.id);

        return jsonRes({
          ok: testResp.ok,
          provider: "amplopay",
          status: testResp.ok ? "connected" : "error",
          http_status: testResp.status,
          checked_at: new Date().toISOString(),
        });
      } catch (fetchErr: any) {
        await logEvent({
          event_type: "connection_test",
          payload: { error: fetchErr.message },
          result: "error",
          processed_at: new Date().toISOString(),
        });

        await svc
          .from("payment_gateways")
          .update({
            config: { ...config, last_test_at: new Date().toISOString(), last_test_status: "error" },
          })
          .eq("id", gateway.id);

        return jsonRes({ ok: false, provider: "amplopay", status: "unreachable", error: fetchErr.message });
      }
    }

    /* ═══════════════════════════════════════════════
       ACTION: create-charge  (PDF seção 6.2)
       ═══════════════════════════════════════════════ */
    if (action === "create-charge" && req.method === "POST") {
      const body = await req.json();
      const { subscription_id, company_id, amount_cents, description, expires_at } = body;

      if (!subscription_id || !amount_cents) {
        return jsonRes({ error: "subscription_id e amount_cents obrigatórios" }, 400);
      }

      const chargePayload = {
        amount: amount_cents,
        description: description || "Cobrança de assinatura",
        expires_at: expires_at || null,
      };

      let externalResp: Response;
      let externalBody: any;
      try {
        externalResp = await fetch(`${baseUrl}/charges/pix`, {
          method: "POST",
          headers: apiHeaders,
          body: JSON.stringify(chargePayload),
        });
        externalBody = await externalResp.json();
      } catch (fetchErr: any) {
        await logEvent({
          event_type: "charge_creation_failed",
          payload: { error: fetchErr.message, request: chargePayload },
          result: "error",
          processed_at: new Date().toISOString(),
        });
        return jsonRes({ ok: false, error: "Falha ao conectar com Amplo Pay: " + fetchErr.message }, 502);
      }

      const extId = externalBody?.id || externalBody?.charge_id || null;

      await logEvent({
        event_type: "charge_created",
        external_id: extId,
        payload: { request: chargePayload, response: externalBody, http_status: externalResp.status },
        result: externalResp.ok ? "success" : "error",
        processed_at: new Date().toISOString(),
      });

      if (!externalResp.ok) {
        return jsonRes({ ok: false, error: "Erro da Amplo Pay", details: externalBody }, externalResp.status);
      }

      // Mapear campos do QR conforme resposta (PDF seção 13 — campos confirmáveis)
      const qrCode = externalBody?.qr_code || externalBody?.qrcode || externalBody?.qr_code_base64 || null;
      const pixCopyPaste =
        externalBody?.pix_copy_paste ||
        externalBody?.copy_paste ||
        externalBody?.brcode ||
        externalBody?.emv ||
        null;

      const { data: charge, error: insertErr } = await svc
        .from("payment_charges")
        .insert({
          subscription_id,
          company_id,
          external_id: extId,
          amount_cents,
          status: "pending",
          qr_code: qrCode,
          pix_copy_paste: pixCopyPaste,
          description,
          expires_at: expires_at || null,
        })
        .select()
        .single();

      if (insertErr) {
        console.error("[amplopay-proxy] Insert charge error:", insertErr.message);
      }

      // Vincular gateway à assinatura (PDF seção 5.2 item 3)
      if (extId) {
        await svc
          .from("subscriptions")
          .update({ gateway: "amplopay", gateway_reference: extId })
          .eq("id", subscription_id);
      }

      return jsonRes({
        ok: true,
        provider: "amplopay",
        charge_id: charge?.id,
        external_id: extId,
        status: "pending",
        qr_code: qrCode,
        pix_copy_paste: pixCopyPaste,
        expires_at: expires_at || null,
      });
    }

    /* ═══════════════════════════════════════════════
       ACTION: query-charge  (PDF seção 6.3 + fallback 5.3)
       ═══════════════════════════════════════════════ */
    if (action === "query-charge") {
      const chargeId = url.searchParams.get("charge_id");
      if (!chargeId) {
        return jsonRes({ error: "charge_id obrigatório" }, 400);
      }

      const { data: charge } = await svc
        .from("payment_charges")
        .select("*")
        .eq("id", chargeId)
        .single();

      if (!charge) {
        return jsonRes({ error: "Cobrança não encontrada" }, 404);
      }

      // Consulta ativa na Amplo Pay (fallback — PDF seção 5.3)
      if (charge.external_id && charge.status !== "paid") {
        try {
          const statusResp = await fetch(`${baseUrl}/charges/${charge.external_id}`, {
            method: "GET",
            headers: apiHeaders,
          });

          if (statusResp.ok) {
            const statusBody = await statusResp.json();
            const newStatus = statusBody?.status || charge.status;

            if (newStatus !== charge.status) {
              const updateData: Record<string, any> = { status: newStatus };
              if ((newStatus === "paid" || newStatus === "approved" || newStatus === "confirmed") && !charge.paid_at) {
                updateData.paid_at = new Date().toISOString();
                updateData.status = "paid";
              }

              await svc.from("payment_charges").update(updateData).eq("id", charge.id);

              // Se pago, ativar assinatura — preferindo confirm_pending_plan_change
              if (updateData.status === "paid" && charge.subscription_id) {
                const { data: confirmRes } = await svc.rpc("confirm_pending_plan_change", {
                  _subscription_id: charge.subscription_id,
                });

                if (!confirmRes || (confirmRes as any).success === false) {
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
                }

                await logEvent({
                  event_type: "fallback_reconciliation",
                  external_id: charge.external_id,
                  charge_id: charge.id,
                  payload: { subscription_id: charge.subscription_id, new_status: "paid", confirm_result: confirmRes },
                  result: "processed",
                  processed_at: new Date().toISOString(),
                });
              }

              charge.status = updateData.status;
              charge.paid_at = updateData.paid_at || charge.paid_at;
            }
          }
        } catch {
          // Retornar dados locais se consulta falhar
        }
      }

      return jsonRes({
        ok: true,
        charge_id: charge.id,
        external_id: charge.external_id,
        status: charge.status,
        paid_at: charge.paid_at,
        amount_cents: charge.amount_cents,
        qr_code: charge.qr_code,
        pix_copy_paste: charge.pix_copy_paste,
      });
    }

    return jsonRes({ error: "Ação não reconhecida. Use: test, create-charge, query-charge" }, 400);
  } catch (error: any) {
    console.error("[amplopay-proxy] ERROR:", error.message);
    return jsonRes({ error: error.message }, 500);
  }
});

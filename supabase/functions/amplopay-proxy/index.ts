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

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse action from URL
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // Get gateway config using service role
    const supabaseService = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: gateway } = await supabaseService
      .from("payment_gateways")
      .select("*")
      .eq("provider", "amplopay")
      .limit(1)
      .single();

    if (!gateway) {
      return new Response(
        JSON.stringify({ error: "Gateway Amplo Pay não configurado" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const config = (gateway.config || {}) as Record<string, any>;
    const baseUrl = config.base_url || "";
    const apiKey = config.api_key || "";

    if (!baseUrl || !apiKey) {
      return new Response(
        JSON.stringify({ error: "Credenciais da Amplo Pay incompletas" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ─── ACTION: test ───
    if (action === "test") {
      try {
        const testResp = await fetch(`${baseUrl}/health`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
        });
        const testBody = await testResp.text();

        // Log attempt
        await supabaseService.from("payment_events").insert({
          event_type: "connection_test",
          payload: {
            http_status: testResp.status,
            response: testBody.substring(0, 500),
          },
          result: testResp.ok ? "success" : "failure",
          processed_at: new Date().toISOString(),
        });

        // Update gateway last test
        await supabaseService
          .from("payment_gateways")
          .update({
            config: {
              ...config,
              last_test_at: new Date().toISOString(),
              last_test_status: testResp.ok ? "connected" : "error",
            },
          })
          .eq("id", gateway.id);

        return new Response(
          JSON.stringify({
            ok: testResp.ok,
            provider: "amplopay",
            status: testResp.ok ? "connected" : "error",
            http_status: testResp.status,
            checked_at: new Date().toISOString(),
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      } catch (fetchErr: any) {
        return new Response(
          JSON.stringify({
            ok: false,
            provider: "amplopay",
            status: "unreachable",
            error: fetchErr.message,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // ─── ACTION: create-charge ───
    if (action === "create-charge" && req.method === "POST") {
      const body = await req.json();
      const { subscription_id, company_id, amount_cents, description, expires_at } = body;

      if (!subscription_id || !amount_cents) {
        return new Response(
          JSON.stringify({ error: "subscription_id e amount_cents obrigatórios" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Call Amplo Pay API to create PIX charge
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
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(chargePayload),
        });
        externalBody = await externalResp.json();
      } catch (fetchErr: any) {
        // Log failure
        await supabaseService.from("payment_events").insert({
          event_type: "charge_creation_failed",
          payload: { error: fetchErr.message, request: chargePayload },
          result: "error",
          processed_at: new Date().toISOString(),
        });

        return new Response(
          JSON.stringify({ ok: false, error: "Falha ao conectar com Amplo Pay: " + fetchErr.message }),
          {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Log attempt
      await supabaseService.from("payment_events").insert({
        event_type: "charge_created",
        external_id: externalBody?.id || externalBody?.charge_id || null,
        payload: {
          request: chargePayload,
          response: externalBody,
          http_status: externalResp.status,
        },
        result: externalResp.ok ? "success" : "error",
        processed_at: new Date().toISOString(),
      });

      if (!externalResp.ok) {
        return new Response(
          JSON.stringify({ ok: false, error: "Erro da Amplo Pay", details: externalBody }),
          {
            status: externalResp.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Persist charge locally
      const extId = externalBody?.id || externalBody?.charge_id || null;
      const qrCode = externalBody?.qr_code || externalBody?.qrcode || null;
      const pixCopyPaste = externalBody?.pix_copy_paste || externalBody?.copy_paste || externalBody?.brcode || null;

      const { data: charge, error: insertErr } = await supabaseService
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

      // Update subscription gateway reference
      if (extId) {
        await supabaseService
          .from("subscriptions")
          .update({ gateway: "amplopay", gateway_reference: extId })
          .eq("id", subscription_id);
      }

      return new Response(
        JSON.stringify({
          ok: true,
          provider: "amplopay",
          charge_id: charge?.id,
          external_id: extId,
          status: "pending",
          qr_code: qrCode,
          pix_copy_paste: pixCopyPaste,
          expires_at: expires_at || null,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ─── ACTION: query-charge ───
    if (action === "query-charge") {
      const chargeId = url.searchParams.get("charge_id");
      if (!chargeId) {
        return new Response(
          JSON.stringify({ error: "charge_id obrigatório" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Get local charge
      const { data: charge } = await supabaseService
        .from("payment_charges")
        .select("*")
        .eq("id", chargeId)
        .single();

      if (!charge) {
        return new Response(
          JSON.stringify({ error: "Cobrança não encontrada" }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // If charge has external_id, query Amplo Pay for updated status
      if (charge.external_id) {
        try {
          const statusResp = await fetch(
            `${baseUrl}/charges/${charge.external_id}`,
            {
              method: "GET",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
            }
          );

          if (statusResp.ok) {
            const statusBody = await statusResp.json();
            const newStatus = statusBody?.status || charge.status;

            // Update local if changed
            if (newStatus !== charge.status) {
              const updateData: Record<string, any> = { status: newStatus };
              if (newStatus === "paid" && !charge.paid_at) {
                updateData.paid_at = new Date().toISOString();
              }
              await supabaseService
                .from("payment_charges")
                .update(updateData)
                .eq("id", charge.id);

              // If paid, update subscription
              if (newStatus === "paid" && charge.subscription_id) {
                await supabaseService
                  .from("subscriptions")
                  .update({
                    status: "active",
                    started_at: new Date().toISOString(),
                  })
                  .eq("id", charge.subscription_id);
              }

              charge.status = newStatus;
            }
          }
        } catch {
          // Fallback: just return local data
        }
      }

      return new Response(
        JSON.stringify({
          ok: true,
          charge_id: charge.id,
          external_id: charge.external_id,
          status: charge.status,
          paid_at: charge.paid_at,
          amount_cents: charge.amount_cents,
          qr_code: charge.qr_code,
          pix_copy_paste: charge.pix_copy_paste,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({ error: "Ação não reconhecida. Use: test, create-charge, query-charge" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("[amplopay-proxy] ERROR:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

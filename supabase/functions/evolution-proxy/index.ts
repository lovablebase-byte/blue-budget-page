import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get auth user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Não autorizado");

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) throw new Error("Não autorizado");

    // Get user's company
    const { data: userRole } = await supabase
      .from("user_roles")
      .select("company_id")
      .eq("user_id", user.id)
      .single();
    if (!userRole?.company_id) throw new Error("Empresa não encontrada");

    // Get Evolution API config
    const { data: evoConfig } = await supabase
      .from("evolution_api_config")
      .select("base_url, api_key, is_active")
      .eq("company_id", userRole.company_id)
      .single();

    if (!evoConfig?.is_active || !evoConfig.base_url || !evoConfig.api_key) {
      throw new Error("Evolution API não configurada ou desativada");
    }

    const body = await req.json();
    const { action, instanceName, payload } = body;
    const baseUrl = evoConfig.base_url.replace(/\/+$/, "");

    let evoPath = "";
    let evoMethod = "GET";
    let evoBody: string | undefined;

    switch (action) {
      case "create":
        evoPath = "/instance/create";
        evoMethod = "POST";
        evoBody = JSON.stringify({
          instanceName,
          qrcode: true,
          integration: "WHATSAPP-BAILEYS",
          ...(payload?.webhook
            ? {
                webhook: {
                  url: payload.webhook,
                  byEvents: payload.webhookByEvents ?? true,
                  base64: true,
                  events: payload.events || [],
                },
              }
            : {}),
        });
        break;
      case "connect":
        evoPath = `/instance/connect/${instanceName}`;
        evoMethod = "GET";
        break;
      case "status":
        evoPath = `/instance/connectionState/${instanceName}`;
        evoMethod = "GET";
        break;
      case "delete":
        evoPath = `/instance/delete/${instanceName}`;
        evoMethod = "DELETE";
        break;
      case "sendPresence":
        evoPath = `/chat/updatePresence/${instanceName}`;
        evoMethod = "POST";
        evoBody = JSON.stringify({
          number: payload?.number,
          presence: payload?.presence || "composing",
          delay: payload?.delay || 3000,
        });
        break;
      case "sendText":
        evoPath = `/message/sendText/${instanceName}`;
        evoMethod = "POST";
        evoBody = JSON.stringify(payload);
        break;
      case "logout":
        evoPath = `/instance/logout/${instanceName}`;
        evoMethod = "DELETE";
        break;
      case "fetchInstances":
        evoPath = "/instance/fetchInstances";
        evoMethod = "GET";
        break;
      default:
        throw new Error(`Ação desconhecida: ${action}`);
    }

    const endpoint = `${baseUrl}${evoPath}`;
    const parsedRequestBody = evoBody ? JSON.parse(evoBody) : null;

    const evoRes = await fetch(endpoint, {
      method: evoMethod,
      headers: {
        "Content-Type": "application/json",
        apikey: evoConfig.api_key,
      },
      ...(evoBody ? { body: evoBody } : {}),
    });

    const responseData = await evoRes
      .json()
      .catch(async () => ({ raw: await evoRes.text().catch(() => "") }));

    const meta = {
      action,
      instanceName,
      endpoint,
      method: evoMethod,
      status: evoRes.status,
      requestBody: parsedRequestBody,
      responseAt: new Date().toISOString(),
    };

    if (!evoRes.ok) {
      // Handle 404 gracefully for status checks and delete actions
      if (evoRes.status === 404) {
        if (action === "status") {
          console.warn("[evolution-proxy] instance not found for status check, returning not_found", {
            company_id: userRole.company_id,
            user_id: user.id,
            ...meta,
          });
          return new Response(
            JSON.stringify({ instance: { state: "not_found", instanceName }, _meta: meta }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        if (action === "delete") {
          console.warn("[evolution-proxy] instance already deleted (404), treating as success", {
            company_id: userRole.company_id,
            user_id: user.id,
            ...meta,
          });
          return new Response(
            JSON.stringify({ status: "deleted_already", instanceName, _meta: meta }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }

      console.error("[evolution-proxy] request failed", {
        company_id: userRole.company_id,
        user_id: user.id,
        ...meta,
        responseBody: responseData,
      });

      return new Response(
        JSON.stringify({
          error: responseData?.message || `Evolution API: HTTP ${evoRes.status}`,
          details: responseData,
          _meta: meta,
        }),
        { status: evoRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let successPayload: Record<string, any>;
    if (Array.isArray(responseData)) {
      successPayload = { data: responseData, _meta: meta };
    } else if (responseData && typeof responseData === "object") {
      successPayload = { ...responseData, _meta: meta };
    } else {
      successPayload = { data: responseData, _meta: meta };
    }

    console.log("[evolution-proxy] request success", {
      company_id: userRole.company_id,
      user_id: user.id,
      ...meta,
    });

    return new Response(JSON.stringify(successPayload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

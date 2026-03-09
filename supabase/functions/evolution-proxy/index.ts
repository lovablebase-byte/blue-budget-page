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

    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
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
          ...(payload?.webhook ? {
            webhook: {
              url: payload.webhook,
              byEvents: payload.webhookByEvents ?? true,
              base64: true,
              events: payload.events || [],
            },
          } : {}),
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

    const evoRes = await fetch(`${baseUrl}${evoPath}`, {
      method: evoMethod,
      headers: {
        "Content-Type": "application/json",
        apikey: evoConfig.api_key,
      },
      ...(evoBody ? { body: evoBody } : {}),
    });

    const responseData = await evoRes.json().catch(() => ({}));

    if (!evoRes.ok) {
      return new Response(
        JSON.stringify({ error: responseData.message || `Evolution API: HTTP ${evoRes.status}`, details: responseData }),
        { status: evoRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

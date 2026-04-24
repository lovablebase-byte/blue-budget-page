import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── AUTH: caller deve ser admin ──
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Não autenticado" }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: claims, error: claimsErr } = await userClient.auth.getClaims(
    authHeader.replace("Bearer ", ""),
  );
  if (claimsErr || !claims?.claims?.sub) {
    return jsonResponse({ error: "Sessão inválida" }, 401);
  }

  const callerId = claims.claims.sub as string;
  const { data: callerRole } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", callerId)
    .maybeSingle();

  if (!callerRole || (callerRole.role !== "admin" && callerRole.role !== "super_admin")) {
    return jsonResponse({ error: "Apenas administradores podem gerenciar usuários" }, 403);
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const action = body.action || "create";

  try {
    // ── DELETE ──
    if (action === "delete") {
      const targetId = body.user_id;
      if (!targetId) return jsonResponse({ error: "user_id é obrigatório" }, 400);
      if (targetId === callerId) {
        return jsonResponse({ error: "Você não pode remover sua própria conta" }, 400);
      }

      console.log(`[seed-users] DELETE user_id=${targetId} by admin=${callerId}`);

      // Limpa relações (RLS bypass via service role)
      await admin.from("permissions").delete().in(
        "user_role_id",
        (await admin.from("user_roles").select("id").eq("user_id", targetId)).data?.map((r: any) => r.id) || [],
      );
      await admin.from("user_roles").delete().eq("user_id", targetId);
      await admin.from("profiles").delete().eq("user_id", targetId);

      const { error: delAuthErr } = await admin.auth.admin.deleteUser(targetId);
      if (delAuthErr) {
        console.error("[seed-users] auth.deleteUser failed:", delAuthErr);
        return jsonResponse({ error: `Falha ao remover usuário: ${delAuthErr.message}` }, 500);
      }

      return jsonResponse({ success: true, deleted: targetId });
    }

    // ── CREATE / UPSERT ──
    const email = body.email;
    const fullName = body.full_name || email || "Novo Usuário";
    const password = body.password || "123456";
    const requestedRole = body.role === "admin" ? "admin" : "user";

    if (!email) return jsonResponse({ error: "Email é obrigatório" }, 400);

    console.log(`[seed-users] CREATE email=${email} role=${requestedRole} by admin=${callerId}`);

    // Single-tenant: pegar tenant principal
    let { data: mainTenant } = await admin
      .from("companies")
      .select("id")
      .eq("slug", "main-tenant")
      .maybeSingle();

    if (!mainTenant) {
      const { data: anyCompany } = await admin
        .from("companies")
        .select("id")
        .order("created_at")
        .limit(1)
        .maybeSingle();
      mainTenant = anyCompany;
    }

    if (!mainTenant) {
      return jsonResponse({ error: "Tenant principal não configurado" }, 500);
    }

    const companyId = mainTenant.id;

    // Verifica se já existe
    const { data: existingUsers } = await admin.auth.admin.listUsers();
    const existing = existingUsers?.users?.find((eu: any) => eu.email === email);

    let userId: string;
    if (existing) {
      userId = existing.id;
      await admin.auth.admin.updateUserById(userId, { password });
    } else {
      const { data: newUser, error: authErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (authErr) return jsonResponse({ error: authErr.message }, 500);
      userId = newUser.user.id;
    }

    // Profile
    await admin
      .from("profiles")
      .upsert({ user_id: userId, full_name: fullName, email }, { onConflict: "user_id" });

    // Single-tenant: 1 role por usuário (delete + insert)
    await admin.from("user_roles").delete().eq("user_id", userId);
    const { error: roleErr } = await admin
      .from("user_roles")
      .insert({ user_id: userId, company_id: companyId, role: requestedRole });

    if (roleErr) return jsonResponse({ error: roleErr.message }, 500);

    // Sem assinatura automática.
    return jsonResponse({ success: true, user_id: userId, role: requestedRole });
  } catch (error: any) {
    console.error("[seed-users] error:", error);
    return jsonResponse({ error: error.message || "Erro desconhecido" }, 500);
  }
});

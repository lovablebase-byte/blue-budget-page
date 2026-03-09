import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Fonte única de verdade: permissões padrão por papel ──
const ADMIN_DEFAULT_PERMISSIONS = [
  { module: 'dashboard', can_view: true, can_create: false, can_edit: false, can_delete: false, extra: {} },
  { module: 'instances', can_view: true, can_create: true, can_edit: true, can_delete: true,
    extra: { pair: true, reconnect: true, disconnect: true, test_message: true } },
  { module: 'greetings', can_view: true, can_create: true, can_edit: true, can_delete: true, extra: { test: true } },
  { module: 'absence', can_view: true, can_create: true, can_edit: true, can_delete: true, extra: {} },
  { module: 'status', can_view: true, can_create: true, can_edit: true, can_delete: true, extra: { apply: true } },
  { module: 'chatbot_keys', can_view: true, can_create: true, can_edit: true, can_delete: true,
    extra: { revoke: true, edit_scopes: true } },
  { module: 'workflow', can_view: true, can_create: true, can_edit: true, can_delete: true,
    extra: { publish: true, test: true } },
  { module: 'ai_agents', can_view: true, can_create: true, can_edit: true, can_delete: true, extra: { test: true } },
  { module: 'campaigns', can_view: true, can_create: true, can_edit: true, can_delete: true,
    extra: { send: true, pause: true, reports: true } },
  { module: 'settings', can_view: true, can_create: false, can_edit: true, can_delete: false, extra: {} },
];

const OPERATOR_DEFAULT_PERMISSIONS = [
  { module: 'dashboard', can_view: true, can_create: false, can_edit: false, can_delete: false, extra: {} },
  { module: 'instances', can_view: true, can_create: false, can_edit: true, can_delete: false,
    extra: { pair: true, test_message: true } },
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const results: string[] = [];

    // 1. Check/create "Empresa Demo"
    let companyId: string;
    const { data: existingCompany } = await supabase
      .from("companies").select("id").eq("slug", "empresa-demo").single();

    if (existingCompany) {
      companyId = existingCompany.id;
      results.push("Empresa Demo já existe");
    } else {
      const { data: newCompany, error: companyErr } = await supabase
        .from("companies").insert({ name: "Empresa Demo", slug: "empresa-demo" }).select("id").single();
      if (companyErr) throw companyErr;
      companyId = newCompany.id;
      results.push("Empresa Demo criada");
    }

    // 2. Check/create subscription with Pro plan
    const { data: plan } = await supabase.from("plans").select("id").eq("name", "Pro").single();
    if (plan) {
      const { data: existingSub } = await supabase
        .from("subscriptions").select("id").eq("company_id", companyId).single();
      if (!existingSub) {
        await supabase.from("subscriptions").insert({
          company_id: companyId, plan_id: plan.id, status: "active",
          started_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        });
        results.push("Assinatura Pro criada");
      } else {
        results.push("Assinatura já existe");
      }
    }

    // 3. Get all modules
    const { data: modules } = await supabase.from("modules").select("id, name");
    const moduleMap = new Map((modules || []).map((m: any) => [m.name, m.id]));

    // 4. Seed users
    const users = [
      { email: "superadmin@superadmin.com", password: "123456", fullName: "Super Admin", role: "super_admin", companyId: null as string | null, perms: [] as typeof ADMIN_DEFAULT_PERMISSIONS },
      { email: "admin@admin.com", password: "123456", fullName: "Admin Demo", role: "admin", companyId, perms: ADMIN_DEFAULT_PERMISSIONS },
      { email: "usuario@usuario.com", password: "123456", fullName: "Operador Demo", role: "user", companyId, perms: OPERATOR_DEFAULT_PERMISSIONS },
    ];

    for (const u of users) {
      // Find or create auth user
      const { data: existingUsers } = await supabase.auth.admin.listUsers();
      const existing = existingUsers?.users?.find((eu: any) => eu.email === u.email);

      let userId: string;
      if (existing) {
        userId = existing.id;
        results.push(`${u.email} já existe`);
      } else {
        const { data: newUser, error: authErr } = await supabase.auth.admin.createUser({
          email: u.email, password: u.password, email_confirm: true,
          user_metadata: { full_name: u.fullName },
        });
        if (authErr) throw authErr;
        userId = newUser.user.id;
        results.push(`${u.email} criado`);
      }

      // Ensure profile
      const { data: existingProfile } = await supabase
        .from("profiles").select("id").eq("user_id", userId).single();
      if (!existingProfile) {
        await supabase.from("profiles").insert({
          user_id: userId, full_name: u.fullName, force_password_change: true,
        });
      } else {
        await supabase.from("profiles").update({ force_password_change: true }).eq("user_id", userId);
      }

      // Ensure user_role
      const { data: existingRole } = await supabase
        .from("user_roles").select("id").eq("user_id", userId).single();

      let userRoleId: string;
      if (!existingRole) {
        const { data: newRole, error: roleErr } = await supabase
          .from("user_roles").insert({ user_id: userId, role: u.role, company_id: u.companyId })
          .select("id").single();
        if (roleErr) throw roleErr;
        userRoleId = newRole.id;
        results.push(`Role ${u.role} atribuído a ${u.email}`);
      } else {
        userRoleId = existingRole.id;
      }

      // ── UPSERT de permissões: adicionar faltantes, nunca remover existentes ──
      if (u.perms.length > 0 && moduleMap.size > 0) {
        // Buscar permissões atuais
        const { data: currentPerms } = await supabase
          .from("permissions")
          .select("module_id")
          .eq("user_role_id", userRoleId);
        
        const existingModuleIds = new Set((currentPerms || []).map((p: any) => p.module_id));

        for (const pm of u.perms) {
          const moduleId = moduleMap.get(pm.module);
          if (!moduleId) continue; // módulo não existe ainda no DB, pular
          
          if (existingModuleIds.has(moduleId)) {
            // Já existe — não sobrescrever (preservar customizações)
            continue;
          }

          await supabase.from("permissions").insert({
            user_role_id: userRoleId,
            module_id: moduleId,
            can_view: pm.can_view,
            can_create: pm.can_create,
            can_edit: pm.can_edit,
            can_delete: pm.can_delete,
            extra_permissions: pm.extra || {},
          });
        }
        results.push(`Permissões default aplicadas a ${u.email}`);
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

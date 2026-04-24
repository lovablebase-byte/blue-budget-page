import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const results: string[] = [];
    const body = req.headers.get('content-type')?.includes('application/json')
      ? await req.json().catch(() => ({}))
      : {};

    const email = body.email;
    const fullName = body.full_name || email || 'Novo Usuário';
    const password = body.password || '123456';
    const requestedRole = body.role === 'admin' ? 'admin' : 'user';

    if (!email) {
      throw new Error("Email é obrigatório");
    }

    // ── Single-tenant: SEMPRE vincular ao tenant principal ──
    let { data: mainTenant } = await supabase
      .from('companies')
      .select('id')
      .eq('slug', 'main-tenant')
      .maybeSingle();

    if (!mainTenant) {
      const { data: anyCompany } = await supabase
        .from('companies')
        .select('id')
        .order('created_at')
        .limit(1)
        .maybeSingle();
      
      if (anyCompany) {
        mainTenant = anyCompany;
      } else {
        const { data: newTenant, error: createErr } = await supabase
          .from('companies')
          .insert({ name: 'Tenant Principal', slug: 'main-tenant', is_active: true })
          .select('id')
          .single();
        if (createErr) throw createErr;
        mainTenant = newTenant;
      }
    }

    const companyId = mainTenant.id;

    // Verificar se usuário já existe
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existing = existingUsers?.users?.find((eu: any) => eu.email === email);

    let userId: string;
    if (existing) {
      userId = existing.id;
      await supabase.auth.admin.updateUserById(userId, { password });
      results.push(`${email} já existe (senha atualizada)`);
    } else {
      const { data: newUser, error: authErr } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (authErr) throw authErr;
      userId = newUser.user.id;
      results.push(`${email} criado`);
    }

    // Garantir profile
    await supabase
      .from('profiles')
      .upsert({ user_id: userId, full_name: fullName, email }, { onConflict: 'user_id' });

    // Garantir UM ÚNICO role (upsert via delete + insert)
    await supabase.from('user_roles').delete().eq('user_id', userId);
    
    const { error: roleErr } = await supabase
      .from('user_roles')
      .insert({ user_id: userId, company_id: companyId, role: requestedRole });
    
    if (roleErr) throw roleErr;
    results.push(`Role '${requestedRole}' atribuído a ${email}`);

    // IMPORTANTE: NÃO criar assinatura automática.
    // Usuário começa sem plano e deve escolher manualmente.

    return new Response(JSON.stringify({ success: true, results, user_id: userId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error('seed-users error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

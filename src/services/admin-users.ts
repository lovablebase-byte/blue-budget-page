/**
 * admin-users — fonte ÚNICA de verdade para gestão de usuários no painel admin.
 *
 * Todas as telas (Dashboard Admin, Admin > Usuários, Subscription) consomem
 * estas funções para garantir contagem e listagem coerentes.
 */
import { supabase } from '@/integrations/supabase/client';

export type AdminUserRole = 'admin' | 'user';

export interface AdminUserRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: AdminUserRole;
  role_id: string | null;
  created_at: string;
}

/** Lista todos os usuários reais (auth + profile + role). */
export async function listAdminUsers(): Promise<AdminUserRow[]> {
  // 1. profiles é a fonte de "usuário real" (handle_new_user garante 1 profile por auth.user)
  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('user_id, full_name, email, created_at')
    .order('created_at', { ascending: false });
  if (pErr) {
    console.error('[admin-users] listAdminUsers profiles error:', pErr);
    throw pErr;
  }

  const { data: roles, error: rErr } = await supabase
    .from('user_roles')
    .select('id, user_id, role');
  if (rErr) {
    console.error('[admin-users] listAdminUsers roles error:', rErr);
    throw rErr;
  }

  const roleMap = new Map<string, { id: string; role: AdminUserRole }>();
  (roles || []).forEach((r) => {
    const normalized = (r.role === 'super_admin' ? 'admin' : r.role) as AdminUserRole;
    roleMap.set(r.user_id, { id: r.id, role: normalized });
  });

  return (profiles || []).map((p) => {
    const r = roleMap.get(p.user_id);
    return {
      user_id: p.user_id,
      full_name: p.full_name,
      email: p.email,
      created_at: p.created_at,
      role: r?.role ?? 'user',
      role_id: r?.id ?? null,
    };
  });
}

/** Conta usuários finais (excluindo admins) — para limites de plano e dashboard. */
export async function countEndUsers(): Promise<number> {
  const { count, error } = await supabase
    .from('user_roles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'user');
  if (error) {
    console.error('[admin-users] countEndUsers error:', error);
    throw error;
  }
  return count ?? 0;
}

/** Conta TODOS os usuários reais (admin + user). */
export async function countAllUsers(): Promise<number> {
  const { count, error } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true });
  if (error) {
    console.error('[admin-users] countAllUsers error:', error);
    throw error;
  }
  return count ?? 0;
}

/** Cria (ou faz upsert) usuário via edge function `seed-users`. */
export async function createAdminUser(input: {
  email: string;
  full_name?: string;
  password?: string;
  role: AdminUserRole;
}): Promise<{ user_id: string }> {
  console.log('[admin-users] createAdminUser', { email: input.email, role: input.role });
  const { data, error } = await supabase.functions.invoke('seed-users', {
    body: { action: 'create', ...input },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

/** Remove usuário via edge function (auth + profile + roles). */
export async function deleteAdminUser(userId: string): Promise<void> {
  console.log('[admin-users] deleteAdminUser', { userId });
  const { data, error } = await supabase.functions.invoke('seed-users', {
    body: { action: 'delete', user_id: userId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
}

/** Atualiza role do usuário (single-tenant: replace). */
export async function updateAdminUserRole(userId: string, role: AdminUserRole): Promise<void> {
  console.log('[admin-users] updateAdminUserRole', { userId, role });
  const { data: tenant } = await supabase
    .from('companies')
    .select('id')
    .eq('slug', 'main-tenant')
    .maybeSingle();

  await supabase.from('user_roles').delete().eq('user_id', userId);
  const { error } = await supabase
    .from('user_roles')
    .insert({ user_id: userId, role, company_id: tenant?.id ?? null });
  if (error) throw error;
}

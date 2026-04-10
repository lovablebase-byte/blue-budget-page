/**
 * Serviço centralizado para configurações admin → cliente.
 * Lida com global_settings, company_settings, company_overrides e plan_allowed_providers.
 */
import { supabase } from '@/integrations/supabase/client';

// ── Global Settings ──

export async function getGlobalSettings() {
  const { data, error } = await supabase
    .from('global_settings')
    .select('*')
    .order('setting_key');
  if (error) throw error;
  return data;
}

export async function upsertGlobalSetting(key: string, value: string, description?: string) {
  const { error } = await supabase
    .from('global_settings')
    .upsert({ setting_key: key, setting_value: value, description }, { onConflict: 'setting_key' });
  if (error) throw error;
}

// ── Company Settings (override global) ──

export async function getCompanySettings(companyId: string) {
  const { data, error } = await supabase
    .from('company_settings')
    .select('*')
    .eq('company_id', companyId)
    .order('setting_key');
  if (error) throw error;
  return data;
}

export async function upsertCompanySetting(companyId: string, key: string, value: string) {
  const { error } = await supabase
    .from('company_settings')
    .upsert(
      { company_id: companyId, setting_key: key, setting_value: value },
      { onConflict: 'company_id,setting_key' }
    );
  if (error) throw error;
}

// ── Company Overrides (plan limit overrides) ──

export async function getCompanyOverrides(companyId: string) {
  const { data, error } = await supabase
    .from('company_overrides')
    .select('*')
    .eq('company_id', companyId)
    .order('override_key');
  if (error) throw error;
  return data;
}

export async function upsertCompanyOverride(companyId: string, key: string, value: string, notes?: string) {
  const { error } = await supabase
    .from('company_overrides')
    .upsert(
      { company_id: companyId, override_key: key, override_value: value, notes },
      { onConflict: 'company_id,override_key' }
    );
  if (error) throw error;
}

export async function deleteCompanyOverride(companyId: string, key: string) {
  const { error } = await supabase
    .from('company_overrides')
    .delete()
    .eq('company_id', companyId)
    .eq('override_key', key);
  if (error) throw error;
}

// ── Plan Allowed Providers ──

export async function getPlanProviders(planId: string) {
  const { data, error } = await supabase
    .from('plan_allowed_providers')
    .select('*')
    .eq('plan_id', planId);
  if (error) throw error;
  return data;
}

export async function setPlanProviders(planId: string, providers: string[]) {
  // Delete existing
  await supabase.from('plan_allowed_providers').delete().eq('plan_id', planId);
  // Insert new
  if (providers.length > 0) {
    const rows = providers.map(p => ({ plan_id: planId, provider: p }));
    const { error } = await supabase.from('plan_allowed_providers').insert(rows);
    if (error) throw error;
  }
}

// ── Effective limit (uses DB function) ──

export async function getEffectiveLimit(companyId: string, limitKey: string): Promise<number> {
  const { data, error } = await supabase.rpc('get_effective_limit', {
    _company_id: companyId,
    _limit_key: limitKey,
  });
  if (error) throw error;
  return data ?? 0;
}

// ── Effective setting (uses DB function) ──

export async function getEffectiveSetting(companyId: string, key: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_effective_setting', {
    _company_id: companyId,
    _key: key,
  });
  if (error) throw error;
  return data;
}

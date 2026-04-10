import { supabase } from '@/integrations/supabase/client';

/**
 * Verifica se a empresa pode criar mais instâncias com base no plano.
 * Usado pelo painel do cliente (futuro) e validação no admin.
 */
export async function canCreateInstance(companyId: string): Promise<{ allowed: boolean; current: number; max: number }> {
  // Check override first
  const { data: override } = await supabase
    .from('company_overrides')
    .select('override_value')
    .eq('company_id', companyId)
    .eq('override_key', 'max_instances')
    .single();

  let maxInstances = 0;

  if (override) {
    maxInstances = parseInt(override.override_value, 10);
  } else {
    // Get from plan
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('plans(max_instances)')
      .eq('company_id', companyId)
      .in('status', ['active', 'trialing'])
      .single();
    maxInstances = (sub as any)?.plans?.max_instances ?? 0;
  }

  const { count } = await supabase
    .from('instances')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId);

  const current = count ?? 0;

  return { allowed: current < maxInstances, current, max: maxInstances };
}

/**
 * Verifica se o provider é permitido pelo plano da empresa.
 */
export async function isProviderAllowed(companyId: string, provider: string): Promise<boolean> {
  // Get company's plan
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('plan_id')
    .eq('company_id', companyId)
    .in('status', ['active', 'trialing'])
    .single();

  if (!sub) return false;

  // Check plan_allowed_providers
  const { data: allowed } = await supabase
    .from('plan_allowed_providers')
    .select('id')
    .eq('plan_id', sub.plan_id)
    .eq('provider', provider);

  // If no providers configured for this plan, allow all (backward compat)
  if (!allowed || allowed.length === 0) {
    const { count } = await supabase
      .from('plan_allowed_providers')
      .select('id', { count: 'exact', head: true })
      .eq('plan_id', sub.plan_id);
    return (count ?? 0) === 0; // No restrictions = all allowed
  }

  return allowed.length > 0;
}

/**
 * Plan enforcement service — checks limits and features against
 * the company's active subscription, with override support.
 *
 * Designed to be used by client-side pages to:
 * - Block creation when limits are reached
 * - Show locked features
 * - Display remaining quota
 */

import { supabase } from '@/integrations/supabase/client';

export interface PlanLimits {
  max_instances: number;
  max_users: number;
  max_messages_month: number;
  max_messages_day: number;
  max_campaigns: number;
  max_ai_agents: number;
  max_chatbots: number;
  max_workflows: number;
  max_contacts: number;
}

export interface PlanFeatures {
  campaigns_enabled: boolean;
  workflows_enabled: boolean;
  ai_agents_enabled: boolean;
  api_access: boolean;
  whitelabel_enabled: boolean;
}

export interface EffectivePlan {
  plan_id: string;
  plan_name: string;
  billing_cycle: string;
  status: string;
  limits: PlanLimits;
  features: PlanFeatures;
  support_priority: string;
  expires_at: string | null;
  renewal_date: string | null;
}

/** Fetch the effective plan for a company, including overrides */
export async function getEffectivePlan(companyId: string): Promise<EffectivePlan | null> {
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('*, plans(*)')
    .eq('company_id', companyId)
    .in('status', ['active', 'trialing'])
    .single();

  if (!sub || !sub.plans) return null;
  const plan = sub.plans as any;

  // Fetch overrides
  const { data: overrides } = await supabase
    .from('company_overrides')
    .select('override_key, override_value')
    .eq('company_id', companyId);

  const overrideMap: Record<string, string> = {};
  (overrides || []).forEach((o: any) => { overrideMap[o.override_key] = o.override_value; });

  const getLimit = (key: string, planVal: number): number => {
    return overrideMap[key] ? parseInt(overrideMap[key], 10) : planVal;
  };

  return {
    plan_id: plan.id,
    plan_name: plan.name,
    billing_cycle: plan.billing_cycle || 'monthly',
    status: sub.status,
    limits: {
      max_instances: getLimit('max_instances', plan.max_instances),
      max_users: getLimit('max_users', plan.max_users),
      max_messages_month: getLimit('max_messages_month', plan.max_messages_month),
      max_messages_day: getLimit('max_messages_day', plan.max_messages_day),
      max_campaigns: getLimit('max_campaigns', plan.max_campaigns),
      max_ai_agents: getLimit('max_ai_agents', plan.max_ai_agents),
      max_chatbots: getLimit('max_chatbots', plan.max_chatbots),
      max_workflows: getLimit('max_workflows', plan.max_workflows),
      max_contacts: getLimit('max_contacts', plan.max_contacts),
    },
    features: {
      campaigns_enabled: plan.campaigns_enabled,
      workflows_enabled: plan.workflows_enabled,
      ai_agents_enabled: plan.ai_agents_enabled,
      api_access: plan.api_access,
      whitelabel_enabled: plan.whitelabel_enabled,
    },
    support_priority: plan.support_priority,
    expires_at: sub.expires_at,
    renewal_date: sub.renewal_date,
  };
}

/** Check if a specific resource limit has been reached */
export async function checkResourceLimit(
  companyId: string,
  resource: keyof PlanLimits,
  table: string,
): Promise<{ allowed: boolean; current: number; max: number }> {
  const plan = await getEffectivePlan(companyId);
  if (!plan) return { allowed: false, current: 0, max: 0 };

  const max = plan.limits[resource];
  const { count } = await supabase
    .from(table as any)
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId);

  const current = count ?? 0;
  return { allowed: current < max, current, max };
}

/** Check if a feature is enabled for the company's plan */
export async function isFeatureEnabled(
  companyId: string,
  feature: keyof PlanFeatures,
): Promise<boolean> {
  const plan = await getEffectivePlan(companyId);
  if (!plan) return false;
  return plan.features[feature];
}

/** Get allowed providers for a company's plan */
export async function getAllowedProviders(companyId: string): Promise<string[]> {
  const plan = await getEffectivePlan(companyId);
  if (!plan) return [];

  const { data } = await supabase
    .from('plan_allowed_providers')
    .select('provider')
    .eq('plan_id', plan.plan_id);

  // If no providers configured, all are allowed
  if (!data || data.length === 0) return ['evolution', 'wuzapi'];
  return data.map((p: any) => p.provider);
}

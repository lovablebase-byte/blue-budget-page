/**
 * Plan enforcement service — checks limits and features against
 * the company's active subscription, with override support.
 */

import { supabase } from '@/integrations/supabase/client';

export interface PlanLimits {
  max_instances: number;
  max_users: number;
  max_messages_month: number;
  max_messages_day: number;
  max_campaigns: number;
  max_ai_agents: number;
  max_contacts: number;
}

export interface PlanFeatures {
  instances_enabled: boolean;
  campaigns_enabled: boolean;
  ai_agents_enabled: boolean;
  invoices_enabled: boolean;
  branding_enabled: boolean;
  api_access: boolean;
  whitelabel_enabled: boolean;
  advanced_logs_enabled: boolean;
  advanced_webhooks_enabled: boolean;
}

export interface EffectivePlan {
  plan_id: string;
  plan_name: string;
  plan_slug: string | null;
  plan_description: string | null;
  billing_cycle: string;
  status: string;
  limits: PlanLimits;
  features: PlanFeatures;
  support_priority: string;
  is_popular: boolean;
  price_cents: number;
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

  const getFeature = (key: string, planVal: boolean): boolean => {
    if (overrideMap[key]) return overrideMap[key] === 'true';
    return planVal;
  };

  return {
    plan_id: plan.id,
    plan_name: plan.name,
    plan_slug: plan.slug || null,
    plan_description: plan.description || null,
    billing_cycle: plan.billing_cycle || 'monthly',
    status: sub.status,
    limits: {
      max_instances: getLimit('max_instances', plan.max_instances),
      max_users: getLimit('max_users', plan.max_users),
      max_messages_month: getLimit('max_messages_month', plan.max_messages_month),
      max_messages_day: getLimit('max_messages_day', plan.max_messages_day),
      max_campaigns: getLimit('max_campaigns', plan.max_campaigns),
      max_ai_agents: getLimit('max_ai_agents', plan.max_ai_agents),
      max_contacts: getLimit('max_contacts', plan.max_contacts),
    },
    features: {
      instances_enabled: getFeature('instances_enabled', plan.instances_enabled ?? true),
      campaigns_enabled: getFeature('campaigns_enabled', plan.campaigns_enabled),
      ai_agents_enabled: getFeature('ai_agents_enabled', plan.ai_agents_enabled),
      invoices_enabled: getFeature('invoices_enabled', plan.invoices_enabled ?? true),
      branding_enabled: getFeature('branding_enabled', plan.branding_enabled ?? false),
      api_access: getFeature('api_access', plan.api_access),
      whitelabel_enabled: getFeature('whitelabel_enabled', plan.whitelabel_enabled),
      advanced_logs_enabled: getFeature('advanced_logs_enabled', plan.advanced_logs_enabled ?? false),
      advanced_webhooks_enabled: getFeature('advanced_webhooks_enabled', plan.advanced_webhooks_enabled ?? false),
    },
    support_priority: plan.support_priority,
    is_popular: plan.is_popular ?? false,
    price_cents: plan.price_cents ?? 0,
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

  // Fallback (plano sem providers explícitos): libera todos os conhecidos
  if (!data || data.length === 0) return ['evolution', 'wuzapi', 'evolution_go'];
  return data.map((p: any) => p.provider);
}

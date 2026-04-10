/**
 * Tipos administrativos para reflexão admin → cliente.
 * Usados pelo painel admin e futuramente pelo painel do cliente.
 */

export interface CompanyOverride {
  id: string;
  company_id: string;
  override_key: string;
  override_value: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Chaves válidas para override de limites do plano */
export type OverrideKey =
  | 'max_instances'
  | 'max_users'
  | 'max_messages_month'
  | 'max_messages_day'
  | 'max_campaigns'
  | 'max_ai_agents'
  | 'max_chatbots'
  | 'max_workflows'
  | 'max_contacts';

export interface GlobalSetting {
  id: string;
  setting_key: string;
  setting_value: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompanySetting {
  id: string;
  company_id: string;
  setting_key: string;
  setting_value: string;
  created_at: string;
  updated_at: string;
}

export interface PlanAllowedProvider {
  id: string;
  plan_id: string;
  provider: string;
  created_at: string;
}

/** Representação unificada de limites efetivos de uma empresa */
export interface EffectiveLimits {
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

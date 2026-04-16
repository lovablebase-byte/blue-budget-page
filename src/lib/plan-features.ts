export const PLAN_FEATURE_LABELS = {
  instances_enabled: 'Instâncias',
  campaigns_enabled: 'Campanhas',
  ai_agents_enabled: 'Agentes IA',
  invoices_enabled: 'Faturas',
  branding_enabled: 'Marca própria',
  api_access: 'API externa',
  whitelabel_enabled: 'White-label',
  advanced_logs_enabled: 'Logs avançados',
  advanced_webhooks_enabled: 'Webhooks avançados',
} as const;

export type PlanFeatureKey = keyof typeof PLAN_FEATURE_LABELS;

export const PLAN_FEATURES = Object.entries(PLAN_FEATURE_LABELS).map(([key, label]) => ({
  key: key as PlanFeatureKey,
  label,
}));

export const MODULE_FEATURE_KEYS = {
  instances: 'instances_enabled',
  campaigns: 'campaigns_enabled',
  ai_agents: 'ai_agents_enabled',
} as const;

export const SETTINGS_FEATURE_KEYS = {
  invoices: 'invoices_enabled',
  branding: 'branding_enabled',
  whitelabel: 'whitelabel_enabled',
  api: 'api_access',
  advanced_logs: 'advanced_logs_enabled',
  advanced_webhooks: 'advanced_webhooks_enabled',
} as const;

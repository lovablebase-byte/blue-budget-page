export type AppRole = 'admin' | 'user';

export type ModuleName = 
  | 'dashboard' | 'instances' | 'ai_agents' 
  | 'campaigns' | 'settings';

export interface ModulePermission {
  module: ModuleName;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  extra_permissions?: Record<string, boolean>;
}

export interface UserRoleData {
  id: string;
  user_id: string;
  company_id: string | null;
  role: AppRole;
}

export interface CompanyData {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
}

export interface SubscriptionData {
  id: string;
  company_id: string;
  plan_id: string;
  status: 'active' | 'past_due' | 'canceled' | 'trialing';
  expires_at: string | null;
  plan?: PlanData;
}

export interface PlanData {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  max_instances: number;
  max_messages_month: number;
  campaigns_enabled: boolean;
  workflows_enabled: boolean;
  ai_agents_enabled: boolean;
  max_users: number;
}

export interface PermissionPreset {
  id: string;
  name: string;
  label: string;
  description: string | null;
  permissions: ModulePermission[];
}


-- 1. company_overrides: admin overrides plan limits per company
CREATE TABLE public.company_overrides (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  override_key text NOT NULL,
  override_value text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, override_key)
);

ALTER TABLE public.company_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_company_overrides" ON public.company_overrides
  FOR ALL USING (is_super_admin());

CREATE POLICY "company_view_own_overrides" ON public.company_overrides
  FOR SELECT USING (is_company_member(company_id));

CREATE TRIGGER update_company_overrides_updated_at
  BEFORE UPDATE ON public.company_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. global_settings: system-wide config inherited by all companies
CREATE TABLE public.global_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key text NOT NULL UNIQUE,
  setting_value text NOT NULL DEFAULT '',
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.global_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_global_settings" ON public.global_settings
  FOR ALL USING (is_super_admin());

CREATE POLICY "authenticated_view_global_settings" ON public.global_settings
  FOR SELECT TO authenticated USING (true);

CREATE TRIGGER update_global_settings_updated_at
  BEFORE UPDATE ON public.global_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. company_settings: per-company config that overrides global
CREATE TABLE public.company_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  setting_key text NOT NULL,
  setting_value text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, setting_key)
);

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_company_settings" ON public.company_settings
  FOR ALL USING (is_super_admin());

CREATE POLICY "admin_manage_own_company_settings" ON public.company_settings
  FOR ALL USING (is_company_admin(company_id))
  WITH CHECK (is_company_admin(company_id));

CREATE POLICY "company_view_own_settings" ON public.company_settings
  FOR SELECT USING (is_company_member(company_id));

CREATE TRIGGER update_company_settings_updated_at
  BEFORE UPDATE ON public.company_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. plan_allowed_providers: which WhatsApp providers each plan can use
CREATE TABLE public.plan_allowed_providers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id uuid NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  provider text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(plan_id, provider)
);

ALTER TABLE public.plan_allowed_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_view_plan_providers" ON public.plan_allowed_providers
  FOR SELECT USING (true);

CREATE POLICY "super_admin_manage_plan_providers" ON public.plan_allowed_providers
  FOR ALL USING (is_super_admin());

-- 5. Helper function: get effective setting (company override > global)
CREATE OR REPLACE FUNCTION public.get_effective_setting(_company_id uuid, _key text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT setting_value FROM public.company_settings WHERE company_id = _company_id AND setting_key = _key LIMIT 1),
    (SELECT setting_value FROM public.global_settings WHERE setting_key = _key LIMIT 1)
  )
$$;

-- 6. Helper function: get effective limit (company override > plan default)
CREATE OR REPLACE FUNCTION public.get_effective_limit(_company_id uuid, _limit_key text)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT override_value::integer FROM public.company_overrides WHERE company_id = _company_id AND override_key = _limit_key LIMIT 1),
    (SELECT CASE _limit_key
      WHEN 'max_instances' THEN p.max_instances
      WHEN 'max_users' THEN p.max_users
      WHEN 'max_messages_month' THEN p.max_messages_month
      WHEN 'max_messages_day' THEN p.max_messages_day
      WHEN 'max_campaigns' THEN p.max_campaigns
      WHEN 'max_ai_agents' THEN p.max_ai_agents
      WHEN 'max_chatbots' THEN p.max_chatbots
      WHEN 'max_workflows' THEN p.max_workflows
      WHEN 'max_contacts' THEN p.max_contacts
      ELSE 0
    END
    FROM public.subscriptions s
    JOIN public.plans p ON p.id = s.plan_id
    WHERE s.company_id = _company_id AND s.status IN ('active', 'trialing')
    LIMIT 1)
  )
$$;

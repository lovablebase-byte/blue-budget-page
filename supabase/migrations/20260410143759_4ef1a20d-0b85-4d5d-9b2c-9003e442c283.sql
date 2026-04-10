
-- 1. Create whatsapp_api_configs table
CREATE TABLE public.whatsapp_api_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider text NOT NULL,
  base_url text NOT NULL DEFAULT '',
  api_key text,
  is_active boolean NOT NULL DEFAULT false,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_api_configs_provider_check CHECK (provider IN ('evolution', 'wuzapi')),
  CONSTRAINT whatsapp_api_configs_company_provider_unique UNIQUE (company_id, provider)
);

-- 2. Enable RLS
ALTER TABLE public.whatsapp_api_configs ENABLE ROW LEVEL SECURITY;

-- 3. RLS policies (same pattern as evolution_api_config)
CREATE POLICY "company_view_whatsapp_configs"
  ON public.whatsapp_api_configs FOR SELECT
  TO authenticated
  USING (is_company_member(company_id));

CREATE POLICY "admin_manage_whatsapp_configs"
  ON public.whatsapp_api_configs FOR ALL
  TO authenticated
  USING (is_company_admin(company_id))
  WITH CHECK (is_company_admin(company_id));

CREATE POLICY "super_admin_whatsapp_configs"
  ON public.whatsapp_api_configs FOR ALL
  TO authenticated
  USING (is_super_admin());

-- 4. Trigger updated_at
CREATE TRIGGER update_whatsapp_api_configs_updated_at
  BEFORE UPDATE ON public.whatsapp_api_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Add provider columns to instances
ALTER TABLE public.instances
  ADD COLUMN provider text NOT NULL DEFAULT 'evolution',
  ADD COLUMN provider_instance_id text;

-- 6. Backfill existing instances
UPDATE public.instances
  SET provider = 'evolution',
      provider_instance_id = evolution_instance_id
  WHERE evolution_instance_id IS NOT NULL;

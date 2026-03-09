
-- Evolution API configuration per company
CREATE TABLE public.evolution_api_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  base_url TEXT NOT NULL DEFAULT '',
  api_key TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(company_id)
);

ALTER TABLE public.evolution_api_config ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "admin_manage_evo_config" ON public.evolution_api_config
  FOR ALL TO authenticated
  USING (is_company_admin(company_id))
  WITH CHECK (is_company_admin(company_id));

CREATE POLICY "company_view_evo_config" ON public.evolution_api_config
  FOR SELECT TO authenticated
  USING (is_company_member(company_id));

CREATE POLICY "super_admin_evo_config" ON public.evolution_api_config
  FOR ALL TO authenticated
  USING (is_super_admin());

-- updated_at trigger
CREATE TRIGGER update_evolution_api_config_updated_at
  BEFORE UPDATE ON public.evolution_api_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

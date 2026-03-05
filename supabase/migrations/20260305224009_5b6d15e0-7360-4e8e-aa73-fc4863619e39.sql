
CREATE TABLE public.human_behavior_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  typing_simulation_enabled BOOLEAN NOT NULL DEFAULT true,
  typing_speed_min NUMERIC NOT NULL DEFAULT 3,
  typing_speed_max NUMERIC NOT NULL DEFAULT 7,
  human_pause_min INTEGER NOT NULL DEFAULT 8,
  human_pause_max INTEGER NOT NULL DEFAULT 25,
  burst_limit INTEGER NOT NULL DEFAULT 20,
  cooldown_after_burst_min INTEGER NOT NULL DEFAULT 120,
  cooldown_after_burst_max INTEGER NOT NULL DEFAULT 300,
  instance_variation JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(company_id)
);

ALTER TABLE public.human_behavior_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_view_hb" ON public.human_behavior_config FOR SELECT USING (is_company_member(company_id));
CREATE POLICY "admin_manage_hb" ON public.human_behavior_config FOR INSERT WITH CHECK (is_company_admin(company_id));
CREATE POLICY "admin_update_hb" ON public.human_behavior_config FOR UPDATE USING (is_company_admin(company_id));
CREATE POLICY "admin_delete_hb" ON public.human_behavior_config FOR DELETE USING (is_company_admin(company_id));
CREATE POLICY "super_admin_hb" ON public.human_behavior_config FOR ALL USING (is_super_admin());

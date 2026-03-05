
-- Company branding table
CREATE TABLE public.company_branding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  logo_light_url TEXT,
  logo_dark_url TEXT,
  favicon_url TEXT,
  site_title TEXT DEFAULT 'Painel',
  custom_domain TEXT,
  primary_color TEXT DEFAULT '221 83% 53%',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id)
);

ALTER TABLE public.company_branding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_view_branding" ON public.company_branding FOR SELECT USING (is_company_member(company_id));
CREATE POLICY "admin_manage_branding" ON public.company_branding FOR INSERT WITH CHECK (is_company_admin(company_id));
CREATE POLICY "admin_update_branding" ON public.company_branding FOR UPDATE USING (is_company_admin(company_id));
CREATE POLICY "admin_delete_branding" ON public.company_branding FOR DELETE USING (is_company_admin(company_id));
CREATE POLICY "super_admin_branding" ON public.company_branding FOR ALL USING (is_super_admin());

-- Storage bucket for branding assets
INSERT INTO storage.buckets (id, name, public) VALUES ('branding', 'branding', true);

-- Storage RLS policies
CREATE POLICY "company_upload_branding" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'branding' AND auth.role() = 'authenticated'
);
CREATE POLICY "public_read_branding" ON storage.objects FOR SELECT USING (
  bucket_id = 'branding'
);
CREATE POLICY "company_delete_branding" ON storage.objects FOR DELETE USING (
  bucket_id = 'branding' AND auth.role() = 'authenticated'
);

-- Trigger for updated_at
CREATE TRIGGER update_company_branding_updated_at
  BEFORE UPDATE ON public.company_branding
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

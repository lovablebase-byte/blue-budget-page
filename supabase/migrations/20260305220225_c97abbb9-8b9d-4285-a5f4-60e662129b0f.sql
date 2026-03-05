
CREATE TABLE public.chatbot_keywords (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  instance_id uuid REFERENCES public.instances(id) ON DELETE SET NULL,
  keywords text[] NOT NULL DEFAULT '{}',
  response text NOT NULL,
  match_type text NOT NULL DEFAULT 'contains',
  audience text NOT NULL DEFAULT 'private',
  delay_seconds integer NOT NULL DEFAULT 2,
  save_history boolean NOT NULL DEFAULT true,
  media_url text,
  chain_to_id uuid REFERENCES public.chatbot_keywords(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.chatbot_keywords ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_view_keywords" ON public.chatbot_keywords FOR SELECT USING (is_company_member(company_id));
CREATE POLICY "admin_manage_keywords" ON public.chatbot_keywords FOR INSERT WITH CHECK (is_company_admin(company_id) OR has_module_permission('chatbot_keys', 'create'));
CREATE POLICY "admin_update_keywords" ON public.chatbot_keywords FOR UPDATE USING (is_company_admin(company_id) OR has_module_permission('chatbot_keys', 'edit'));
CREATE POLICY "admin_delete_keywords" ON public.chatbot_keywords FOR DELETE USING (is_company_admin(company_id) OR has_module_permission('chatbot_keys', 'delete'));
CREATE POLICY "super_admin_keywords" ON public.chatbot_keywords FOR ALL USING (is_super_admin());

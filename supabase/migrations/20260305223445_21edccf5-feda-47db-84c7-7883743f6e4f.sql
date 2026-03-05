
CREATE TABLE IF NOT EXISTS public.messages_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  instance_id UUID REFERENCES public.instances(id) ON DELETE SET NULL,
  contact_number TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'outgoing',
  message TEXT,
  media_url TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.messages_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_messages_log_company_id ON public.messages_log(company_id);
CREATE INDEX IF NOT EXISTS idx_messages_log_instance_id ON public.messages_log(instance_id);
CREATE INDEX IF NOT EXISTS idx_messages_log_contact_number ON public.messages_log(contact_number);
CREATE INDEX IF NOT EXISTS idx_messages_log_status ON public.messages_log(status);
CREATE INDEX IF NOT EXISTS idx_messages_log_campaign_id ON public.messages_log(campaign_id);
CREATE INDEX IF NOT EXISTS idx_messages_log_sent_at ON public.messages_log(sent_at);

CREATE POLICY "company_view_logs" ON public.messages_log FOR SELECT USING (is_company_member(company_id));
CREATE POLICY "company_insert_logs" ON public.messages_log FOR INSERT WITH CHECK (is_company_member(company_id));
CREATE POLICY "super_admin_logs" ON public.messages_log FOR ALL USING (is_super_admin());

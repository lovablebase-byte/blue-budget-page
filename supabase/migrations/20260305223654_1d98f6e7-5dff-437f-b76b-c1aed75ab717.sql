
-- Message queue table
CREATE TABLE IF NOT EXISTS public.message_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  instance_id UUID REFERENCES public.instances(id) ON DELETE SET NULL,
  phone TEXT NOT NULL,
  message TEXT NOT NULL,
  media_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.message_queue ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_mq_status ON public.message_queue(status);
CREATE INDEX idx_mq_campaign ON public.message_queue(campaign_id);
CREATE INDEX idx_mq_company ON public.message_queue(company_id);
CREATE INDEX idx_mq_instance ON public.message_queue(instance_id);
CREATE INDEX idx_mq_scheduled ON public.message_queue(scheduled_at);

CREATE POLICY "company_view_queue" ON public.message_queue FOR SELECT USING (is_company_member(company_id));
CREATE POLICY "company_insert_queue" ON public.message_queue FOR INSERT WITH CHECK (is_company_member(company_id));
CREATE POLICY "company_update_queue" ON public.message_queue FOR UPDATE USING (is_company_member(company_id));
CREATE POLICY "company_delete_queue" ON public.message_queue FOR DELETE USING (is_company_admin(company_id));
CREATE POLICY "super_admin_queue" ON public.message_queue FOR ALL USING (is_super_admin());

-- Instance limits table
CREATE TABLE IF NOT EXISTS public.instance_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES public.instances(id) ON DELETE CASCADE UNIQUE,
  max_per_minute INTEGER NOT NULL DEFAULT 10,
  max_per_hour INTEGER NOT NULL DEFAULT 200,
  max_per_day INTEGER NOT NULL DEFAULT 2000,
  messages_sent_minute INTEGER NOT NULL DEFAULT 0,
  messages_sent_hour INTEGER NOT NULL DEFAULT 0,
  messages_sent_day INTEGER NOT NULL DEFAULT 0,
  last_reset_minute TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_reset_hour TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_reset_day TIMESTAMPTZ NOT NULL DEFAULT now(),
  cooldown_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.instance_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_view_limits" ON public.instance_limits FOR SELECT USING (
  EXISTS (SELECT 1 FROM instances i WHERE i.id = instance_limits.instance_id AND is_company_member(i.company_id))
);
CREATE POLICY "company_manage_limits" ON public.instance_limits FOR ALL USING (
  EXISTS (SELECT 1 FROM instances i WHERE i.id = instance_limits.instance_id AND is_company_admin(i.company_id))
);
CREATE POLICY "super_admin_limits" ON public.instance_limits FOR ALL USING (is_super_admin());


-- Delivery WhatsApp integration config per company
CREATE TABLE public.delivery_whatsapp_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  endpoint_url TEXT NOT NULL DEFAULT '',
  store_phone TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id)
);

ALTER TABLE public.delivery_whatsapp_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manage_delivery_config" ON public.delivery_whatsapp_config FOR ALL TO authenticated
  USING (is_company_admin(company_id)) WITH CHECK (is_company_admin(company_id));
CREATE POLICY "company_view_delivery_config" ON public.delivery_whatsapp_config FOR SELECT TO authenticated
  USING (is_company_member(company_id));
CREATE POLICY "super_admin_delivery_config" ON public.delivery_whatsapp_config FOR ALL TO authenticated
  USING (is_super_admin());

-- Delivery message templates (one per event/status)
CREATE TABLE public.delivery_message_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL, -- e.g. 'new_order_store', 'new_order_client', 'status_aceito', 'status_preparando', etc.
  label TEXT NOT NULL,
  message_template TEXT NOT NULL DEFAULT '',
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, event_key)
);

ALTER TABLE public.delivery_message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manage_delivery_templates" ON public.delivery_message_templates FOR ALL TO authenticated
  USING (is_company_admin(company_id)) WITH CHECK (is_company_admin(company_id));
CREATE POLICY "company_view_delivery_templates" ON public.delivery_message_templates FOR SELECT TO authenticated
  USING (is_company_member(company_id));
CREATE POLICY "super_admin_delivery_templates" ON public.delivery_message_templates FOR ALL TO authenticated
  USING (is_super_admin());

-- Delivery send logs
CREATE TABLE public.delivery_send_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_code TEXT,
  event_key TEXT NOT NULL,
  phone TEXT NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, sent, failed
  api_response JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.delivery_send_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manage_delivery_logs" ON public.delivery_send_logs FOR ALL TO authenticated
  USING (is_company_admin(company_id)) WITH CHECK (is_company_admin(company_id));
CREATE POLICY "company_view_delivery_logs" ON public.delivery_send_logs FOR SELECT TO authenticated
  USING (is_company_member(company_id));
CREATE POLICY "super_admin_delivery_logs" ON public.delivery_send_logs FOR ALL TO authenticated
  USING (is_super_admin());

-- Triggers for updated_at
CREATE TRIGGER update_delivery_whatsapp_config_updated_at BEFORE UPDATE ON public.delivery_whatsapp_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_delivery_message_templates_updated_at BEFORE UPDATE ON public.delivery_message_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- =============================================
-- ETAPA 1-3: Tabelas adicionais
-- =============================================

-- Audit logs
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  payload JSONB DEFAULT '{}',
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- WhatsApp instances
CREATE TABLE public.instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone_number TEXT,
  status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'pairing', 'error')),
  evolution_instance_id TEXT,
  webhook_url TEXT,
  webhook_secret TEXT,
  reconnect_policy TEXT DEFAULT 'auto',
  tags TEXT[] DEFAULT '{}',
  timezone TEXT DEFAULT 'America/Sao_Paulo',
  last_connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Webhook events
CREATE TABLE public.webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES public.instances(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'inbound' CHECK (direction IN ('inbound', 'outbound')),
  payload JSONB DEFAULT '{}',
  status TEXT DEFAULT 'received',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Invoices
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.subscriptions(id),
  amount_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'canceled')),
  due_date DATE NOT NULL,
  paid_at TIMESTAMPTZ,
  gateway TEXT,
  gateway_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Payment gateways config
CREATE TABLE public.payment_gateways (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('abacatepay', 'cakto', 'infinitepay', 'manual')),
  config JSONB DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Greetings
CREATE TABLE public.greetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  message_template TEXT NOT NULL,
  schedule JSONB DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Absence rules
CREATE TABLE public.absence_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  message TEXT NOT NULL,
  schedule JSONB NOT NULL DEFAULT '{}',
  only_first_message BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Status templates
CREATE TABLE public.status_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status_type TEXT NOT NULL,
  message TEXT NOT NULL,
  auto_send BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Chatbot keys
CREATE TABLE public.chatbot_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  api_key TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  scopes TEXT[] DEFAULT '{"read_events"}',
  rate_limit INTEGER DEFAULT 60,
  ip_allowlist TEXT[] DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Chatbot key usage logs
CREATE TABLE public.chatbot_key_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id UUID NOT NULL REFERENCES public.chatbot_keys(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  status_code INTEGER,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Workflows
CREATE TABLE public.workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  definition JSONB NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  is_published BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- AI Agents
CREATE TABLE public.ai_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  objective TEXT,
  base_prompt TEXT,
  safety_rules TEXT,
  tools TEXT[] DEFAULT '{"respond"}',
  enabled_instances UUID[] DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Campaigns
CREATE TABLE public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  message_template TEXT NOT NULL,
  segment_type TEXT DEFAULT 'tags' CHECK (segment_type IN ('tags', 'list', 'csv')),
  segment_data JSONB DEFAULT '{}',
  send_window JSONB DEFAULT '{}',
  rate_limit_per_minute INTEGER DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'paused', 'completed', 'canceled')),
  stats JSONB DEFAULT '{"sent":0,"delivered":0,"read":0,"failed":0}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add timezone to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/Sao_Paulo';
-- Add referral code to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_code TEXT DEFAULT gen_random_uuid()::text;

-- =============================================
-- ENABLE RLS ON NEW TABLES
-- =============================================
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_gateways ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.greetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.absence_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.status_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_key_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

-- =============================================
-- RLS POLICIES (company-scoped pattern)
-- =============================================

-- Helper macro: for each company-scoped table
-- audit_logs
CREATE POLICY "super_admin_audit" ON public.audit_logs FOR ALL USING (public.is_super_admin());
CREATE POLICY "company_audit" ON public.audit_logs FOR SELECT USING (public.is_company_member(company_id));
CREATE POLICY "insert_audit" ON public.audit_logs FOR INSERT WITH CHECK (public.is_company_member(company_id) OR company_id IS NULL);

-- instances
CREATE POLICY "super_admin_instances" ON public.instances FOR ALL USING (public.is_super_admin());
CREATE POLICY "company_view_instances" ON public.instances FOR SELECT USING (public.is_company_member(company_id));
CREATE POLICY "admin_manage_instances" ON public.instances FOR INSERT WITH CHECK (public.is_company_admin(company_id));
CREATE POLICY "admin_update_instances" ON public.instances FOR UPDATE USING (public.is_company_admin(company_id) OR (public.is_company_member(company_id) AND public.has_module_permission('instances', 'edit')));
CREATE POLICY "admin_delete_instances" ON public.instances FOR DELETE USING (public.is_company_admin(company_id));

-- webhook_events
CREATE POLICY "super_admin_events" ON public.webhook_events FOR ALL USING (public.is_super_admin());
CREATE POLICY "company_view_events" ON public.webhook_events FOR SELECT USING (public.is_company_member(company_id));
CREATE POLICY "company_insert_events" ON public.webhook_events FOR INSERT WITH CHECK (public.is_company_member(company_id));

-- invoices
CREATE POLICY "super_admin_invoices" ON public.invoices FOR ALL USING (public.is_super_admin());
CREATE POLICY "admin_view_invoices" ON public.invoices FOR SELECT USING (public.is_company_admin(company_id));

-- payment_gateways
CREATE POLICY "super_admin_gateways" ON public.payment_gateways FOR ALL USING (public.is_super_admin());

-- greetings
CREATE POLICY "super_admin_greetings" ON public.greetings FOR ALL USING (public.is_super_admin());
CREATE POLICY "company_view_greetings" ON public.greetings FOR SELECT USING (public.is_company_member(company_id));
CREATE POLICY "admin_manage_greetings" ON public.greetings FOR INSERT WITH CHECK (public.is_company_admin(company_id) OR public.has_module_permission('greetings', 'create'));
CREATE POLICY "admin_update_greetings" ON public.greetings FOR UPDATE USING (public.is_company_admin(company_id) OR public.has_module_permission('greetings', 'edit'));
CREATE POLICY "admin_delete_greetings" ON public.greetings FOR DELETE USING (public.is_company_admin(company_id) OR public.has_module_permission('greetings', 'delete'));

-- absence_rules
CREATE POLICY "super_admin_absence" ON public.absence_rules FOR ALL USING (public.is_super_admin());
CREATE POLICY "company_view_absence" ON public.absence_rules FOR SELECT USING (public.is_company_member(company_id));
CREATE POLICY "admin_manage_absence" ON public.absence_rules FOR INSERT WITH CHECK (public.is_company_admin(company_id) OR public.has_module_permission('absence', 'create'));
CREATE POLICY "admin_update_absence" ON public.absence_rules FOR UPDATE USING (public.is_company_admin(company_id) OR public.has_module_permission('absence', 'edit'));
CREATE POLICY "admin_delete_absence" ON public.absence_rules FOR DELETE USING (public.is_company_admin(company_id) OR public.has_module_permission('absence', 'delete'));

-- status_templates
CREATE POLICY "super_admin_status" ON public.status_templates FOR ALL USING (public.is_super_admin());
CREATE POLICY "company_view_status" ON public.status_templates FOR SELECT USING (public.is_company_member(company_id));
CREATE POLICY "admin_manage_status" ON public.status_templates FOR INSERT WITH CHECK (public.is_company_admin(company_id) OR public.has_module_permission('status', 'create'));
CREATE POLICY "admin_update_status" ON public.status_templates FOR UPDATE USING (public.is_company_admin(company_id) OR public.has_module_permission('status', 'edit'));
CREATE POLICY "admin_delete_status" ON public.status_templates FOR DELETE USING (public.is_company_admin(company_id) OR public.has_module_permission('status', 'delete'));

-- chatbot_keys (sensitive - no view for regular users by default)
CREATE POLICY "super_admin_keys" ON public.chatbot_keys FOR ALL USING (public.is_super_admin());
CREATE POLICY "admin_view_keys" ON public.chatbot_keys FOR SELECT USING (public.is_company_admin(company_id) OR public.has_module_permission('chatbot_keys', 'view'));
CREATE POLICY "admin_manage_keys" ON public.chatbot_keys FOR INSERT WITH CHECK (public.is_company_admin(company_id));
CREATE POLICY "admin_update_keys" ON public.chatbot_keys FOR UPDATE USING (public.is_company_admin(company_id));
CREATE POLICY "admin_delete_keys" ON public.chatbot_keys FOR DELETE USING (public.is_company_admin(company_id));

-- chatbot_key_logs
CREATE POLICY "super_admin_key_logs" ON public.chatbot_key_logs FOR ALL USING (public.is_super_admin());
CREATE POLICY "admin_view_key_logs" ON public.chatbot_key_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.chatbot_keys ck WHERE ck.id = chatbot_key_logs.key_id AND public.is_company_admin(ck.company_id))
);

-- workflows
CREATE POLICY "super_admin_workflows" ON public.workflows FOR ALL USING (public.is_super_admin());
CREATE POLICY "company_view_workflows" ON public.workflows FOR SELECT USING (public.is_company_member(company_id));
CREATE POLICY "admin_manage_workflows" ON public.workflows FOR INSERT WITH CHECK (public.is_company_admin(company_id) OR public.has_module_permission('workflow', 'create'));
CREATE POLICY "admin_update_workflows" ON public.workflows FOR UPDATE USING (public.is_company_admin(company_id) OR public.has_module_permission('workflow', 'edit'));
CREATE POLICY "admin_delete_workflows" ON public.workflows FOR DELETE USING (public.is_company_admin(company_id) OR public.has_module_permission('workflow', 'delete'));

-- ai_agents
CREATE POLICY "super_admin_agents" ON public.ai_agents FOR ALL USING (public.is_super_admin());
CREATE POLICY "company_view_agents" ON public.ai_agents FOR SELECT USING (public.is_company_member(company_id));
CREATE POLICY "admin_manage_agents" ON public.ai_agents FOR INSERT WITH CHECK (public.is_company_admin(company_id) OR public.has_module_permission('ai_agents', 'create'));
CREATE POLICY "admin_update_agents" ON public.ai_agents FOR UPDATE USING (public.is_company_admin(company_id) OR public.has_module_permission('ai_agents', 'edit'));
CREATE POLICY "admin_delete_agents" ON public.ai_agents FOR DELETE USING (public.is_company_admin(company_id) OR public.has_module_permission('ai_agents', 'delete'));

-- campaigns
CREATE POLICY "super_admin_campaigns" ON public.campaigns FOR ALL USING (public.is_super_admin());
CREATE POLICY "company_view_campaigns" ON public.campaigns FOR SELECT USING (public.is_company_member(company_id));
CREATE POLICY "admin_manage_campaigns" ON public.campaigns FOR INSERT WITH CHECK (public.is_company_admin(company_id) OR public.has_module_permission('campaigns', 'create'));
CREATE POLICY "admin_update_campaigns" ON public.campaigns FOR UPDATE USING (public.is_company_admin(company_id) OR public.has_module_permission('campaigns', 'edit'));
CREATE POLICY "admin_delete_campaigns" ON public.campaigns FOR DELETE USING (public.is_company_admin(company_id) OR public.has_module_permission('campaigns', 'delete'));

-- Triggers for updated_at
CREATE TRIGGER update_instances_updated_at BEFORE UPDATE ON public.instances FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_gateways_updated_at BEFORE UPDATE ON public.payment_gateways FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_greetings_updated_at BEFORE UPDATE ON public.greetings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_absence_updated_at BEFORE UPDATE ON public.absence_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_status_updated_at BEFORE UPDATE ON public.status_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_keys_updated_at BEFORE UPDATE ON public.chatbot_keys FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_workflows_updated_at BEFORE UPDATE ON public.workflows FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON public.ai_agents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Audit log function
CREATE OR REPLACE FUNCTION public.log_audit(
  _action TEXT,
  _entity_type TEXT,
  _entity_id UUID DEFAULT NULL,
  _payload JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _log_id UUID;
  _company_id UUID;
BEGIN
  SELECT company_id INTO _company_id FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;
  INSERT INTO public.audit_logs (user_id, company_id, action, entity_type, entity_id, payload)
  VALUES (auth.uid(), _company_id, _action, _entity_type, _entity_id, _payload)
  RETURNING id INTO _log_id;
  RETURN _log_id;
END;
$$;

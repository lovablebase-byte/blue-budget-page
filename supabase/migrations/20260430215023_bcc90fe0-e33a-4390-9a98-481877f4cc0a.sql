-- =============================================
-- Etapa 7: Webhooks de saída para clientes
-- =============================================

-- 1) customer_webhooks
CREATE TABLE IF NOT EXISTS public.customer_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  instance_id uuid NULL,
  url text NOT NULL,
  secret text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  events text[] NOT NULL DEFAULT '{}'::text[],
  description text NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_webhooks_company ON public.customer_webhooks(company_id);
CREATE INDEX IF NOT EXISTS idx_customer_webhooks_instance ON public.customer_webhooks(instance_id) WHERE instance_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customer_webhooks_enabled ON public.customer_webhooks(company_id, enabled) WHERE enabled = true;

-- 2) customer_webhook_deliveries
CREATE TABLE IF NOT EXISTS public.customer_webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_webhook_id uuid NOT NULL REFERENCES public.customer_webhooks(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  instance_id uuid NULL,
  event_type text NOT NULL,
  webhook_event_id uuid NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  http_status integer NULL,
  attempts integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz NULL,
  last_error text NULL,
  delivered_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cwd_company ON public.customer_webhook_deliveries(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cwd_webhook ON public.customer_webhook_deliveries(customer_webhook_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cwd_pending ON public.customer_webhook_deliveries(status, next_retry_at)
  WHERE status IN ('pending', 'retrying');

-- 3) Trigger: validar URL e instance ownership
CREATE OR REPLACE FUNCTION public.validate_customer_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lower text;
  v_inst_company uuid;
BEGIN
  IF NEW.url IS NULL OR length(trim(NEW.url)) = 0 THEN
    RAISE EXCEPTION 'invalid_url' USING ERRCODE = '22023';
  END IF;

  v_lower := lower(trim(NEW.url));

  IF v_lower LIKE 'javascript:%' OR v_lower LIKE 'file:%' OR v_lower LIKE 'data:%' THEN
    RAISE EXCEPTION 'unsafe_url_scheme' USING ERRCODE = '22023';
  END IF;

  IF v_lower NOT LIKE 'https://%' AND v_lower NOT LIKE 'http://%' THEN
    RAISE EXCEPTION 'invalid_url_scheme' USING ERRCODE = '22023';
  END IF;

  -- Block private/local hosts (basic guard)
  IF v_lower ~ '^https?://(localhost|127\.|0\.0\.0\.0|::1|10\.|192\.168\.|169\.254\.)' OR
     v_lower ~ '^https?://172\.(1[6-9]|2[0-9]|3[0-1])\.' THEN
    RAISE EXCEPTION 'private_or_local_host_blocked' USING ERRCODE = '22023';
  END IF;

  IF NEW.secret IS NULL OR length(NEW.secret) < 24 THEN
    RAISE EXCEPTION 'weak_secret' USING ERRCODE = '22023';
  END IF;

  IF NEW.instance_id IS NOT NULL THEN
    SELECT company_id INTO v_inst_company FROM public.instances WHERE id = NEW.instance_id;
    IF v_inst_company IS NULL THEN
      RAISE EXCEPTION 'instance_not_found' USING ERRCODE = '42704';
    END IF;
    IF v_inst_company <> NEW.company_id THEN
      RAISE EXCEPTION 'instance_company_mismatch' USING ERRCODE = '42501';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_customer_webhook ON public.customer_webhooks;
CREATE TRIGGER trg_validate_customer_webhook
BEFORE INSERT OR UPDATE ON public.customer_webhooks
FOR EACH ROW EXECUTE FUNCTION public.validate_customer_webhook();

-- 4) Trigger updated_at em deliveries
CREATE OR REPLACE FUNCTION public.touch_customer_webhook_deliveries()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_cwd ON public.customer_webhook_deliveries;
CREATE TRIGGER trg_touch_cwd
BEFORE UPDATE ON public.customer_webhook_deliveries
FOR EACH ROW EXECUTE FUNCTION public.touch_customer_webhook_deliveries();

-- 5) RLS
ALTER TABLE public.customer_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_webhook_deliveries ENABLE ROW LEVEL SECURITY;

-- customer_webhooks policies
DROP POLICY IF EXISTS company_view_cw ON public.customer_webhooks;
CREATE POLICY company_view_cw ON public.customer_webhooks
  FOR SELECT USING (public.is_company_member(company_id));

DROP POLICY IF EXISTS admin_insert_cw ON public.customer_webhooks;
CREATE POLICY admin_insert_cw ON public.customer_webhooks
  FOR INSERT WITH CHECK (public.is_company_admin(company_id));

DROP POLICY IF EXISTS admin_update_cw ON public.customer_webhooks;
CREATE POLICY admin_update_cw ON public.customer_webhooks
  FOR UPDATE USING (public.is_company_admin(company_id));

DROP POLICY IF EXISTS admin_delete_cw ON public.customer_webhooks;
CREATE POLICY admin_delete_cw ON public.customer_webhooks
  FOR DELETE USING (public.is_company_admin(company_id));

DROP POLICY IF EXISTS platform_admin_cw ON public.customer_webhooks;
CREATE POLICY platform_admin_cw ON public.customer_webhooks
  FOR ALL USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

-- customer_webhook_deliveries policies (read-only para clientes; writes via service role)
DROP POLICY IF EXISTS company_view_cwd ON public.customer_webhook_deliveries;
CREATE POLICY company_view_cwd ON public.customer_webhook_deliveries
  FOR SELECT USING (public.is_company_member(company_id));

DROP POLICY IF EXISTS platform_admin_cwd ON public.customer_webhook_deliveries;
CREATE POLICY platform_admin_cwd ON public.customer_webhook_deliveries
  FOR ALL USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

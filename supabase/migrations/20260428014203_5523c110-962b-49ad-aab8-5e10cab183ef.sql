CREATE TABLE public.public_api_idempotency_keys (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_id uuid NOT NULL REFERENCES public.instances(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  idempotency_key text,
  external_id text,
  endpoint text NOT NULL,
  request_hash text NOT NULL,
  provider text,
  recipient text,
  message_preview text,
  provider_message_id text,
  response_status integer,
  response_body jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_idem_instance_key
  ON public.public_api_idempotency_keys (instance_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX uq_idem_instance_external
  ON public.public_api_idempotency_keys (instance_id, external_id)
  WHERE external_id IS NOT NULL AND idempotency_key IS NULL;

CREATE INDEX idx_idem_company ON public.public_api_idempotency_keys (company_id);
CREATE INDEX idx_idem_created ON public.public_api_idempotency_keys (created_at DESC);

ALTER TABLE public.public_api_idempotency_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_view_idem"
  ON public.public_api_idempotency_keys
  FOR SELECT
  USING (is_company_member(company_id));

CREATE POLICY "admin_manage_idem"
  ON public.public_api_idempotency_keys
  FOR ALL
  USING (is_company_admin(company_id))
  WITH CHECK (is_company_admin(company_id));

CREATE POLICY "super_admin_idem"
  ON public.public_api_idempotency_keys
  FOR ALL
  USING (is_super_admin());

CREATE TRIGGER update_idem_updated_at
BEFORE UPDATE ON public.public_api_idempotency_keys
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
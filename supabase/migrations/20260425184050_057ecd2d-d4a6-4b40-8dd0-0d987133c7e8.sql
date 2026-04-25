-- 1) Atualizar CHECK constraint em payment_gateways.provider para incluir abacatepay
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.payment_gateways'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%provider%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.payment_gateways DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE public.payment_gateways
  ADD CONSTRAINT payment_gateways_provider_check
  CHECK (provider IN ('amplopay', 'mercadopago', 'infinitepay', 'abacatepay'));

-- 2) Atualizar CHECK constraint em payment_charges.gateway
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.payment_charges'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%gateway%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.payment_charges DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE public.payment_charges
  ADD CONSTRAINT payment_charges_gateway_check
  CHECK (gateway IN ('amplopay', 'mercadopago', 'infinitepay', 'abacatepay'));

-- 3) Atualizar CHECK constraint em payment_events.gateway
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.payment_events'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%gateway%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.payment_events DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE public.payment_events
  ADD CONSTRAINT payment_events_gateway_check
  CHECK (gateway IN ('amplopay', 'mercadopago', 'infinitepay', 'abacatepay'));

-- 4) Índices auxiliares (idempotentes)
CREATE INDEX IF NOT EXISTS idx_payment_charges_gateway_status
  ON public.payment_charges (gateway, status);

CREATE INDEX IF NOT EXISTS idx_payment_charges_gateway_payment_id
  ON public.payment_charges (gateway_payment_id);

CREATE INDEX IF NOT EXISTS idx_payment_events_gateway_raw
  ON public.payment_events (gateway, raw_event_id);

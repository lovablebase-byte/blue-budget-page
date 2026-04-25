-- ════════════════════════════════════════════════════════════════
-- MERCADO PAGO: Adicionar colunas em payment_charges
-- ════════════════════════════════════════════════════════════════
ALTER TABLE public.payment_charges
  ADD COLUMN IF NOT EXISTS gateway text NOT NULL DEFAULT 'amplopay',
  ADD COLUMN IF NOT EXISTS gateway_payment_id text,
  ADD COLUMN IF NOT EXISTS qr_code_base64 text,
  ADD COLUMN IF NOT EXISTS ticket_url text,
  ADD COLUMN IF NOT EXISTS status_detail text,
  ADD COLUMN IF NOT EXISTS external_reference text,
  ADD COLUMN IF NOT EXISTS raw_response jsonb;

-- Backfill: cobranças antigas pertencem ao Amplo Pay
UPDATE public.payment_charges
  SET gateway = 'amplopay'
  WHERE gateway IS NULL OR gateway = '';

-- Constraint de gateway aceito
ALTER TABLE public.payment_charges
  DROP CONSTRAINT IF EXISTS payment_charges_gateway_check;
ALTER TABLE public.payment_charges
  ADD CONSTRAINT payment_charges_gateway_check
  CHECK (gateway IN ('amplopay', 'mercadopago'));

-- Índices úteis
CREATE INDEX IF NOT EXISTS idx_payment_charges_gateway ON public.payment_charges(gateway);
CREATE INDEX IF NOT EXISTS idx_payment_charges_gateway_payment_id ON public.payment_charges(gateway_payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_charges_external_reference ON public.payment_charges(external_reference);

-- ════════════════════════════════════════════════════════════════
-- MERCADO PAGO: Adicionar colunas em payment_events
-- ════════════════════════════════════════════════════════════════
ALTER TABLE public.payment_events
  ADD COLUMN IF NOT EXISTS gateway text NOT NULL DEFAULT 'amplopay',
  ADD COLUMN IF NOT EXISTS processed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS raw_event_id text;

-- Backfill: eventos antigos pertencem ao Amplo Pay
UPDATE public.payment_events
  SET gateway = 'amplopay'
  WHERE gateway IS NULL OR gateway = '';

-- Constraint
ALTER TABLE public.payment_events
  DROP CONSTRAINT IF EXISTS payment_events_gateway_check;
ALTER TABLE public.payment_events
  ADD CONSTRAINT payment_events_gateway_check
  CHECK (gateway IN ('amplopay', 'mercadopago'));

-- Idempotência: impedir mesmo evento (gateway + raw_event_id) duas vezes
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_events_unique_raw
  ON public.payment_events(gateway, raw_event_id)
  WHERE raw_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_events_gateway ON public.payment_events(gateway);
CREATE INDEX IF NOT EXISTS idx_payment_events_external_id ON public.payment_events(external_id);

-- ════════════════════════════════════════════════════════════════
-- MERCADO PAGO: Adicionar coluna environment em payment_gateways
-- ════════════════════════════════════════════════════════════════
ALTER TABLE public.payment_gateways
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'production';

ALTER TABLE public.payment_gateways
  DROP CONSTRAINT IF EXISTS payment_gateways_environment_check;
ALTER TABLE public.payment_gateways
  ADD CONSTRAINT payment_gateways_environment_check
  CHECK (environment IN ('sandbox', 'production'));

ALTER TABLE public.payment_gateways
  DROP CONSTRAINT IF EXISTS payment_gateways_provider_check;
ALTER TABLE public.payment_gateways
  ADD CONSTRAINT payment_gateways_provider_check
  CHECK (provider IN ('amplopay', 'mercadopago'));

-- ════════════════════════════════════════════════════════════════
-- Inserir registro inicial do Mercado Pago se não existir
-- ════════════════════════════════════════════════════════════════
INSERT INTO public.payment_gateways (provider, name, config, is_active, environment)
SELECT 'mercadopago', 'Mercado Pago', '{}'::jsonb, false, 'production'
WHERE NOT EXISTS (
  SELECT 1 FROM public.payment_gateways WHERE provider = 'mercadopago'
);
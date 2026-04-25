-- Permitir gateway 'infinitepay' nas tabelas existentes
ALTER TABLE public.payment_gateways DROP CONSTRAINT IF EXISTS payment_gateways_provider_check;
ALTER TABLE public.payment_gateways ADD CONSTRAINT payment_gateways_provider_check
  CHECK (provider IN ('amplopay', 'mercadopago', 'infinitepay'));

ALTER TABLE public.payment_charges DROP CONSTRAINT IF EXISTS payment_charges_gateway_check;
ALTER TABLE public.payment_charges ADD CONSTRAINT payment_charges_gateway_check
  CHECK (gateway IN ('amplopay', 'mercadopago', 'infinitepay'));

ALTER TABLE public.payment_events DROP CONSTRAINT IF EXISTS payment_events_gateway_check;
ALTER TABLE public.payment_events ADD CONSTRAINT payment_events_gateway_check
  CHECK (gateway IN ('amplopay', 'mercadopago', 'infinitepay'));

-- Adicionar campos específicos InfinitePay em payment_charges (sem quebrar nada existente)
ALTER TABLE public.payment_charges
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS capture_method text,
  ADD COLUMN IF NOT EXISTS order_nsu text,
  ADD COLUMN IF NOT EXISTS transaction_nsu text,
  ADD COLUMN IF NOT EXISTS invoice_slug text,
  ADD COLUMN IF NOT EXISTS receipt_url text,
  ADD COLUMN IF NOT EXISTS checkout_url text;

-- Índice para lookup rápido por order_nsu (webhook InfinitePay)
CREATE INDEX IF NOT EXISTS idx_payment_charges_order_nsu
  ON public.payment_charges(order_nsu) WHERE order_nsu IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_charges_transaction_nsu
  ON public.payment_charges(transaction_nsu) WHERE transaction_nsu IS NOT NULL;
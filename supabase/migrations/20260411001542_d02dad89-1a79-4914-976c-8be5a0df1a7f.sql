
-- Add slug and is_popular to plans
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS is_popular boolean NOT NULL DEFAULT false;

-- Add granular feature toggles
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS instances_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS greetings_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS absence_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS status_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS chatbot_keys_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS chatbot_keywords_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS invoices_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS branding_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS advanced_logs_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS advanced_webhooks_enabled boolean NOT NULL DEFAULT false;

-- Backfill slug from name (lowercase, no spaces)
UPDATE public.plans SET slug = lower(replace(replace(name, ' ', '-'), '.', '')) WHERE slug IS NULL;

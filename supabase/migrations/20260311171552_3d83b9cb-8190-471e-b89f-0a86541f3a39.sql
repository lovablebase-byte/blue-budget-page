ALTER TABLE public.instances ADD COLUMN IF NOT EXISTS access_token text NOT NULL DEFAULT substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);

-- Backfill existing rows that might have empty access_token
UPDATE public.instances SET access_token = substr(replace(gen_random_uuid()::text, '-', ''), 1, 12) WHERE access_token IS NULL OR access_token = '';
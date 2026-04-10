
-- Migrate existing instances: generate webhook_secret and fix webhook_url
-- Only updates instances where webhook_secret is null
UPDATE public.instances
SET
  webhook_secret = substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 24),
  webhook_url = 'https://rmswpurvnqqayemvuocv.supabase.co/functions/v1/webhook-receiver?instance_id=' || id::text || '&secret=' || substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 24)
WHERE webhook_secret IS NULL;

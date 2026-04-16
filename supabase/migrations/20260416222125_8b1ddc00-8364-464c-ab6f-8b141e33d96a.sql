-- 1) whatsapp_api_configs.provider
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.whatsapp_api_configs'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%provider%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.whatsapp_api_configs DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE public.whatsapp_api_configs
  ADD CONSTRAINT whatsapp_api_configs_provider_check
  CHECK (provider IN ('evolution', 'wuzapi', 'evolution_go'));

-- 2) instances.provider (caso exista uma check constraint similar)
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.instances'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%provider%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.instances DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE public.instances
  ADD CONSTRAINT instances_provider_check
  CHECK (provider IN ('evolution', 'wuzapi', 'evolution_go'));

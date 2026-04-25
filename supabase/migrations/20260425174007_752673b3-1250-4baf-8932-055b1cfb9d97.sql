-- Add 'quepasa' to allowed providers across constraints

-- whatsapp_api_configs.provider
ALTER TABLE public.whatsapp_api_configs DROP CONSTRAINT IF EXISTS whatsapp_api_configs_provider_check;
ALTER TABLE public.whatsapp_api_configs
  ADD CONSTRAINT whatsapp_api_configs_provider_check
  CHECK (provider IN ('evolution', 'wuzapi', 'evolution_go', 'wppconnect', 'quepasa'));

-- instances.provider
ALTER TABLE public.instances DROP CONSTRAINT IF EXISTS instances_provider_check;
ALTER TABLE public.instances
  ADD CONSTRAINT instances_provider_check
  CHECK (provider IN ('evolution', 'wuzapi', 'evolution_go', 'wppconnect', 'quepasa'));
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS gateway text DEFAULT NULL;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS gateway_reference text DEFAULT NULL;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS auto_renew boolean NOT NULL DEFAULT true;
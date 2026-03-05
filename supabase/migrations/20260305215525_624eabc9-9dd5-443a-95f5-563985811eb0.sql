
ALTER TABLE public.greetings
  ADD COLUMN IF NOT EXISTS instance_id uuid REFERENCES public.instances(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delay_min integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS delay_max integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS media_url text,
  ADD COLUMN IF NOT EXISTS cooldown_minutes integer NOT NULL DEFAULT 60;


ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'openai',
  ADD COLUMN IF NOT EXISTS api_key text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS response_style text NOT NULL DEFAULT 'balanced',
  ADD COLUMN IF NOT EXISTS delay_seconds integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS max_tokens integer NOT NULL DEFAULT 1024,
  ADD COLUMN IF NOT EXISTS schedule jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS understand_audio boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS understand_image boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS function_calling boolean NOT NULL DEFAULT false;

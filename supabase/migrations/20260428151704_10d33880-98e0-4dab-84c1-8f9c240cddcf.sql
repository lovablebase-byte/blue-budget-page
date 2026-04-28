-- Add new columns to webhook_events
ALTER TABLE public.webhook_events 
ADD COLUMN IF NOT EXISTS provider TEXT,
ADD COLUMN IF NOT EXISTS raw_event_type TEXT,
ADD COLUMN IF NOT EXISTS message_id TEXT,
ADD COLUMN IF NOT EXISTS from_number TEXT,
ADD COLUMN IF NOT EXISTS to_number TEXT,
ADD COLUMN IF NOT EXISTS text_preview TEXT,
ADD COLUMN IF NOT EXISTS connection_state TEXT,
ADD COLUMN IF NOT EXISTS processed BOOLEAN DEFAULT FALSE;

-- Add index for performance on frequent lookups
CREATE INDEX IF NOT EXISTS idx_webhook_events_instance_id ON public.webhook_events(instance_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_type ON public.webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at ON public.webhook_events(created_at DESC);

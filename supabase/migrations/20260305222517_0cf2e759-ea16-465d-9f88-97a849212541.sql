
-- Add new columns to plans table
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS max_campaigns integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS max_messages_day integer NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS max_ai_agents integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_chatbots integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS max_workflows integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS max_contacts integer NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS api_access boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whitelabel_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS support_priority text NOT NULL DEFAULT 'standard';

-- Add renewal_date to subscriptions
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS renewal_date timestamp with time zone;

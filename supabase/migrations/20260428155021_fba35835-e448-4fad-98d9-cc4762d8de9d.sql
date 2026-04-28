-- Ensure instance_limits table has all required columns with fallbacks
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'instance_limits') THEN
        CREATE TABLE public.instance_limits (
            id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            instance_id UUID NOT NULL REFERENCES public.instances(id) ON DELETE CASCADE UNIQUE,
            max_per_minute INTEGER DEFAULT 60,
            max_per_hour INTEGER DEFAULT 1000,
            max_per_day INTEGER DEFAULT 5000,
            messages_sent_minute INTEGER DEFAULT 0,
            messages_sent_hour INTEGER DEFAULT 0,
            messages_sent_day INTEGER DEFAULT 0,
            last_reset_minute TIMESTAMP WITH TIME ZONE DEFAULT now(),
            last_reset_hour TIMESTAMP WITH TIME ZONE DEFAULT now(),
            last_reset_day TIMESTAMP WITH TIME ZONE DEFAULT now(),
            cooldown_until TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
        );
    END IF;
END $$;

-- Add indexes for performance if they don't exist
CREATE INDEX IF NOT EXISTS idx_instance_limits_instance_id ON public.instance_limits(instance_id);

-- Enable RLS
ALTER TABLE public.instance_limits ENABLE ROW LEVEL SECURITY;

-- Policies for instance_limits
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can do everything on instance_limits') THEN
        CREATE POLICY "Admins can do everything on instance_limits" 
        ON public.instance_limits 
        FOR ALL 
        USING (
            EXISTS (
                SELECT 1 FROM public.user_roles 
                WHERE user_id = auth.uid() 
                AND role IN ('admin', 'super_admin')
            )
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view their own instance limits') THEN
        CREATE POLICY "Users can view their own instance limits" 
        ON public.instance_limits 
        FOR SELECT 
        USING (
            EXISTS (
                SELECT 1 FROM public.instances i
                JOIN public.user_roles ur ON i.company_id = ur.company_id
                WHERE i.id = instance_limits.instance_id
                AND ur.user_id = auth.uid()
            )
        );
    END IF;
END $$;

-- Atomic Rate Limit Checker & Updater
CREATE OR REPLACE FUNCTION public.check_and_update_rate_limit(
    p_instance_id UUID,
    p_increment INTEGER DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_limit RECORD;
    v_now TIMESTAMP WITH TIME ZONE := now();
    v_reset_min BOOLEAN := FALSE;
    v_reset_hour BOOLEAN := FALSE;
    v_reset_day BOOLEAN := FALSE;
    v_new_min INTEGER;
    v_new_hour INTEGER;
    v_new_day INTEGER;
BEGIN
    -- Get or create limit record
    SELECT * INTO v_limit FROM public.instance_limits WHERE instance_id = p_instance_id FOR UPDATE;
    
    IF NOT FOUND THEN
        INSERT INTO public.instance_limits (instance_id) 
        VALUES (p_instance_id) 
        RETURNING * INTO v_limit;
    END IF;

    -- Check if we need to reset counters based on time windows
    IF v_limit.last_reset_minute < (v_now - INTERVAL '1 minute') THEN
        v_reset_min := TRUE;
        v_new_min := p_increment;
    ELSE
        v_new_min := v_limit.messages_sent_minute + p_increment;
    END IF;

    IF v_limit.last_reset_hour < (v_now - INTERVAL '1 hour') THEN
        v_reset_hour := TRUE;
        v_new_hour := p_increment;
    ELSE
        v_new_hour := v_limit.messages_sent_hour + p_increment;
    END IF;

    IF v_limit.last_reset_day < (v_now - INTERVAL '1 day') THEN
        v_reset_day := TRUE;
        v_new_day := p_increment;
    ELSE
        v_new_day := v_limit.messages_sent_day + p_increment;
    END IF;

    -- Validate limits
    IF v_new_min > v_limit.max_per_minute THEN
        RETURN jsonb_build_object(
            'ok', false,
            'error', 'rate_limit_exceeded',
            'limit_type', 'minute',
            'current', v_new_min - p_increment,
            'limit', v_limit.max_per_minute,
            'reset_at', v_limit.last_reset_minute + INTERVAL '1 minute'
        );
    END IF;

    IF v_new_hour > v_limit.max_per_hour THEN
        RETURN jsonb_build_object(
            'ok', false,
            'error', 'rate_limit_exceeded',
            'limit_type', 'hour',
            'current', v_new_hour - p_increment,
            'limit', v_limit.max_per_hour,
            'reset_at', v_limit.last_reset_hour + INTERVAL '1 hour'
        );
    END IF;

    IF v_new_day > v_limit.max_per_day THEN
        RETURN jsonb_build_object(
            'ok', false,
            'error', 'rate_limit_exceeded',
            'limit_type', 'day',
            'current', v_new_day - p_increment,
            'limit', v_limit.max_per_day,
            'reset_at', v_limit.last_reset_day + INTERVAL '1 day'
        );
    END IF;

    -- Check cooldown
    IF v_limit.cooldown_until IS NOT NULL AND v_limit.cooldown_until > v_now THEN
        RETURN jsonb_build_object(
            'ok', false,
            'error', 'rate_limit_cooldown',
            'reset_at', v_limit.cooldown_until
        );
    END IF;

    -- Update counters
    UPDATE public.instance_limits
    SET 
        messages_sent_minute = v_new_min,
        messages_sent_hour = v_new_hour,
        messages_sent_day = v_new_day,
        last_reset_minute = CASE WHEN v_reset_min THEN v_now ELSE last_reset_minute END,
        last_reset_hour = CASE WHEN v_reset_hour THEN v_now ELSE last_reset_hour END,
        last_reset_day = CASE WHEN v_reset_day THEN v_now ELSE last_reset_day END,
        cooldown_until = NULL -- Clear cooldown if it was in the past
    WHERE instance_id = p_instance_id;

    RETURN jsonb_build_object(
        'ok', true,
        'remaining_minute', v_limit.max_per_minute - v_new_min,
        'limit_minute', v_limit.max_per_minute,
        'reset_minute', (CASE WHEN v_reset_min THEN v_now ELSE v_limit.last_reset_minute END) + INTERVAL '1 minute'
    );
END;
$$;

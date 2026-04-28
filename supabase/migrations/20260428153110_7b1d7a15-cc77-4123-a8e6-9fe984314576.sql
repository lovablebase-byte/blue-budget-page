-- Primeiro removemos a função antiga para evitar erro de tipo de retorno (JSONB vs Record)
DROP FUNCTION IF EXISTS public.create_instance_safe(text,text,text[],text,text,text);

-- Recria com as novas validações comerciais
CREATE OR REPLACE FUNCTION public.create_instance_safe(
    _name TEXT,
    _provider TEXT,
    _tags TEXT[] DEFAULT '{}',
    _timezone TEXT DEFAULT 'America/Sao_Paulo',
    _reconnect_policy TEXT DEFAULT 'auto',
    _webhook_secret TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_company_id UUID;
    v_plan RECORD;
    v_sub RECORD;
    v_instance public.instances;
    v_is_admin BOOLEAN;
    v_current_instances INTEGER;
    v_access_token TEXT;
BEGIN
    -- 1. Identifica usuário
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    -- 2. Identifica empresa
    SELECT company_id INTO v_company_id 
    FROM public.profiles 
    WHERE user_id = v_user_id;
    
    IF v_company_id IS NULL THEN
        RAISE EXCEPTION 'no_company_for_user';
    END IF;

    -- 3. Verifica se é admin (bypass)
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE user_id = v_user_id AND role IN ('admin', 'super_admin')
    ) INTO v_is_admin;

    IF NOT v_is_admin THEN
        -- 4. Busca assinatura e plano
        SELECT s.* INTO v_sub
        FROM public.subscriptions s
        WHERE s.company_id = v_company_id
        LIMIT 1;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'no_active_plan';
        END IF;

        IF v_sub.status NOT IN ('active', 'trialing') THEN
            RAISE EXCEPTION 'subscription_inactive';
        END IF;

        IF v_sub.expires_at IS NOT NULL AND v_sub.expires_at < NOW() THEN
            RAISE EXCEPTION 'subscription_expired';
        END IF;

        SELECT * INTO v_plan FROM public.plans WHERE id = v_sub.plan_id;

        -- 5. Validações do Plano
        IF NOT v_plan.instances_enabled THEN
            RAISE EXCEPTION 'instances_module_disabled';
        END IF;

        -- Limite de instâncias
        SELECT COUNT(*) INTO v_current_instances 
        FROM public.instances 
        WHERE company_id = v_company_id;

        IF v_current_instances >= v_plan.max_instances THEN
            RAISE EXCEPTION 'instance_limit_reached';
        END IF;

        -- Provider permitido
        IF v_plan.allowed_providers IS NOT NULL AND NOT (_provider = ANY(v_plan.allowed_providers)) THEN
            RAISE EXCEPTION 'provider_not_allowed_for_plan';
        END IF;
    END IF;

    -- 6. Cria o access_token
    v_access_token := replace(gen_random_uuid()::text, '-', '');

    -- 7. Insere a instância
    INSERT INTO public.instances (
        company_id,
        name,
        provider,
        tags,
        timezone,
        reconnect_policy,
        webhook_secret,
        access_token,
        status,
        created_at,
        updated_at
    ) VALUES (
        v_company_id,
        _name,
        _provider,
        _tags,
        _timezone,
        _reconnect_policy,
        _webhook_secret,
        v_access_token,
        'offline',
        NOW(),
        NOW()
    )
    RETURNING * INTO v_instance;

    RETURN to_jsonb(v_instance);
END;
$$;

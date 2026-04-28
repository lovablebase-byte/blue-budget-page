-- =============================================================================
-- CORREÇÃO 4 + 5: Token forte e validação completa na RPC create_instance_safe
--
-- Correção 4: Gerar access_token com encode(gen_random_bytes(32), 'hex')
--   Resultado: 64 caracteres hexadecimais (vs 32 chars do UUID sem hífens anterior).
--
-- Correção 5: Validar criação de instância com regras corretas:
--   - Usuário comum: respeita max_instances, provider do plano, assinatura ativa.
--   - Admin global da plataforma (company_id IS NULL): bypass total.
--   - Admin de empresa cliente (company_id IS NOT NULL): SEM bypass comercial.
--   - allowed_providers vazio ou NULL: bloqueia TODOS os providers.
--   - Retorno compatível com o frontend (JSONB com a instância criada).
-- =============================================================================

DROP FUNCTION IF EXISTS public.create_instance_safe(text,text,text[],text,text,text);

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
    v_user_id          UUID;
    v_company_id       UUID;
    v_user_company_id  UUID;   -- company_id do role do usuário
    v_plan             RECORD;
    v_sub              RECORD;
    v_instance         public.instances;
    v_is_platform_admin BOOLEAN;  -- admin global (company_id IS NULL)
    v_current_instances INTEGER;
    v_access_token     TEXT;
    v_allowed_providers TEXT[];
BEGIN
    -- 1. Identifica usuário autenticado
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    -- 2. Identifica company_id do role do usuário
    SELECT company_id INTO v_user_company_id
    FROM public.user_roles
    WHERE user_id = v_user_id
    LIMIT 1;

    -- 3. Verifica se é admin global da plataforma (role='admin' E company_id IS NULL)
    --    Admin global tem bypass comercial total.
    --    Admin de empresa cliente (company_id IS NOT NULL) NÃO tem bypass.
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = v_user_id
          AND role = 'admin'
          AND company_id IS NULL
    ) INTO v_is_platform_admin;

    -- 4. Determina a company_id da instância a ser criada
    IF v_is_platform_admin THEN
        -- Admin global: usa company_id do perfil (pode criar em qualquer empresa)
        SELECT company_id INTO v_company_id
        FROM public.profiles
        WHERE user_id = v_user_id;
        -- Se não tiver perfil com company, usa a empresa principal
        IF v_company_id IS NULL THEN
            SELECT id INTO v_company_id
            FROM public.companies
            WHERE slug = 'main-tenant'
            LIMIT 1;
        END IF;
    ELSE
        -- Usuário comum ou admin de empresa: usa a empresa do role
        v_company_id := v_user_company_id;
    END IF;

    IF v_company_id IS NULL THEN
        RAISE EXCEPTION 'no_company_for_user';
    END IF;

    -- 5. Validações comerciais (SOMENTE para não-admin-global)
    IF NOT v_is_platform_admin THEN
        -- 5a. Busca assinatura ativa
        SELECT s.* INTO v_sub
        FROM public.subscriptions s
        WHERE s.company_id = v_company_id
          AND s.status IN ('active', 'trialing')
        LIMIT 1;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'no_active_plan';
        END IF;

        IF v_sub.expires_at IS NOT NULL AND v_sub.expires_at < NOW() THEN
            RAISE EXCEPTION 'subscription_expired';
        END IF;

        -- 5b. Busca plano
        SELECT * INTO v_plan FROM public.plans WHERE id = v_sub.plan_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'plan_not_found';
        END IF;

        -- 5c. Módulo de instâncias habilitado no plano
        IF NOT COALESCE(v_plan.instances_enabled, false) THEN
            RAISE EXCEPTION 'instances_module_disabled';
        END IF;

        -- 5d. Limite de instâncias
        SELECT COUNT(*) INTO v_current_instances
        FROM public.instances
        WHERE company_id = v_company_id;

        IF v_current_instances >= COALESCE(v_plan.max_instances, 0) THEN
            RAISE EXCEPTION 'instance_limit_reached';
        END IF;

        -- 5e. Provider permitido pelo plano
        -- Regra segura: NULL ou array vazio → bloqueia TODOS os providers
        v_allowed_providers := COALESCE(v_plan.allowed_providers, '{}'::text[]);

        IF array_length(v_allowed_providers, 1) IS NULL OR array_length(v_allowed_providers, 1) = 0 THEN
            -- Array vazio ou NULL: nenhum provider é permitido
            RAISE EXCEPTION 'provider_not_allowed_for_plan';
        END IF;

        IF NOT (_provider = ANY(v_allowed_providers)) THEN
            RAISE EXCEPTION 'provider_not_allowed_for_plan';
        END IF;
    END IF;

    -- 6. Gera access_token FORTE: 64 caracteres hexadecimais (32 bytes aleatórios)
    --    Muito mais seguro que UUID sem hífens (32 chars com entropia limitada).
    v_access_token := encode(gen_random_bytes(32), 'hex');

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

    -- 8. Log de auditoria (se a função existir)
    BEGIN
        PERFORM public.log_audit(
            'instance_created',
            'instance',
            v_instance.id,
            jsonb_build_object(
                'provider', _provider,
                'is_platform_admin', v_is_platform_admin,
                'company_id', v_company_id
            )
        );
    EXCEPTION WHEN OTHERS THEN
        -- log_audit é opcional; não falha a criação se não existir
        NULL;
    END;

    RETURN to_jsonb(v_instance);
END;
$$;

COMMENT ON FUNCTION public.create_instance_safe(text,text,text[],text,text,text) IS
  'Cria instância WhatsApp com validações completas de plano e segurança. '
  'Admin global (company_id IS NULL) tem bypass comercial. '
  'Admin de empresa cliente e usuário comum respeitam plano, limite e providers. '
  'allowed_providers vazio ou NULL bloqueia TODOS os providers. '
  'Token gerado com encode(gen_random_bytes(32), hex) = 64 chars hexadecimais.';

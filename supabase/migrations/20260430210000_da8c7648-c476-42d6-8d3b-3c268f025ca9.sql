CREATE OR REPLACE FUNCTION public.create_instance_safe(
  _name text,
  _provider text,
  _tags text[] DEFAULT '{}'::text[],
  _timezone text DEFAULT 'America/Sao_Paulo'::text,
  _reconnect_policy text DEFAULT 'auto'::text,
  _webhook_secret text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_user_id           UUID;
  v_company_id        UUID;
  v_plan              RECORD;
  v_sub               RECORD;
  v_instance          public.instances;
  v_is_platform_admin BOOLEAN;
  v_current_instances INTEGER;
  v_access_token      TEXT;
  v_allowed_providers TEXT[];
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT company_id INTO v_company_id
  FROM public.user_roles
  WHERE user_id = v_user_id
  LIMIT 1;

  v_is_platform_admin := public.is_platform_admin();

  IF v_company_id IS NULL THEN
    IF v_is_platform_admin THEN
      SELECT id INTO v_company_id FROM public.companies WHERE slug = 'main-tenant' LIMIT 1;
    END IF;
    IF v_company_id IS NULL THEN
      RAISE EXCEPTION 'no_company_for_user';
    END IF;
  END IF;

  IF NOT v_is_platform_admin THEN
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

    IF v_plan IS NULL THEN
      RAISE EXCEPTION 'plan_not_found';
    END IF;

    IF NOT COALESCE(v_plan.instances_enabled, false) THEN
      RAISE EXCEPTION 'instances_module_disabled';
    END IF;

    SELECT COUNT(*) INTO v_current_instances
    FROM public.instances
    WHERE company_id = v_company_id;

    IF v_current_instances >= v_plan.max_instances THEN
      RAISE EXCEPTION 'instance_limit_reached';
    END IF;

    v_allowed_providers := COALESCE(v_plan.allowed_providers, '{}'::text[]);
    IF array_length(v_allowed_providers, 1) IS NULL OR array_length(v_allowed_providers, 1) = 0 THEN
      RAISE EXCEPTION 'provider_not_allowed_for_plan';
    END IF;
    IF NOT (_provider = ANY(v_allowed_providers)) THEN
      RAISE EXCEPTION 'provider_not_allowed_for_plan';
    END IF;
  END IF;

  -- Token forte: 64 chars hex (qualificado para extensions schema)
  v_access_token := encode(extensions.gen_random_bytes(32), 'hex');

  INSERT INTO public.instances (
    company_id, name, provider, tags, timezone,
    reconnect_policy, webhook_secret, access_token, status,
    created_at, updated_at
  ) VALUES (
    v_company_id, _name, _provider, _tags, _timezone,
    _reconnect_policy, _webhook_secret, v_access_token, 'offline',
    NOW(), NOW()
  )
  RETURNING * INTO v_instance;

  RETURN to_jsonb(v_instance);
END;
$$;

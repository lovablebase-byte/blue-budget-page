-- ============================================================
-- create_instance_safe: SECURITY DEFINER RPC for safe instance creation
-- Validates: company membership, plan limit, provider permission,
-- and inserts with proper company_id. Returns the new row as JSON.
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_instance_safe(
  _name text,
  _provider text,
  _tags text[] DEFAULT '{}'::text[],
  _timezone text DEFAULT 'America/Sao_Paulo',
  _reconnect_policy text DEFAULT 'auto',
  _webhook_secret text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _company_id uuid;
  _is_admin boolean;
  _max_instances int;
  _current_count int;
  _plan_id uuid;
  _instances_enabled boolean;
  _provider_allowed boolean;
  _provider_active boolean;
  _new_id uuid;
  _new_row jsonb;
  _final_secret text;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF _name IS NULL OR length(trim(_name)) = 0 THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
  END IF;

  IF _provider IS NULL OR length(trim(_provider)) = 0 THEN
    RAISE EXCEPTION 'invalid_provider' USING ERRCODE = '22023';
  END IF;

  -- Resolve user's company and admin flag
  SELECT company_id, (role IN ('admin','super_admin'))
    INTO _company_id, _is_admin
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1;

  IF _company_id IS NULL THEN
    RAISE EXCEPTION 'no_company_for_user' USING ERRCODE = '42501';
  END IF;

  -- Admin bypass: skip plan/permission/limit checks (per project rule)
  IF NOT _is_admin THEN
    -- Check has_module_permission('instances','create')
    IF NOT public.has_module_permission('instances','create') THEN
      RAISE EXCEPTION 'permission_denied: instances.create' USING ERRCODE = '42501';
    END IF;

    -- Resolve active plan
    SELECT s.plan_id, p.instances_enabled, p.max_instances
      INTO _plan_id, _instances_enabled, _max_instances
    FROM public.subscriptions s
    JOIN public.plans p ON p.id = s.plan_id
    WHERE s.company_id = _company_id
      AND s.status IN ('active','trialing')
    LIMIT 1;

    IF _plan_id IS NULL THEN
      RAISE EXCEPTION 'no_active_plan' USING ERRCODE = '42501';
    END IF;

    IF NOT COALESCE(_instances_enabled, false) THEN
      RAISE EXCEPTION 'instances_module_disabled' USING ERRCODE = '42501';
    END IF;

    -- Effective limit (overrides aware)
    SELECT COALESCE(public.get_effective_limit(_company_id, 'max_instances'), _max_instances)
      INTO _max_instances;

    SELECT COUNT(*) INTO _current_count
    FROM public.instances
    WHERE company_id = _company_id;

    IF _max_instances IS NOT NULL AND _max_instances > 0 AND _current_count >= _max_instances THEN
      RAISE EXCEPTION 'instance_limit_reached' USING ERRCODE = '42501';
    END IF;

    -- Check provider is allowed for plan (if any restriction exists)
    IF EXISTS (SELECT 1 FROM public.plan_allowed_providers WHERE plan_id = _plan_id) THEN
      SELECT EXISTS (
        SELECT 1 FROM public.plan_allowed_providers
        WHERE plan_id = _plan_id AND provider = _provider
      ) INTO _provider_allowed;
      IF NOT _provider_allowed THEN
        RAISE EXCEPTION 'provider_not_allowed_for_plan' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  -- Check provider is configured & active for the company
  SELECT EXISTS (
    SELECT 1 FROM public.whatsapp_api_configs
    WHERE company_id = _company_id AND provider = _provider AND is_active = true
  ) INTO _provider_active;

  IF NOT _provider_active THEN
    -- Allow legacy 'evolution' via evolution_api_config
    IF _provider = 'evolution' THEN
      SELECT is_active INTO _provider_active
      FROM public.evolution_api_config
      WHERE company_id = _company_id
      LIMIT 1;
      _provider_active := COALESCE(_provider_active, false);
    END IF;
  END IF;

  IF NOT _provider_active THEN
    RAISE EXCEPTION 'provider_not_configured' USING ERRCODE = '42501';
  END IF;

  _final_secret := COALESCE(_webhook_secret, replace(gen_random_uuid()::text, '-', ''));

  -- Insert with safe defaults; status MUST start offline (never online)
  INSERT INTO public.instances (
    company_id, name, provider,
    provider_instance_id, evolution_instance_id,
    webhook_url, webhook_secret,
    tags, timezone, reconnect_policy, status
  ) VALUES (
    _company_id, trim(_name), _provider,
    NULL, NULL,
    '', _final_secret,
    COALESCE(_tags, '{}'::text[]),
    COALESCE(_timezone, 'America/Sao_Paulo'),
    COALESCE(_reconnect_policy, 'auto'),
    'offline'
  )
  RETURNING id INTO _new_id;

  SELECT to_jsonb(i.*) INTO _new_row
  FROM public.instances i
  WHERE i.id = _new_id;

  PERFORM public.log_audit(
    'instance_created',
    'instance',
    _new_id,
    jsonb_build_object('provider', _provider, 'name', _name)
  );

  RETURN _new_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_instance_safe(text, text, text[], text, text, text) TO authenticated;
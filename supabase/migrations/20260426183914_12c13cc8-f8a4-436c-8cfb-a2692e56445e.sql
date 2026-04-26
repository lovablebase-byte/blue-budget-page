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
SET search_path TO 'public'
AS $function$
DECLARE
  _user_id uuid := auth.uid();
  _company_id uuid;
  _is_admin boolean;
  _max_instances int;
  _current_count int;
  _plan_id uuid;
  _instances_enabled boolean;
  _provider_allowed boolean;
  _has_provider_restriction boolean;
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

  -- Admin bypass: skip ALL plan/limit/provider checks (per project rule)
  IF NOT _is_admin THEN
    -- Plan-based authorization (NOT RBAC). End users authorize via active plan.
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

    -- Provider must be allowed by plan (only enforce if plan declares restrictions)
    SELECT EXISTS (SELECT 1 FROM public.plan_allowed_providers WHERE plan_id = _plan_id)
      INTO _has_provider_restriction;

    IF _has_provider_restriction THEN
      SELECT EXISTS (
        SELECT 1 FROM public.plan_allowed_providers
        WHERE plan_id = _plan_id AND provider = _provider
      ) INTO _provider_allowed;
      IF NOT _provider_allowed THEN
        RAISE EXCEPTION 'provider_not_allowed_for_plan' USING ERRCODE = '42501';
      END IF;
    END IF;
    -- NOTE: provider_active check (whatsapp_api_configs) removed for end users.
    -- Configuration is managed at instance level after creation, not as a creation prerequisite.
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
$function$;

GRANT EXECUTE ON FUNCTION public.create_instance_safe(text, text, text[], text, text, text) TO authenticated;
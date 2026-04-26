CREATE OR REPLACE FUNCTION public.update_instance_provider_safe(
  _instance_id uuid,
  _provider_instance_id text DEFAULT NULL,
  _evolution_instance_id text DEFAULT NULL,
  _webhook_url text DEFAULT NULL,
  _status text DEFAULT NULL,
  _phone_number text DEFAULT NULL
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
  _instance_company uuid;
  _new_row jsonb;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT company_id, (role IN ('admin','super_admin'))
    INTO _company_id, _is_admin
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1;

  SELECT company_id INTO _instance_company
  FROM public.instances WHERE id = _instance_id;

  IF _instance_company IS NULL THEN
    RAISE EXCEPTION 'instance_not_found' USING ERRCODE = '42704';
  END IF;

  IF NOT _is_admin AND _instance_company IS DISTINCT FROM _company_id THEN
    RAISE EXCEPTION 'not_owner' USING ERRCODE = '42501';
  END IF;

  IF _status IS NOT NULL AND _status NOT IN ('offline','pairing','connecting','online','error') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
  END IF;

  UPDATE public.instances SET
    provider_instance_id  = COALESCE(_provider_instance_id, provider_instance_id),
    evolution_instance_id = COALESCE(_evolution_instance_id, evolution_instance_id),
    webhook_url           = COALESCE(_webhook_url, webhook_url),
    status                = COALESCE(_status, status),
    phone_number          = COALESCE(_phone_number, phone_number),
    updated_at            = now()
  WHERE id = _instance_id;

  SELECT to_jsonb(i.*) INTO _new_row FROM public.instances i WHERE i.id = _instance_id;
  RETURN _new_row;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.update_instance_provider_safe(uuid, text, text, text, text, text) TO authenticated;
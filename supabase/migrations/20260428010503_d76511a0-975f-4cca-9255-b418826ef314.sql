
-- 1. Strong default token for new instances (64 hex chars from 32 random bytes)
ALTER TABLE public.instances
  ALTER COLUMN access_token SET DEFAULT encode(gen_random_bytes(32), 'hex');

-- 2. Backfill weak tokens (current default produced 12 chars; we replace anything <= 16 chars)
UPDATE public.instances
SET access_token = encode(gen_random_bytes(32), 'hex'),
    updated_at = now()
WHERE access_token IS NULL OR length(access_token) <= 16;

-- 3. Rotation function (admin or super-admin only)
CREATE OR REPLACE FUNCTION public.rotate_instance_token(_instance_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _company_id uuid;
  _is_admin boolean;
  _instance_company uuid;
  _new_token text;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT company_id, (role IN ('admin','super_admin'))
    INTO _company_id, _is_admin
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1;

  SELECT company_id INTO _instance_company FROM public.instances WHERE id = _instance_id;
  IF _instance_company IS NULL THEN
    RAISE EXCEPTION 'instance_not_found' USING ERRCODE = '42704';
  END IF;

  IF NOT _is_admin AND NOT public.is_company_admin(_instance_company) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  _new_token := encode(gen_random_bytes(32), 'hex');

  UPDATE public.instances
    SET access_token = _new_token,
        updated_at = now()
    WHERE id = _instance_id;

  PERFORM public.log_audit(
    'instance_token_rotated',
    'instance',
    _instance_id,
    jsonb_build_object('rotated_at', now())
  );

  RETURN jsonb_build_object('success', true, 'access_token', _new_token);
END;
$$;


CREATE OR REPLACE FUNCTION public.change_subscription_plan(_new_plan_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _company_id uuid;
  _sub_id uuid;
BEGIN
  -- Get the user's company
  SELECT company_id INTO _company_id
  FROM public.user_roles
  WHERE user_id = auth.uid()
    AND company_id IS NOT NULL
  LIMIT 1;

  IF _company_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não pertence a nenhuma empresa';
  END IF;

  -- Validate the new plan exists and is active
  IF NOT EXISTS (SELECT 1 FROM public.plans WHERE id = _new_plan_id AND is_active = true) THEN
    RAISE EXCEPTION 'Plano não encontrado ou inativo';
  END IF;

  -- Find existing active subscription
  SELECT id INTO _sub_id
  FROM public.subscriptions
  WHERE company_id = _company_id
    AND status IN ('active', 'trialing')
  LIMIT 1;

  IF _sub_id IS NOT NULL THEN
    -- Update existing subscription
    UPDATE public.subscriptions
    SET plan_id = _new_plan_id,
        updated_at = now()
    WHERE id = _sub_id;
  ELSE
    -- Create new subscription
    INSERT INTO public.subscriptions (company_id, plan_id, status, started_at)
    VALUES (_company_id, _new_plan_id, 'active', now());
  END IF;
END;
$$;

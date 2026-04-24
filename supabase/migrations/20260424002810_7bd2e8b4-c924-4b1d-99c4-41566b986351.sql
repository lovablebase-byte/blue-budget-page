-- Refine is_super_admin to check for global admin role (no company_id)
CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'admin'
      AND company_id IS NULL
  )
$function$;

-- Update handle_new_user to create a unique company per user
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_company_id UUID;
  user_full_name TEXT;
BEGIN
  user_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email);

  -- Insert into profiles
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, user_full_name);

  -- Create a new company for this user (Multi-tenant approach)
  INSERT INTO public.companies (name, slug, is_active)
  VALUES (
    user_full_name || ' - Empresa', 
    'empresa-' || substring(NEW.id::text, 1, 8),
    true
  )
  RETURNING id INTO new_company_id;

  -- Insert into user_roles as admin of their own company
  INSERT INTO public.user_roles (user_id, company_id, role)
  VALUES (NEW.id, new_company_id, 'admin');

  RETURN NEW;
END;
$function$;

-- Update change_subscription_plan to handle free vs paid plans
CREATE OR REPLACE FUNCTION public.change_subscription_plan(_new_plan_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _company_id uuid;
  _sub_id uuid;
  _is_free boolean;
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

  -- Validate the new plan exists and check if it is free
  SELECT (price_cents = 0) INTO _is_free
  FROM public.plans 
  WHERE id = _new_plan_id AND is_active = true;

  IF _is_free IS NULL THEN
    RAISE EXCEPTION 'Plano não encontrado ou inativo';
  END IF;

  -- Find existing subscription (any status)
  SELECT id INTO _sub_id
  FROM public.subscriptions
  WHERE company_id = _company_id
  LIMIT 1;

  IF _sub_id IS NOT NULL THEN
    -- Update existing subscription
    UPDATE public.subscriptions
    SET plan_id = _new_plan_id,
        status = CASE WHEN _is_free THEN 'active' ELSE 'pending_payment' END,
        updated_at = now()
    WHERE id = _sub_id;
  ELSE
    -- Create new subscription
    INSERT INTO public.subscriptions (company_id, plan_id, status, started_at)
    VALUES (
      _company_id, 
      _new_plan_id, 
      CASE WHEN _is_free THEN 'active' ELSE 'pending_payment' END, 
      now()
    );
  END IF;
END;
$function$;

-- Ensure RLS policies for user_roles allow super admins to see everything
DROP POLICY IF EXISTS "super_admin_all_roles" ON public.user_roles;
CREATE POLICY "super_admin_all_roles" 
ON public.user_roles 
FOR ALL 
TO public
USING (is_super_admin());

-- Ensure RLS policies for profiles allow super admins to see everything
DROP POLICY IF EXISTS "super_admin_all_profiles" ON public.profiles;
CREATE POLICY "super_admin_all_profiles" 
ON public.profiles 
FOR ALL 
TO public
USING (is_super_admin());

-- Fix members_view_own_company_roles to avoid circular dependency and handle NULLs
CREATE OR REPLACE FUNCTION public.is_company_member(_company_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND (company_id = _company_id OR (company_id IS NULL AND _company_id IS NULL))
  )
$function$;

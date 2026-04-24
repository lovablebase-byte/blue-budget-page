-- Update handle_new_user function to include role creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  default_company_id UUID;
BEGIN
  -- Insert into profiles
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));

  -- Find the first company (single-tenant)
  SELECT id INTO default_company_id FROM public.companies LIMIT 1;

  -- Insert into user_roles
  -- We use 'user' as default role.
  -- company_id can be NULL if no company exists, but ideally there should be one.
  INSERT INTO public.user_roles (user_id, company_id, role)
  VALUES (NEW.id, default_company_id, 'user');

  RETURN NEW;
END;
$function$;

-- Also, fix existing users that might be missing a role
-- This is a one-time fix for the user stuck in loop
INSERT INTO public.user_roles (user_id, company_id, role)
SELECT p.user_id, (SELECT id FROM public.companies LIMIT 1), 'user'
FROM public.profiles p
LEFT JOIN public.user_roles ur ON p.user_id = ur.user_id
WHERE ur.id IS NULL;

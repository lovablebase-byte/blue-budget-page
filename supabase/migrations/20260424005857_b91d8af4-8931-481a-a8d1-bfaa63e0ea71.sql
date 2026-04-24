-- Adicionar coluna de email se não existir
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'email') THEN
        ALTER TABLE public.profiles ADD COLUMN email TEXT;
    END IF;
END $$;

-- Atualizar a função handle_new_user para incluir o email
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
  user_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email, 'Usuário');

  -- Insert into profiles with email
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, user_full_name, NEW.email);

  -- Create a new company for this user (Mantendo por compatibilidade, mas o sistema está migrando)
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

-- Sincronizar emails existentes
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.user_id = u.id AND p.email IS NULL;

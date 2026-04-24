-- 1. Garantir uma única company canônica (tenant principal)
DO $$
DECLARE
  main_company_id uuid;
BEGIN
  -- Procurar uma company com slug 'main-tenant' ou criar uma
  SELECT id INTO main_company_id FROM public.companies WHERE slug = 'main-tenant' LIMIT 1;
  
  IF main_company_id IS NULL THEN
    -- Reutilizar a primeira company existente (mais antiga) ou criar nova
    SELECT id INTO main_company_id FROM public.companies ORDER BY created_at LIMIT 1;
    
    IF main_company_id IS NULL THEN
      INSERT INTO public.companies (name, slug, is_active) 
      VALUES ('Tenant Principal', 'main-tenant', true)
      RETURNING id INTO main_company_id;
    ELSE
      UPDATE public.companies SET slug = 'main-tenant', name = 'Tenant Principal' WHERE id = main_company_id;
    END IF;
  END IF;

  -- 2. Limpar TODAS as roles existentes e recriar apenas uma por usuário
  DELETE FROM public.user_roles;

  -- 3. Recriar roles: admin para admin@admin.com e superadmin@superadmin.com; user para o resto
  INSERT INTO public.user_roles (user_id, company_id, role)
  SELECT 
    u.id,
    main_company_id,
    CASE 
      WHEN u.email IN ('admin@admin.com', 'superadmin@superadmin.com') THEN 'admin'::app_role
      ELSE 'user'::app_role
    END
  FROM auth.users u;

  -- 4. Remover companies órfãs (que não são o tenant principal)
  DELETE FROM public.companies WHERE id <> main_company_id;
  
  -- 5. Remover assinaturas órfãs (vinculadas a companies que não existem mais)
  DELETE FROM public.subscriptions WHERE company_id <> main_company_id;
END $$;

-- 6. Garantir que cada usuário tenha apenas UM role
DROP INDEX IF EXISTS unique_user_role;
CREATE UNIQUE INDEX unique_user_role ON public.user_roles (user_id);

-- 7. Corrigir handle_new_user: novo usuário nasce 'user', sem nova company, sem assinatura
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  main_company_id uuid;
  user_full_name TEXT;
BEGIN
  user_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email, 'Usuário');

  -- Insert profile with email
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, user_full_name, NEW.email)
  ON CONFLICT (user_id) DO UPDATE 
    SET full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
        email = COALESCE(public.profiles.email, EXCLUDED.email);

  -- Vincular ao tenant principal SEMPRE (single-tenant)
  SELECT id INTO main_company_id FROM public.companies WHERE slug = 'main-tenant' LIMIT 1;
  
  IF main_company_id IS NULL THEN
    SELECT id INTO main_company_id FROM public.companies ORDER BY created_at LIMIT 1;
  END IF;

  -- Insert as 'user' role (NUNCA admin para auto-cadastros)
  -- Ignorar se já existir (caso de seed via edge function)
  INSERT INTO public.user_roles (user_id, company_id, role)
  VALUES (NEW.id, main_company_id, 'user')
  ON CONFLICT (user_id) DO NOTHING;

  -- IMPORTANTE: NÃO criar assinatura automática. Usuário começa sem plano.

  RETURN NEW;
END;
$function$;

-- 8. Garantir o trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 9. Corrigir get_user_role para retornar o role correto
CREATE OR REPLACE FUNCTION public.get_user_role()
 RETURNS app_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT role FROM public.user_roles
  WHERE user_id = auth.uid()
  LIMIT 1
$function$;
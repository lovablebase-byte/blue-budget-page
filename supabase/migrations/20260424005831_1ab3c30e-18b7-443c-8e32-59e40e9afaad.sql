-- Primeiro, vamos garantir que todos os usuários existentes no auth.users tenham um perfil e um papel.
-- Usaremos um bloco anônimo para sincronizar os dados.
DO $$
DECLARE
    user_record RECORD;
BEGIN
    FOR user_record IN SELECT id, email, COALESCE(raw_user_meta_data->>'full_name', email, 'Usuário') as name FROM auth.users
    LOOP
        -- Garantir perfil
        INSERT INTO public.profiles (user_id, full_name)
        VALUES (user_record.id, user_record.name)
        ON CONFLICT (user_id) DO NOTHING;
        
        -- Garantir papel (se não tiver nenhum, vira 'user')
        INSERT INTO public.user_roles (user_id, role)
        VALUES (user_record.id, 'user')
        ON CONFLICT (user_id, company_id) DO NOTHING; -- Nota: a constraint pode variar, vamos apenas garantir que exista um papel
    END LOOP;
END $$;

-- Ajustar a função is_super_admin para ser mais robusta
CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin', 'super_admin')
  );
END;
$function$;

-- Corrigir políticas de RLS para perfis
DROP POLICY IF EXISTS "super_admin_all_profiles" ON public.profiles;
DROP POLICY IF EXISTS "users_view_own_profile" ON public.profiles;

CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
USING (is_super_admin());

CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
USING (auth.uid() = user_id OR is_super_admin());

-- Corrigir políticas de RLS para papéis (user_roles)
DROP POLICY IF EXISTS "super_admin_all_roles" ON public.user_roles;
DROP POLICY IF EXISTS "members_view_own_company_roles" ON public.user_roles;

CREATE POLICY "Admins can view all roles"
ON public.user_roles
FOR SELECT
USING (is_super_admin());

CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
USING (auth.uid() = user_id OR is_super_admin());

-- Garantir que admins possam gerenciar tudo
CREATE POLICY "Admins can manage all profiles"
ON public.profiles
FOR ALL
USING (is_super_admin())
WITH CHECK (is_super_admin());

CREATE POLICY "Admins can manage all roles"
ON public.user_roles
FOR ALL
USING (is_super_admin())
WITH CHECK (is_super_admin());

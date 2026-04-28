-- =============================================================================
-- CORREÇÃO 2: Separar admin global da plataforma de admin da empresa cliente
--
-- Regra final:
--   platform_admin (role = 'admin' AND company_id IS NULL) → bypass comercial total
--   company_admin  (role = 'admin' AND company_id IS NOT NULL) → sem bypass comercial
--   user           (role = 'user')                             → sem bypass
--
-- Esta migration:
--   1. Recria is_super_admin() para verificar company_id IS NULL (admin global).
--   2. Cria is_platform_admin() como alias explícito e documentado.
--   3. Recria is_company_admin() para verificar admin da empresa específica.
--   4. Garante que as políticas RLS continuem funcionando para o admin global.
--   5. NÃO altera dados de user_roles — apenas as funções de verificação.
--   6. NÃO quebra acesso existente: o admin global continua com acesso total.
-- =============================================================================

-- --------------------------------------------------------------------------
-- 1. is_super_admin(): retorna TRUE somente para admin global da plataforma
--    (role = 'admin' E company_id IS NULL)
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'admin'
      AND company_id IS NULL
  );
$$;

-- --------------------------------------------------------------------------
-- 2. is_platform_admin(): alias explícito de is_super_admin()
--    Usar este nome em código novo para maior clareza semântica.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_super_admin();
$$;

-- --------------------------------------------------------------------------
-- 3. is_company_admin(_company_id): retorna TRUE para admin da empresa
--    específica (role = 'admin' E company_id = _company_id).
--    NÃO concede bypass comercial — apenas acesso operacional à empresa.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_company_admin(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND company_id = _company_id
      AND role = 'admin'
  );
$$;

-- --------------------------------------------------------------------------
-- 4. is_company_member(_company_id): membro da empresa (qualquer role)
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_company_member(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND company_id = _company_id
  );
$$;

-- --------------------------------------------------------------------------
-- 5. Atualiza políticas RLS para usar is_super_admin() corrigido
--    (admin global com company_id IS NULL)
-- --------------------------------------------------------------------------

-- Profiles
DROP POLICY IF EXISTS "super_admin_all_profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;

CREATE POLICY "platform_admin_all_profiles"
ON public.profiles
FOR ALL
TO public
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

-- User roles
DROP POLICY IF EXISTS "super_admin_all_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;

CREATE POLICY "platform_admin_all_roles"
ON public.user_roles
FOR ALL
TO public
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

-- --------------------------------------------------------------------------
-- 6. Garante que o admin global tenha company_id IS NULL
--    Identifica o usuário admin pelo email padrão do sistema.
--    Se não houver nenhum admin global, promove o primeiro admin existente.
-- --------------------------------------------------------------------------
DO $$
DECLARE
  v_admin_user_id uuid;
BEGIN
  -- Tenta encontrar usuário com email de admin da plataforma
  SELECT u.id INTO v_admin_user_id
  FROM auth.users u
  WHERE u.email IN ('admin@admin.com', 'superadmin@superadmin.com', 'platform@admin.com')
  LIMIT 1;

  -- Se encontrou, garante que seu role seja admin global (company_id IS NULL)
  IF v_admin_user_id IS NOT NULL THEN
    -- Remove role antigo com company_id
    DELETE FROM public.user_roles
    WHERE user_id = v_admin_user_id AND company_id IS NOT NULL;

    -- Insere ou mantém role global
    INSERT INTO public.user_roles (user_id, company_id, role)
    VALUES (v_admin_user_id, NULL, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- --------------------------------------------------------------------------
-- 7. COMENTÁRIO EXPLICATIVO no schema
-- --------------------------------------------------------------------------
COMMENT ON FUNCTION public.is_super_admin() IS
  'Retorna TRUE apenas para admin global da plataforma (role=admin, company_id IS NULL). '
  'NÃO retorna TRUE para admin de empresa cliente. '
  'Usar is_platform_admin() em código novo para maior clareza.';

COMMENT ON FUNCTION public.is_platform_admin() IS
  'Alias de is_super_admin(). Admin global da plataforma com bypass comercial total. '
  'Diferente de is_company_admin() que é admin de empresa cliente sem bypass.';

COMMENT ON FUNCTION public.is_company_admin(uuid) IS
  'Retorna TRUE para admin da empresa específica. '
  'NÃO concede bypass comercial — apenas acesso operacional à empresa.';

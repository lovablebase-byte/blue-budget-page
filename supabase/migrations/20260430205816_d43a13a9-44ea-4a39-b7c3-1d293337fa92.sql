-- =============================================================================
-- ETAPA CORRETIVA 1.2 — Aplicação real das correções de admin/provider/token
-- Idempotente. Não depende de migrations anteriores.
-- =============================================================================

-- 1) is_platform_admin(): admin global = role 'admin' E company_id IS NULL
CREATE OR REPLACE FUNCTION public.is_platform_admin()
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

COMMENT ON FUNCTION public.is_platform_admin() IS
  'TRUE somente para admin global da plataforma (role=admin, company_id IS NULL). '
  'Único caminho de bypass comercial. Admin de cliente NÃO retorna TRUE.';

-- 2) is_super_admin(): alias seguro de is_platform_admin (não considera company admin)
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_platform_admin();
$$;

COMMENT ON FUNCTION public.is_super_admin() IS
  'Alias de is_platform_admin(). Admin de cliente NÃO retorna TRUE.';

-- 3) Trigger de sincronização: remoção total → {} (nunca NULL)
CREATE OR REPLACE FUNCTION public.sync_plan_providers_to_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_plan_id uuid;
  v_providers text[];
BEGIN
  v_plan_id := COALESCE(NEW.plan_id, OLD.plan_id);

  SELECT array_agg(provider ORDER BY provider)
  INTO v_providers
  FROM public.plan_allowed_providers
  WHERE plan_id = v_plan_id;

  UPDATE public.plans
  SET allowed_providers = COALESCE(v_providers, '{}'::text[])
  WHERE id = v_plan_id;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS tr_sync_plan_providers ON public.plan_allowed_providers;
CREATE TRIGGER tr_sync_plan_providers
AFTER INSERT OR UPDATE OR DELETE ON public.plan_allowed_providers
FOR EACH ROW EXECUTE FUNCTION public.sync_plan_providers_to_column();

-- 4) Migra planos com NULL: usa plan_allowed_providers se houver, senão {}
UPDATE public.plans p
SET allowed_providers = COALESCE(
  (
    SELECT array_agg(provider ORDER BY provider)
    FROM public.plan_allowed_providers pap
    WHERE pap.plan_id = p.id
  ),
  '{}'::text[]
)
WHERE p.allowed_providers IS NULL;

COMMENT ON COLUMN public.plans.allowed_providers IS
  'Providers permitidos. Lista explícita = libera somente os listados. '
  '{} = bloqueia todos. NULL não deve existir (legado).';

-- 5) create_instance_safe: token forte, regra estrita de provider, bypass só platform admin
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
AS $$
DECLARE
  v_user_id           UUID;
  v_company_id        UUID;
  v_plan              RECORD;
  v_sub               RECORD;
  v_instance          public.instances;
  v_is_platform_admin BOOLEAN;
  v_current_instances INTEGER;
  v_access_token      TEXT;
  v_allowed_providers TEXT[];
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Empresa do usuário (via user_roles é a fonte canônica)
  SELECT company_id INTO v_company_id
  FROM public.user_roles
  WHERE user_id = v_user_id
  LIMIT 1;

  -- Bypass comercial APENAS para admin global da plataforma
  v_is_platform_admin := public.is_platform_admin();

  -- Admin global precisa indicar uma empresa-alvo. Se ele próprio não tem company,
  -- caímos no tenant principal "main-tenant" (mesmo padrão usado em handle_new_user).
  IF v_company_id IS NULL THEN
    IF v_is_platform_admin THEN
      SELECT id INTO v_company_id FROM public.companies WHERE slug = 'main-tenant' LIMIT 1;
    END IF;
    IF v_company_id IS NULL THEN
      RAISE EXCEPTION 'no_company_for_user';
    END IF;
  END IF;

  IF NOT v_is_platform_admin THEN
    -- Assinatura ativa
    SELECT s.* INTO v_sub
    FROM public.subscriptions s
    WHERE s.company_id = v_company_id
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'no_active_plan';
    END IF;

    IF v_sub.status NOT IN ('active', 'trialing') THEN
      RAISE EXCEPTION 'subscription_inactive';
    END IF;

    IF v_sub.expires_at IS NOT NULL AND v_sub.expires_at < NOW() THEN
      RAISE EXCEPTION 'subscription_expired';
    END IF;

    SELECT * INTO v_plan FROM public.plans WHERE id = v_sub.plan_id;

    IF v_plan IS NULL THEN
      RAISE EXCEPTION 'plan_not_found';
    END IF;

    IF NOT COALESCE(v_plan.instances_enabled, false) THEN
      RAISE EXCEPTION 'instances_module_disabled';
    END IF;

    -- Limite de instâncias
    SELECT COUNT(*) INTO v_current_instances
    FROM public.instances
    WHERE company_id = v_company_id;

    IF v_current_instances >= v_plan.max_instances THEN
      RAISE EXCEPTION 'instance_limit_reached';
    END IF;

    -- Provider: NULL ou {} bloqueiam TUDO. Só libera o que estiver explicitamente listado.
    v_allowed_providers := COALESCE(v_plan.allowed_providers, '{}'::text[]);
    IF array_length(v_allowed_providers, 1) IS NULL OR array_length(v_allowed_providers, 1) = 0 THEN
      RAISE EXCEPTION 'provider_not_allowed_for_plan';
    END IF;
    IF NOT (_provider = ANY(v_allowed_providers)) THEN
      RAISE EXCEPTION 'provider_not_allowed_for_plan';
    END IF;
  END IF;

  -- Token forte: 64 chars hex
  v_access_token := encode(gen_random_bytes(32), 'hex');

  INSERT INTO public.instances (
    company_id, name, provider, tags, timezone,
    reconnect_policy, webhook_secret, access_token, status,
    created_at, updated_at
  ) VALUES (
    v_company_id, _name, _provider, _tags, _timezone,
    _reconnect_policy, _webhook_secret, v_access_token, 'offline',
    NOW(), NOW()
  )
  RETURNING * INTO v_instance;

  RETURN to_jsonb(v_instance);
END;
$$;

COMMENT ON FUNCTION public.create_instance_safe(text,text,text[],text,text,text) IS
  'Cria instância respeitando plano. Bypass comercial APENAS para is_platform_admin(). '
  'allowed_providers NULL ou {} bloqueia todos. Token = encode(gen_random_bytes(32),hex) 64 chars.';

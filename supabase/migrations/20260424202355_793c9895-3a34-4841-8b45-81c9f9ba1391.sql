
-- ===========================================================
-- 1. Saneamento de companies: garante UM tenant principal
-- ===========================================================
DO $$
DECLARE
  main_id uuid;
BEGIN
  SELECT id INTO main_id FROM public.companies WHERE slug = 'main-tenant' LIMIT 1;
  IF main_id IS NULL THEN
    SELECT id INTO main_id FROM public.companies ORDER BY created_at LIMIT 1;
    IF main_id IS NULL THEN
      INSERT INTO public.companies (name, slug, is_active)
      VALUES ('Tenant Principal', 'main-tenant', true)
      RETURNING id INTO main_id;
    ELSE
      UPDATE public.companies
      SET slug = 'main-tenant', name = 'Tenant Principal', is_active = true
      WHERE id = main_id;
    END IF;
  END IF;

  UPDATE public.user_roles SET company_id = main_id WHERE company_id IS NULL OR company_id <> main_id;
  UPDATE public.subscriptions SET company_id = main_id WHERE company_id <> main_id;
  UPDATE public.invoices SET company_id = main_id WHERE company_id <> main_id;
  UPDATE public.instances SET company_id = main_id WHERE company_id <> main_id;
  UPDATE public.payment_charges SET company_id = main_id WHERE company_id <> main_id;
  UPDATE public.audit_logs SET company_id = main_id WHERE company_id IS NOT NULL AND company_id <> main_id;

  DELETE FROM public.companies WHERE id <> main_id;
END $$;

-- ===========================================================
-- 2. Garante profile para TODO auth.user
-- ===========================================================
INSERT INTO public.profiles (user_id, full_name, email)
SELECT u.id, COALESCE(u.raw_user_meta_data->>'full_name', u.email, 'Usuário'), u.email
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id
WHERE p.id IS NULL;

UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.user_id = u.id AND (p.email IS NULL OR p.email = '');

DELETE FROM public.profiles p
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.user_id);

-- ===========================================================
-- 3. Garante UM role por usuário
-- ===========================================================
DO $$
DECLARE
  main_id uuid;
BEGIN
  SELECT id INTO main_id FROM public.companies WHERE slug = 'main-tenant' LIMIT 1;

  WITH ranked AS (
    SELECT id, user_id,
           ROW_NUMBER() OVER (
             PARTITION BY user_id
             ORDER BY CASE WHEN role::text = 'admin' THEN 0
                           WHEN role::text = 'super_admin' THEN 0
                           ELSE 1 END,
                      created_at ASC
           ) AS rn
    FROM public.user_roles
  )
  DELETE FROM public.user_roles WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

  UPDATE public.user_roles SET role = 'admin' WHERE role::text = 'super_admin';
  UPDATE public.user_roles SET company_id = main_id WHERE company_id IS NULL;

  INSERT INTO public.user_roles (user_id, company_id, role)
  SELECT u.id, main_id,
         CASE WHEN u.email IN ('admin@admin.com', 'superadmin@superadmin.com') THEN 'admin'::app_role
              ELSE 'user'::app_role END
  FROM auth.users u
  LEFT JOIN public.user_roles ur ON ur.user_id = u.id
  WHERE ur.id IS NULL;

  DELETE FROM public.user_roles ur
  WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = ur.user_id);
END $$;

-- ===========================================================
-- 4. Índice único: 1 role por user_id
-- ===========================================================
DROP INDEX IF EXISTS unique_user_role;
DROP INDEX IF EXISTS unique_user_company_role;
CREATE UNIQUE INDEX unique_user_role ON public.user_roles (user_id);

-- ===========================================================
-- 5. Limpa subscriptions órfãs ou duplicadas
-- ===========================================================
DO $$
DECLARE
  main_id uuid;
BEGIN
  SELECT id INTO main_id FROM public.companies WHERE slug = 'main-tenant' LIMIT 1;
  DELETE FROM public.subscriptions WHERE company_id <> main_id;
END $$;

WITH ranked AS (
  SELECT id, company_id,
         ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY created_at DESC) AS rn
  FROM public.subscriptions
)
DELETE FROM public.subscriptions WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- ===========================================================
-- 6. RPC change_subscription_plan: DROP antes para mudar o retorno
-- ===========================================================
DROP FUNCTION IF EXISTS public.change_subscription_plan(uuid);

CREATE FUNCTION public.change_subscription_plan(_new_plan_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _company_id uuid;
  _sub_id uuid;
  _is_free boolean;
  _new_status text;
BEGIN
  SELECT company_id INTO _company_id
  FROM public.user_roles
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF _company_id IS NULL THEN
    SELECT id INTO _company_id FROM public.companies WHERE slug = 'main-tenant' LIMIT 1;
  END IF;

  IF _company_id IS NULL THEN
    RAISE EXCEPTION 'Tenant principal não encontrado';
  END IF;

  SELECT (price_cents = 0) INTO _is_free
  FROM public.plans WHERE id = _new_plan_id AND is_active = true;

  IF _is_free IS NULL THEN
    RAISE EXCEPTION 'Plano não encontrado ou inativo';
  END IF;

  -- Plano gratuito: ativa direto. Plano pago: pending_payment (NUNCA ativa sem pagamento).
  _new_status := CASE WHEN _is_free THEN 'active' ELSE 'pending_payment' END;

  SELECT id INTO _sub_id FROM public.subscriptions WHERE company_id = _company_id LIMIT 1;

  IF _sub_id IS NOT NULL THEN
    UPDATE public.subscriptions
    SET plan_id = _new_plan_id,
        status = _new_status,
        started_at = CASE WHEN _is_free THEN now() ELSE started_at END,
        updated_at = now()
    WHERE id = _sub_id;
  ELSE
    INSERT INTO public.subscriptions (company_id, plan_id, status, started_at)
    VALUES (_company_id, _new_plan_id, _new_status, now());
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'is_free', _is_free,
    'status', _new_status,
    'requires_payment', NOT _is_free
  );
END;
$function$;

-- ===========================================================
-- 7. handle_new_user: novo usuário sempre 'user', sem assinatura
-- ===========================================================
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

  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, user_full_name, NEW.email)
  ON CONFLICT (user_id) DO UPDATE
    SET full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
        email = COALESCE(public.profiles.email, EXCLUDED.email);

  SELECT id INTO main_company_id FROM public.companies WHERE slug = 'main-tenant' LIMIT 1;

  INSERT INTO public.user_roles (user_id, company_id, role)
  VALUES (NEW.id, main_company_id, 'user')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

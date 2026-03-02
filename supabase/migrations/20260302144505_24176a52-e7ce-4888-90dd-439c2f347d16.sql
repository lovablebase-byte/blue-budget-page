
-- =============================================
-- FASE 1: Schema completo do SaaS WhatsApp Manager
-- =============================================

-- 1. Enum de papéis
CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'user');

-- 2. Tabela de empresas
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Tabela de papéis de usuário (separada de profiles)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'user',
  invited_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, company_id)
);

-- 4. Tabela de perfis
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Tabela de planos
CREATE TABLE public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL DEFAULT 0,
  max_instances INTEGER NOT NULL DEFAULT 1,
  max_messages_month INTEGER NOT NULL DEFAULT 1000,
  campaigns_enabled BOOLEAN NOT NULL DEFAULT false,
  workflows_enabled BOOLEAN NOT NULL DEFAULT false,
  ai_agents_enabled BOOLEAN NOT NULL DEFAULT false,
  max_users INTEGER NOT NULL DEFAULT 3,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Tabela de assinaturas
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.plans(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'canceled', 'trialing')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id)
);

-- 7. Módulos do sistema
CREATE TABLE public.modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. Permissões granulares por usuário por módulo
CREATE TABLE public.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_role_id UUID NOT NULL REFERENCES public.user_roles(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  can_view BOOLEAN NOT NULL DEFAULT false,
  can_create BOOLEAN NOT NULL DEFAULT false,
  can_edit BOOLEAN NOT NULL DEFAULT false,
  can_delete BOOLEAN NOT NULL DEFAULT false,
  extra_permissions JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_role_id, module_id)
);

-- 9. Presets de permissão
CREATE TABLE public.permission_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  permissions JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- ENABLE RLS
-- =============================================
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permission_presets ENABLE ROW LEVEL SECURITY;

-- =============================================
-- HELPER FUNCTIONS (SECURITY DEFINER)
-- =============================================

-- Check if user is super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'super_admin'
  )
$$;

-- Check if user is admin of a specific company
CREATE OR REPLACE FUNCTION public.is_company_admin(_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND company_id = _company_id
      AND role = 'admin'
  )
$$;

-- Check if user is member of a company
CREATE OR REPLACE FUNCTION public.is_company_member(_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND company_id = _company_id
  )
$$;

-- Get user's company_id
CREATE OR REPLACE FUNCTION public.get_user_company_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.user_roles
  WHERE user_id = auth.uid()
  AND company_id IS NOT NULL
  LIMIT 1
$$;

-- Get user role id for current user
CREATE OR REPLACE FUNCTION public.get_user_role_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.user_roles
  WHERE user_id = auth.uid()
  AND company_id IS NOT NULL
  LIMIT 1
$$;

-- Check module permission
CREATE OR REPLACE FUNCTION public.has_module_permission(_module_name TEXT, _permission TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.permissions p
    JOIN public.user_roles ur ON ur.id = p.user_role_id
    JOIN public.modules m ON m.id = p.module_id
    WHERE ur.user_id = auth.uid()
      AND m.name = _module_name
      AND (
        (_permission = 'view' AND p.can_view = true) OR
        (_permission = 'create' AND p.can_create = true) OR
        (_permission = 'edit' AND p.can_edit = true) OR
        (_permission = 'delete' AND p.can_delete = true)
      )
  )
$$;

-- Get user role enum
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles
  WHERE user_id = auth.uid()
  LIMIT 1
$$;

-- =============================================
-- RLS POLICIES
-- =============================================

-- COMPANIES
CREATE POLICY "super_admin_all_companies" ON public.companies FOR ALL USING (public.is_super_admin());
CREATE POLICY "admin_own_company" ON public.companies FOR SELECT USING (public.is_company_member(id));
CREATE POLICY "admin_update_company" ON public.companies FOR UPDATE USING (public.is_company_admin(id));

-- USER_ROLES
CREATE POLICY "super_admin_all_roles" ON public.user_roles FOR ALL USING (public.is_super_admin());
CREATE POLICY "members_view_own_company_roles" ON public.user_roles FOR SELECT USING (public.is_company_member(company_id) OR user_id = auth.uid());
CREATE POLICY "admin_manage_company_roles" ON public.user_roles FOR INSERT WITH CHECK (public.is_company_admin(company_id) AND role != 'super_admin');
CREATE POLICY "admin_update_company_roles" ON public.user_roles FOR UPDATE USING (public.is_company_admin(company_id) AND role != 'super_admin');
CREATE POLICY "admin_delete_company_roles" ON public.user_roles FOR DELETE USING (public.is_company_admin(company_id) AND role != 'super_admin');

-- PROFILES
CREATE POLICY "users_view_own_profile" ON public.profiles FOR SELECT USING (user_id = auth.uid() OR public.is_super_admin());
CREATE POLICY "users_update_own_profile" ON public.profiles FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "users_insert_own_profile" ON public.profiles FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "super_admin_all_profiles" ON public.profiles FOR ALL USING (public.is_super_admin());

-- PLANS
CREATE POLICY "anyone_view_plans" ON public.plans FOR SELECT USING (true);
CREATE POLICY "super_admin_manage_plans" ON public.plans FOR ALL USING (public.is_super_admin());

-- SUBSCRIPTIONS
CREATE POLICY "super_admin_all_subs" ON public.subscriptions FOR ALL USING (public.is_super_admin());
CREATE POLICY "admin_own_sub" ON public.subscriptions FOR SELECT USING (public.is_company_admin(company_id));
CREATE POLICY "admin_manage_sub" ON public.subscriptions FOR UPDATE USING (public.is_company_admin(company_id));

-- MODULES
CREATE POLICY "anyone_view_modules" ON public.modules FOR SELECT USING (true);
CREATE POLICY "super_admin_manage_modules" ON public.modules FOR ALL USING (public.is_super_admin());

-- PERMISSIONS
CREATE POLICY "super_admin_all_perms" ON public.permissions FOR ALL USING (public.is_super_admin());
CREATE POLICY "view_own_permissions" ON public.permissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.id = permissions.user_role_id
      AND (ur.user_id = auth.uid() OR public.is_company_admin(ur.company_id))
    )
  );
CREATE POLICY "admin_manage_perms" ON public.permissions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.id = permissions.user_role_id
      AND public.is_company_admin(ur.company_id)
    )
  );
CREATE POLICY "admin_update_perms" ON public.permissions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.id = permissions.user_role_id
      AND public.is_company_admin(ur.company_id)
    )
  );
CREATE POLICY "admin_delete_perms" ON public.permissions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.id = permissions.user_role_id
      AND public.is_company_admin(ur.company_id)
    )
  );

-- PERMISSION_PRESETS
CREATE POLICY "anyone_view_presets" ON public.permission_presets FOR SELECT USING (true);
CREATE POLICY "super_admin_manage_presets" ON public.permission_presets FOR ALL USING (public.is_super_admin());

-- =============================================
-- TRIGGERS
-- =============================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_plans_updated_at BEFORE UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- =============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- SEED MODULES
-- =============================================

INSERT INTO public.modules (name, label) VALUES
  ('dashboard', 'Dashboard'),
  ('instances', 'Instâncias'),
  ('greetings', 'Saudações'),
  ('absence', 'Ausência'),
  ('status', 'Status'),
  ('chatbot_keys', 'Chatbots Keys'),
  ('workflow', 'Workflow'),
  ('ai_agents', 'Agentes IA'),
  ('campaigns', 'Campanhas'),
  ('settings', 'Ajustes');

-- =============================================
-- SEED PERMISSION PRESETS
-- =============================================

INSERT INTO public.permission_presets (name, label, description, permissions) VALUES
  ('operator', 'Operador', 'Acesso básico: visualizar instâncias, saudações, ausência e status. Sem criação nem exclusão.', '[
    {"module": "dashboard", "can_view": true, "can_create": false, "can_edit": false, "can_delete": false},
    {"module": "instances", "can_view": true, "can_create": false, "can_edit": false, "can_delete": false, "extra": {"send_test": true, "pair_qr": true}},
    {"module": "greetings", "can_view": true, "can_create": false, "can_edit": false, "can_delete": false},
    {"module": "absence", "can_view": true, "can_create": false, "can_edit": false, "can_delete": false},
    {"module": "status", "can_view": true, "can_create": false, "can_edit": false, "can_delete": false}
  ]'::jsonb),
  ('manager', 'Gerente', 'Acesso amplo: criar, editar e gerenciar todos os módulos operacionais. Sem acesso financeiro.', '[
    {"module": "dashboard", "can_view": true, "can_create": false, "can_edit": false, "can_delete": false},
    {"module": "instances", "can_view": true, "can_create": true, "can_edit": true, "can_delete": false, "extra": {"send_test": true, "pair_qr": true, "reconnect": true}},
    {"module": "greetings", "can_view": true, "can_create": true, "can_edit": true, "can_delete": true},
    {"module": "absence", "can_view": true, "can_create": true, "can_edit": true, "can_delete": true},
    {"module": "status", "can_view": true, "can_create": true, "can_edit": true, "can_delete": true},
    {"module": "chatbot_keys", "can_view": true, "can_create": true, "can_edit": true, "can_delete": false},
    {"module": "workflow", "can_view": true, "can_create": true, "can_edit": true, "can_delete": false},
    {"module": "ai_agents", "can_view": true, "can_create": true, "can_edit": true, "can_delete": false},
    {"module": "campaigns", "can_view": true, "can_create": true, "can_edit": true, "can_delete": false, "extra": {"send": true, "pause": true, "view_reports": true}}
  ]'::jsonb);

-- =============================================
-- SEED DEFAULT PLANS
-- =============================================

INSERT INTO public.plans (name, description, price_cents, max_instances, max_messages_month, campaigns_enabled, workflows_enabled, ai_agents_enabled, max_users) VALUES
  ('Starter', 'Ideal para começar. 1 instância, 1000 msgs/mês.', 4990, 1, 1000, false, false, false, 3),
  ('Pro', 'Para equipes. 5 instâncias, 10k msgs, campanhas e workflows.', 14990, 5, 10000, true, true, false, 10),
  ('Enterprise', 'Sem limites. Todas as funcionalidades.', 49990, 50, 100000, true, true, true, 100);

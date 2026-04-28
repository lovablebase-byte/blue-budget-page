-- =============================================================================
-- CORREÇÃO 3: Semântica segura de allowed_providers
--
-- Regra final:
--   allowed_providers = ['evolution', 'wuzapi']  → permite somente esses
--   allowed_providers = []  (array vazio)         → bloqueia TODOS os providers
--   allowed_providers = NULL                      → LEGADO: migrar para lista explícita
--
-- Esta migration:
--   1. Altera o comentário da coluna para documentar a nova semântica.
--   2. Migra planos com NULL para array vazio (bloqueia tudo) SOMENTE se não
--      houver nenhuma linha em plan_allowed_providers para o plano.
--      Se houver linhas em plan_allowed_providers, usa-as como lista explícita.
--   3. Atualiza o trigger de sincronização para tratar array vazio corretamente
--      (ao remover todos os providers do painel, allowed_providers vira '{}', não NULL).
--   4. Cria função auxiliar get_plan_allowed_providers(plan_id) para uso nas RPCs.
-- =============================================================================

-- --------------------------------------------------------------------------
-- 1. Atualiza comentário da coluna para documentar semântica segura
-- --------------------------------------------------------------------------
COMMENT ON COLUMN public.plans.allowed_providers IS
  'Providers permitidos para este plano. '
  'Lista com valores: permite somente os providers listados. '
  'Array vazio {}: bloqueia TODOS os providers. '
  'NULL: legado — tratar como array vazio (bloquear tudo) em código novo.';

-- --------------------------------------------------------------------------
-- 2. Migra planos com NULL para lista explícita a partir de plan_allowed_providers
--    Se não houver linhas, define como array vazio (bloqueia tudo).
-- --------------------------------------------------------------------------
UPDATE public.plans p
SET allowed_providers = COALESCE(
    (
        SELECT array_agg(provider ORDER BY provider)
        FROM public.plan_allowed_providers pap
        WHERE pap.plan_id = p.id
    ),
    '{}'::text[]   -- sem linhas na tabela legada → bloqueia tudo
)
WHERE p.allowed_providers IS NULL;

-- --------------------------------------------------------------------------
-- 3. Atualiza trigger de sincronização para usar array vazio em vez de NULL
--    quando todos os providers são removidos do painel admin.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_plan_providers_to_column()
RETURNS TRIGGER AS $$
DECLARE
  v_plan_id uuid;
  v_providers text[];
BEGIN
  v_plan_id := COALESCE(NEW.plan_id, OLD.plan_id);

  SELECT array_agg(provider ORDER BY provider)
  INTO v_providers
  FROM public.plan_allowed_providers
  WHERE plan_id = v_plan_id;

  -- Se não houver providers, usa array vazio (bloqueia tudo), NUNCA NULL.
  UPDATE public.plans
  SET allowed_providers = COALESCE(v_providers, '{}'::text[])
  WHERE id = v_plan_id;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Recria o trigger (já existia, mas recria para garantir a nova função)
DROP TRIGGER IF EXISTS tr_sync_plan_providers ON public.plan_allowed_providers;
CREATE TRIGGER tr_sync_plan_providers
AFTER INSERT OR UPDATE OR DELETE ON public.plan_allowed_providers
FOR EACH ROW EXECUTE FUNCTION public.sync_plan_providers_to_column();

-- --------------------------------------------------------------------------
-- 4. Função auxiliar: get_plan_allowed_providers(plan_id)
--    Retorna a lista de providers permitidos para um plano.
--    Nunca retorna NULL — retorna array vazio se não houver providers.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_plan_allowed_providers(_plan_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(allowed_providers, '{}'::text[])
  FROM public.plans
  WHERE id = _plan_id;
$$;

COMMENT ON FUNCTION public.get_plan_allowed_providers(uuid) IS
  'Retorna os providers permitidos para o plano. '
  'Nunca retorna NULL: array vazio significa que NENHUM provider é permitido. '
  'Usar esta função em RPCs e Edge Functions para verificar providers.';

-- Migra dados existentes de plan_allowed_providers para a nova coluna allowed_providers em plans
DO $$ 
BEGIN
    UPDATE public.plans p
    SET allowed_providers = (
        SELECT array_agg(provider)
        FROM public.plan_allowed_providers pap
        WHERE pap.plan_id = p.id
    )
    WHERE allowed_providers IS NULL;
END $$;

-- Garante que se um plano não tiver nada em allowed_providers (e nem na tabela legada), ele continue NULL (permitindo todos por padrão se for a regra desejada, ou uma lista vazia para bloquear)
-- O sistema atual trata NULL como "permite todos".

-- Cria uma view ou mantém a tabela legada apenas para compatibilidade se o painel admin ainda a usar fortemente,
-- mas vamos garantir que a coluna na tabela plans seja a fonte primária.

-- Opcional: Trigger para manter sincronizado se o Admin ainda escreve na tabela antiga
CREATE OR REPLACE FUNCTION public.sync_plan_providers_to_column()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.plans
    SET allowed_providers = (
        SELECT array_agg(provider)
        FROM public.plan_allowed_providers
        WHERE plan_id = COALESCE(NEW.plan_id, OLD.plan_id)
    )
    WHERE id = COALESCE(NEW.plan_id, OLD.plan_id);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_sync_plan_providers ON public.plan_allowed_providers;
CREATE TRIGGER tr_sync_plan_providers
AFTER INSERT OR UPDATE OR DELETE ON public.plan_allowed_providers
FOR EACH ROW EXECUTE FUNCTION public.sync_plan_providers_to_column();

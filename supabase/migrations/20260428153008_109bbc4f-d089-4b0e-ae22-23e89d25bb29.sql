-- Adiciona coluna para controle de providers permitidos por plano
ALTER TABLE public.plans 
ADD COLUMN IF NOT EXISTS allowed_providers TEXT[] DEFAULT NULL;

-- Comentário para documentação
COMMENT ON COLUMN public.plans.allowed_providers IS 'Lista de identifiers de providers permitidos neste plano (ex: evolution, evolution_go). Se NULL, permite todos.';

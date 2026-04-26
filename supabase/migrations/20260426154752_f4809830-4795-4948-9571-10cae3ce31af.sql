-- 1) Normaliza dados existentes para os valores canônicos antes de trocar a constraint
UPDATE public.instances SET status = 'online' WHERE status IN ('connected');
UPDATE public.instances SET status = 'offline' WHERE status IN ('disconnected', 'close', 'closed', 'logout', 'logged_out');
UPDATE public.instances SET status = 'connecting' WHERE status IN ('opening');
UPDATE public.instances SET status = 'error' WHERE status IN ('not_found', 'deleted', 'failed');

-- 2) Substitui a constraint para aceitar todos os valores usados pelo código
ALTER TABLE public.instances DROP CONSTRAINT IF EXISTS instances_status_check;
ALTER TABLE public.instances
  ADD CONSTRAINT instances_status_check
  CHECK (status IN ('online','offline','connecting','pairing','error','connected','disconnected'));

-- 3) Índice composto para o dashboard admin / contagens por status
CREATE INDEX IF NOT EXISTS idx_instances_company_status
  ON public.instances (company_id, status);

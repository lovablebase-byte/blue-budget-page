-- Normaliza permissões legadas: usuários (role 'user') que ficaram com
-- instances.can_create = false agora podem criar instâncias dentro do limite do plano.
-- Admin nunca é afetado (bypass no código). Restrições de plano seguem válidas.
UPDATE public.permissions p
SET can_create = true
FROM public.user_roles ur, public.modules m
WHERE p.user_role_id = ur.id
  AND p.module_id = m.id
  AND ur.role = 'user'
  AND m.name = 'instances'
  AND p.can_create = false;
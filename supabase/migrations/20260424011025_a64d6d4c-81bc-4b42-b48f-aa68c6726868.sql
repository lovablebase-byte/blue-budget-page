-- Clean up duplicate roles: if a user has both 'admin' and 'user' roles, keep only the 'admin' one.
-- First, identify and delete 'user' roles for users who have an 'admin' role in the same company (or both NULL company_id)
DELETE FROM public.user_roles a
USING public.user_roles b
WHERE a.user_id = b.user_id
  AND (a.company_id = b.company_id OR (a.company_id IS NULL AND b.company_id IS NULL))
  AND a.role = 'user'
  AND b.role = 'admin'
  AND a.id <> b.id;

-- Also handle super_admin vs user/admin
DELETE FROM public.user_roles a
USING public.user_roles b
WHERE a.user_id = b.user_id
  AND (a.company_id = b.company_id OR (a.company_id IS NULL AND b.company_id IS NULL))
  AND a.role IN ('user', 'admin')
  AND b.role = 'super_admin'
  AND a.id <> b.id;

-- Now handle cases where there are multiple identical roles for the same user/company (due to NULLs)
DELETE FROM public.user_roles a
WHERE a.created_at > (
    SELECT MIN(b.created_at)
    FROM public.user_roles b
    WHERE a.user_id = b.user_id
      AND (a.company_id = b.company_id OR (a.company_id IS NULL AND b.company_id IS NULL))
);

-- Optional: Add a more robust unique constraint if possible
-- Since NULLS NOT DISTINCT is only Postgres 15+, and we might be on older, 
-- we can use a unique index on (user_id, COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid));
DROP INDEX IF EXISTS unique_user_company_role;
CREATE UNIQUE INDEX unique_user_company_role ON public.user_roles (user_id, COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid));

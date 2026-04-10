-- Unique slug for companies
ALTER TABLE public.companies ADD CONSTRAINT companies_slug_unique UNIQUE (slug);

-- Allow super_admin to insert subscriptions (already covered by super_admin_all_subs ALL policy)
-- Add insert policy for company admins
CREATE POLICY "admin_insert_sub"
ON public.subscriptions
FOR INSERT
TO public
WITH CHECK (is_super_admin());

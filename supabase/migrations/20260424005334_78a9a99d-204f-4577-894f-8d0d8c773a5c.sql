-- Redefine is_super_admin to be company-agnostic (Single-Tenant)
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin', 'super_admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure profiles are viewable by all admins
DROP POLICY IF EXISTS "super_admin_all_profiles" ON public.profiles;
CREATE POLICY "super_admin_all_profiles" 
ON public.profiles 
FOR ALL 
TO authenticated 
USING (is_super_admin());

-- Ensure user_roles are viewable by all admins
DROP POLICY IF EXISTS "super_admin_all_roles" ON public.user_roles;
CREATE POLICY "super_admin_all_roles" 
ON public.user_roles 
FOR ALL 
TO authenticated 
USING (is_super_admin());

-- Cleanup: The existing policies already use is_super_admin(), so they will now work for all admins.
-- However, we should also ensure that the "members_view_own_company_roles" doesn't restrict admins.
-- It already says (is_company_member(company_id) OR (user_id = auth.uid())), and super_admin_all_roles is FOR ALL.

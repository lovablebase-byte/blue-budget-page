
-- Update all super_admin users to admin
UPDATE public.user_roles SET role = 'admin' WHERE role = 'super_admin';

-- Recreate is_super_admin function to check for admin role
-- Keeps RLS policies working without changes
CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'admin'
  )
$$;

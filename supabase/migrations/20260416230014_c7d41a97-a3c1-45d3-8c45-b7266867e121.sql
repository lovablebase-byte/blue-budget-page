DROP POLICY IF EXISTS admin_manage_instances ON public.instances;

CREATE POLICY admin_manage_instances ON public.instances
FOR INSERT
WITH CHECK (
  is_company_admin(company_id)
  OR (
    is_company_member(company_id)
    AND has_module_permission('instances'::text, 'create'::text)
  )
);
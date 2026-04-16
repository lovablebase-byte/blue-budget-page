
DROP POLICY IF EXISTS "admin_delete_instances" ON public.instances;
CREATE POLICY "admin_delete_instances"
  ON public.instances FOR DELETE
  TO authenticated
  USING (
    is_company_admin(company_id)
    OR is_company_member(company_id)
  );

CREATE POLICY "company_member_view_sub"
ON public.subscriptions
FOR SELECT
TO authenticated
USING (is_company_member(company_id));
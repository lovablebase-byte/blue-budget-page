
-- Add period and notes columns to invoices
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS period_start date,
  ADD COLUMN IF NOT EXISTS period_end date,
  ADD COLUMN IF NOT EXISTS notes text;

-- Allow company members (not just admins) to view their own invoices
CREATE POLICY "company_member_view_invoices"
  ON public.invoices
  FOR SELECT
  USING (is_company_member(company_id));

-- Drop the old admin-only select policy since the new one is broader
DROP POLICY IF EXISTS "admin_view_invoices" ON public.invoices;

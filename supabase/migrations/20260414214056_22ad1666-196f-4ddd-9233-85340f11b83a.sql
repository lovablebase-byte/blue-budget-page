
-- payment_charges: tracks each PIX charge issued
CREATE TABLE public.payment_charges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  external_id TEXT,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  qr_code TEXT,
  pix_copy_paste TEXT,
  description TEXT,
  expires_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- payment_events: audit trail for webhook and reconciliation events
CREATE TABLE public.payment_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  charge_id UUID REFERENCES public.payment_charges(id) ON DELETE SET NULL,
  external_id TEXT,
  event_type TEXT NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  result TEXT DEFAULT 'received',
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

-- RLS for payment_charges
ALTER TABLE public.payment_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_charges" ON public.payment_charges
  FOR ALL TO public USING (is_super_admin());

CREATE POLICY "company_view_charges" ON public.payment_charges
  FOR SELECT TO public USING (is_company_member(company_id));

-- RLS for payment_events
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_events" ON public.payment_events
  FOR ALL TO public USING (is_super_admin());

CREATE POLICY "company_view_payment_events" ON public.payment_events
  FOR SELECT TO public USING (
    EXISTS (
      SELECT 1 FROM public.payment_charges pc
      WHERE pc.id = payment_events.charge_id
      AND is_company_member(pc.company_id)
    )
  );

-- updated_at triggers
CREATE TRIGGER update_payment_charges_updated_at
  BEFORE UPDATE ON public.payment_charges
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

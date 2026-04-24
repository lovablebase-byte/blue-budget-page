-- Corrige change_subscription_plan: preserva plano ativo durante pending payment
-- Regras:
--  • Plano gratuito → ativa imediatamente (substitui qualquer assinatura existente)
--  • Plano pago → NÃO altera o plano atual; cria/atualiza uma "intenção" registrada
--    em subscriptions.notes (pending_plan_id) e dispara fluxo de cobrança.
--    Plano só é trocado quando o webhook/fallback confirmar pagamento.
--  • Cancelamento → status='canceled', limpa pending intent, sem plano efetivo.

CREATE OR REPLACE FUNCTION public.change_subscription_plan(_new_plan_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _company_id uuid;
  _sub_id uuid;
  _current_status text;
  _current_plan_id uuid;
  _is_free boolean;
  _new_price int;
BEGIN
  SELECT company_id INTO _company_id
  FROM public.user_roles
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF _company_id IS NULL THEN
    SELECT id INTO _company_id FROM public.companies WHERE slug = 'main-tenant' LIMIT 1;
  END IF;

  IF _company_id IS NULL THEN
    RAISE EXCEPTION 'Tenant principal não encontrado';
  END IF;

  SELECT (price_cents = 0), price_cents INTO _is_free, _new_price
  FROM public.plans WHERE id = _new_plan_id AND is_active = true;

  IF _is_free IS NULL THEN
    RAISE EXCEPTION 'Plano não encontrado ou inativo';
  END IF;

  SELECT id, status, plan_id INTO _sub_id, _current_status, _current_plan_id
  FROM public.subscriptions WHERE company_id = _company_id LIMIT 1;

  -- Caso 1: PLANO GRATUITO → ativa imediatamente, descarta intenções pendentes
  IF _is_free THEN
    IF _sub_id IS NOT NULL THEN
      UPDATE public.subscriptions
      SET plan_id = _new_plan_id,
          status = 'active',
          started_at = now(),
          canceled_at = NULL,
          suspended_at = NULL,
          notes = NULL,
          updated_at = now()
      WHERE id = _sub_id;
    ELSE
      INSERT INTO public.subscriptions (company_id, plan_id, status, started_at)
      VALUES (_company_id, _new_plan_id, 'active', now());
    END IF;

    PERFORM public.log_audit(
      'change_plan_free',
      'subscription',
      _new_plan_id,
      jsonb_build_object('company_id', _company_id, 'previous_status', _current_status)
    );

    RETURN jsonb_build_object(
      'success', true,
      'is_free', true,
      'status', 'active',
      'requires_payment', false,
      'plan_changed', true
    );
  END IF;

  -- Caso 2: PLANO PAGO → NÃO altera plano atual. Apenas registra intenção.
  -- Plano vigente (se ativo) continua valendo até pagamento confirmar.
  IF _sub_id IS NULL THEN
    -- Usuário sem nenhuma assinatura: cria placeholder em pending_payment (sem recursos)
    INSERT INTO public.subscriptions (company_id, plan_id, status, started_at, notes)
    VALUES (
      _company_id,
      _new_plan_id,
      'pending_payment',
      now(),
      jsonb_build_object('pending_plan_id', _new_plan_id, 'requested_at', now())::text
    );
  ELSE
    -- Já existe assinatura: preserva plan_id e status atual; registra intenção em notes
    UPDATE public.subscriptions
    SET notes = jsonb_build_object(
          'pending_plan_id', _new_plan_id,
          'requested_at', now(),
          'previous_plan_id', _current_plan_id,
          'previous_status', _current_status
        )::text,
        updated_at = now()
    WHERE id = _sub_id;
  END IF;

  PERFORM public.log_audit(
    'change_plan_paid_pending',
    'subscription',
    _new_plan_id,
    jsonb_build_object(
      'company_id', _company_id,
      'previous_plan_id', _current_plan_id,
      'previous_status', _current_status,
      'preserved_current_plan', _sub_id IS NOT NULL AND _current_status IN ('active','trialing')
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'is_free', false,
    'status', COALESCE(_current_status, 'pending_payment'),
    'requires_payment', true,
    'plan_changed', false,
    'preserved_current_plan', _sub_id IS NOT NULL AND _current_status IN ('active','trialing')
  );
END;
$$;

-- Função: confirmar troca de plano após pagamento aprovado.
-- Lê pending_plan_id de notes, aplica como plan_id, ativa.
CREATE OR REPLACE FUNCTION public.confirm_pending_plan_change(_subscription_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _notes jsonb;
  _pending_plan_id uuid;
BEGIN
  SELECT notes::jsonb INTO _notes
  FROM public.subscriptions
  WHERE id = _subscription_id;

  IF _notes IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_pending_intent');
  END IF;

  _pending_plan_id := (_notes->>'pending_plan_id')::uuid;
  IF _pending_plan_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_pending_plan_id');
  END IF;

  UPDATE public.subscriptions
  SET plan_id = _pending_plan_id,
      status = 'active',
      started_at = now(),
      expires_at = now() + interval '1 month',
      canceled_at = NULL,
      suspended_at = NULL,
      notes = NULL,
      updated_at = now()
  WHERE id = _subscription_id;

  RETURN jsonb_build_object(
    'success', true,
    'activated_plan_id', _pending_plan_id
  );
END;
$$;

-- Função: cancelar intenção pendente (usuário desiste de comprar)
CREATE OR REPLACE FUNCTION public.cancel_pending_plan_change()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _company_id uuid;
  _sub_id uuid;
  _status text;
BEGIN
  SELECT company_id INTO _company_id
  FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;
  IF _company_id IS NULL THEN
    SELECT id INTO _company_id FROM public.companies WHERE slug = 'main-tenant' LIMIT 1;
  END IF;

  SELECT id, status INTO _sub_id, _status
  FROM public.subscriptions WHERE company_id = _company_id LIMIT 1;

  IF _sub_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_subscription');
  END IF;

  -- Se status = pending_payment e nunca houve plano efetivo → remove a sub inteira
  IF _status = 'pending_payment' THEN
    DELETE FROM public.subscriptions WHERE id = _sub_id;
    PERFORM public.log_audit('cancel_pending_plan', 'subscription', _sub_id, '{}'::jsonb);
    RETURN jsonb_build_object('success', true, 'action', 'removed');
  END IF;

  -- Caso contrário, apenas limpa a intenção em notes
  UPDATE public.subscriptions
  SET notes = NULL, updated_at = now()
  WHERE id = _sub_id;

  PERFORM public.log_audit('cancel_pending_plan', 'subscription', _sub_id, '{}'::jsonb);
  RETURN jsonb_build_object('success', true, 'action', 'cleared_intent');
END;
$$;
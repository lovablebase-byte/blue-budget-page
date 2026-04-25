// Helper para descobrir qual gateway de pagamento usar.
// Suporta: Amplo Pay, Mercado Pago, InfinitePay e AbacatePay.
// Prioridade quando múltiplos ativos:
// AbacatePay > InfinitePay > Mercado Pago > Amplo Pay.
import { supabase } from '@/integrations/supabase/client';

export type PaymentGatewayName = 'amplopay' | 'mercadopago' | 'infinitepay' | 'abacatepay';

export interface ActiveGateway {
  provider: PaymentGatewayName;
  proxyAction: string; // nome da edge function (sem caminho)
}

const PROXY_BY_PROVIDER: Record<PaymentGatewayName, string> = {
  amplopay: 'amplopay-proxy',
  mercadopago: 'mercadopago-proxy',
  infinitepay: 'infinitepay-proxy',
  abacatepay: 'abacatepay-proxy',
};

export async function getActivePaymentGateway(): Promise<ActiveGateway | null> {
  const { data } = await supabase
    .from('payment_gateways')
    .select('provider, is_active')
    .eq('is_active', true);

  if (!data || data.length === 0) return null;

  const providers = data.map((g) => g.provider as PaymentGatewayName);
  // Prioridade: AbacatePay > InfinitePay > Mercado Pago > Amplo Pay
  const chosen: PaymentGatewayName = providers.includes('abacatepay')
    ? 'abacatepay'
    : providers.includes('infinitepay')
      ? 'infinitepay'
      : providers.includes('mercadopago')
        ? 'mercadopago'
        : (providers[0] as PaymentGatewayName);

  return {
    provider: chosen,
    proxyAction: PROXY_BY_PROVIDER[chosen],
  };
}

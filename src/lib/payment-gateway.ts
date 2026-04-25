// Helper para descobrir qual gateway de pagamento usar (Amplo Pay, Mercado Pago ou InfinitePay).
// Regra: usa o gateway com is_active=true. Prioridade quando múltiplos ativos:
// InfinitePay > Mercado Pago > Amplo Pay.
import { supabase } from '@/integrations/supabase/client';

export type PaymentGatewayName = 'amplopay' | 'mercadopago' | 'infinitepay';

export interface ActiveGateway {
  provider: PaymentGatewayName;
  proxyAction: string; // ex: 'mercadopago-proxy' | 'amplopay-proxy' | 'infinitepay-proxy'
}

const PROXY_BY_PROVIDER: Record<PaymentGatewayName, string> = {
  amplopay: 'amplopay-proxy',
  mercadopago: 'mercadopago-proxy',
  infinitepay: 'infinitepay-proxy',
};

export async function getActivePaymentGateway(): Promise<ActiveGateway | null> {
  const { data } = await supabase
    .from('payment_gateways')
    .select('provider, is_active')
    .eq('is_active', true);

  if (!data || data.length === 0) return null;

  const providers = data.map((g) => g.provider as PaymentGatewayName);
  // Prioridade: InfinitePay > Mercado Pago > Amplo Pay
  const chosen: PaymentGatewayName = providers.includes('infinitepay')
    ? 'infinitepay'
    : providers.includes('mercadopago')
      ? 'mercadopago'
      : (providers[0] as PaymentGatewayName);

  return {
    provider: chosen,
    proxyAction: PROXY_BY_PROVIDER[chosen],
  };
}

// Helper para descobrir qual gateway de pagamento usar (Amplo Pay ou Mercado Pago).
// Regra: usa o gateway com is_active=true. Se mais de um estiver ativo, prioriza Mercado Pago.
import { supabase } from '@/integrations/supabase/client';

export type PaymentGatewayName = 'amplopay' | 'mercadopago';

export interface ActiveGateway {
  provider: PaymentGatewayName;
  proxyAction: string; // ex: 'mercadopago-proxy' | 'amplopay-proxy'
}

export async function getActivePaymentGateway(): Promise<ActiveGateway | null> {
  const { data } = await supabase
    .from('payment_gateways')
    .select('provider, is_active')
    .eq('is_active', true);

  if (!data || data.length === 0) return null;

  const providers = data.map((g) => g.provider as PaymentGatewayName);
  // Prioriza Mercado Pago se ambos ativos
  const chosen: PaymentGatewayName = providers.includes('mercadopago')
    ? 'mercadopago'
    : (providers[0] as PaymentGatewayName);

  return {
    provider: chosen,
    proxyAction: chosen === 'mercadopago' ? 'mercadopago-proxy' : 'amplopay-proxy',
  };
}

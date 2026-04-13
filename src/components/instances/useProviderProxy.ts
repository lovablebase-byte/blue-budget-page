import { supabase } from '@/integrations/supabase/client';

/**
 * Shared helper to call whatsapp-provider-proxy Edge Function.
 */
export async function callProviderProxy(
  action: string,
  provider?: string,
  instanceName?: string,
  payload?: any
) {
  const res = await supabase.functions.invoke('whatsapp-provider-proxy', {
    body: { action, provider, instanceName, payload },
  });

  if (res.error) {
    const invokeError: any = res.error;
    const errorContext = invokeError?.context;
    let errorDetails: any = null;
    if (errorContext) {
      errorDetails = await errorContext.clone().json().catch(async () => {
        const rawText = await errorContext.text().catch(() => '');
        return rawText ? { raw: rawText } : null;
      });
    }
    throw new Error(errorDetails?.error || invokeError.message || 'Erro ao chamar proxy');
  }

  if (res.data?.error) {
    throw new Error(res.data.error);
  }

  return res.data;
}

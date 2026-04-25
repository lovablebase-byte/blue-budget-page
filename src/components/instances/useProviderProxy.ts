import { supabase } from '@/integrations/supabase/client';

/**
 * Shared helper to call whatsapp-provider-proxy Edge Function.
 * Includes automatic retry on transient SUPABASE_EDGE_RUNTIME_ERROR (503) cold-start failures.
 */
export async function callProviderProxy(
  action: string,
  provider?: string,
  instanceName?: string,
  payload?: any
) {
  const maxAttempts = 3;
  let lastError: any = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await supabase.functions.invoke('whatsapp-provider-proxy', {
      body: { action, provider, instanceName, payload },
    });

    if (!res.error) {
      if (res.data?.error) {
        throw new Error(res.data.error);
      }
      return res.data;
    }

    const invokeError: any = res.error;
    const errorContext = invokeError?.context;
    let errorDetails: any = null;
    if (errorContext) {
      errorDetails = await errorContext.clone().json().catch(async () => {
        const rawText = await errorContext.text().catch(() => '');
        return rawText ? { raw: rawText } : null;
      });
    }

    const status = errorContext?.status;
    const code = errorDetails?.code || '';
    const isTransient =
      status === 503 ||
      status === 504 ||
      code === 'SUPABASE_EDGE_RUNTIME_ERROR' ||
      /temporarily unavailable|boot/i.test(errorDetails?.message || invokeError.message || '');

    lastError = new Error(errorDetails?.error || errorDetails?.message || invokeError.message || 'Erro ao chamar proxy');

    if (isTransient && attempt < maxAttempts) {
      // Exponential backoff: 600ms, 1500ms
      await new Promise((r) => setTimeout(r, attempt === 1 ? 600 : 1500));
      continue;
    }

    throw lastError;
  }

  throw lastError ?? new Error('Erro ao chamar proxy');
}

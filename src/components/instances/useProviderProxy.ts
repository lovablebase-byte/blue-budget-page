import { supabase } from '@/integrations/supabase/client';

const MAX_CONCURRENT_PROXY_CALLS = 2;
let activeProxyCalls = 0;
const proxyQueue: Array<() => void> = [];

async function runWithProxyLimit<T>(task: () => Promise<T>): Promise<T> {
  if (activeProxyCalls >= MAX_CONCURRENT_PROXY_CALLS) {
    await new Promise<void>((resolve) => proxyQueue.push(resolve));
  }

  activeProxyCalls += 1;
  try {
    return await task();
  } finally {
    activeProxyCalls = Math.max(0, activeProxyCalls - 1);
    proxyQueue.shift()?.();
  }
}

function getRetryDelay(attempt: number) {
  const baseDelay = attempt === 1 ? 800 : attempt === 2 ? 1800 : 3200;
  return baseDelay + Math.floor(Math.random() * 400);
}

/**
 * Shared helper to call whatsapp-provider-proxy Edge Function.
 * Includes concurrency limiting and automatic retry on transient Edge Runtime cold-start failures.
 */
export async function callProviderProxy(
  action: string,
  provider?: string,
  instanceName?: string,
  payload?: any
) {
  const maxAttempts = 4;
  let lastError: any = null;

  return runWithProxyLimit(async () => {
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
          const rawText = await errorContext.clone().text().catch(() => '');
          return rawText ? { raw: rawText } : null;
        });
      }

      const status = errorContext?.status;
      const code = errorDetails?.code || '';
      const message = errorDetails?.message || errorDetails?.error || invokeError.message || '';
      const isTransient =
        status === 503 ||
        status === 504 ||
        code === 'SUPABASE_EDGE_RUNTIME_ERROR' ||
        /temporarily unavailable|boot|service is unavailable|runtime/i.test(message);

      lastError = new Error(errorDetails?.error || message || 'Erro ao chamar proxy');

      if (isTransient && attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, getRetryDelay(attempt)));
        continue;
      }

      throw lastError;
    }

    throw lastError ?? new Error('Erro ao chamar proxy');
  });
}

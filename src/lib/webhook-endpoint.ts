/**
 * Generates the real webhook URL for a given instance.
 * Points to the webhook-receiver edge function with instance_id and secret as query params.
 *
 * Honors VITE_WEBHOOK_BASE_URL (preferred) or VITE_PUBLIC_API_BASE_URL when set,
 * otherwise falls back to the Supabase functions URL.
 */

const SUPABASE_PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const WEBHOOK_BASE_URL = (import.meta.env.VITE_WEBHOOK_BASE_URL as string | undefined)?.replace(/\/+$/, '');
const PUBLIC_API_BASE_URL = (import.meta.env.VITE_PUBLIC_API_BASE_URL as string | undefined)?.replace(/\/+$/, '');

function getReceiverBase(): string {
  if (WEBHOOK_BASE_URL) return WEBHOOK_BASE_URL;
  if (PUBLIC_API_BASE_URL) {
    // Strip trailing /v1 to share the same functions origin.
    return `${PUBLIC_API_BASE_URL.replace(/\/v1$/i, '')}/webhook-receiver`;
  }
  return `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/webhook-receiver`;
}

export function getWebhookEndpoint(
  instanceId: string,
  webhookSecret: string,
  provider?: string
): string {
  const base = getReceiverBase();
  const params = new URLSearchParams({
    instance_id: instanceId,
    secret: webhookSecret,
  });
  if (provider) params.set('provider', provider);
  return `${base}?${params.toString()}`;
}

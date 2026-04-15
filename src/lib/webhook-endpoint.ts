/**
 * Generates the real webhook URL for a given instance.
 * Points to the webhook-receiver edge function with instance_id and secret as query params.
 */

const SUPABASE_PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;

export function getWebhookEndpoint(
  instanceId: string,
  webhookSecret: string,
  provider?: string
): string {
  const base = `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/webhook-receiver`;
  const params = new URLSearchParams({
    instance_id: instanceId,
    secret: webhookSecret,
  });
  if (provider) params.set('provider', provider);
  return `${base}?${params.toString()}`;
}

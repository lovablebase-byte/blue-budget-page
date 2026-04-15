/**
 * Single source of truth for instance delivery endpoint generation.
 * Format: /functions/v1/api-send-text?uuid={instance_id}&access_token={access_token}
 * Compatible with the same pattern as api.anotadinho.com/api/send/text?uuid=...&access_token=...
 */

const SUPABASE_PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;

export function getDeliveryEndpoint(instanceId: string, accessToken: string): string {
  return `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/api-send-text?uuid=${instanceId}&access_token=${accessToken}`;
}

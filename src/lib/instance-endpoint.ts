/**
 * Single source of truth for instance delivery endpoint generation.
 * Uses the stable Supabase Edge Function URL + instance UUID as query param.
 * This URL never changes after creation.
 */

const SUPABASE_PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID || 'rmswpurvnqqayemvuocv';

export function getDeliveryEndpoint(instanceId: string): string {
  return `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/delivery-whatsapp?instance_id=${instanceId}`;
}

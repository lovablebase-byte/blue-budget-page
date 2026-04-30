/**
 * Single source of truth for instance delivery endpoint generation.
 * Format: /functions/v1/api-send-text?uuid={instance_id}&access_token={access_token}
 *
 * Honors VITE_PUBLIC_API_BASE_URL for white-label / custom domain deployments.
 * Falls back to the Supabase functions URL when the env var is not configured.
 */

const SUPABASE_PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const PUBLIC_API_BASE_URL = (import.meta.env.VITE_PUBLIC_API_BASE_URL as string | undefined)?.replace(/\/+$/, '');

/**
 * Returns the functions origin (no trailing slash).
 * If VITE_PUBLIC_API_BASE_URL is set as e.g. "https://api.seudominio.com/v1",
 * we strip the "/v1" suffix to derive the legacy functions origin.
 */
function getFunctionsOrigin(): string {
  if (PUBLIC_API_BASE_URL) {
    // Strip a trailing /v1 if present so legacy endpoints share the same host.
    return PUBLIC_API_BASE_URL.replace(/\/v1$/i, '');
  }
  return `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1`;
}

export function getDeliveryEndpoint(instanceId: string, accessToken: string): string {
  return `${getFunctionsOrigin()}/api-send-text?uuid=${instanceId}&access_token=${accessToken}`;
}

export function getLegacyApiSendTextBase(): string {
  return `${getFunctionsOrigin()}/api-send-text`;
}

/**
 * Public API v1 base URL used in user-facing documentation.
 * Examples:
 *   - https://api.seudominio.com/v1
 *   - https://PROJECT.supabase.co/functions/v1/public-api/v1
 */
export function getPublicApiV1Base(): string {
  if (PUBLIC_API_BASE_URL) {
    return /\/v1$/i.test(PUBLIC_API_BASE_URL) ? PUBLIC_API_BASE_URL : `${PUBLIC_API_BASE_URL}/v1`;
  }
  return `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/public-api/v1`;
}

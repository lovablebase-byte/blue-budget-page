/**
 * Hook for plan enforcement — checks limits, features, and providers
 * against the company's active subscription.
 *
 * Regra de bypass:
 *   - isPlatformAdmin (company_id IS NULL): bypass total de limites e providers.
 *   - isAdmin com company_id (admin de empresa cliente): SEM bypass comercial.
 *   - user comum: sem bypass.
 */
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  getEffectivePlan,
  checkResourceLimit,
  isFeatureEnabled,
  getAllowedProviders,
  PlanLimits,
  PlanFeatures,
} from '@/services/plan-enforcement';

/**
 * Verifica se o usuário atual é admin global da plataforma (company_id IS NULL).
 * Admin de empresa cliente NÃO é admin global.
 */
export function useIsPlatformAdmin() {
  return useQuery({
    queryKey: ['is-platform-admin'],
    queryFn: async () => {
      const { data } = await supabase.rpc('is_platform_admin');
      return data === true;
    },
    staleTime: 120_000,
  });
}

export function useEffectivePlan() {
  const { company } = useAuth();
  return useQuery({
    queryKey: ['effective-plan', company?.id],
    queryFn: () => getEffectivePlan(company!.id),
    enabled: !!company?.id,
    staleTime: 60_000,
  });
}

export function useResourceLimit(resource: keyof PlanLimits, table: string) {
  const { company } = useAuth();
  const { data: isPlatformAdmin } = useIsPlatformAdmin();
  return useQuery({
    queryKey: ['resource-limit', company?.id, resource, isPlatformAdmin],
    queryFn: () => {
      // Bypass somente para admin global da plataforma
      if (isPlatformAdmin) return { allowed: true, current: 0, max: Infinity };
      return checkResourceLimit(company!.id, resource, table);
    },
    enabled: !!company?.id,
    staleTime: 30_000,
  });
}

export function useFeatureEnabled(feature: keyof PlanFeatures) {
  const { company } = useAuth();
  const { data: isPlatformAdmin } = useIsPlatformAdmin();
  return useQuery({
    queryKey: ['feature-enabled', company?.id, feature, isPlatformAdmin],
    queryFn: () => {
      // Bypass somente para admin global da plataforma
      if (isPlatformAdmin) return true;
      return isFeatureEnabled(company!.id, feature);
    },
    enabled: !!company?.id,
    staleTime: 60_000,
  });
}

export function useAllowedProviders() {
  const { company } = useAuth();
  const { data: isPlatformAdmin } = useIsPlatformAdmin();
  return useQuery({
    queryKey: ['allowed-providers', company?.id, isPlatformAdmin],
    queryFn: () => {
      // Admin global da plataforma vê todos os providers (bypass de UI)
      if (isPlatformAdmin) return ['evolution', 'wuzapi', 'evolution_go', 'wppconnect', 'quepasa'];
      // Admin de empresa cliente e usuário comum respeitam o plano
      return getAllowedProviders(company!.id);
    },
    enabled: !!company?.id,
    staleTime: 60_000,
  });
}

/**
 * Hook for plan enforcement — checks limits, features, and providers
 * against the company's active subscription.
 */
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import {
  getEffectivePlan,
  checkResourceLimit,
  isFeatureEnabled,
  getAllowedProviders,
  PlanLimits,
  PlanFeatures,
} from '@/services/plan-enforcement';

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
  return useQuery({
    queryKey: ['resource-limit', company?.id, resource],
    queryFn: () => checkResourceLimit(company!.id, resource, table),
    enabled: !!company?.id,
    staleTime: 30_000,
  });
}

export function useFeatureEnabled(feature: keyof PlanFeatures) {
  const { company } = useAuth();
  return useQuery({
    queryKey: ['feature-enabled', company?.id, feature],
    queryFn: () => isFeatureEnabled(company!.id, feature),
    enabled: !!company?.id,
    staleTime: 60_000,
  });
}

export function useAllowedProviders() {
  const { company } = useAuth();
  return useQuery({
    queryKey: ['allowed-providers', company?.id],
    queryFn: () => getAllowedProviders(company!.id),
    enabled: !!company?.id,
    staleTime: 60_000,
  });
}

/**
 * CompanyContext — Provides the full client context:
 * company, plan, subscription, limits, features, providers, settings.
 * All client pages consume this instead of making individual queries.
 */
import React, { createContext, useContext } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  useEffectivePlan,
  useAllowedProviders,
  useIsPlatformAdmin,
} from '@/hooks/use-plan-enforcement';
import type { EffectivePlan } from '@/services/plan-enforcement';

interface CompanyContextType {
  /** Effective plan with limits, features, and overrides applied */
  plan: EffectivePlan | null;
  planLoading: boolean;
  /** Allowed WhatsApp providers for this company's plan */
  allowedProviders: string[];
  providersLoading: boolean;
  /** Subscription status shortcuts */
  isActive: boolean;
  isSuspended: boolean;
  isTrialing: boolean;
  /** Check if a feature is enabled in the plan */
  hasFeature: (feature: keyof EffectivePlan['features']) => boolean;
  /** Check if a resource is within limits (optimistic — use useResourceLimit for real-time) */
  getLimit: (key: keyof EffectivePlan['limits']) => number;
}

const CompanyContext = createContext<CompanyContextType>({
  plan: null,
  planLoading: true,
  allowedProviders: [],
  providersLoading: true,
  isActive: false,
  isSuspended: false,
  isTrialing: false,
  hasFeature: () => false,
  getLimit: () => 0,
});

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const { company } = useAuth();
  const { data: isPlatformAdmin = false } = useIsPlatformAdmin();
  const { data: plan, isLoading: planLoading } = useEffectivePlan();
  const { data: allowedProviders = [], isLoading: providersLoading } = useAllowedProviders();

  // Bypass de status de assinatura SOMENTE para admin global da plataforma.
  // Admin de empresa cliente (isAdmin mas com company_id) respeita assinatura.
  const isActive = isPlatformAdmin ? true : (plan?.status === 'active' || plan?.status === 'trialing');
  const isSuspended = isPlatformAdmin ? false : (plan?.status === 'canceled' || plan?.status === 'past_due');
  const isTrialing = plan?.status === 'trialing';

  const hasFeature = (feature: keyof EffectivePlan['features']): boolean => {
    if (isPlatformAdmin) return true;
    if (!plan) return false;
    return plan.features[feature];
  };

  const getLimit = (key: keyof EffectivePlan['limits']): number => {
    if (isPlatformAdmin) return Infinity;
    if (!plan) return 0;
    return plan.limits[key];
  };

  return (
    <CompanyContext.Provider
      value={{
        plan: plan || null,
        planLoading,
        allowedProviders,
        providersLoading,
        isActive,
        isSuspended,
        isTrialing,
        hasFeature,
        getLimit,
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  return useContext(CompanyContext);
}

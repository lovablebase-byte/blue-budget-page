/**
 * Cálculo centralizado da rota inicial pós-login (e fallback de redirect)
 * para usuário comum, considerando: role, plano ativo, features liberadas
 * e permissões granulares.
 *
 * Regras:
 * - admin → sempre /dashboard
 * - usuário comum:
 *     percorre routeOrderForRedirect (operacionais), retorna a primeira que:
 *       - não é admin-only
 *       - tem feature liberada no plano (se a rota tem feature mapeada)
 *       - tem permissão de view (se há permissões granulares cadastradas)
 *     se nada estiver liberado → /account (área pessoal segura, nunca tela preta)
 */
import { routeOrderForRedirect, moduleFeatureMap } from '@/lib/routes';
import type { EffectivePlan } from '@/services/plan-enforcement';
import type { ModulePermission } from '@/types/roles';
import type { AppRole } from '@/types/roles';

interface ResolveOptions {
  role: AppRole | null;
  plan: EffectivePlan | null;
  permissions: ModulePermission[];
}

const SAFE_FALLBACK = '/account';
const ADMIN_HOME = '/dashboard';

export function resolveInitialRoute({ role, plan, permissions }: ResolveOptions): string {
  if (role === 'admin') return ADMIN_HOME;
  if (!role) return SAFE_FALLBACK;

  const hasGranular = permissions.length > 0;

  for (const route of routeOrderForRedirect) {
    if (route.path === '/dashboard') continue; // admin-only
    const featureKey = moduleFeatureMap[route.module];
    // Feature gate: se módulo tem feature, plano precisa estar ativo e ter feature ON
    if (featureKey) {
      if (!plan) continue;
      if (!plan.features[featureKey]) continue;
    }
    // Permission gate: se há permissões granulares, precisa ter view no módulo
    if (hasGranular) {
      const perm = permissions.find(p => p.module === route.module);
      if (!perm || !perm.can_view) continue;
    }
    return route.path;
  }

  return SAFE_FALLBACK;
}

export const INITIAL_ROUTE_FALLBACK = SAFE_FALLBACK;

import { supabase } from '@/integrations/supabase/client';

export interface ActiveProvider {
  provider: string;
  is_default: boolean;
}

const PROVIDER_LABELS: Record<string, string> = {
  evolution: 'Evolution API',
  evolution_go: 'Evolution Go',
  wuzapi: 'WuzAPI',
};

export async function fetchCompanyActiveProviders(companyId: string): Promise<ActiveProvider[]> {
  const { data } = await supabase
    .from('whatsapp_api_configs')
    .select('provider, is_default')
    .eq('company_id', companyId)
    .eq('is_active', true);

  const providers = [...((data || []) as ActiveProvider[])];
  const hasEvolution = providers.some((provider) => provider.provider === 'evolution');

  if (!hasEvolution) {
    const { data: legacy } = await supabase
      .from('evolution_api_config')
      .select('is_active')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .limit(1);

    if (legacy?.length) {
      providers.push({ provider: 'evolution', is_default: providers.length === 0 });
    }
  }

  return providers;
}

export function hasActiveProviderConfig(activeProviders: ActiveProvider[], provider: string): boolean {
  return activeProviders.some((item) => item.provider === provider);
}

export function getProviderConfigurationError(provider: string): string {
  const label = PROVIDER_LABELS[provider] || provider;
  return `${label} não está configurado ou ativo para esta conta.`;
}
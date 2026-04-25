import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/contexts/CompanyContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Save, Globe, Webhook, Plug, Loader2, CheckCircle2, XCircle, Star, Copy, AlertCircle, Info, Lock, Zap, Rocket, MessageCircle, Cable, Radio } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { getCompanySettings, getEffectiveSetting } from '@/services/admin-settings';

interface ProviderState {
  baseUrl: string;
  apiKey: string;
  isActive: boolean;
  isDefault: boolean;
  testing: boolean;
  testStatus: 'idle' | 'success' | 'error';
  saving: boolean;
}

const defaultProviderState = (): ProviderState => ({
  baseUrl: '', apiKey: '', isActive: false, isDefault: false,
  testing: false, testStatus: 'idle', saving: false,
});

export default function Settings() {
  const { company, isAdmin } = useAuth();
  const { isSuspended, allowedProviders, hasFeature } = useCompany();
  const queryClient = useQueryClient();

  const [companyName, setCompanyName] = useState('');
  const [evo, setEvo] = useState<ProviderState>(defaultProviderState());
  const [wuz, setWuz] = useState<ProviderState>(defaultProviderState());
  const [ego, setEgo] = useState<ProviderState>(defaultProviderState());
  const [wpp, setWpp] = useState<ProviderState>(defaultProviderState());
  const [qp, setQp] = useState<ProviderState>(defaultProviderState());

  const { data: companyData } = useQuery({
    queryKey: ['company-settings', company?.id],
    queryFn: async () => {
      if (!company?.id) return null;
      const { data, error } = await supabase.from('companies').select('*').eq('id', company.id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!company?.id,
  });

  const { data: companySettings = [] } = useQuery({
    queryKey: ['company-settings-list', company?.id],
    queryFn: () => getCompanySettings(company!.id),
    enabled: !!company?.id,
  });

  const { data: globalSettings = [] } = useQuery({
    queryKey: ['global-settings'],
    queryFn: async () => {
      const { data } = await supabase.from('global_settings').select('*').order('setting_key');
      return data || [];
    },
  });

  const { data: waConfigs } = useQuery({
    queryKey: ['whatsapp-api-configs', company?.id],
    queryFn: async () => {
      if (!company?.id) return [];
      const { data } = await supabase.from('whatsapp_api_configs').select('*').eq('company_id', company.id);
      return data || [];
    },
    enabled: !!company?.id,
  });

  const { data: legacyEvoConfig } = useQuery({
    queryKey: ['evolution-config', company?.id],
    queryFn: async () => {
      if (!company?.id) return null;
      const { data } = await supabase.from('evolution_api_config').select('*').eq('company_id', company.id).single();
      return data;
    },
    enabled: !!company?.id,
  });

  useEffect(() => {
    if (companyData) setCompanyName(companyData.name);
  }, [companyData]);

  useEffect(() => {
    const evoConfig = waConfigs?.find((c: any) => c.provider === 'evolution');
    const wuzConfig = waConfigs?.find((c: any) => c.provider === 'wuzapi');
    const egoConfig = waConfigs?.find((c: any) => c.provider === 'evolution_go');
    const wppConfig = waConfigs?.find((c: any) => c.provider === 'wppconnect');
    const qpConfig = waConfigs?.find((c: any) => c.provider === 'quepasa');
    if (evoConfig) {
      setEvo(prev => ({ ...prev, baseUrl: evoConfig.base_url, apiKey: evoConfig.api_key || '', isActive: evoConfig.is_active, isDefault: evoConfig.is_default }));
    } else if (legacyEvoConfig) {
      setEvo(prev => ({ ...prev, baseUrl: legacyEvoConfig.base_url, apiKey: legacyEvoConfig.api_key || '', isActive: legacyEvoConfig.is_active, isDefault: false }));
    }
    if (wuzConfig) {
      setWuz(prev => ({ ...prev, baseUrl: wuzConfig.base_url, apiKey: wuzConfig.api_key || '', isActive: wuzConfig.is_active, isDefault: wuzConfig.is_default }));
    }
    if (egoConfig) {
      setEgo(prev => ({ ...prev, baseUrl: egoConfig.base_url, apiKey: egoConfig.api_key || '', isActive: egoConfig.is_active, isDefault: egoConfig.is_default }));
    }
    if (wppConfig) {
      setWpp(prev => ({ ...prev, baseUrl: wppConfig.base_url, apiKey: wppConfig.api_key || '', isActive: wppConfig.is_active, isDefault: wppConfig.is_default }));
    }
    if (qpConfig) {
      setQp(prev => ({ ...prev, baseUrl: qpConfig.base_url, apiKey: qpConfig.api_key || '', isActive: qpConfig.is_active, isDefault: qpConfig.is_default }));
    }
  }, [waConfigs, legacyEvoConfig]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!company?.id) return;
      const { error } = await supabase.from('companies').update({ name: companyName }).eq('id', company.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-settings'] });
      toast.success('Configurações salvas');
    },
    onError: (e: any) => toast.error(e.message),
  });

  type ProviderKey = 'evolution' | 'wuzapi' | 'evolution_go' | 'wppconnect' | 'quepasa';

  const providerStateMap: Record<ProviderKey, [ProviderState, React.Dispatch<React.SetStateAction<ProviderState>>]> = {
    evolution: [evo, setEvo],
    wuzapi: [wuz, setWuz],
    evolution_go: [ego, setEgo],
    wppconnect: [wpp, setWpp],
    quepasa: [qp, setQp],
  };

  const providerLabel = (p: ProviderKey) =>
    p === 'evolution' ? 'Evolution API'
    : p === 'wuzapi' ? 'Wuzapi'
    : p === 'evolution_go' ? 'Evolution Go'
    : p === 'wppconnect' ? 'WPPConnect'
    : 'QuePasa';

  const saveProvider = async (provider: ProviderKey, state: ProviderState) => {
    if (!company?.id) throw new Error('Conta não identificada');
    if (!state.baseUrl) throw new Error('URL da API é obrigatória');

    const payload = {
      company_id: company.id,
      provider,
      base_url: state.baseUrl.replace(/\/+$/, ''),
      api_key: state.apiKey || null,
      is_active: state.isActive,
      is_default: state.isDefault,
    };

    if (state.isDefault) {
      await supabase.from('whatsapp_api_configs').update({ is_default: false }).eq('company_id', company.id).neq('provider', provider);
    }

    const { error } = await supabase
      .from('whatsapp_api_configs')
      .upsert(payload, { onConflict: 'company_id,provider' });
    if (error) throw error;

    if (provider === 'evolution') {
      const legacyPayload = { company_id: company.id, base_url: payload.base_url, api_key: payload.api_key || '', is_active: payload.is_active };
      if (legacyEvoConfig) {
        await supabase.from('evolution_api_config').update(legacyPayload).eq('company_id', company.id);
      } else {
        await supabase.from('evolution_api_config').insert(legacyPayload);
      }
    }

    await queryClient.invalidateQueries({ queryKey: ['whatsapp-api-configs'] });
    await queryClient.invalidateQueries({ queryKey: ['evolution-config'] });
  };

  const handleSaveProvider = async (provider: ProviderKey) => {
    const [state, setState] = providerStateMap[provider];
    if (provider === 'wppconnect' || provider === 'quepasa') {
      const validationError = validateProviderInputs(provider, state);
      if (validationError) { toast.error(validationError); return; }
    }
    const normalizedUrl = normalizeBaseUrl(state.baseUrl);
    if (normalizedUrl !== state.baseUrl) {
      setState(prev => ({ ...prev, baseUrl: normalizedUrl }));
    }
    const stateToUse = { ...state, baseUrl: normalizedUrl };
    setState(prev => ({ ...prev, saving: true }));
    try {
      await saveProvider(provider, stateToUse);
      toast.success(`Integração ${providerLabel(provider)} salva`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setState(prev => ({ ...prev, saving: false }));
    }
  };

  const normalizeBaseUrl = (url: string) => url.trim().replace(/\/+$/, '');

  const validateProviderInputs = (provider: ProviderKey, state: ProviderState): string | null => {
    const url = state.baseUrl.trim();
    const key = state.apiKey.trim();
    if (provider === 'wppconnect') {
      if (!url) return 'Informe a URL base do WPPConnect Server.';
      if (!key) return 'Informe a Secret Key do WPPConnect.';
      if (!/^https?:\/\//i.test(url)) return 'A URL do WPPConnect deve começar com http:// ou https://';
      if (/\/\/+$/.test(url) || /[^:]\/\/+/.test(url.replace(/^https?:\/\//i, ''))) {
        return 'A URL do WPPConnect contém barras duplicadas. Verifique o endereço.';
      }
    } else if (provider === 'quepasa') {
      if (!url) return 'Informe a URL base do servidor QuePasa.';
      if (!key) return 'Informe o Token / Master Key do QuePasa.';
      if (!/^https?:\/\//i.test(url)) return 'A URL do QuePasa deve começar com http:// ou https://';
      if (/\/\/+$/.test(url) || /[^:]\/\/+/.test(url.replace(/^https?:\/\//i, ''))) {
        return 'A URL do QuePasa contém barras duplicadas. Verifique o endereço.';
      }
    } else {
      if (!url || !key) return 'Preencha a URL e a API Key';
    }
    return null;
  };

  const friendlyTestError = (provider: ProviderKey, raw: string): string => {
    const msg = (raw || '').toLowerCase();
    if (provider !== 'wppconnect' && provider !== 'quepasa') return raw || 'Não foi possível conectar';
    const label = provider === 'wppconnect' ? 'WPPConnect Server' : 'servidor QuePasa';
    if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('econnrefused') || msg.includes('timeout')) {
      return `Não foi possível alcançar o ${label}. Verifique se a URL está correta e o servidor está online.`;
    }
    if (msg.includes('401') || msg.includes('unauthorized') || msg.includes('invalid token') || msg.includes('forbidden') || msg.includes('403')) {
      return provider === 'wppconnect'
        ? 'Secret Key inválida. Verifique a chave configurada no servidor WPPConnect.'
        : 'Token / Master Key inválido. Verifique a chave configurada no servidor QuePasa.';
    }
    if (msg.includes('404') || msg.includes('not found')) {
      return `Endpoint não encontrado. Confirme se a URL aponta para um ${label} compatível.`;
    }
    if (msg.includes('500') || msg.includes('502') || msg.includes('503')) {
      return `O ${label} retornou um erro. Tente novamente em instantes.`;
    }
    return raw || `Não foi possível conectar ao ${label}`;
  };

  const testConnection = async (provider: ProviderKey) => {
    const [state, setState] = providerStateMap[provider];
    const validationError = validateProviderInputs(provider, state);
    if (validationError) { toast.error(validationError); return; }

    // Normalize URL (remove trailing slashes) before saving/testing
    const normalizedUrl = normalizeBaseUrl(state.baseUrl);
    if (normalizedUrl !== state.baseUrl) {
      setState(prev => ({ ...prev, baseUrl: normalizedUrl }));
    }
    const stateToUse = { ...state, baseUrl: normalizedUrl };

    setState(prev => ({ ...prev, testing: true, testStatus: 'idle' }));
    try {
      await saveProvider(provider, stateToUse);
      queryClient.invalidateQueries({ queryKey: ['whatsapp-api-configs'] });
      const res = await supabase.functions.invoke('whatsapp-provider-proxy', { body: { action: 'testConnection', provider } });
      if (res.error) {
        const invokeError: any = res.error;
        const ctx = invokeError?.context;
        let details: any = null;
        if (ctx) { details = await ctx.clone().json().catch(async () => { const raw = await ctx.text().catch(() => ''); return raw ? { raw } : null; }); }
        throw new Error(details?.error || invokeError.message || 'Falha na conexão');
      }
      if (res.data?.error) throw new Error(res.data.error);
      setState(prev => ({ ...prev, testStatus: 'success' }));
      toast.success('Conexão bem-sucedida!');
    } catch (err: any) {
      setState(prev => ({ ...prev, testStatus: 'error' }));
      toast.error(friendlyTestError(provider, err?.message || ''));
    } finally {
      setState(prev => ({ ...prev, testing: false }));
    }
  };

  // Admin has unrestricted access to all providers — plan restrictions only apply to client users
  const isProviderAllowed = (provider: string) =>
    isAdmin || allowedProviders.length === 0 || allowedProviders.includes(provider);

  const effectiveSettings = globalSettings.map((gs: any) => {
    const override = companySettings.find((cs: any) => cs.setting_key === gs.setting_key);
    return {
      key: gs.setting_key,
      value: override ? override.setting_value : gs.setting_value,
      description: gs.description,
      isInherited: !override,
    };
  });

  const renderProviderCard = (
    provider: ProviderKey,
    label: string,
    description: string,
  ) => {
    const [state, setState] = providerStateMap[provider];
    const allowed = isProviderAllowed(provider);
    const canEdit = isAdmin ? true : (!isSuspended && allowed);

    const placeholder =
      provider === 'evolution' ? 'https://sua-evolution-api.com'
      : provider === 'wuzapi' ? 'https://sua-wuzapi.com:8080'
      : provider === 'evolution_go' ? 'https://sua-evolution-go.com:8080'
      : provider === 'wppconnect' ? 'https://sua-wppconnect.com'
      : 'https://sua-quepasa.com';
    const apiKeyLabel =
      provider === 'wuzapi' ? 'Admin Token'
      : provider === 'wppconnect' ? 'Secret Key'
      : provider === 'quepasa' ? 'Token / Master Key'
      : 'API Key (GLOBAL_API_KEY)';

    return (
      <Card key={provider} className={`border-border/40 bg-card/80 ${!allowed ? 'opacity-60' : ''}`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-accent/10">
                  <Plug className="h-5 w-5 text-accent" />
                </div>
                {label}
              </CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {!allowed && (
                <Badge variant="outline" className="gap-1 bg-warning/10 border-warning/30 text-warning">
                  <Lock className="h-3 w-3" /> Não permitido
                </Badge>
              )}
              {state.isDefault && allowed && (
                <Badge variant="outline" className="gap-1 bg-warning/10 border-warning/30 text-warning">
                  <Star className="h-3 w-3" /> Padrão
                </Badge>
              )}
              {state.isActive && allowed && (
                <Badge className="bg-success/10 text-success border border-success/30">Ativo</Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!allowed && (
            <Alert className="bg-warning/5 border-warning/20">
              <Lock className="h-4 w-4 text-warning" />
              <AlertDescription>Este provider não está disponível no seu plano atual.</AlertDescription>
            </Alert>
          )}
          {provider === 'wppconnect' && (
            <p className="text-xs text-muted-foreground -mb-1">
              Informe a URL base do seu WPPConnect Server e a Secret Key configurada no servidor.
            </p>
          )}
          {provider === 'quepasa' && (
            <p className="text-xs text-muted-foreground -mb-1">
              Informe a URL base do seu servidor QuePasa e o token/masterkey configurado na instalação.
            </p>
          )}
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-xs uppercase tracking-wider">URL da API</Label>
            <Input value={state.baseUrl} onChange={e => setState(prev => ({ ...prev, baseUrl: e.target.value, testStatus: 'idle' }))} onBlur={() => {
              if ((provider === 'wppconnect' || provider === 'quepasa') && state.baseUrl) {
                const norm = normalizeBaseUrl(state.baseUrl);
                if (norm !== state.baseUrl) setState(prev => ({ ...prev, baseUrl: norm }));
              }
            }} placeholder={placeholder} disabled={!canEdit} />
            {provider === 'wppconnect' && (
              <p className="text-[11px] text-muted-foreground">Sem barra final. Ex.: https://sua-wppconnect.com</p>
            )}
            {provider === 'quepasa' && (
              <p className="text-[11px] text-muted-foreground">Sem barra final. Ex.: https://sua-quepasa.com</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-xs uppercase tracking-wider">{apiKeyLabel}</Label>
            <Input type="password" autoComplete="new-password" value={state.apiKey} onChange={e => setState(prev => ({ ...prev, apiKey: e.target.value, testStatus: 'idle' }))} disabled={!canEdit} />
            {provider === 'wppconnect' && (
              <p className="text-[11px] text-muted-foreground">A Secret Key fica armazenada com segurança no servidor e nunca é exibida em logs.</p>
            )}
            {provider === 'quepasa' && (
              <p className="text-[11px] text-muted-foreground">O token/masterkey fica armazenado com segurança no servidor e nunca é exibido em logs.</p>
            )}
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-border/30">
            <p className="text-sm font-medium">Ativar integração</p>
            <Switch checked={state.isActive} onCheckedChange={v => setState(prev => ({ ...prev, isActive: v }))} disabled={!canEdit} />
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-border/30">
            <p className="text-sm font-medium">Provider padrão</p>
            <Switch checked={state.isDefault} onCheckedChange={v => {
              setState(prev => ({ ...prev, isDefault: v }));
              if (v) {
                // Clear "default" on all other providers locally for instant UI feedback
                (Object.keys(providerStateMap) as ProviderKey[])
                  .filter(p => p !== provider)
                  .forEach(p => providerStateMap[p][1](prev => ({ ...prev, isDefault: false })));
              }
            }} disabled={!canEdit} />
          </div>
          {canEdit && (
            <div className="flex items-center gap-3 pt-2">
              <Button variant="outline" onClick={() => testConnection(provider)} disabled={state.testing || !state.baseUrl || !state.apiKey} className="border-accent/40 text-accent hover:bg-accent/10">
                {state.testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : state.testStatus === 'success' ? <CheckCircle2 className="h-4 w-4 mr-2 text-success" /> : state.testStatus === 'error' ? <XCircle className="h-4 w-4 mr-2 text-destructive" /> : <Plug className="h-4 w-4 mr-2" />}
                Testar conexão
              </Button>
              <Button onClick={() => handleSaveProvider(provider)} disabled={state.saving}>
                {state.saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Save className="h-4 w-4 mr-2" /> Salvar integração
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground">Configurações gerais da conta</p>
      </div>

      {isSuspended && (
        <Alert variant="destructive" className="bg-destructive/10 border-destructive/30">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Assinatura suspensa</AlertTitle>
          <AlertDescription>Edição de configurações desabilitada. Regularize sua assinatura.</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6">
        <Card className="border-border/40 bg-card/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-primary/10">
                <Globe className="h-5 w-5 text-primary" />
              </div>
              Geral
            </CardTitle>
            <CardDescription>Informações básicas da conta</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">Nome da conta</Label>
              <Input value={companyName} onChange={e => setCompanyName(e.target.value)} disabled={!isAdmin || isSuspended} />
            </div>
          </CardContent>
        </Card>

        {effectiveSettings.length > 0 && (
          <Card className="border-border/40 bg-card/80">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-accent/10">
                  <Info className="h-5 w-5 text-accent" />
                </div>
                Configurações Efetivas
              </CardTitle>
              <CardDescription>Valores herdados do sistema ou personalizados para a conta</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {effectiveSettings.map((s: any) => (
                  <div key={s.key} className="flex items-center justify-between py-3 px-3 rounded-lg hover:bg-muted/20 transition-colors border-b border-border/20 last:border-0">
                    <div>
                      <p className="text-sm font-medium font-mono text-foreground">{s.key}</p>
                      {s.description && <p className="text-xs text-muted-foreground">{s.description}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono text-muted-foreground">{s.value || '—'}</span>
                      {s.isInherited ? (
                        <Badge variant="outline" className="text-xs bg-muted/20 border-border/40">Herdado</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs bg-primary/10 border-primary/30 text-primary">Customizado</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="space-y-2">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Provedores WhatsApp</h2>
          <p className="text-sm text-muted-foreground">
            Selecione um provedor abaixo para visualizar e configurar suas credenciais. Apenas um provedor pode ser definido como padrão por vez.
          </p>
        </div>

        <Tabs defaultValue="evolution" className="space-y-4">
          <div className="overflow-x-auto -mx-1 px-1">
            <TabsList className="inline-flex w-auto min-w-full sm:min-w-0">
              {([
                { value: 'evolution', label: 'Evolution API', icon: Zap, state: evo },
                { value: 'evolution_go', label: 'Evolution Go', icon: Rocket, state: ego },
                { value: 'wuzapi', label: 'WuzAPI', icon: MessageCircle, state: wuz },
                { value: 'wppconnect', label: 'WPPConnect', icon: Cable, state: wpp },
                { value: 'quepasa', label: 'QuePasa', icon: Radio, state: qp },
              ] as const).map((p) => {
                const Icon = p.icon;
                return (
                  <TabsTrigger key={p.value} value={p.value} className="gap-2 whitespace-nowrap">
                    <Icon className="h-4 w-4" />
                    <span>{p.label}</span>
                    {p.state.isDefault && (
                      <Star className="h-3 w-3 text-warning fill-warning" />
                    )}
                    {p.state.isActive && !p.state.isDefault && (
                      <span className="h-1.5 w-1.5 rounded-full bg-success shadow-[0_0_6px_hsl(var(--success))]" />
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          <TabsContent value="evolution" className="mt-4">
            {renderProviderCard('evolution', 'Evolution API', 'Integração com a Evolution API v1 para gerenciamento de WhatsApp')}
          </TabsContent>
          <TabsContent value="evolution_go" className="mt-4">
            {renderProviderCard('evolution_go', 'Evolution Go (v2)', 'Versão em Go da Evolution API — alta performance, autenticação via GLOBAL_API_KEY')}
          </TabsContent>
          <TabsContent value="wuzapi" className="mt-4">
            {renderProviderCard('wuzapi', 'Wuzapi', 'Integração com Wuzapi (whatsmeow) para gerenciamento de WhatsApp')}
          </TabsContent>
          <TabsContent value="wppconnect" className="mt-4">
            {renderProviderCard('wppconnect', 'WPPConnect', 'Informe a URL base do seu WPPConnect Server e a Secret Key configurada no servidor.')}
          </TabsContent>
          <TabsContent value="quepasa" className="mt-4">
            {renderProviderCard('quepasa', 'QuePasa', 'QuePasa — API HTTP open-source para conexão WhatsApp Web, QR Code, envio de mensagens e webhooks.')}
          </TabsContent>
        </Tabs>

        <Card className="border-border/40 bg-card/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-accent/10">
                <Webhook className="h-5 w-5 text-accent" />
              </div>
              Webhooks
            </CardTitle>
            <CardDescription>Endpoint centralizado para receber eventos dos providers WhatsApp</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">URL base do webhook (gerada automaticamente)</Label>
              <div className="flex gap-2 mt-1">
                <Input value={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webhook-receiver`} readOnly className="font-mono text-xs bg-muted/30 border-border/30" />
                <Button variant="outline" size="icon" onClick={() => {
                  navigator.clipboard.writeText(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webhook-receiver`);
                  toast.success('URL copiada!');
                }} className="border-accent/40 text-accent hover:bg-accent/10">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                Cada instância recebe automaticamente uma URL única com identificador e token de segurança.
              </p>
            </div>
          </CardContent>
        </Card>

        {isAdmin && !isSuspended && (
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="w-fit">
            <Save className="h-4 w-4 mr-2" /> Salvar configurações
          </Button>
        )}
      </div>
    </div>
  );
}

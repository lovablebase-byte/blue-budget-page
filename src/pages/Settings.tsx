import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Save, Globe, Bell, Webhook, Plug, Loader2, CheckCircle2, XCircle, Star, Copy } from 'lucide-react';

const TIMEZONES = [
  'America/Sao_Paulo', 'America/Manaus', 'America/Bahia', 'America/Recife',
  'America/Fortaleza', 'America/Belem', 'America/Cuiaba', 'America/Porto_Velho',
  'America/Rio_Branco', 'America/Noronha',
];

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
  const { company } = useAuth();
  const queryClient = useQueryClient();

  const [companyName, setCompanyName] = useState('');
  const [defaultTimezone, setDefaultTimezone] = useState('America/Sao_Paulo');
  const [autoReconnect, setAutoReconnect] = useState(true);
  const [notifyOffline, setNotifyOffline] = useState(true);

  const [evo, setEvo] = useState<ProviderState>(defaultProviderState());
  const [wuz, setWuz] = useState<ProviderState>(defaultProviderState());

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

  // Load new whatsapp_api_configs
  const { data: waConfigs } = useQuery({
    queryKey: ['whatsapp-api-configs', company?.id],
    queryFn: async () => {
      if (!company?.id) return [];
      const { data } = await supabase
        .from('whatsapp_api_configs')
        .select('*')
        .eq('company_id', company.id);
      return data || [];
    },
    enabled: !!company?.id,
  });

  // Legacy fallback
  const { data: legacyEvoConfig } = useQuery({
    queryKey: ['evolution-config', company?.id],
    queryFn: async () => {
      if (!company?.id) return null;
      const { data } = await supabase
        .from('evolution_api_config')
        .select('*')
        .eq('company_id', company.id)
        .single();
      return data;
    },
    enabled: !!company?.id,
  });

  useEffect(() => {
    if (companyData) setCompanyName(companyData.name);
  }, [companyData]);

  // Hydrate provider states from DB
  useEffect(() => {
    const evoConfig = waConfigs?.find((c: any) => c.provider === 'evolution');
    const wuzConfig = waConfigs?.find((c: any) => c.provider === 'wuzapi');

    if (evoConfig) {
      setEvo(prev => ({ ...prev, baseUrl: evoConfig.base_url, apiKey: evoConfig.api_key || '', isActive: evoConfig.is_active, isDefault: evoConfig.is_default }));
    } else if (legacyEvoConfig) {
      // Fallback from legacy table
      setEvo(prev => ({ ...prev, baseUrl: legacyEvoConfig.base_url, apiKey: legacyEvoConfig.api_key || '', isActive: legacyEvoConfig.is_active, isDefault: false }));
    }

    if (wuzConfig) {
      setWuz(prev => ({ ...prev, baseUrl: wuzConfig.base_url, apiKey: wuzConfig.api_key || '', isActive: wuzConfig.is_active, isDefault: wuzConfig.is_default }));
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

  const saveProvider = async (provider: 'evolution' | 'wuzapi', state: ProviderState) => {
    if (!company?.id) return;

    const payload = {
      company_id: company.id,
      provider,
      base_url: state.baseUrl.replace(/\/+$/, ''),
      api_key: state.apiKey || null,
      is_active: state.isActive,
      is_default: state.isDefault,
    };

    // If setting as default, unset others
    if (state.isDefault) {
      await supabase
        .from('whatsapp_api_configs')
        .update({ is_default: false })
        .eq('company_id', company.id)
        .neq('provider', provider);
    }

    // Upsert into new table
    const existing = waConfigs?.find((c: any) => c.provider === provider);
    if (existing) {
      const { error } = await supabase
        .from('whatsapp_api_configs')
        .update(payload)
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('whatsapp_api_configs')
        .insert(payload);
      if (error) throw error;
    }

    // Also sync to legacy table for Evolution
    if (provider === 'evolution') {
      const legacyPayload = {
        company_id: company.id,
        base_url: payload.base_url,
        api_key: payload.api_key || '',
        is_active: payload.is_active,
      };
      if (legacyEvoConfig) {
        await supabase.from('evolution_api_config').update(legacyPayload).eq('company_id', company.id);
      } else {
        await supabase.from('evolution_api_config').insert(legacyPayload);
      }
    }

    queryClient.invalidateQueries({ queryKey: ['whatsapp-api-configs'] });
    queryClient.invalidateQueries({ queryKey: ['evolution-config'] });
  };

  const handleSaveProvider = async (provider: 'evolution' | 'wuzapi') => {
    const state = provider === 'evolution' ? evo : wuz;
    const setState = provider === 'evolution' ? setEvo : setWuz;
    setState(prev => ({ ...prev, saving: true }));
    try {
      await saveProvider(provider, state);
      toast.success(`Integração ${provider === 'evolution' ? 'Evolution API' : 'Wuzapi'} salva`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setState(prev => ({ ...prev, saving: false }));
    }
  };

  const testConnection = async (provider: 'evolution' | 'wuzapi') => {
    const state = provider === 'evolution' ? evo : wuz;
    const setState = provider === 'evolution' ? setEvo : setWuz;

    if (!state.baseUrl || !state.apiKey) {
      toast.error('Preencha a URL e a API Key');
      return;
    }

    setState(prev => ({ ...prev, testing: true, testStatus: 'idle' }));
    try {
      const res = await supabase.functions.invoke('whatsapp-provider-proxy', {
        body: { action: 'testConnection', provider },
      });
      if (res.error || res.data?.error) throw new Error(res.data?.error || 'Falha na conexão');

      // For test to work, provider must already be saved. If not saved yet, do direct test.
      setState(prev => ({ ...prev, testStatus: 'success' }));
      toast.success('Conexão bem-sucedida!');
    } catch {
      // Try direct connection test
      try {
        const baseUrl = state.baseUrl.replace(/\/+$/, '');
        if (provider === 'evolution') {
          const r = await fetch(`${baseUrl}/instance/fetchInstances`, {
            method: 'GET',
            headers: { apikey: state.apiKey },
          });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
        } else {
          const r = await fetch(`${baseUrl}/admin/users`, {
            method: 'GET',
            headers: { Authorization: state.apiKey },
          });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
        }
        setState(prev => ({ ...prev, testStatus: 'success' }));
        toast.success('Conexão bem-sucedida!');
      } catch (err: any) {
        setState(prev => ({ ...prev, testStatus: 'error' }));
        toast.error(err.message || 'Não foi possível conectar');
      }
    } finally {
      setState(prev => ({ ...prev, testing: false }));
    }
  };

  const renderProviderCard = (
    provider: 'evolution' | 'wuzapi',
    label: string,
    description: string,
    state: ProviderState,
    setState: React.Dispatch<React.SetStateAction<ProviderState>>,
  ) => (
    <Card key={provider}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Plug className="h-5 w-5" /> {label}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {state.isDefault && (
              <Badge variant="outline" className="gap-1 border-amber-500 text-amber-600">
                <Star className="h-3 w-3" /> Padrão
              </Badge>
            )}
            {state.isActive && (
              <Badge className="bg-green-600 hover:bg-green-700">Ativo</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>URL da API</Label>
          <Input
            value={state.baseUrl}
            onChange={e => { setState(prev => ({ ...prev, baseUrl: e.target.value, testStatus: 'idle' })); }}
            placeholder={provider === 'evolution' ? 'https://sua-evolution-api.com' : 'https://sua-wuzapi.com:8080'}
          />
          <p className="text-xs text-muted-foreground mt-1">
            {provider === 'evolution' ? 'URL base da sua instância Evolution API' : 'URL base da sua instância Wuzapi'}
          </p>
        </div>
        <div>
          <Label>{provider === 'evolution' ? 'API Key' : 'Admin Token'}</Label>
          <Input
            type="password"
            value={state.apiKey}
            onChange={e => { setState(prev => ({ ...prev, apiKey: e.target.value, testStatus: 'idle' })); }}
            placeholder={provider === 'evolution' ? 'Sua chave de autenticação' : 'WUZAPI_ADMIN_TOKEN'}
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Ativar integração</p>
            <p className="text-xs text-muted-foreground">Habilitar comunicação com {label}</p>
          </div>
          <Switch checked={state.isActive} onCheckedChange={v => setState(prev => ({ ...prev, isActive: v }))} />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Provider padrão</p>
            <p className="text-xs text-muted-foreground">Usar como padrão ao criar novas instâncias</p>
          </div>
          <Switch checked={state.isDefault} onCheckedChange={v => {
            setState(prev => ({ ...prev, isDefault: v }));
            if (v) {
              // Uncheck the other provider's default
              const otherSetState = provider === 'evolution' ? setWuz : setEvo;
              otherSetState(prev => ({ ...prev, isDefault: false }));
            }
          }} />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Button variant="outline" onClick={() => testConnection(provider)} disabled={state.testing || !state.baseUrl || !state.apiKey}>
            {state.testing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : state.testStatus === 'success' ? (
              <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />
            ) : state.testStatus === 'error' ? (
              <XCircle className="h-4 w-4 mr-2 text-red-500" />
            ) : (
              <Plug className="h-4 w-4 mr-2" />
            )}
            Testar conexão
          </Button>
          <Button onClick={() => handleSaveProvider(provider)} disabled={state.saving}>
            {state.saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <Save className="h-4 w-4 mr-2" /> Salvar integração
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-muted-foreground">Configurações gerais da empresa</p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5" /> Geral</CardTitle>
            <CardDescription>Informações básicas da empresa</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Nome da empresa</Label>
              <Input value={companyName} onChange={e => setCompanyName(e.target.value)} />
            </div>
            <div>
              <Label>Fuso horário padrão</Label>
              <Select value={defaultTimezone} onValueChange={setDefaultTimezone}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map(tz => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* WhatsApp Providers */}
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Provedores WhatsApp</h2>
          <p className="text-sm text-muted-foreground">Configure os provedores de API WhatsApp disponíveis para sua empresa</p>
        </div>

        {renderProviderCard(
          'evolution',
          'Evolution API',
          'Integração com a Evolution API para gerenciamento de WhatsApp',
          evo,
          setEvo,
        )}

        {renderProviderCard(
          'wuzapi',
          'Wuzapi',
          'Integração com Wuzapi (whatsmeow) para gerenciamento de WhatsApp',
          wuz,
          setWuz,
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Webhook className="h-5 w-5" /> Webhooks</CardTitle>
            <CardDescription>Endpoint centralizado para receber eventos dos providers WhatsApp</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>URL base do webhook (gerada automaticamente)</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={`https://rmswpurvnqqayemvuocv.supabase.co/functions/v1/webhook-receiver`}
                  readOnly
                  className="font-mono text-xs"
                />
                <Button variant="outline" size="icon" onClick={() => {
                  navigator.clipboard.writeText('https://rmswpurvnqqayemvuocv.supabase.co/functions/v1/webhook-receiver');
                  toast.success('URL copiada!');
                }}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                Cada instância recebe automaticamente uma URL única com identificador e token de segurança.
                O webhook é configurado no provider durante a criação da instância.
              </p>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Reconexão automática</p>
                <p className="text-xs text-muted-foreground">Reconectar instâncias automaticamente ao cair</p>
              </div>
              <Switch checked={autoReconnect} onCheckedChange={setAutoReconnect} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" /> Notificações</CardTitle>
            <CardDescription>Preferências de alertas</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Alertar instância offline</p>
                <p className="text-xs text-muted-foreground">Receber notificação quando uma instância desconectar</p>
              </div>
              <Switch checked={notifyOffline} onCheckedChange={setNotifyOffline} />
            </div>
          </CardContent>
        </Card>

        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="w-fit">
          <Save className="h-4 w-4 mr-2" /> Salvar configurações
        </Button>
      </div>
    </div>
  );
}

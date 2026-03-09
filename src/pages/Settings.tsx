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
import { toast } from '@/hooks/use-toast';
import { Save, Globe, Bell, Webhook, Plug, Loader2, CheckCircle2, XCircle } from 'lucide-react';

const TIMEZONES = [
  'America/Sao_Paulo', 'America/Manaus', 'America/Bahia', 'America/Recife',
  'America/Fortaleza', 'America/Belem', 'America/Cuiaba', 'America/Porto_Velho',
  'America/Rio_Branco', 'America/Noronha',
];

export default function Settings() {
  const { company } = useAuth();
  const queryClient = useQueryClient();

  const [companyName, setCompanyName] = useState('');
  const [defaultTimezone, setDefaultTimezone] = useState('America/Sao_Paulo');
  const [defaultWebhookUrl, setDefaultWebhookUrl] = useState('');
  const [autoReconnect, setAutoReconnect] = useState(true);
  const [notifyOffline, setNotifyOffline] = useState(true);

  // Evolution API state
  const [evoBaseUrl, setEvoBaseUrl] = useState('');
  const [evoApiKey, setEvoApiKey] = useState('');
  const [evoActive, setEvoActive] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');

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

  const { data: evoConfig } = useQuery({
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

  useEffect(() => {
    if (evoConfig) {
      setEvoBaseUrl(evoConfig.base_url);
      setEvoApiKey(evoConfig.api_key);
      setEvoActive(evoConfig.is_active);
    }
  }, [evoConfig]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!company?.id) return;
      const { error } = await supabase.from('companies').update({ name: companyName }).eq('id', company.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-settings'] });
      toast({ title: 'Configurações salvas' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const saveEvoMutation = useMutation({
    mutationFn: async () => {
      if (!company?.id) return;
      const payload = {
        company_id: company.id,
        base_url: evoBaseUrl.replace(/\/+$/, ''),
        api_key: evoApiKey,
        is_active: evoActive,
      };
      if (evoConfig) {
        const { error } = await supabase
          .from('evolution_api_config')
          .update(payload)
          .eq('company_id', company.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('evolution_api_config')
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evolution-config'] });
      toast({ title: 'Integração Evolution API salva' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const testConnection = async () => {
    if (!evoBaseUrl || !evoApiKey) {
      toast({ title: 'Preencha a URL e a API Key', variant: 'destructive' });
      return;
    }
    setTestingConnection(true);
    setConnectionStatus('idle');
    try {
      const url = evoBaseUrl.replace(/\/+$/, '');
      const res = await fetch(`${url}/instance/fetchInstances`, {
        method: 'GET',
        headers: { apikey: evoApiKey },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setConnectionStatus('success');
      toast({ title: 'Conexão bem-sucedida!', description: 'A Evolution API respondeu corretamente.' });
    } catch (err: any) {
      setConnectionStatus('error');
      toast({ title: 'Falha na conexão', description: err.message || 'Não foi possível conectar.', variant: 'destructive' });
    } finally {
      setTestingConnection(false);
    }
  };

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

        {/* Evolution API Integration */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Plug className="h-5 w-5" /> Evolution API
                </CardTitle>
                <CardDescription>Integração com a API de gerenciamento WhatsApp</CardDescription>
              </div>
              {evoConfig?.is_active && (
                <Badge variant="default" className="bg-green-600 hover:bg-green-700">Conectado</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>URL da API</Label>
              <Input
                value={evoBaseUrl}
                onChange={e => { setEvoBaseUrl(e.target.value); setConnectionStatus('idle'); }}
                placeholder="https://sua-evolution-api.com"
              />
              <p className="text-xs text-muted-foreground mt-1">URL base da sua instância Evolution API (sem barra no final)</p>
            </div>
            <div>
              <Label>API Key</Label>
              <Input
                type="password"
                value={evoApiKey}
                onChange={e => { setEvoApiKey(e.target.value); setConnectionStatus('idle'); }}
                placeholder="Sua chave de autenticação"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Ativar integração</p>
                <p className="text-xs text-muted-foreground">Habilitar comunicação com a Evolution API</p>
              </div>
              <Switch checked={evoActive} onCheckedChange={setEvoActive} />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button variant="outline" onClick={testConnection} disabled={testingConnection || !evoBaseUrl || !evoApiKey}>
                {testingConnection ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : connectionStatus === 'success' ? (
                  <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />
                ) : connectionStatus === 'error' ? (
                  <XCircle className="h-4 w-4 mr-2 text-red-500" />
                ) : (
                  <Plug className="h-4 w-4 mr-2" />
                )}
                Testar conexão
              </Button>
              <Button onClick={() => saveEvoMutation.mutate()} disabled={saveEvoMutation.isPending}>
                {saveEvoMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Save className="h-4 w-4 mr-2" /> Salvar integração
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Webhook className="h-5 w-5" /> Webhooks</CardTitle>
            <CardDescription>URL padrão para novas instâncias</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>URL padrão de webhook</Label>
              <Input value={defaultWebhookUrl} onChange={e => setDefaultWebhookUrl(e.target.value)} placeholder="https://seu-servidor.com/webhook" />
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

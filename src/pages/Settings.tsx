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
import { toast } from '@/hooks/use-toast';
import { Save, Globe, Bell, Webhook } from 'lucide-react';

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

  useEffect(() => {
    if (companyData) {
      setCompanyName(companyData.name);
    }
  }, [companyData]);

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

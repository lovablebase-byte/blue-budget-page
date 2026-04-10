import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getGlobalSettings, upsertGlobalSetting } from '@/services/admin-settings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DataTable, Column } from '@/components/DataTable';
import { toast } from 'sonner';
import { Save, Settings2, Globe, Webhook, Plug, Plus, Pencil, Trash2, Copy } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

// ── Default settings definitions ──
const DEFAULT_SETTINGS = [
  { key: 'default_provider', label: 'Provider padrão', description: 'Provider utilizado ao criar novas instâncias', defaultValue: 'evolution' },
  { key: 'default_timezone', label: 'Fuso horário padrão', description: 'Timezone padrão para novas instâncias', defaultValue: 'America/Sao_Paulo' },
  { key: 'webhook_base_url', label: 'URL base de webhooks', description: 'URL base do endpoint de webhooks', defaultValue: `${SUPABASE_URL}/functions/v1/webhook-receiver` },
  { key: 'max_reconnect_attempts', label: 'Tentativas de reconexão', description: 'Máximo de tentativas de reconexão automática', defaultValue: '3' },
  { key: 'message_retry_limit', label: 'Limite de retentativas', description: 'Máximo de retentativas ao enviar mensagem', defaultValue: '3' },
  { key: 'cooldown_minutes_default', label: 'Cooldown padrão (min)', description: 'Tempo de cooldown padrão entre mensagens de saudação', defaultValue: '60' },
];

export default function AdminSettings() {
  const queryClient = useQueryClient();

  // ── Global settings ──
  const { data: globalSettings = [], isLoading: loadingGlobal } = useQuery({
    queryKey: ['global-settings'],
    queryFn: getGlobalSettings,
  });

  const [settingsForm, setSettingsForm] = useState<Record<string, string>>({});
  const [newSettingOpen, setNewSettingOpen] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newDesc, setNewDesc] = useState('');

  useEffect(() => {
    const map: Record<string, string> = {};
    DEFAULT_SETTINGS.forEach(d => { map[d.key] = d.defaultValue; });
    globalSettings.forEach((s: any) => { map[s.setting_key] = s.setting_value; });
    setSettingsForm(map);
  }, [globalSettings]);

  const saveSettings = useMutation({
    mutationFn: async () => {
      for (const [key, value] of Object.entries(settingsForm)) {
        const def = DEFAULT_SETTINGS.find(d => d.key === key);
        await upsertGlobalSetting(key, value, def?.description);
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['global-settings'] }); toast.success('Configurações globais salvas'); },
    onError: (e: any) => toast.error(e.message),
  });

  const addCustomSetting = useMutation({
    mutationFn: async () => {
      if (!newKey) throw new Error('Chave é obrigatória');
      await upsertGlobalSetting(newKey, newValue, newDesc);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['global-settings'] });
      toast.success('Configuração adicionada');
      setNewSettingOpen(false);
      setNewKey(''); setNewValue(''); setNewDesc('');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteGlobalSetting = useMutation({
    mutationFn: async (key: string) => {
      const { error } = await supabase.from('global_settings').delete().eq('setting_key', key);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['global-settings'] }); toast.success('Removida'); },
    onError: (e: any) => toast.error(e.message),
  });

  // Custom settings (non-default)
  const customSettings = globalSettings.filter((s: any) => !DEFAULT_SETTINGS.find(d => d.key === s.setting_key));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Ajustes do Sistema</h1>
        <p className="text-muted-foreground">Configurações globais herdáveis por todas as empresas</p>
      </div>

      {/* Default settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Settings2 className="h-5 w-5" /> Padrões Globais</CardTitle>
          <CardDescription>Valores padrão que serão herdados por todas as empresas (sobrescritos individualmente quando necessário)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {DEFAULT_SETTINGS.map(def => (
            <div key={def.key}>
              <Label>{def.label}</Label>
              <Input
                value={settingsForm[def.key] || ''}
                onChange={e => setSettingsForm(prev => ({ ...prev, [def.key]: e.target.value }))}
                placeholder={def.defaultValue}
              />
              <p className="text-xs text-muted-foreground mt-1">{def.description}</p>
            </div>
          ))}
          <Button onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending}>
            <Save className="h-4 w-4 mr-2" /> Salvar padrões
          </Button>
        </CardContent>
      </Card>

      {/* Webhook info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Webhook className="h-5 w-5" /> Webhooks</CardTitle>
          <CardDescription>Endpoint centralizado para receber eventos</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              value={`${SUPABASE_URL}/functions/v1/webhook-receiver`}
              readOnly
              className="font-mono text-xs"
            />
            <Button variant="outline" size="icon" onClick={() => {
              navigator.clipboard.writeText(`${SUPABASE_URL}/functions/v1/webhook-receiver`);
              toast.success('URL copiada');
            }}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Cada instância recebe URL única com token. Configurado automaticamente ao criar instância.</p>
        </CardContent>
      </Card>

      {/* Custom settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5" /> Configurações Customizadas</CardTitle>
              <CardDescription>Chaves de configuração adicionais</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => setNewSettingOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Nova
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {customSettings.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma configuração customizada.</p>
          ) : (
            <div className="space-y-3">
              {customSettings.map((s: any) => (
                <div key={s.id} className="flex items-center justify-between border rounded-md p-3">
                  <div>
                    <p className="text-sm font-medium font-mono">{s.setting_key}</p>
                    <p className="text-xs text-muted-foreground">{s.description || s.setting_value}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{s.setting_value}</span>
                    <ConfirmDialog
                      title="Remover configuração?"
                      description={`A chave "${s.setting_key}" será removida.`}
                      onConfirm={() => deleteGlobalSetting.mutate(s.setting_key)}
                      trigger={<Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* New setting dialog */}
      <Dialog open={newSettingOpen} onOpenChange={setNewSettingOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Configuração</DialogTitle>
            <DialogDescription>Adicione uma chave de configuração global</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Chave *</Label>
              <Input value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="minha_config" />
            </div>
            <div>
              <Label>Valor</Label>
              <Input value={newValue} onChange={e => setNewValue(e.target.value)} placeholder="valor" />
            </div>
            <div>
              <Label>Descrição</Label>
              <Input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Descrição opcional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewSettingOpen(false)}>Cancelar</Button>
            <Button onClick={() => addCustomSetting.mutate()} disabled={!newKey || addCustomSetting.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

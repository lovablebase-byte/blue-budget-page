import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/contexts/CompanyContext';
import { useFeatureEnabled } from '@/hooks/use-plan-enforcement';
import { FeatureLockedBanner } from '@/components/PlanEnforcementGuard';
import { DataTable, Column } from '@/components/DataTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from '@/hooks/use-toast';
import { Plus, Copy, Eye, EyeOff, Trash2, Key, AlertTriangle } from 'lucide-react';

const SCOPES = [
  { value: 'send_message', label: 'Enviar mensagem' },
  { value: 'read_events', label: 'Ler eventos' },
  { value: 'manage_instance', label: 'Gerenciar instância' },
  { value: 'read_only', label: 'Somente leitura' },
];

export default function ChatbotKeys() {
  const { company } = useAuth();
  const { isSuspended } = useCompany();
  const apiFeature = useFeatureEnabled('api_access');
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(['read_events']);
  const [rateLimit, setRateLimit] = useState(60);
  const [ipAllowlist, setIpAllowlist] = useState('');
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());

  const { data: keys = [], isLoading } = useQuery({
    queryKey: ['chatbot-keys', company?.id],
    queryFn: async () => {
      if (!company?.id) return [];
      const { data, error } = await supabase
        .from('chatbot_keys')
        .select('*')
        .eq('company_id', company.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!company?.id,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('chatbot_keys').insert({
        company_id: company!.id,
        name,
        scopes,
        rate_limit: rateLimit,
        ip_allowlist: ipAllowlist ? ipAllowlist.split(',').map(s => s.trim()) : [],
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatbot-keys'] });
      setOpen(false);
      setName('');
      setScopes(['read_events']);
      toast({ title: 'Chave criada com sucesso' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('chatbot_keys').update({ is_active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['chatbot-keys'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('chatbot_keys').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatbot-keys'] });
      toast({ title: 'Chave revogada' });
    },
  });

  const toggleReveal = (id: string) => {
    setRevealedKeys(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toast({ title: 'Chave copiada!' });
  };

  const columns: Column<any>[] = [
    { key: 'name', label: 'Nome', sortable: true },
    {
      key: 'api_key', label: 'Chave API',
      render: (row) => (
        <div className="flex items-center gap-2 font-mono text-xs">
          <span>{revealedKeys.has(row.id) ? row.api_key : `${row.api_key.slice(0, 8)}...`}</span>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => toggleReveal(row.id)}>
            {revealedKeys.has(row.id) ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyKey(row.api_key)}>
            <Copy className="h-3 w-3" />
          </Button>
        </div>
      ),
    },
    {
      key: 'scopes', label: 'Escopos',
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {(row.scopes || []).map((s: string) => (
            <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
          ))}
        </div>
      ),
    },
    { key: 'rate_limit', label: 'Rate Limit', render: (row) => `${row.rate_limit}/min` },
    {
      key: 'is_active', label: 'Ativa',
      render: (row) => (
        <Switch checked={row.is_active} onCheckedChange={(v) => toggleMutation.mutate({ id: row.id, is_active: v })} />
      ),
    },
  ];

  const featureBlocked = apiFeature.data === false;

  return (
    <div className="space-y-6">
      {featureBlocked && <FeatureLockedBanner featureLabel="API de Chatbot" />}
      {isSuspended && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Conta suspensa</AlertTitle>
          <AlertDescription>Sua conta está suspensa. Não é possível gerenciar chaves.</AlertDescription>
        </Alert>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Chaves de Chatbot</h1>
          <p className="text-muted-foreground">Gerencie chaves de acesso à API</p>
        </div>
        {!featureBlocked && !isSuspended && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> Nova Chave</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova Chave API</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Nome</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Bot de atendimento" />
              </div>
              <div>
                <Label>Escopos</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {SCOPES.map(s => (
                    <label key={s.value} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={scopes.includes(s.value)}
                        onCheckedChange={(checked) => {
                          setScopes(prev => checked ? [...prev, s.value] : prev.filter(x => x !== s.value));
                        }}
                      />
                      {s.label}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <Label>Rate Limit (req/min)</Label>
                <Input type="number" value={rateLimit} onChange={e => setRateLimit(Number(e.target.value))} />
              </div>
              <div>
                <Label>IP Allowlist (separado por vírgula)</Label>
                <Input value={ipAllowlist} onChange={e => setIpAllowlist(e.target.value)} placeholder="Deixe vazio para permitir todos" />
              </div>
              <Button onClick={() => createMutation.mutate()} disabled={!name || createMutation.isPending} className="w-full">
                Criar Chave
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <DataTable
        data={keys}
        columns={columns}
        searchKey="name"
        searchPlaceholder="Buscar chave..."
        loading={isLoading}
        emptyMessage="Nenhuma chave criada"
        actions={(row) => (
          <ConfirmDialog
            title="Revogar chave?"
            description="Esta ação é irreversível. A chave será desativada permanentemente."
            onConfirm={() => deleteMutation.mutate(row.id)}
            trigger={<Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>}
          />
        )}
      />
    </div>
  );
}

import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { DataTable, Column } from '@/components/DataTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import { Plus, Trash2, Send, BarChart3, Users, MessageCircle, AlertTriangle, Upload, Play, Pause, Shield, Clock, Zap, FileText } from 'lucide-react';

// ---- Spintax engine ----
function resolveSpintax(text: string): string {
  return text.replace(/\{([^{}]+)\}/g, (_, group) => {
    const options = group.split('|');
    return options[Math.floor(Math.random() * options.length)];
  });
}

// ---- Risk level calculator ----
function calcRiskLevel(ratePerMin: number, totalContacts: number, instanceCount: number): { level: string; color: string; percent: number; tips: string[] } {
  const effectiveRate = instanceCount > 0 ? ratePerMin / instanceCount : ratePerMin;
  const tips: string[] = [];
  let score = 0;

  if (effectiveRate > 20) { score += 40; tips.push('Reduza o limite por minuto para menos de 20'); }
  else if (effectiveRate > 10) { score += 20; tips.push('Considere reduzir o limite por minuto'); }

  if (totalContacts > 1000) { score += 20; tips.push('Listas grandes aumentam o risco'); }
  if (instanceCount < 2) { score += 15; tips.push('Use múltiplas instâncias para distribuir envios'); }
  if (totalContacts > 500 && instanceCount < 3) { score += 15; tips.push('Adicione mais instâncias para esta quantidade de contatos'); }

  const percent = Math.min(score, 100);
  if (percent <= 30) return { level: 'Baixo', color: 'text-green-500', percent, tips };
  if (percent <= 60) return { level: 'Médio', color: 'text-yellow-500', percent, tips };
  return { level: 'Alto', color: 'text-destructive', percent, tips };
}

export default function Campaigns() {
  const { company } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('config');

  // Form state
  const [form, setForm] = useState({
    name: '',
    message_template: '',
    segment_type: 'manual',
    rate_limit_per_minute: 15,
    delay_min: 3,
    delay_max: 8,
    simulate_typing: true,
    use_spintax: true,
  });
  const [selectedInstances, setSelectedInstances] = useState<string[]>([]);
  const [contacts, setContacts] = useState<string[]>([]);
  const [contactsInput, setContactsInput] = useState('');
  const [importProgress, setImportProgress] = useState<{ current: number; total: number; percent: number } | null>(null);
  const [previewMsg, setPreviewMsg] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  // Queries
  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ['campaigns', company?.id],
    queryFn: async () => {
      if (!company?.id) return [];
      const { data, error } = await supabase.from('campaigns').select('*').eq('company_id', company.id).order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!company?.id,
  });

  const { data: instances = [] } = useQuery({
    queryKey: ['instances', company?.id],
    queryFn: async () => {
      if (!company?.id) return [];
      const { data, error } = await supabase.from('instances').select('id, name, status').eq('company_id', company.id);
      if (error) throw error;
      return data;
    },
    enabled: !!company?.id,
  });

  const onlineInstances = useMemo(() => instances.filter(i => i.status === 'online'), [instances]);

  // Risk monitor
  const risk = useMemo(
    () => calcRiskLevel(form.rate_limit_per_minute, contacts.length, selectedInstances.length),
    [form.rate_limit_per_minute, contacts.length, selectedInstances.length]
  );

  // CSV/TXT import
  const handleFileImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (!text) return;
      const lines = text.split(/[\r\n,;]+/).map(l => l.replace(/\D/g, '').trim()).filter(l => l.length >= 10 && l.length <= 15);
      const unique = [...new Set(lines)];

      // Batch processing with progress
      const BATCH = 500;
      let imported = 0;
      const allContacts: string[] = [];
      const processBatch = (start: number) => {
        const batch = unique.slice(start, start + BATCH);
        allContacts.push(...batch);
        imported += batch.length;
        setImportProgress({ current: imported, total: unique.length, percent: Math.round((imported / unique.length) * 100) });
        if (start + BATCH < unique.length) {
          setTimeout(() => processBatch(start + BATCH), 50);
        } else {
          setContacts(prev => [...new Set([...prev, ...allContacts])]);
          setTimeout(() => setImportProgress(null), 1500);
          toast({ title: `${allContacts.length} contatos importados` });
        }
      };
      setImportProgress({ current: 0, total: unique.length, percent: 0 });
      processBatch(0);
    };
    reader.readAsText(file);
    e.target.value = '';
  }, []);

  // Manual contacts
  const handleAddManualContacts = useCallback(() => {
    const nums = contactsInput.split(/[\r\n,;]+/).map(l => l.replace(/\D/g, '').trim()).filter(l => l.length >= 10 && l.length <= 15);
    if (nums.length === 0) return;
    setContacts(prev => [...new Set([...prev, ...nums])]);
    setContactsInput('');
    toast({ title: `${nums.length} contatos adicionados` });
  }, [contactsInput]);

  // Create campaign
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!company?.id) throw new Error('Empresa não encontrada');
      if (contacts.length === 0) throw new Error('Adicione contatos');
      if (selectedInstances.length === 0) throw new Error('Selecione ao menos uma instância');

      const { error } = await supabase.from('campaigns').insert({
        company_id: company.id,
        name: form.name,
        message_template: form.message_template,
        segment_type: form.segment_type,
        rate_limit_per_minute: form.rate_limit_per_minute,
        segment_data: {
          contacts,
          instances: selectedInstances,
          delay_min: form.delay_min,
          delay_max: form.delay_max,
          simulate_typing: form.simulate_typing,
          use_spintax: form.use_spintax,
        } as any,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      setOpen(false);
      resetForm();
      toast({ title: 'Campanha criada com sucesso' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('campaigns').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['campaigns'] }); toast({ title: 'Campanha excluída' }); },
  });

  const resetForm = () => {
    setForm({ name: '', message_template: '', segment_type: 'manual', rate_limit_per_minute: 15, delay_min: 3, delay_max: 8, simulate_typing: true, use_spintax: true });
    setSelectedInstances([]);
    setContacts([]);
    setContactsInput('');
    setActiveTab('config');
  };

  const toggleInstance = (id: string) => {
    setSelectedInstances(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  // Stats
  const totalStats = campaigns.reduce((acc, c) => {
    const s = c.stats as any || { sent: 0, delivered: 0, read: 0, failed: 0 };
    return { sent: acc.sent + (s.sent || 0), delivered: acc.delivered + (s.delivered || 0), read: acc.read + (s.read || 0), failed: acc.failed + (s.failed || 0) };
  }, { sent: 0, delivered: 0, read: 0, failed: 0 });

  const statusColor = (status: string) => {
    switch (status) { case 'draft': return 'secondary'; case 'sending': return 'default'; case 'completed': return 'outline'; case 'paused': return 'destructive'; default: return 'secondary'; }
  };
  const statusLabel = (status: string) => {
    switch (status) { case 'draft': return 'Rascunho'; case 'sending': return 'Enviando'; case 'completed': return 'Concluída'; case 'paused': return 'Pausada'; default: return status; }
  };

  const columns: Column<any>[] = [
    { key: 'name', label: 'Nome', sortable: true },
    {
      key: 'segment_data', label: 'Contatos',
      render: (row) => {
        const sd = row.segment_data as any;
        return <Badge variant="outline"><Users className="h-3 w-3 mr-1" />{sd?.contacts?.length || 0}</Badge>;
      }
    },
    {
      key: 'instances', label: 'Instâncias',
      render: (row) => {
        const sd = row.segment_data as any;
        return <Badge variant="outline"><Zap className="h-3 w-3 mr-1" />{sd?.instances?.length || 0}</Badge>;
      }
    },
    { key: 'status', label: 'Status', render: (row) => <Badge variant={statusColor(row.status)}>{statusLabel(row.status)}</Badge> },
    { key: 'rate_limit_per_minute', label: 'Limite/min' },
    {
      key: 'stats', label: 'Enviados/Entregues',
      render: (row) => { const s = row.stats as any || { sent: 0, delivered: 0 }; return `${s.sent || 0} / ${s.delivered || 0}`; },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Campanhas</h1>
          <p className="text-muted-foreground">Disparos em massa com proteções anti-ban</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> Nova Campanha</Button></DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Nova Campanha</DialogTitle></DialogHeader>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="config">Configuração</TabsTrigger>
                <TabsTrigger value="contacts">Contatos ({contacts.length})</TabsTrigger>
                <TabsTrigger value="message">Mensagem</TabsTrigger>
                <TabsTrigger value="risk">Risco</TabsTrigger>
              </TabsList>

              {/* Tab 1: Config */}
              <TabsContent value="config" className="space-y-4 mt-4">
                <div>
                  <Label>Nome da Campanha</Label>
                  <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Promoção Natal 2026" />
                </div>

                <div>
                  <Label>Instâncias para envio</Label>
                  <p className="text-xs text-muted-foreground mb-2">Selecione as instâncias online para distribuir os envios</p>
                  {onlineInstances.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">Nenhuma instância online disponível</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {onlineInstances.map(inst => (
                        <label key={inst.id} className="flex items-center gap-2 p-2 border rounded-md cursor-pointer hover:bg-accent/50">
                          <Checkbox checked={selectedInstances.includes(inst.id)} onCheckedChange={() => toggleInstance(inst.id)} />
                          <span className="text-sm">{inst.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Delay mínimo (s)</Label>
                    <Input type="number" min={1} max={60} value={form.delay_min} onChange={e => setForm(f => ({ ...f, delay_min: Math.max(1, Number(e.target.value)) }))} />
                  </div>
                  <div>
                    <Label>Delay máximo (s)</Label>
                    <Input type="number" min={1} max={120} value={form.delay_max} onChange={e => setForm(f => ({ ...f, delay_max: Math.max(form.delay_min, Number(e.target.value)) }))} />
                  </div>
                </div>

                <div>
                  <Label>Limite de envios por minuto</Label>
                  <div className="flex items-center gap-4">
                    <Slider
                      value={[form.rate_limit_per_minute]}
                      onValueChange={([v]) => setForm(f => ({ ...f, rate_limit_per_minute: v }))}
                      min={1} max={60} step={1}
                      className="flex-1"
                    />
                    <span className="text-sm font-medium w-12 text-right">{form.rate_limit_per_minute}/min</span>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={form.simulate_typing} onCheckedChange={(v) => setForm(f => ({ ...f, simulate_typing: !!v }))} />
                    <span className="text-sm">Simular digitação</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={form.use_spintax} onCheckedChange={(v) => setForm(f => ({ ...f, use_spintax: !!v }))} />
                    <span className="text-sm">Usar Spintax</span>
                  </label>
                </div>
              </TabsContent>

              {/* Tab 2: Contacts */}
              <TabsContent value="contacts" className="space-y-4 mt-4">
                <div>
                  <Label>Importar CSV ou TXT</Label>
                  <p className="text-xs text-muted-foreground mb-2">Arquivo com números de telefone (um por linha ou separados por vírgula)</p>
                  <div className="flex gap-2">
                    <Button variant="outline" className="relative" asChild>
                      <label className="cursor-pointer">
                        <Upload className="h-4 w-4 mr-2" /> Importar Arquivo
                        <input type="file" accept=".csv,.txt" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleFileImport} />
                      </label>
                    </Button>
                    {contacts.length > 0 && (
                      <Button variant="ghost" size="sm" onClick={() => setContacts([])}>
                        <Trash2 className="h-4 w-4 mr-1" /> Limpar ({contacts.length})
                      </Button>
                    )}
                  </div>
                  {importProgress && (
                    <div className="mt-2 space-y-1">
                      <Progress value={importProgress.percent} className="h-2" />
                      <p className="text-xs text-muted-foreground">{importProgress.current} de {importProgress.total} processados ({importProgress.percent}%)</p>
                    </div>
                  )}
                </div>

                <div>
                  <Label>Adicionar manualmente</Label>
                  <Textarea
                    rows={4}
                    value={contactsInput}
                    onChange={e => setContactsInput(e.target.value)}
                    placeholder="5511999999999&#10;5511888888888&#10;ou separados por vírgula..."
                  />
                  <Button variant="outline" size="sm" className="mt-2" onClick={handleAddManualContacts} disabled={!contactsInput.trim()}>
                    <Plus className="h-4 w-4 mr-1" /> Adicionar
                  </Button>
                </div>

                {contacts.length > 0 && (
                  <div className="border rounded-md p-3 max-h-40 overflow-y-auto">
                    <p className="text-xs text-muted-foreground mb-2">{contacts.length} contatos na lista</p>
                    <div className="flex flex-wrap gap-1">
                      {contacts.slice(0, 50).map((c, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">{c}</Badge>
                      ))}
                      {contacts.length > 50 && <Badge variant="outline" className="text-xs">+{contacts.length - 50} mais</Badge>}
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* Tab 3: Message */}
              <TabsContent value="message" className="space-y-4 mt-4">
                <div>
                  <Label>Mensagem da Campanha</Label>
                  <p className="text-xs text-muted-foreground mb-2">
                    Use spintax para variar: {'{Olá|Oi|Hey}'} — Use {'{{nome}}'} para variáveis
                  </p>
                  <Textarea
                    rows={6}
                    value={form.message_template}
                    onChange={e => setForm(f => ({ ...f, message_template: e.target.value }))}
                    placeholder="{Olá|Oi|Hey} {{nome}}! Temos uma {promoção|oferta} especial para você..."
                  />
                </div>
                <Button
                  variant="outline" size="sm"
                  onClick={() => { setPreviewMsg(resolveSpintax(form.message_template)); setShowPreview(true); }}
                  disabled={!form.message_template}
                >
                  <FileText className="h-4 w-4 mr-1" /> Preview Spintax
                </Button>
                {showPreview && previewMsg && (
                  <Card>
                    <CardContent className="p-3">
                      <p className="text-xs text-muted-foreground mb-1">Exemplo de mensagem gerada:</p>
                      <p className="text-sm whitespace-pre-wrap bg-accent/30 rounded p-2">{previewMsg}</p>
                      <Button variant="ghost" size="sm" className="mt-2" onClick={() => { setPreviewMsg(resolveSpintax(form.message_template)); }}>
                        Gerar outra variação
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Tab 4: Risk monitor */}
              <TabsContent value="risk" className="space-y-4 mt-4">
                <Card>
                  <CardContent className="p-4 space-y-4">
                    <div className="flex items-center gap-3">
                      <Shield className={`h-8 w-8 ${risk.color}`} />
                      <div>
                        <p className="text-lg font-bold">Risco: <span className={risk.color}>{risk.level}</span></p>
                        <p className="text-xs text-muted-foreground">Análise baseada nas configurações atuais</p>
                      </div>
                    </div>
                    <Progress value={risk.percent} className="h-3" />

                    <div className="grid grid-cols-3 gap-3 text-center text-sm">
                      <div className="border rounded p-2">
                        <Users className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                        <p className="font-bold">{contacts.length}</p>
                        <p className="text-xs text-muted-foreground">Contatos</p>
                      </div>
                      <div className="border rounded p-2">
                        <Zap className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                        <p className="font-bold">{selectedInstances.length}</p>
                        <p className="text-xs text-muted-foreground">Instâncias</p>
                      </div>
                      <div className="border rounded p-2">
                        <Clock className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                        <p className="font-bold">{form.delay_min}-{form.delay_max}s</p>
                        <p className="text-xs text-muted-foreground">Delay</p>
                      </div>
                    </div>

                    {risk.tips.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">Recomendações:</p>
                        {risk.tips.map((tip, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs">
                            <AlertTriangle className="h-3 w-3 mt-0.5 text-yellow-500 shrink-0" />
                            <span>{tip}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {contacts.length > 0 && selectedInstances.length > 0 && (
                      <div className="border-t pt-3 text-xs text-muted-foreground space-y-1">
                        <p>⏱ Tempo estimado: ~{Math.ceil(contacts.length / Math.max(form.rate_limit_per_minute, 1))} minutos</p>
                        <p>📊 ~{Math.ceil(form.rate_limit_per_minute / Math.max(selectedInstances.length, 1))} msgs/min por instância</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            <Button
              onClick={() => createMutation.mutate()}
              disabled={!form.name || !form.message_template || contacts.length === 0 || selectedInstances.length === 0 || createMutation.isPending}
              className="w-full mt-4"
            >
              <Send className="h-4 w-4 mr-2" /> Criar Campanha
            </Button>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4 text-center"><Send className="h-5 w-5 mx-auto mb-1 text-primary" /><p className="text-2xl font-bold">{totalStats.sent}</p><p className="text-xs text-muted-foreground">Enviados</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><MessageCircle className="h-5 w-5 mx-auto mb-1 text-green-500" /><p className="text-2xl font-bold">{totalStats.delivered}</p><p className="text-xs text-muted-foreground">Entregues</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><Users className="h-5 w-5 mx-auto mb-1 text-accent-foreground" /><p className="text-2xl font-bold">{totalStats.read}</p><p className="text-xs text-muted-foreground">Lidos</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><AlertTriangle className="h-5 w-5 mx-auto mb-1 text-destructive" /><p className="text-2xl font-bold">{totalStats.failed}</p><p className="text-xs text-muted-foreground">Falhas</p></CardContent></Card>
      </div>

      {/* Table */}
      <DataTable
        data={campaigns}
        columns={columns}
        searchKey="name"
        searchPlaceholder="Buscar campanha..."
        loading={isLoading}
        emptyMessage="Nenhuma campanha criada"
        actions={(row) => (
          <ConfirmDialog title="Excluir campanha?" description="Esta ação é irreversível." onConfirm={() => deleteMutation.mutate(row.id)} trigger={<Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>} />
        )}
      />
    </div>
  );
}

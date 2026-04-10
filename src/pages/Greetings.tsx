import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/contexts/CompanyContext';
import { DataTable, Column } from '@/components/DataTable';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';
import {
  Plus, Trash2, Edit, Send, MoreHorizontal, Loader2,
  MessageCircle, Clock, Image, Eye, AlertTriangle,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// Extra config stored in the `schedule` jsonb column until types regenerate
interface GreetingConfig {
  instance_id?: string | null;
  delay_min?: number;
  delay_max?: number;
  media_url?: string | null;
  cooldown_minutes?: number;
}

interface Greeting {
  id: string;
  name: string;
  message_template: string;
  tags: string[];
  is_active: boolean;
  schedule: GreetingConfig | null;
  created_at: string;
}

interface InstanceOption {
  id: string;
  name: string;
}

const VARIABLES = [
  { key: '[wa_name]', desc: 'Nome do contato no WhatsApp' },
  { key: '[saudacao]', desc: 'Bom dia / Boa tarde / Boa noite (automático)' },
];

function resolveSpintax(text: string): string {
  return text.replace(/\{([^}]+)\}/g, (_, options) => {
    const parts = options.split('|');
    return parts[Math.floor(Math.random() * parts.length)];
  });
}

function resolveVariables(text: string): string {
  const hour = new Date().getHours();
  const saudacao = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  return text.replace(/\[wa_name\]/g, 'João').replace(/\[saudacao\]/g, saudacao);
}

export default function Greetings() {
  const { company, hasPermission, isReadOnly } = useAuth();
  const { isSuspended } = useCompany();
  const [items, setItems] = useState<Greeting[]>([]);
  const [instances, setInstances] = useState<InstanceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [selected, setSelected] = useState<Greeting | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Form
  const [name, setName] = useState('');
  const [template, setTemplate] = useState('');
  const [tags, setTags] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [instanceId, setInstanceId] = useState('');
  const [delayMin, setDelayMin] = useState(1);
  const [delayMax, setDelayMax] = useState(5);
  const [mediaUrl, setMediaUrl] = useState('');
  const [cooldownMinutes, setCooldownMinutes] = useState(60);
  const [previewText, setPreviewText] = useState('');

  const fetchData = async () => {
    if (!company) return;
    setLoading(true);
    const [{ data: greetings }, { data: inst }] = await Promise.all([
      supabase.from('greetings').select('*').eq('company_id', company.id).order('created_at', { ascending: false }),
      supabase.from('instances').select('id, name').eq('company_id', company.id).order('name'),
    ]);
    setItems((greetings as unknown as Greeting[]) || []);
    setInstances((inst as InstanceOption[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [company]);

  const resetForm = () => {
    setName(''); setTemplate(''); setTags(''); setIsActive(true);
    setInstanceId(''); setDelayMin(1); setDelayMax(5);
    setMediaUrl(''); setCooldownMinutes(60);
  };

  const openEdit = (item: Greeting) => {
    setSelected(item);
    setName(item.name);
    setTemplate(item.message_template);
    setTags(item.tags?.join(', ') || '');
    setIsActive(item.is_active);
    const cfg = (item.schedule || {}) as GreetingConfig;
    setInstanceId(cfg.instance_id || '');
    setDelayMin(cfg.delay_min ?? 1);
    setDelayMax(cfg.delay_max ?? 5);
    setMediaUrl(cfg.media_url || '');
    setCooldownMinutes(cfg.cooldown_minutes ?? 60);
    setShowForm(true);
  };

  const openNew = () => { setSelected(null); resetForm(); setShowForm(true); };

  const handleSave = async () => {
    if (!company || !name.trim() || !template.trim()) return;
    setSaving(true);
    try {
      const config: GreetingConfig = {
        instance_id: instanceId || null,
        delay_min: delayMin,
        delay_max: delayMax,
        media_url: mediaUrl.trim() || null,
        cooldown_minutes: cooldownMinutes,
      };
      const payload = {
        company_id: company.id,
        name: name.trim(),
        message_template: template,
        tags: tags ? tags.split(',').map(t => t.trim()) : [],
        is_active: isActive,
        schedule: config as any,
      };
      if (selected) {
        const { error } = await supabase.from('greetings').update(payload).eq('id', selected.id);
        if (error) throw error;
        toast.success('Saudação atualizada!');
      } else {
        const { error } = await supabase.from('greetings').insert(payload);
        if (error) throw error;
        toast.success('Saudação criada!');
      }
      setShowForm(false);
      resetForm();
      fetchData();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('greetings').delete().eq('id', selected.id);
      if (error) throw error;
      toast.success('Saudação excluída');
      setShowDelete(false); setSelected(null);
      fetchData();
    } catch (e: any) { toast.error(e.message); } finally { setDeleting(false); }
  };

  const handlePreview = (msg: string) => {
    setPreviewText(resolveVariables(resolveSpintax(msg)));
    setShowPreview(true);
  };

  const getInstanceName = (cfg: GreetingConfig | null) => {
    const id = cfg?.instance_id;
    if (!id) return 'Todas';
    return instances.find(i => i.id === id)?.name || '—';
  };

  const columns: Column<Greeting>[] = [
    { key: 'name', label: 'Nome', sortable: true },
    {
      key: 'schedule', label: 'Instância', render: (r) =>
        <Badge variant="outline" className="text-xs">{getInstanceName(r.schedule as GreetingConfig)}</Badge>
    },
    {
      key: 'message_template', label: 'Mensagem', render: (r) =>
        <span className="truncate max-w-[220px] block text-sm text-muted-foreground">{r.message_template}</span>
    },
    {
      key: 'is_active', label: 'Ativo', render: (r) =>
        <Badge variant={r.is_active ? 'success' : 'secondary'}>{r.is_active ? 'Ativo' : 'Inativo'}</Badge>
    },
  ];

  const activeCount = items.filter(i => i.is_active).length;

  return (
    <div className="space-y-6">
      {isSuspended && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Conta suspensa</AlertTitle>
          <AlertDescription>Sua conta está suspensa. Não é possível criar ou editar saudações.</AlertDescription>
        </Alert>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Saudações Automáticas</h1>
          <p className="text-muted-foreground">
            Mensagens automáticas de boas-vindas com variáveis e spintax
          </p>
        </div>
        {hasPermission('greetings', 'create') && !isReadOnly && !isSuspended && (
          <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nova saudação</Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="group">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de regras</CardTitle>
            <div className="rounded-md p-1.5 bg-primary/10"><MessageCircle className="h-4 w-4 text-primary" /></div>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold tracking-tight">{items.length}</div></CardContent>
        </Card>
        <Card className="group">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ativas</CardTitle>
            <div className="rounded-md p-1.5 bg-success/10"><MessageCircle className="h-4 w-4 text-success" /></div>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold tracking-tight text-primary">{activeCount}</div></CardContent>
        </Card>
        <Card className="group">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Instâncias cobertas</CardTitle>
            <div className="rounded-md p-1.5 bg-accent/10"><MessageCircle className="h-4 w-4 text-accent" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">
              {new Set(items.map(i => (i.schedule as GreetingConfig)?.instance_id).filter(Boolean)).size}/{instances.length}
            </div>
          </CardContent>
        </Card>
      </div>

      <DataTable
        data={items} columns={columns} searchKey="name"
        searchPlaceholder="Buscar saudação..." loading={loading}
        emptyMessage="Nenhuma saudação configurada."
        actions={(row) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => openEdit(row)}><Edit className="mr-2 h-4 w-4" /> Editar</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handlePreview(row.message_template)}><Eye className="mr-2 h-4 w-4" /> Pré-visualizar</DropdownMenuItem>
              <DropdownMenuItem onClick={() => toast.info('Teste será conectado à Evolution API')}><Send className="mr-2 h-4 w-4" /> Testar</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={() => { setSelected(row); setShowDelete(true); }}>
                <Trash2 className="mr-2 h-4 w-4" /> Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      />

      {/* Form Dialog */}
      <Dialog open={showForm} onOpenChange={(o) => { setShowForm(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selected ? 'Editar' : 'Nova'} saudação</DialogTitle>
            <DialogDescription>Configure a mensagem automática de boas-vindas</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome da regra *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Boas-vindas VIP" />
            </div>

            <div className="space-y-2">
              <Label>Instância</Label>
              <Select value={instanceId || 'all'} onValueChange={v => setInstanceId(v === 'all' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Todas as instâncias" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as instâncias</SelectItem>
                  {instances.map(inst => (
                    <SelectItem key={inst.id} value={inst.id}>{inst.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Mensagem de saudação *</Label>
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => handlePreview(template)}>
                  <Eye className="h-3 w-3 mr-1" /> Pré-visualizar
                </Button>
              </div>
              <Textarea
                value={template} onChange={e => setTemplate(e.target.value)}
                placeholder="{Oi|Olá} [wa_name], [saudacao]! Como posso ajudar?"
                rows={4} className="font-mono text-sm"
              />
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Variáveis disponíveis:</p>
                <div className="flex flex-wrap gap-1.5">
                  {VARIABLES.map(v => (
                    <Tooltip key={v.key}>
                      <TooltipTrigger asChild>
                        <Badge variant="outline" className="text-xs cursor-pointer hover:bg-primary/10 hover:text-primary hover:border-primary/40 transition-colors"
                          onClick={() => setTemplate(prev => prev + v.key)}>
                          {v.key}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>{v.desc}</TooltipContent>
                    </Tooltip>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  <strong>Spintax:</strong> Use {'{Oi|Olá|E aí}'} para variações aleatórias
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><Image className="h-3.5 w-3.5" /> Imagem (opcional)</Label>
              <Input value={mediaUrl} onChange={e => setMediaUrl(e.target.value)} placeholder="https://exemplo.com/imagem.jpg" />
            </div>

            <Separator />

            <div className="space-y-3">
              <Label className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Delay de envio (segundos)</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Mínimo</Label>
                  <Input type="number" min={0} value={delayMin} onChange={e => setDelayMin(Number(e.target.value))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Máximo</Label>
                  <Input type="number" min={0} value={delayMax} onChange={e => setDelayMax(Number(e.target.value))} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Delay aleatório entre {delayMin}s e {delayMax}s</p>
            </div>

            <div className="space-y-2">
              <Label>Tempo mínimo entre reenvios (minutos)</Label>
              <Input type="number" min={0} value={cooldownMinutes} onChange={e => setCooldownMinutes(Number(e.target.value))} />
              <p className="text-xs text-muted-foreground">Evita reenvio ao mesmo contato dentro de {cooldownMinutes} min</p>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Tags (separadas por vírgula)</Label>
              <Input value={tags} onChange={e => setTags(e.target.value)} placeholder="vip, novo, retorno" />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <Label>Regra ativa</Label>
            </div>

            <Button onClick={handleSave} disabled={saving || !name.trim() || !template.trim()} className="w-full">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar saudação
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Pré-visualização</DialogTitle>
            <DialogDescription>Exemplo de como a mensagem será enviada</DialogDescription>
          </DialogHeader>
          <div className="bg-muted rounded-lg p-4">
            <div className="bg-primary/10 rounded-lg rounded-tl-none p-3 text-sm">{previewText}</div>
            <p className="text-xs text-muted-foreground mt-2 text-right">Variáveis e spintax resolvidos</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => handlePreview(template || selected?.message_template || '')}>
            Gerar outra variação
          </Button>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={showDelete} onOpenChange={setShowDelete} title="Excluir saudação"
        description={`Excluir "${selected?.name}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir" variant="destructive" onConfirm={handleDelete} loading={deleting} />
    </div>
  );
}

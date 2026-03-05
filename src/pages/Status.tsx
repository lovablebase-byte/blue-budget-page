import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
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
import { toast } from 'sonner';
import {
  Plus, Trash2, Edit, MoreHorizontal, Loader2, Radio,
  Clock, Image, Smartphone, Calendar,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface DayConfig {
  enabled: boolean;
  time: string;
  image_url: string;
}

interface StatusSchedule {
  instance_id?: string | null;
  default_image_url?: string | null;
  days: Record<string, DayConfig>;
}

interface StatusTemplate {
  id: string;
  name: string;
  status_type: string;
  message: string;
  auto_send: boolean;
  created_at: string;
}

interface InstanceOption {
  id: string;
  name: string;
}

const WEEKDAY_KEYS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'] as const;
const WEEKDAY_LABELS: Record<string, string> = {
  seg: 'Segunda', ter: 'Terça', qua: 'Quarta', qui: 'Quinta',
  sex: 'Sexta', sab: 'Sábado', dom: 'Domingo',
};

const defaultDays = (): Record<string, DayConfig> =>
  Object.fromEntries(WEEKDAY_KEYS.map(k => [k, {
    enabled: ['seg', 'ter', 'qua', 'qui', 'sex'].includes(k),
    time: '08:00',
    image_url: '',
  }]));

export default function StatusPage() {
  const { company, hasPermission, isReadOnly } = useAuth();
  const [items, setItems] = useState<StatusTemplate[]>([]);
  const [instances, setInstances] = useState<InstanceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [selected, setSelected] = useState<StatusTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Form
  const [name, setName] = useState('');
  const [caption, setCaption] = useState('');
  const [instanceId, setInstanceId] = useState('');
  const [defaultImageUrl, setDefaultImageUrl] = useState('');
  const [autoSend, setAutoSend] = useState(true);
  const [dayConfigs, setDayConfigs] = useState<Record<string, DayConfig>>(defaultDays());

  const fetchData = async () => {
    if (!company) return;
    setLoading(true);
    const [{ data: templates }, { data: inst }] = await Promise.all([
      supabase.from('status_templates').select('*').eq('company_id', company.id).order('created_at', { ascending: false }),
      supabase.from('instances').select('id, name').eq('company_id', company.id).order('name'),
    ]);
    setItems((templates as StatusTemplate[]) || []);
    setInstances((inst as InstanceOption[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [company]);

  const resetForm = () => {
    setName(''); setCaption(''); setInstanceId(''); setDefaultImageUrl('');
    setAutoSend(true); setDayConfigs(defaultDays());
  };

  const getSchedule = (item: StatusTemplate): StatusSchedule | null => {
    // schedule config is stored encoded in `message` as JSON prefix or we parse from status_type=schedule
    // For simplicity, we store extra config in a JSON block at end of message
    try {
      if (item.status_type === 'schedule') {
        return JSON.parse(item.message);
      }
    } catch {}
    return null;
  };

  const openEdit = (item: StatusTemplate) => {
    setSelected(item);
    setName(item.name);
    setAutoSend(item.auto_send);

    const sched = getSchedule(item);
    if (sched) {
      setCaption(item.name); // caption stored as name for schedule type
      setInstanceId(sched.instance_id || '');
      setDefaultImageUrl(sched.default_image_url || '');
      setDayConfigs(sched.days || defaultDays());
    } else {
      setCaption(item.message);
      setInstanceId('');
      setDefaultImageUrl('');
      setDayConfigs(defaultDays());
    }
    setShowForm(true);
  };

  const openNew = () => { setSelected(null); resetForm(); setShowForm(true); };

  const updateDay = (key: string, field: keyof DayConfig, value: any) => {
    setDayConfigs(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  };

  const handleSave = async () => {
    if (!company || !name.trim() || !caption.trim()) return;
    setSaving(true);
    try {
      const schedule: StatusSchedule = {
        instance_id: instanceId || null,
        default_image_url: defaultImageUrl.trim() || null,
        days: dayConfigs,
      };
      const payload = {
        company_id: company.id,
        name: name.trim(),
        status_type: 'schedule',
        message: JSON.stringify(schedule),
        auto_send: autoSend,
      };
      if (selected) {
        const { error } = await supabase.from('status_templates').update(payload).eq('id', selected.id);
        if (error) throw error;
        toast.success('Agendamento atualizado!');
      } else {
        const { error } = await supabase.from('status_templates').insert(payload);
        if (error) throw error;
        toast.success('Agendamento criado!');
      }
      setShowForm(false);
      resetForm();
      fetchData();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!selected) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('status_templates').delete().eq('id', selected.id);
      if (error) throw error;
      toast.success('Agendamento excluído');
      setShowDelete(false); setSelected(null); fetchData();
    } catch (e: any) { toast.error(e.message); } finally { setDeleting(false); }
  };

  const getInstanceName = (item: StatusTemplate) => {
    const sched = getSchedule(item);
    if (!sched?.instance_id) return 'Todas';
    return instances.find(i => i.id === sched.instance_id)?.name || '—';
  };

  const getActiveDays = (item: StatusTemplate) => {
    const sched = getSchedule(item);
    if (!sched?.days) return '—';
    return WEEKDAY_KEYS
      .filter(k => sched.days[k]?.enabled)
      .map(k => WEEKDAY_LABELS[k]?.slice(0, 3))
      .join(', ') || 'Nenhum';
  };

  const columns: Column<StatusTemplate>[] = [
    { key: 'name', label: 'Nome', sortable: true },
    {
      key: 'status_type', label: 'Instância', render: (r) =>
        <Badge variant="outline" className="text-xs">{getInstanceName(r)}</Badge>
    },
    {
      key: 'message', label: 'Dias ativos', render: (r) =>
        <span className="text-xs text-muted-foreground">{getActiveDays(r)}</span>
    },
    {
      key: 'auto_send', label: 'Auto', render: (r) =>
        <Badge variant={r.auto_send ? 'default' : 'secondary'}>{r.auto_send ? 'Sim' : 'Não'}</Badge>
    },
  ];

  const activeCount = items.filter(i => i.auto_send).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Status do WhatsApp</h1>
          <p className="text-muted-foreground">Agendamento automático de status com imagem por dia da semana</p>
        </div>
        {hasPermission('status', 'create') && !isReadOnly && (
          <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Novo agendamento</Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{items.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Automáticos</CardTitle>
            <Radio className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-primary">{activeCount}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Instâncias</CardTitle>
            <Smartphone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(items.map(i => getSchedule(i)?.instance_id).filter(Boolean)).size}/{instances.length}
            </div>
          </CardContent>
        </Card>
      </div>

      <DataTable
        data={items} columns={columns} searchKey="name"
        searchPlaceholder="Buscar agendamento..." loading={loading}
        emptyMessage="Nenhum agendamento de status configurado."
        actions={(row) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => openEdit(row)}><Edit className="mr-2 h-4 w-4" /> Editar</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={() => { setSelected(row); setShowDelete(true); }}>
                <Trash2 className="mr-2 h-4 w-4" /> Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      />

      {/* Form */}
      <Dialog open={showForm} onOpenChange={(o) => { setShowForm(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selected ? 'Editar' : 'Novo'} agendamento de status</DialogTitle>
            <DialogDescription>Configure a postagem automática de status do WhatsApp</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome do agendamento *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Status diário - Promoção" />
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
              <Label>Legenda do status *</Label>
              <Textarea
                value={caption} onChange={e => setCaption(e.target.value)} rows={3}
                placeholder="🔥 Confira nossas ofertas do dia! Visite nosso site."
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><Image className="h-3.5 w-3.5" /> Imagem padrão</Label>
              <Input
                value={defaultImageUrl} onChange={e => setDefaultImageUrl(e.target.value)}
                placeholder="https://exemplo.com/status-padrao.jpg"
              />
              <p className="text-xs text-muted-foreground">
                Usada nos dias sem imagem específica configurada
              </p>
            </div>

            <Separator />

            {/* Schedule per day */}
            <div className="space-y-3">
              <Label className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" /> Cronograma por dia da semana
              </Label>
              <div className="space-y-2">
                {WEEKDAY_KEYS.map(key => {
                  const day = dayConfigs[key];
                  return (
                    <div key={key} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-center gap-3">
                        <Switch
                          checked={day?.enabled ?? false}
                          onCheckedChange={v => updateDay(key, 'enabled', v)}
                        />
                        <span className="w-20 text-sm font-medium">{WEEKDAY_LABELS[key]}</span>
                        {day?.enabled && (
                          <div className="flex items-center gap-2 flex-1">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                              type="time" value={day.time}
                              onChange={e => updateDay(key, 'time', e.target.value)}
                              className="w-28 h-8 text-sm"
                            />
                          </div>
                        )}
                      </div>
                      {day?.enabled && (
                        <div className="pl-14">
                          <Input
                            value={day.image_url}
                            onChange={e => updateDay(key, 'image_url', e.target.value)}
                            placeholder="URL da imagem específica (opcional)"
                            className="text-xs h-8"
                          />
                          {!day.image_url && defaultImageUrl && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Usará imagem padrão
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <Separator />

            <div className="flex items-center gap-2">
              <Switch checked={autoSend} onCheckedChange={setAutoSend} />
              <Label>Executar automaticamente</Label>
            </div>

            <Button onClick={handleSave} disabled={saving || !name.trim() || !caption.trim()} className="w-full">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar agendamento
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={showDelete} onOpenChange={setShowDelete} title="Excluir agendamento"
        description={`Excluir "${selected?.name}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir" variant="destructive" onConfirm={handleDelete} loading={deleting} />
    </div>
  );
}

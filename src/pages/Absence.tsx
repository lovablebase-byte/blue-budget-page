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
  Plus, Trash2, Edit, MoreHorizontal, Loader2, Clock,
  Image, MessageCircle, Smartphone, Eye,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface DaySchedule {
  enabled: boolean;
  start: string;
  end: string;
}

interface AbsenceSchedule {
  instance_id?: string | null;
  media_url?: string | null;
  cooldown_minutes?: number;
  days: Record<string, DaySchedule>;
}

interface AbsenceRule {
  id: string;
  name: string;
  message: string;
  schedule: AbsenceSchedule;
  only_first_message: boolean;
  is_active: boolean;
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

const defaultDays = (): Record<string, DaySchedule> =>
  Object.fromEntries(WEEKDAY_KEYS.map(k => [k, {
    enabled: ['seg', 'ter', 'qua', 'qui', 'sex'].includes(k),
    start: '08:00',
    end: '18:00',
  }]));

export default function Absence() {
  const { company, hasPermission, isReadOnly } = useAuth();
  const [items, setItems] = useState<AbsenceRule[]>([]);
  const [instances, setInstances] = useState<InstanceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [selected, setSelected] = useState<AbsenceRule | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Form
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [instanceId, setInstanceId] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [cooldownMinutes, setCooldownMinutes] = useState(60);
  const [onlyFirst, setOnlyFirst] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [daySchedules, setDaySchedules] = useState<Record<string, DaySchedule>>(defaultDays());

  const fetchData = async () => {
    if (!company) return;
    setLoading(true);
    const [{ data: rules }, { data: inst }] = await Promise.all([
      supabase.from('absence_rules').select('*').eq('company_id', company.id).order('created_at', { ascending: false }),
      supabase.from('instances').select('id, name').eq('company_id', company.id).order('name'),
    ]);
    setItems((rules as unknown as AbsenceRule[]) || []);
    setInstances((inst as InstanceOption[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [company]);

  const resetForm = () => {
    setName(''); setMessage(''); setInstanceId(''); setMediaUrl('');
    setCooldownMinutes(60); setOnlyFirst(true); setIsActive(true);
    setDaySchedules(defaultDays());
  };

  const openEdit = (item: AbsenceRule) => {
    setSelected(item);
    setName(item.name);
    setMessage(item.message);
    const sched = item.schedule || {} as AbsenceSchedule;
    setInstanceId(sched.instance_id || '');
    setMediaUrl(sched.media_url || '');
    setCooldownMinutes(sched.cooldown_minutes ?? 60);
    setDaySchedules(sched.days || defaultDays());
    setOnlyFirst(item.only_first_message);
    setIsActive(item.is_active);
    setShowForm(true);
  };

  const openNew = () => { setSelected(null); resetForm(); setShowForm(true); };

  const updateDay = (key: string, field: keyof DaySchedule, value: any) => {
    setDaySchedules(prev => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  };

  const handleSave = async () => {
    if (!company || !name.trim() || !message.trim()) return;
    setSaving(true);
    try {
      const schedule: AbsenceSchedule = {
        instance_id: instanceId || null,
        media_url: mediaUrl.trim() || null,
        cooldown_minutes: cooldownMinutes,
        days: daySchedules,
      };
      const payload = {
        company_id: company.id,
        name: name.trim(),
        message,
        schedule: schedule as any,
        only_first_message: onlyFirst,
        is_active: isActive,
      };
      if (selected) {
        const { error } = await supabase.from('absence_rules').update(payload).eq('id', selected.id);
        if (error) throw error;
        toast.success('Regra atualizada!');
      } else {
        const { error } = await supabase.from('absence_rules').insert(payload);
        if (error) throw error;
        toast.success('Regra criada!');
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
      const { error } = await supabase.from('absence_rules').delete().eq('id', selected.id);
      if (error) throw error;
      toast.success('Regra excluída');
      setShowDelete(false); setSelected(null); fetchData();
    } catch (e: any) { toast.error(e.message); } finally { setDeleting(false); }
  };

  const getInstanceName = (sched: AbsenceSchedule | null) => {
    const id = sched?.instance_id;
    if (!id) return 'Todas';
    return instances.find(i => i.id === id)?.name || '—';
  };

  const getActiveDays = (sched: AbsenceSchedule | null) => {
    if (!sched?.days) return '—';
    return WEEKDAY_KEYS
      .filter(k => sched.days[k]?.enabled)
      .map(k => WEEKDAY_LABELS[k]?.slice(0, 3))
      .join(', ') || 'Nenhum';
  };

  const columns: Column<AbsenceRule>[] = [
    { key: 'name', label: 'Nome', sortable: true },
    {
      key: 'schedule', label: 'Instância', render: (r) =>
        <Badge variant="outline" className="text-xs">{getInstanceName(r.schedule)}</Badge>
    },
    {
      key: 'message', label: 'Mensagem', render: (r) =>
        <span className="truncate max-w-[180px] block text-sm text-muted-foreground">{r.message}</span>
    },
    {
      key: 'only_first_message', label: 'Dias', render: (r) =>
        <span className="text-xs text-muted-foreground">{getActiveDays(r.schedule)}</span>
    },
    {
      key: 'is_active', label: 'Ativo', render: (r) =>
        <Badge variant={r.is_active ? 'default' : 'secondary'}>{r.is_active ? 'Sim' : 'Não'}</Badge>
    },
  ];

  const activeCount = items.filter(i => i.is_active).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Ausência Automática</h1>
          <p className="text-muted-foreground">Respostas automáticas fora do horário de atendimento</p>
        </div>
        {hasPermission('absence', 'create') && !isReadOnly && (
          <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nova regra</Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total de regras</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{items.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Ativas</CardTitle>
            <Clock className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-primary">{activeCount}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Instâncias cobertas</CardTitle>
            <Smartphone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(items.map(i => i.schedule?.instance_id).filter(Boolean)).size}/{instances.length}
            </div>
          </CardContent>
        </Card>
      </div>

      <DataTable
        data={items} columns={columns} searchKey="name"
        searchPlaceholder="Buscar regra..." loading={loading}
        emptyMessage="Nenhuma regra de ausência configurada."
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
            <DialogTitle>{selected ? 'Editar' : 'Nova'} regra de ausência</DialogTitle>
            <DialogDescription>Configure resposta automática fora do horário</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome da regra *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Fora do expediente" />
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
              <Label>Mensagem de ausência *</Label>
              <Textarea
                value={message} onChange={e => setMessage(e.target.value)} rows={4}
                placeholder="Obrigado por entrar em contato! Nosso horário de atendimento é de segunda a sexta, das 08h às 18h. Retornaremos assim que possível!"
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><Image className="h-3.5 w-3.5" /> Mídia (opcional)</Label>
              <Input value={mediaUrl} onChange={e => setMediaUrl(e.target.value)} placeholder="https://exemplo.com/imagem.jpg" />
              <p className="text-xs text-muted-foreground">URL pública de imagem/vídeo para enviar junto</p>
            </div>

            <Separator />

            {/* Schedule per day */}
            <div className="space-y-3">
              <Label className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> Horário de atendimento por dia
              </Label>
              <p className="text-xs text-muted-foreground">
                Fora destes horários, a mensagem de ausência será enviada automaticamente
              </p>
              <div className="space-y-2">
                {WEEKDAY_KEYS.map(key => {
                  const day = daySchedules[key];
                  return (
                    <div key={key} className="flex items-center gap-3 rounded-lg border p-2.5">
                      <Switch
                        checked={day?.enabled ?? false}
                        onCheckedChange={v => updateDay(key, 'enabled', v)}
                      />
                      <span className="w-20 text-sm font-medium">{WEEKDAY_LABELS[key]}</span>
                      {day?.enabled ? (
                        <div className="flex items-center gap-2 flex-1">
                          <Input
                            type="time" value={day.start}
                            onChange={e => updateDay(key, 'start', e.target.value)}
                            className="w-28 h-8 text-sm"
                          />
                          <span className="text-xs text-muted-foreground">até</span>
                          <Input
                            type="time" value={day.end}
                            onChange={e => updateDay(key, 'end', e.target.value)}
                            className="w-28 h-8 text-sm"
                          />
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground flex-1">Ausência o dia todo</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* Anti-spam */}
            <div className="space-y-2">
              <Label>Intervalo mínimo entre reenvios (minutos)</Label>
              <Input
                type="number" min={0} value={cooldownMinutes}
                onChange={e => setCooldownMinutes(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                Evita enviar mensagem repetida ao mesmo contato dentro de {cooldownMinutes} min
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={onlyFirst} onCheckedChange={setOnlyFirst} />
              <Label>Enviar apenas na primeira mensagem do contato</Label>
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <Label>Regra ativa</Label>
            </div>

            <Button onClick={handleSave} disabled={saving || !name.trim() || !message.trim()} className="w-full">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar regra
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={showDelete} onOpenChange={setShowDelete} title="Excluir regra"
        description={`Excluir "${selected?.name}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir" variant="destructive" onConfirm={handleDelete} loading={deleting} />
    </div>
  );
}

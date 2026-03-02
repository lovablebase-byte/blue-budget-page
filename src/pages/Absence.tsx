import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { DataTable, Column } from '@/components/DataTable';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Plus, Trash2, Edit, MoreHorizontal, Loader2, Clock } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

interface AbsenceRule {
  id: string;
  name: string;
  message: string;
  schedule: any;
  only_first_message: boolean;
  is_active: boolean;
  created_at: string;
}

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

export default function Absence() {
  const { company, hasPermission, isReadOnly } = useAuth();
  const [items, setItems] = useState<AbsenceRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [selected, setSelected] = useState<AbsenceRule | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [startTime, setStartTime] = useState('18:00');
  const [endTime, setEndTime] = useState('08:00');
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [onlyFirst, setOnlyFirst] = useState(false);
  const [isActive, setIsActive] = useState(true);

  const fetchData = async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase.from('absence_rules').select('*').eq('company_id', company.id).order('created_at', { ascending: false });
    setItems((data as AbsenceRule[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [company]);

  const openEdit = (item: AbsenceRule) => {
    setSelected(item);
    setName(item.name);
    setMessage(item.message);
    setStartTime(item.schedule?.start || '18:00');
    setEndTime(item.schedule?.end || '08:00');
    setDays(item.schedule?.days || [0, 1, 2, 3, 4]);
    setOnlyFirst(item.only_first_message);
    setIsActive(item.is_active);
    setShowForm(true);
  };

  const openNew = () => {
    setSelected(null);
    setName(''); setMessage(''); setStartTime('18:00'); setEndTime('08:00');
    setDays([0, 1, 2, 3, 4]); setOnlyFirst(false); setIsActive(true);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!company || !name.trim() || !message.trim()) return;
    setSaving(true);
    try {
      const payload = {
        company_id: company.id,
        name: name.trim(),
        message,
        schedule: { start: startTime, end: endTime, days },
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

  const toggleDay = (day: number) => {
    setDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  const columns: Column<AbsenceRule>[] = [
    { key: 'name', label: 'Nome', sortable: true },
    { key: 'message', label: 'Resposta', render: (r) => <span className="truncate max-w-[200px] block">{r.message}</span> },
    {
      key: 'schedule', label: 'Horário', render: (r) => (
        <span className="text-sm">{r.schedule?.start || '—'} → {r.schedule?.end || '—'}</span>
      )
    },
    { key: 'only_first_message', label: '1ª msg', render: (r) => r.only_first_message ? 'Sim' : 'Não' },
    { key: 'is_active', label: 'Ativo', render: (r) => <Badge variant={r.is_active ? 'default' : 'secondary'}>{r.is_active ? 'Sim' : 'Não'}</Badge> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Ausência</h1>
          <p className="text-muted-foreground">Respostas automáticas fora do horário de atendimento</p>
        </div>
        {hasPermission('absence', 'create') && !isReadOnly && (
          <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nova regra</Button>
        )}
      </div>

      <DataTable data={items} columns={columns} searchKey="name" searchPlaceholder="Buscar regra..." loading={loading} emptyMessage="Nenhuma regra de ausência."
        actions={(row) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => openEdit(row)}><Edit className="mr-2 h-4 w-4" /> Editar</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={() => { setSelected(row); setShowDelete(true); }}><Trash2 className="mr-2 h-4 w-4" /> Excluir</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      />

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selected ? 'Editar' : 'Nova'} regra de ausência</DialogTitle>
            <DialogDescription>Defina quando e como responder automaticamente</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Nome *</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Fora do expediente" /></div>
            <div className="space-y-2"><Label>Mensagem de resposta *</Label><Textarea value={message} onChange={e => setMessage(e.target.value)} rows={3} placeholder="Obrigado por entrar em contato! Estamos fora do horário de atendimento." /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Início ausência</Label><Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} /></div>
              <div className="space-y-2"><Label>Fim ausência</Label><Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} /></div>
            </div>
            <div className="space-y-2">
              <Label>Dias da semana</Label>
              <div className="flex gap-2 flex-wrap">
                {WEEKDAYS.map((label, i) => (
                  <Button key={i} type="button" size="sm" variant={days.includes(i) ? 'default' : 'outline'} onClick={() => toggleDay(i)}>{label}</Button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2"><Switch checked={onlyFirst} onCheckedChange={setOnlyFirst} /><Label>Somente primeira mensagem do dia</Label></div>
            <div className="flex items-center gap-2"><Switch checked={isActive} onCheckedChange={setIsActive} /><Label>Ativo</Label></div>
            <Button onClick={handleSave} disabled={saving || !name.trim() || !message.trim()} className="w-full">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={showDelete} onOpenChange={setShowDelete} title="Excluir regra" description={`Excluir "${selected?.name}"?`} confirmLabel="Excluir" variant="destructive" onConfirm={handleDelete} loading={deleting} />
    </div>
  );
}

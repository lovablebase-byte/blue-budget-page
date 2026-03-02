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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Trash2, Edit, MoreHorizontal, Loader2, Radio } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

interface StatusTemplate {
  id: string;
  name: string;
  status_type: string;
  message: string;
  auto_send: boolean;
  created_at: string;
}

const STATUS_TYPES = [
  { value: 'attending', label: 'Em atendimento' },
  { value: 'waiting', label: 'Aguardando' },
  { value: 'finished', label: 'Finalizado' },
  { value: 'custom', label: 'Personalizado' },
];

export default function StatusPage() {
  const { company, hasPermission, isReadOnly } = useAuth();
  const [items, setItems] = useState<StatusTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [selected, setSelected] = useState<StatusTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [name, setName] = useState('');
  const [statusType, setStatusType] = useState('attending');
  const [message, setMessage] = useState('');
  const [autoSend, setAutoSend] = useState(false);

  const fetchData = async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase.from('status_templates').select('*').eq('company_id', company.id).order('created_at', { ascending: false });
    setItems((data as StatusTemplate[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [company]);

  const openEdit = (item: StatusTemplate) => {
    setSelected(item);
    setName(item.name);
    setStatusType(item.status_type);
    setMessage(item.message);
    setAutoSend(item.auto_send);
    setShowForm(true);
  };

  const openNew = () => {
    setSelected(null);
    setName(''); setStatusType('attending'); setMessage(''); setAutoSend(false);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!company || !name.trim() || !message.trim()) return;
    setSaving(true);
    try {
      const payload = {
        company_id: company.id,
        name: name.trim(),
        status_type: statusType,
        message,
        auto_send: autoSend,
      };
      if (selected) {
        const { error } = await supabase.from('status_templates').update(payload).eq('id', selected.id);
        if (error) throw error;
        toast.success('Template atualizado!');
      } else {
        const { error } = await supabase.from('status_templates').insert(payload);
        if (error) throw error;
        toast.success('Template criado!');
      }
      setShowForm(false);
      fetchData();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!selected) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('status_templates').delete().eq('id', selected.id);
      if (error) throw error;
      toast.success('Template excluído');
      setShowDelete(false); setSelected(null); fetchData();
    } catch (e: any) { toast.error(e.message); } finally { setDeleting(false); }
  };

  const columns: Column<StatusTemplate>[] = [
    { key: 'name', label: 'Nome', sortable: true },
    {
      key: 'status_type', label: 'Tipo', render: (r) => {
        const t = STATUS_TYPES.find(s => s.value === r.status_type);
        return <Badge variant="outline">{t?.label || r.status_type}</Badge>;
      }
    },
    { key: 'message', label: 'Mensagem', render: (r) => <span className="truncate max-w-[200px] block">{r.message}</span> },
    { key: 'auto_send', label: 'Auto envio', render: (r) => <Badge variant={r.auto_send ? 'default' : 'secondary'}>{r.auto_send ? 'Sim' : 'Não'}</Badge> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Status</h1>
          <p className="text-muted-foreground">Templates de status de atendimento com envio automático</p>
        </div>
        {hasPermission('status', 'create') && !isReadOnly && (
          <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Novo template</Button>
        )}
      </div>

      <DataTable data={items} columns={columns} searchKey="name" searchPlaceholder="Buscar template..." loading={loading} emptyMessage="Nenhum template de status."
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
            <DialogTitle>{selected ? 'Editar' : 'Novo'} template de status</DialogTitle>
            <DialogDescription>Configure a mensagem de status automática</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Nome *</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Atendimento iniciado" /></div>
            <div className="space-y-2">
              <Label>Tipo de status</Label>
              <Select value={statusType} onValueChange={setStatusType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_TYPES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Mensagem *</Label><Textarea value={message} onChange={e => setMessage(e.target.value)} rows={3} placeholder="Seu atendimento foi iniciado. Em breve um atendente irá te responder." /></div>
            <div className="flex items-center gap-2"><Switch checked={autoSend} onCheckedChange={setAutoSend} /><Label>Enviar automaticamente ao mudar status</Label></div>
            <Button onClick={handleSave} disabled={saving || !name.trim() || !message.trim()} className="w-full">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={showDelete} onOpenChange={setShowDelete} title="Excluir template" description={`Excluir "${selected?.name}"?`} confirmLabel="Excluir" variant="destructive" onConfirm={handleDelete} loading={deleting} />
    </div>
  );
}

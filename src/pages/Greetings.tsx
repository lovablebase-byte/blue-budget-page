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
import { toast } from 'sonner';
import { Plus, Trash2, Edit, Send, MoreHorizontal, Loader2, MessageCircle } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

interface Greeting {
  id: string;
  name: string;
  message_template: string;
  tags: string[];
  is_active: boolean;
  created_at: string;
}

export default function Greetings() {
  const { company, hasPermission, isReadOnly } = useAuth();
  const [items, setItems] = useState<Greeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [selected, setSelected] = useState<Greeting | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [name, setName] = useState('');
  const [template, setTemplate] = useState('');
  const [tags, setTags] = useState('');
  const [isActive, setIsActive] = useState(true);

  const fetchData = async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase.from('greetings').select('*').eq('company_id', company.id).order('created_at', { ascending: false });
    setItems((data as Greeting[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [company]);

  const openEdit = (item: Greeting) => {
    setSelected(item);
    setName(item.name);
    setTemplate(item.message_template);
    setTags(item.tags?.join(', ') || '');
    setIsActive(item.is_active);
    setShowForm(true);
  };

  const openNew = () => {
    setSelected(null);
    setName(''); setTemplate(''); setTags(''); setIsActive(true);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!company || !name.trim() || !template.trim()) return;
    setSaving(true);
    try {
      const payload = {
        company_id: company.id,
        name: name.trim(),
        message_template: template,
        tags: tags ? tags.split(',').map(t => t.trim()) : [],
        is_active: isActive,
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

  const columns: Column<Greeting>[] = [
    { key: 'name', label: 'Nome', sortable: true },
    { key: 'message_template', label: 'Mensagem', render: (r) => <span className="truncate max-w-[200px] block">{r.message_template}</span> },
    { key: 'tags', label: 'Tags', render: (r) => r.tags?.map(t => <Badge key={t} variant="outline" className="mr-1 text-xs">{t}</Badge>) || '—' },
    { key: 'is_active', label: 'Ativo', render: (r) => <Badge variant={r.is_active ? 'default' : 'secondary'}>{r.is_active ? 'Sim' : 'Não'}</Badge> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Saudações</h1>
          <p className="text-muted-foreground">Mensagens automáticas por horário e contato. Variáveis: {'{{nome}}, {{horário}}, {{empresa}}, {{atendente}}'}</p>
        </div>
        {hasPermission('greetings', 'create') && !isReadOnly && (
          <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nova saudação</Button>
        )}
      </div>

      <DataTable data={items} columns={columns} searchKey="name" searchPlaceholder="Buscar saudação..." loading={loading} emptyMessage="Nenhuma saudação configurada."
        actions={(row) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => openEdit(row)}><Edit className="mr-2 h-4 w-4" /> Editar</DropdownMenuItem>
              <DropdownMenuItem onClick={() => toast.info('Envio de teste será conectado à Evolution API')}><Send className="mr-2 h-4 w-4" /> Testar</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={() => { setSelected(row); setShowDelete(true); }}><Trash2 className="mr-2 h-4 w-4" /> Excluir</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      />

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selected ? 'Editar' : 'Nova'} saudação</DialogTitle>
            <DialogDescription>Configure a mensagem automática</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Nome *</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Boas-vindas" /></div>
            <div className="space-y-2">
              <Label>Mensagem *</Label>
              <Textarea value={template} onChange={e => setTemplate(e.target.value)} placeholder="Olá {{nome}}! Bem-vindo à {{empresa}}." rows={4} />
              <p className="text-xs text-muted-foreground">Use {'{{nome}}, {{horário}}, {{empresa}}, {{atendente}}'} como variáveis</p>
            </div>
            <div className="space-y-2"><Label>Tags (vírgula)</Label><Input value={tags} onChange={e => setTags(e.target.value)} placeholder="vip, novo" /></div>
            <div className="flex items-center gap-2"><Switch checked={isActive} onCheckedChange={setIsActive} /><Label>Ativo</Label></div>
            <Button onClick={handleSave} disabled={saving || !name.trim() || !template.trim()} className="w-full">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={showDelete} onOpenChange={setShowDelete} title="Excluir saudação" description={`Excluir "${selected?.name}"?`} confirmLabel="Excluir" variant="destructive" onConfirm={handleDelete} loading={deleting} />
    </div>
  );
}

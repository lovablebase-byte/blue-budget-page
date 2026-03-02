import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { DataTable, Column } from '@/components/DataTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { toast } from '@/hooks/use-toast';
import { Plus, Trash2, Bot } from 'lucide-react';

const TOOLS = [
  { value: 'respond', label: 'Responder' },
  { value: 'classify', label: 'Classificar' },
  { value: 'extract', label: 'Extrair dados' },
  { value: 'summarize', label: 'Resumir conversa' },
];

export default function AIAgents() {
  const { company } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', objective: '', base_prompt: '', safety_rules: '', tools: ['respond'] as string[] });

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ['ai-agents', company?.id],
    queryFn: async () => {
      if (!company?.id) return [];
      const { data, error } = await supabase.from('ai_agents').select('*').eq('company_id', company.id).order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!company?.id,
  });

  const { data: instances = [] } = useQuery({
    queryKey: ['instances-list', company?.id],
    queryFn: async () => {
      if (!company?.id) return [];
      const { data } = await supabase.from('instances').select('id, name').eq('company_id', company.id);
      return data || [];
    },
    enabled: !!company?.id,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { company_id: company!.id, ...form, objective: form.objective || null, base_prompt: form.base_prompt || null, safety_rules: form.safety_rules || null };
      if (editId) {
        const { error } = await supabase.from('ai_agents').update(payload).eq('id', editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('ai_agents').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-agents'] });
      resetForm();
      toast({ title: editId ? 'Agente atualizado' : 'Agente criado' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('ai_agents').update({ is_active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ai-agents'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ai_agents').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['ai-agents'] }); toast({ title: 'Agente excluído' }); },
  });

  const resetForm = () => {
    setOpen(false);
    setEditId(null);
    setForm({ name: '', objective: '', base_prompt: '', safety_rules: '', tools: ['respond'] });
  };

  const openEdit = (a: any) => {
    setEditId(a.id);
    setForm({ name: a.name, objective: a.objective || '', base_prompt: a.base_prompt || '', safety_rules: a.safety_rules || '', tools: a.tools || ['respond'] });
    setOpen(true);
  };

  const columns: Column<any>[] = [
    { key: 'name', label: 'Nome', sortable: true },
    { key: 'objective', label: 'Objetivo', render: (row) => row.objective || '—' },
    {
      key: 'tools', label: 'Ferramentas',
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {(row.tools || []).map((t: string) => <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>)}
        </div>
      ),
    },
    {
      key: 'is_active', label: 'Ativo',
      render: (row) => <Switch checked={row.is_active} onCheckedChange={(v) => toggleMutation.mutate({ id: row.id, is_active: v })} />,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agentes IA</h1>
          <p className="text-muted-foreground">Configure agentes inteligentes para suas instâncias</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); else setOpen(true); }}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> Novo Agente</Button></DialogTrigger>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editId ? 'Editar Agente' : 'Novo Agente'}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Nome</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div><Label>Objetivo</Label><Input value={form.objective} onChange={e => setForm(f => ({ ...f, objective: e.target.value }))} placeholder="Ex: Atender clientes e responder dúvidas" /></div>
              <div><Label>Prompt Base</Label><Textarea rows={4} value={form.base_prompt} onChange={e => setForm(f => ({ ...f, base_prompt: e.target.value }))} placeholder="Instruções para o agente..." /></div>
              <div><Label>Regras de Segurança</Label><Textarea rows={2} value={form.safety_rules} onChange={e => setForm(f => ({ ...f, safety_rules: e.target.value }))} placeholder="Ex: Nunca compartilhar dados sensíveis" /></div>
              <div>
                <Label>Ferramentas</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {TOOLS.map(t => (
                    <label key={t.value} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={form.tools.includes(t.value)}
                        onCheckedChange={(checked) => setForm(f => ({ ...f, tools: checked ? [...f.tools, t.value] : f.tools.filter(x => x !== t.value) }))}
                      />
                      {t.label}
                    </label>
                  ))}
                </div>
              </div>
              <Button onClick={() => saveMutation.mutate()} disabled={!form.name || saveMutation.isPending} className="w-full">
                {editId ? 'Salvar' : 'Criar Agente'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <DataTable
        data={agents}
        columns={columns}
        searchKey="name"
        searchPlaceholder="Buscar agente..."
        loading={isLoading}
        emptyMessage="Nenhum agente criado"
        actions={(row) => (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>Editar</Button>
            <ConfirmDialog title="Excluir agente?" description="Esta ação é irreversível." onConfirm={() => deleteMutation.mutate(row.id)} trigger={<Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>} />
          </div>
        )}
      />
    </div>
  );
}

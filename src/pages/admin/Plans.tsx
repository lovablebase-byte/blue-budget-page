import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DataTable, Column } from '@/components/DataTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Plus, Trash2 } from 'lucide-react';

const defaultForm = {
  name: '', description: '', price_cents: 0,
  max_instances: 1, max_messages_month: 1000, max_users: 3,
  max_campaigns: 5, max_messages_day: 500, max_ai_agents: 1,
  max_chatbots: 3, max_workflows: 3, max_contacts: 1000,
  campaigns_enabled: false, workflows_enabled: false, ai_agents_enabled: false,
  api_access: false, whitelabel_enabled: false, support_priority: 'standard',
  is_active: true,
};

export default function AdminPlans() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...defaultForm });

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ['admin-plans'],
    queryFn: async () => {
      const { data, error } = await supabase.from('plans').select('*').order('price_cents');
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { ...form, description: form.description || null };
      if (editId) {
        const { error } = await supabase.from('plans').update(payload).eq('id', editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('plans').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-plans'] });
      resetForm();
      toast({ title: editId ? 'Plano atualizado' : 'Plano criado' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('plans').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-plans'] }); toast({ title: 'Plano excluído' }); },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('plans').update({ is_active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-plans'] }); toast({ title: 'Status atualizado' }); },
  });

  const resetForm = () => {
    setOpen(false); setEditId(null);
    setForm({ ...defaultForm });
  };

  const openEdit = (p: any) => {
    setEditId(p.id);
    setForm({
      name: p.name, description: p.description || '', price_cents: p.price_cents,
      max_instances: p.max_instances, max_messages_month: p.max_messages_month, max_users: p.max_users,
      max_campaigns: p.max_campaigns ?? 5, max_messages_day: p.max_messages_day ?? 500,
      max_ai_agents: p.max_ai_agents ?? 1, max_chatbots: p.max_chatbots ?? 3,
      max_workflows: p.max_workflows ?? 3, max_contacts: p.max_contacts ?? 1000,
      campaigns_enabled: p.campaigns_enabled, workflows_enabled: p.workflows_enabled,
      ai_agents_enabled: p.ai_agents_enabled, api_access: p.api_access ?? false,
      whitelabel_enabled: p.whitelabel_enabled ?? false, support_priority: p.support_priority ?? 'standard',
      is_active: p.is_active,
    });
    setOpen(true);
  };

  const set = (key: string, val: any) => setForm(f => ({ ...f, [key]: val }));

  const columns: Column<any>[] = [
    { key: 'name', label: 'Nome', sortable: true },
    { key: 'price_cents', label: 'Preço', render: (row) => `R$ ${(row.price_cents / 100).toFixed(2)}` },
    { key: 'max_instances', label: 'Instâncias' },
    { key: 'max_users', label: 'Usuários' },
    { key: 'support_priority', label: 'Suporte', render: (row) => {
      const map: Record<string, string> = { standard: 'Padrão', priority: 'Prioritário', premium: 'Premium' };
      return map[row.support_priority] || row.support_priority;
    }},
    { key: 'is_active', label: 'Status', render: (row) => (
      <Badge variant={row.is_active ? 'default' : 'secondary'}>{row.is_active ? 'Ativo' : 'Inativo'}</Badge>
    )},
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Planos</h1>
        <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); else setOpen(true); }}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> Novo Plano</Button></DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editId ? 'Editar Plano' : 'Novo Plano'}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Nome</Label><Input value={form.name} onChange={e => set('name', e.target.value)} /></div>
                <div><Label>Preço (centavos)</Label><Input type="number" value={form.price_cents} onChange={e => set('price_cents', Number(e.target.value))} /></div>
              </div>
              <div><Label>Descrição</Label><Input value={form.description} onChange={e => set('description', e.target.value)} /></div>

              <h3 className="text-sm font-semibold text-muted-foreground pt-2">Limites de Recursos</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div><Label>Max Instâncias</Label><Input type="number" value={form.max_instances} onChange={e => set('max_instances', Number(e.target.value))} /></div>
                <div><Label>Max Usuários</Label><Input type="number" value={form.max_users} onChange={e => set('max_users', Number(e.target.value))} /></div>
                <div><Label>Max Campanhas</Label><Input type="number" value={form.max_campaigns} onChange={e => set('max_campaigns', Number(e.target.value))} /></div>
                <div><Label>Msgs/mês</Label><Input type="number" value={form.max_messages_month} onChange={e => set('max_messages_month', Number(e.target.value))} /></div>
                <div><Label>Msgs/dia</Label><Input type="number" value={form.max_messages_day} onChange={e => set('max_messages_day', Number(e.target.value))} /></div>
                <div><Label>Max Agentes IA</Label><Input type="number" value={form.max_ai_agents} onChange={e => set('max_ai_agents', Number(e.target.value))} /></div>
                <div><Label>Max Chatbots</Label><Input type="number" value={form.max_chatbots} onChange={e => set('max_chatbots', Number(e.target.value))} /></div>
                <div><Label>Max Workflows</Label><Input type="number" value={form.max_workflows} onChange={e => set('max_workflows', Number(e.target.value))} /></div>
                <div><Label>Max Contatos</Label><Input type="number" value={form.max_contacts} onChange={e => set('max_contacts', Number(e.target.value))} /></div>
              </div>

              <h3 className="text-sm font-semibold text-muted-foreground pt-2">Funcionalidades</h3>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.campaigns_enabled} onCheckedChange={(v) => set('campaigns_enabled', !!v)} /> Campanhas</label>
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.workflows_enabled} onCheckedChange={(v) => set('workflows_enabled', !!v)} /> Workflows</label>
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.ai_agents_enabled} onCheckedChange={(v) => set('ai_agents_enabled', !!v)} /> Agentes IA</label>
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.api_access} onCheckedChange={(v) => set('api_access', !!v)} /> Acesso API</label>
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.whitelabel_enabled} onCheckedChange={(v) => set('whitelabel_enabled', !!v)} /> White Label</label>
              </div>

              <div><Label>Nível de Suporte</Label>
                <Select value={form.support_priority} onValueChange={v => set('support_priority', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Padrão</SelectItem>
                    <SelectItem value="priority">Prioritário</SelectItem>
                    <SelectItem value="premium">Premium</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button onClick={() => saveMutation.mutate()} disabled={!form.name || saveMutation.isPending} className="w-full">{editId ? 'Salvar' : 'Criar Plano'}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <DataTable data={plans} columns={columns} searchKey="name" loading={isLoading} emptyMessage="Nenhum plano" actions={(row) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>Editar</Button>
          <Button variant="ghost" size="sm" onClick={() => toggleActiveMutation.mutate({ id: row.id, is_active: !row.is_active })}>
            {row.is_active ? 'Desativar' : 'Ativar'}
          </Button>
          <ConfirmDialog title="Excluir plano?" description="Isso pode afetar assinaturas ativas." onConfirm={() => deleteMutation.mutate(row.id)} trigger={<Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>} />
        </div>
      )} />
    </div>
  );
}

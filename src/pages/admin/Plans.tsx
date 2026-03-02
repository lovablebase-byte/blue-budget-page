import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DataTable, Column } from '@/components/DataTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { toast } from '@/hooks/use-toast';
import { Plus, Trash2 } from 'lucide-react';

export default function AdminPlans() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '', description: '', price_cents: 0, max_instances: 1, max_messages_month: 1000, max_users: 3,
    campaigns_enabled: false, workflows_enabled: false, ai_agents_enabled: false,
  });

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

  const resetForm = () => {
    setOpen(false); setEditId(null);
    setForm({ name: '', description: '', price_cents: 0, max_instances: 1, max_messages_month: 1000, max_users: 3, campaigns_enabled: false, workflows_enabled: false, ai_agents_enabled: false });
  };

  const openEdit = (p: any) => {
    setEditId(p.id);
    setForm({ name: p.name, description: p.description || '', price_cents: p.price_cents, max_instances: p.max_instances, max_messages_month: p.max_messages_month, max_users: p.max_users, campaigns_enabled: p.campaigns_enabled, workflows_enabled: p.workflows_enabled, ai_agents_enabled: p.ai_agents_enabled });
    setOpen(true);
  };

  const columns: Column<any>[] = [
    { key: 'name', label: 'Nome', sortable: true },
    { key: 'price_cents', label: 'Preço', render: (row) => `R$ ${(row.price_cents / 100).toFixed(2)}` },
    { key: 'max_instances', label: 'Instâncias' },
    { key: 'max_messages_month', label: 'Msgs/mês' },
    { key: 'max_users', label: 'Usuários' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Planos</h1>
        <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); else setOpen(true); }}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> Novo Plano</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editId ? 'Editar Plano' : 'Novo Plano'}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Nome</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div><Label>Descrição</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Preço (centavos)</Label><Input type="number" value={form.price_cents} onChange={e => setForm(f => ({ ...f, price_cents: Number(e.target.value) }))} /></div>
                <div><Label>Max Instâncias</Label><Input type="number" value={form.max_instances} onChange={e => setForm(f => ({ ...f, max_instances: Number(e.target.value) }))} /></div>
                <div><Label>Max Msgs/mês</Label><Input type="number" value={form.max_messages_month} onChange={e => setForm(f => ({ ...f, max_messages_month: Number(e.target.value) }))} /></div>
                <div><Label>Max Usuários</Label><Input type="number" value={form.max_users} onChange={e => setForm(f => ({ ...f, max_users: Number(e.target.value) }))} /></div>
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.campaigns_enabled} onCheckedChange={(v) => setForm(f => ({ ...f, campaigns_enabled: !!v }))} /> Campanhas</label>
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.workflows_enabled} onCheckedChange={(v) => setForm(f => ({ ...f, workflows_enabled: !!v }))} /> Workflows</label>
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.ai_agents_enabled} onCheckedChange={(v) => setForm(f => ({ ...f, ai_agents_enabled: !!v }))} /> Agentes IA</label>
              </div>
              <Button onClick={() => saveMutation.mutate()} disabled={!form.name || saveMutation.isPending} className="w-full">{editId ? 'Salvar' : 'Criar Plano'}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <DataTable data={plans} columns={columns} searchKey="name" loading={isLoading} emptyMessage="Nenhum plano" actions={(row) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>Editar</Button>
          <ConfirmDialog title="Excluir plano?" description="Isso pode afetar assinaturas ativas." onConfirm={() => deleteMutation.mutate(row.id)} trigger={<Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>} />
        </div>
      )} />
    </div>
  );
}

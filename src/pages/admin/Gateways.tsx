import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DataTable, Column } from '@/components/DataTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { toast } from '@/hooks/use-toast';
import { Plus, Trash2 } from 'lucide-react';

const PROVIDERS = [
  { value: 'abacatepay', label: 'AbacatePay' },
  { value: 'cakto', label: 'Cakto' },
  { value: 'infinitepay', label: 'InfinitePay' },
];

export default function AdminGateways() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', provider: 'abacatepay' });

  const { data: gateways = [], isLoading } = useQuery({
    queryKey: ['admin-gateways'],
    queryFn: async () => {
      const { data, error } = await supabase.from('payment_gateways').select('*').order('created_at');
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('payment_gateways').insert(form);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-gateways'] });
      setOpen(false); setForm({ name: '', provider: 'abacatepay' });
      toast({ title: 'Gateway criado' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('payment_gateways').update({ is_active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-gateways'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('payment_gateways').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-gateways'] }); toast({ title: 'Gateway excluído' }); },
  });

  const columns: Column<any>[] = [
    { key: 'name', label: 'Nome', sortable: true },
    { key: 'provider', label: 'Provedor', render: (row) => PROVIDERS.find(p => p.value === row.provider)?.label || row.provider },
    { key: 'is_active', label: 'Ativo', render: (row) => <Switch checked={row.is_active} onCheckedChange={(v) => toggleMutation.mutate({ id: row.id, is_active: v })} /> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Gateways de Pagamento</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> Novo Gateway</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo Gateway</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Nome</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div>
                <Label>Provedor</Label>
                <Select value={form.provider} onValueChange={(v) => setForm(f => ({ ...f, provider: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PROVIDERS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button onClick={() => createMutation.mutate()} disabled={!form.name || createMutation.isPending} className="w-full">Criar Gateway</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <DataTable data={gateways} columns={columns} searchKey="name" loading={isLoading} emptyMessage="Nenhum gateway" actions={(row) => (
        <ConfirmDialog title="Excluir gateway?" description="Isso pode afetar cobranças ativas." onConfirm={() => deleteMutation.mutate(row.id)} trigger={<Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>} />
      )} />
    </div>
  );
}

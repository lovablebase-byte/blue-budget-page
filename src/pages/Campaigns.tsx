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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { toast } from '@/hooks/use-toast';
import { Plus, Trash2, Send, BarChart3, Users, MessageCircle, AlertTriangle } from 'lucide-react';

export default function Campaigns() {
  const { company } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', message_template: '', segment_type: 'tags', rate_limit_per_minute: 30 });

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ['campaigns', company?.id],
    queryFn: async () => {
      if (!company?.id) return [];
      const { data, error } = await supabase.from('campaigns').select('*').eq('company_id', company.id).order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!company?.id,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('campaigns').insert({
        company_id: company!.id,
        ...form,
        rate_limit_per_minute: form.rate_limit_per_minute,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      setOpen(false);
      setForm({ name: '', message_template: '', segment_type: 'tags', rate_limit_per_minute: 30 });
      toast({ title: 'Campanha criada' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('campaigns').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['campaigns'] }); toast({ title: 'Campanha excluída' }); },
  });

  const statusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'secondary';
      case 'sending': return 'default';
      case 'completed': return 'outline';
      case 'paused': return 'destructive';
      default: return 'secondary';
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'draft': return 'Rascunho';
      case 'sending': return 'Enviando';
      case 'completed': return 'Concluída';
      case 'paused': return 'Pausada';
      default: return status;
    }
  };

  const totalStats = campaigns.reduce((acc, c) => {
    const s = c.stats as any || { sent: 0, delivered: 0, read: 0, failed: 0 };
    return { sent: acc.sent + s.sent, delivered: acc.delivered + s.delivered, read: acc.read + s.read, failed: acc.failed + s.failed };
  }, { sent: 0, delivered: 0, read: 0, failed: 0 });

  const columns: Column<any>[] = [
    { key: 'name', label: 'Nome', sortable: true },
    { key: 'segment_type', label: 'Segmentação', render: (row) => <Badge variant="outline">{row.segment_type}</Badge> },
    { key: 'status', label: 'Status', render: (row) => <Badge variant={statusColor(row.status)}>{statusLabel(row.status)}</Badge> },
    { key: 'rate_limit_per_minute', label: 'Limite/min' },
    {
      key: 'stats', label: 'Enviados/Entregues',
      render: (row) => {
        const s = row.stats as any || { sent: 0, delivered: 0 };
        return `${s.sent} / ${s.delivered}`;
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Campanhas</h1>
          <p className="text-muted-foreground">Disparos em massa com segmentação e relatórios</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> Nova Campanha</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova Campanha</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Nome</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div><Label>Mensagem Template</Label><Textarea rows={4} value={form.message_template} onChange={e => setForm(f => ({ ...f, message_template: e.target.value }))} placeholder="Use {{nome}} para variáveis..." /></div>
              <div>
                <Label>Tipo de Segmentação</Label>
                <Select value={form.segment_type} onValueChange={(v) => setForm(f => ({ ...f, segment_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tags">Por Tags</SelectItem>
                    <SelectItem value="list">Lista manual</SelectItem>
                    <SelectItem value="csv">Importar CSV</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Limite por minuto</Label><Input type="number" value={form.rate_limit_per_minute} onChange={e => setForm(f => ({ ...f, rate_limit_per_minute: Number(e.target.value) }))} /></div>
              <Button onClick={() => createMutation.mutate()} disabled={!form.name || !form.message_template || createMutation.isPending} className="w-full">Criar Campanha</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4 text-center"><Send className="h-5 w-5 mx-auto mb-1 text-primary" /><p className="text-2xl font-bold">{totalStats.sent}</p><p className="text-xs text-muted-foreground">Enviados</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><MessageCircle className="h-5 w-5 mx-auto mb-1 text-success" /><p className="text-2xl font-bold">{totalStats.delivered}</p><p className="text-xs text-muted-foreground">Entregues</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><Users className="h-5 w-5 mx-auto mb-1 text-accent-foreground" /><p className="text-2xl font-bold">{totalStats.read}</p><p className="text-xs text-muted-foreground">Lidos</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><AlertTriangle className="h-5 w-5 mx-auto mb-1 text-destructive" /><p className="text-2xl font-bold">{totalStats.failed}</p><p className="text-xs text-muted-foreground">Falhas</p></CardContent></Card>
      </div>

      <DataTable
        data={campaigns}
        columns={columns}
        searchKey="name"
        searchPlaceholder="Buscar campanha..."
        loading={isLoading}
        emptyMessage="Nenhuma campanha criada"
        actions={(row) => (
          <ConfirmDialog title="Excluir campanha?" description="Esta ação é irreversível." onConfirm={() => deleteMutation.mutate(row.id)} trigger={<Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>} />
        )}
      />
    </div>
  );
}

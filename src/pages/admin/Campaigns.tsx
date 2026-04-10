import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DataTable, Column } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { toast } from '@/hooks/use-toast';
import { Trash2, Megaphone, Building2, Users, Send, CheckCircle, AlertTriangle } from 'lucide-react';

const statusLabel: Record<string, string> = { draft: 'Rascunho', sending: 'Enviando', completed: 'Concluída', paused: 'Pausada' };
const statusVariant = (s: string) => {
  switch (s) { case 'sending': return 'default' as const; case 'completed': return 'outline' as const; case 'paused': return 'destructive' as const; default: return 'secondary' as const; }
};

export default function AdminCampaigns() {
  const queryClient = useQueryClient();
  const [companyFilter, setCompanyFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const { data: companies = [] } = useQuery({
    queryKey: ['admin-companies'],
    queryFn: async () => {
      const { data } = await supabase.from('companies').select('id, name').order('name');
      return data || [];
    },
  });

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ['admin-campaigns', companyFilter, statusFilter],
    queryFn: async () => {
      let q = supabase.from('campaigns').select('*, companies(name)').order('created_at', { ascending: false });
      if (companyFilter !== 'all') q = q.eq('company_id', companyFilter);
      if (statusFilter !== 'all') q = q.eq('status', statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('campaigns').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-campaigns'] }); toast({ title: 'Campanha excluída' }); },
  });

  const totalStats = campaigns.reduce((acc, c) => {
    const s = c.stats as any || { sent: 0, delivered: 0, read: 0, failed: 0 };
    return { sent: acc.sent + (s.sent || 0), delivered: acc.delivered + (s.delivered || 0), failed: acc.failed + (s.failed || 0) };
  }, { sent: 0, delivered: 0, failed: 0 });

  const columns: Column<any>[] = [
    { key: 'companies', label: 'Empresa', render: (row) => <Badge variant="outline"><Building2 className="h-3 w-3 mr-1" />{(row.companies as any)?.name || '—'}</Badge> },
    { key: 'name', label: 'Nome', sortable: true },
    { key: 'segment_data', label: 'Contatos', render: (row) => { const sd = row.segment_data as any; return <Badge variant="outline"><Users className="h-3 w-3 mr-1" />{sd?.contacts?.length || 0}</Badge>; } },
    { key: 'status', label: 'Status', render: (row) => <Badge variant={statusVariant(row.status)}>{statusLabel[row.status] || row.status}</Badge> },
    { key: 'rate_limit_per_minute', label: 'Limite/min' },
    { key: 'stats', label: 'Env/Entreg/Falha', render: (row) => { const s = row.stats as any || {}; return `${s.sent || 0}/${s.delivered || 0}/${s.failed || 0}`; } },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Campanhas — Visão Global</h1>
          <p className="text-muted-foreground">Todas as campanhas de todas as empresas</p>
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              <SelectItem value="draft">Rascunho</SelectItem>
              <SelectItem value="sending">Enviando</SelectItem>
              <SelectItem value="completed">Concluída</SelectItem>
              <SelectItem value="paused">Pausada</SelectItem>
            </SelectContent>
          </Select>
          <Select value={companyFilter} onValueChange={setCompanyFilter}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="Filtrar empresa" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as empresas</SelectItem>
              {companies.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><Megaphone className="h-6 w-6 text-primary" /></div>
              <div><p className="text-2xl font-bold tracking-tight">{campaigns.length}</p><p className="text-sm text-muted-foreground">Total</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-warning/10"><Send className="h-6 w-6 text-warning" /></div>
              <div><p className="text-2xl font-bold tracking-tight">{totalStats.sent}</p><p className="text-sm text-muted-foreground">Enviadas</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-success/10"><CheckCircle className="h-6 w-6 text-success" /></div>
              <div><p className="text-2xl font-bold tracking-tight text-success">{totalStats.delivered}</p><p className="text-sm text-muted-foreground">Entregues</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-destructive/10"><AlertTriangle className="h-6 w-6 text-destructive" /></div>
              <div><p className="text-2xl font-bold tracking-tight text-destructive">{totalStats.failed}</p><p className="text-sm text-muted-foreground">Falhas</p></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <DataTable data={campaigns} columns={columns} searchKey="name" searchPlaceholder="Buscar campanha..." loading={isLoading} emptyMessage="Nenhuma campanha encontrada"
        actions={(row) => (
          <ConfirmDialog title="Excluir campanha?" description="Esta ação é irreversível." onConfirm={() => deleteMutation.mutate(row.id)}
            trigger={<Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>} />
        )}
      />
    </div>
  );
}

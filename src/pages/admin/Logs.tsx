import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Send, CheckCircle2, Eye, XCircle, Download, Search, Filter } from 'lucide-react';

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  queued: { label: 'Na fila', variant: 'outline' },
  sent: { label: 'Enviado', variant: 'secondary' },
  delivered: { label: 'Entregue', variant: 'default' },
  read: { label: 'Lido', variant: 'default' },
  failed: { label: 'Falhou', variant: 'destructive' },
};

const fmtDate = (d: string | null) => d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

export default function AdminLogs() {
  const [filters, setFilters] = useState({ contact: '', status: 'all', instance_id: 'all', campaign_id: 'all', date: '' });
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const { data: instances = [] } = useQuery({
    queryKey: ['log-instances'],
    queryFn: async () => {
      const { data } = await supabase.from('instances').select('id, name');
      return data || [];
    },
  });

  const { data: campaigns = [] } = useQuery({
    queryKey: ['log-campaigns'],
    queryFn: async () => {
      const { data } = await supabase.from('campaigns').select('id, name');
      return data || [];
    },
  });

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['messages-log', filters, page],
    queryFn: async () => {
      let q = supabase.from('messages_log').select('*, instances(name), campaigns(name)').order('created_at', { ascending: false }).range(page * pageSize, (page + 1) * pageSize - 1);
      if (filters.contact) q = q.ilike('contact_number', `%${filters.contact}%`);
      if (filters.status !== 'all') q = q.eq('status', filters.status);
      if (filters.instance_id !== 'all') q = q.eq('instance_id', filters.instance_id);
      if (filters.campaign_id !== 'all') q = q.eq('campaign_id', filters.campaign_id);
      if (filters.date) q = q.gte('created_at', `${filters.date}T00:00:00`).lte('created_at', `${filters.date}T23:59:59`);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const { data: stats } = useQuery({
    queryKey: ['messages-log-stats'],
    queryFn: async () => {
      const [sent, delivered, read, failed] = await Promise.all([
        supabase.from('messages_log').select('id', { count: 'exact', head: true }).eq('status', 'sent'),
        supabase.from('messages_log').select('id', { count: 'exact', head: true }).eq('status', 'delivered'),
        supabase.from('messages_log').select('id', { count: 'exact', head: true }).eq('status', 'read'),
        supabase.from('messages_log').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
      ]);
      return { sent: sent.count ?? 0, delivered: delivered.count ?? 0, read: read.count ?? 0, failed: failed.count ?? 0 };
    },
  });

  const exportCSV = () => {
    const header = 'Número,Direção,Mensagem,Status,Instância,Campanha,Enviado,Entregue,Lido\n';
    const rows = logs.map((l: any) =>
      `"${l.contact_number}","${l.direction}","${(l.message || '').replace(/"/g, '""')}","${l.status}","${(l as any).instances?.name || ''}","${(l as any).campaigns?.name || ''}","${fmtDate(l.sent_at)}","${fmtDate(l.delivered_at)}","${fmtDate(l.read_at)}"`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const set = (key: string, val: string) => { setFilters(f => ({ ...f, [key]: val })); setPage(0); };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Logs de Mensagens</h1>
        <Button variant="outline" onClick={exportCSV} disabled={logs.length === 0}>
          <Download className="h-4 w-4 mr-2" /> Exportar CSV
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Enviados</CardTitle>
            <div className="icon-premium metric-green p-1.5 rounded-md"><Send className="h-4 w-4" /></div>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold metric-green">{stats?.sent ?? 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Entregues</CardTitle>
            <div className="icon-premium metric-orange p-1.5 rounded-md"><CheckCircle2 className="h-4 w-4" /></div>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold metric-orange">{stats?.delivered ?? 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Lidos</CardTitle>
            <div className="icon-premium metric-turquoise p-1.5 rounded-md"><Eye className="h-4 w-4" /></div>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold metric-turquoise">{stats?.read ?? 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Falhas</CardTitle>
            <div className="icon-premium metric-red p-1.5 rounded-md"><XCircle className="h-4 w-4" /></div>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold metric-red">{stats?.failed ?? 0}</div></CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[180px]">
              <label className="text-xs text-muted-foreground">Número</label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="Buscar número..." value={filters.contact} onChange={e => set('contact', e.target.value)} />
              </div>
            </div>
            <div className="w-[150px]">
              <label className="text-xs text-muted-foreground">Status</label>
              <Select value={filters.status} onValueChange={v => set('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="queued">Na fila</SelectItem>
                  <SelectItem value="sent">Enviado</SelectItem>
                  <SelectItem value="delivered">Entregue</SelectItem>
                  <SelectItem value="read">Lido</SelectItem>
                  <SelectItem value="failed">Falhou</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-[180px]">
              <label className="text-xs text-muted-foreground">Instância</label>
              <Select value={filters.instance_id} onValueChange={v => set('instance_id', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {instances.map((i: any) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-[180px]">
              <label className="text-xs text-muted-foreground">Campanha</label>
              <Select value={filters.campaign_id} onValueChange={v => set('campaign_id', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {campaigns.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-[160px]">
              <label className="text-xs text-muted-foreground">Data</label>
              <Input type="date" value={filters.date} onChange={e => set('date', e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="relative w-full overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Mensagem</TableHead>
                  <TableHead>Instância</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Enviado</TableHead>
                  <TableHead>Entregue</TableHead>
                  <TableHead>Lido</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
                ) : logs.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum log encontrado</TableCell></TableRow>
                ) : (
                  logs.map((log: any) => {
                    const s = STATUS_MAP[log.status] || { label: log.status, variant: 'outline' as const };
                    return (
                      <TableRow key={log.id}>
                        <TableCell className="font-mono text-xs">{log.contact_number}</TableCell>
                        <TableCell className="max-w-[200px] truncate text-xs">{log.message || '—'}</TableCell>
                        <TableCell className="text-xs">{(log as any).instances?.name || '—'}</TableCell>
                        <TableCell><Badge variant={s.variant} className="text-[10px]">{s.label}</Badge></TableCell>
                        <TableCell className="text-xs">{fmtDate(log.sent_at)}</TableCell>
                        <TableCell className="text-xs">{fmtDate(log.delivered_at)}</TableCell>
                        <TableCell className="text-xs">{fmtDate(log.read_at)}</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          {/* Pagination */}
          <div className="flex items-center justify-between border-t px-4 py-3">
            <p className="text-xs text-muted-foreground">{logs.length} registros</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</Button>
              <Button variant="outline" size="sm" disabled={logs.length < pageSize} onClick={() => setPage(p => p + 1)}>Próxima</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

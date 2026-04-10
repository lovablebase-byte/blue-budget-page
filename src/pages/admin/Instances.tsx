import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DataTable, Column } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Smartphone, Wifi, WifiOff, Signal, RefreshCw, Eye, MoreHorizontal,
  QrCode, Power, PowerOff, Trash2, Search, Filter, X,
} from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { toast } from 'sonner';

interface AdminInstance {
  id: string;
  name: string;
  phone_number: string | null;
  status: string;
  provider: string;
  created_at: string;
  last_connected_at: string | null;
  company_id: string;
  company_name: string;
  plan_name: string | null;
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  online: { label: 'Online', variant: 'default' },
  connected: { label: 'Online', variant: 'default' },
  offline: { label: 'Offline', variant: 'secondary' },
  connecting: { label: 'Conectando', variant: 'outline' },
  pairing: { label: 'Pareando', variant: 'outline' },
  error: { label: 'Erro', variant: 'destructive' },
};

const providerLabels: Record<string, string> = {
  evolution: 'Evolution',
  wuzapi: 'Wuzapi',
};

export default function AdminInstances() {
  const navigate = useNavigate();
  const [filterCompany, setFilterCompany] = useState('all');
  const [filterProvider, setFilterProvider] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<AdminInstance | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Fetch all instances with company info
  const { data: instances = [], isLoading, refetch } = useQuery({
    queryKey: ['admin-instances'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('instances')
        .select('id, name, phone_number, status, provider, created_at, last_connected_at, company_id, companies(name)')
        .order('created_at', { ascending: false });
      if (error) throw error;

      // Fetch subscriptions with plans for company mapping
      const { data: subs } = await supabase
        .from('subscriptions')
        .select('company_id, plans(name)')
        .in('status', ['active', 'trialing']);

      const planMap: Record<string, string> = {};
      (subs || []).forEach((s: any) => {
        if (s.company_id && s.plans?.name) planMap[s.company_id] = s.plans.name;
      });

      return (data || []).map((i: any) => ({
        id: i.id,
        name: i.name,
        phone_number: i.phone_number,
        status: i.status,
        provider: i.provider,
        created_at: i.created_at,
        last_connected_at: i.last_connected_at,
        company_id: i.company_id,
        company_name: i.companies?.name || '—',
        plan_name: planMap[i.company_id] || null,
      })) as AdminInstance[];
    },
    refetchInterval: 30000,
  });

  // Get unique companies for filter
  const { data: companies = [] } = useQuery({
    queryKey: ['admin-companies-filter'],
    queryFn: async () => {
      const { data } = await supabase.from('companies').select('id, name').order('name');
      return data || [];
    },
  });

  // Apply filters
  const filtered = instances.filter((inst) => {
    if (filterCompany !== 'all' && inst.company_id !== filterCompany) return false;
    if (filterProvider !== 'all' && inst.provider !== filterProvider) return false;
    if (filterStatus !== 'all') {
      if (filterStatus === 'online' && inst.status !== 'online' && inst.status !== 'connected') return false;
      if (filterStatus === 'offline' && inst.status !== 'offline') return false;
      if (filterStatus === 'connecting' && inst.status !== 'connecting' && inst.status !== 'pairing') return false;
      if (filterStatus === 'error' && inst.status !== 'error') return false;
    }
    if (searchText) {
      const s = searchText.toLowerCase();
      return inst.name.toLowerCase().includes(s) ||
        inst.company_name.toLowerCase().includes(s) ||
        (inst.phone_number || '').includes(s);
    }
    return true;
  });

  const hasFilters = filterCompany !== 'all' || filterProvider !== 'all' || filterStatus !== 'all' || searchText !== '';

  const clearFilters = () => {
    setFilterCompany('all');
    setFilterProvider('all');
    setFilterStatus('all');
    setSearchText('');
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      // Try provider delete first
      try {
        await supabase.functions.invoke('whatsapp-provider-proxy', {
          body: { action: 'delete', provider: deleteTarget.provider, instanceName: deleteTarget.name },
        });
      } catch {}
      const { error } = await supabase.from('instances').delete().eq('id', deleteTarget.id);
      if (error) throw error;
      toast.success('Instância excluída');
      setDeleteTarget(null);
      refetch();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDeleting(false);
    }
  };

  // Stats
  const total = filtered.length;
  const online = filtered.filter(i => i.status === 'online' || i.status === 'connected').length;
  const offline = filtered.filter(i => i.status === 'offline').length;
  const connecting = filtered.filter(i => i.status === 'connecting' || i.status === 'pairing').length;

  const columns: Column<AdminInstance>[] = [
    { key: 'name', label: 'Nome', sortable: true },
    { key: 'company_name', label: 'Empresa', sortable: true },
    {
      key: 'provider', label: 'Provider',
      render: (r) => <Badge variant="outline" className="text-xs font-mono">{providerLabels[r.provider] || r.provider}</Badge>,
    },
    {
      key: 'status', label: 'Status',
      render: (r) => {
        const cfg = statusConfig[r.status] || statusConfig.offline;
        return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
      },
    },
    { key: 'phone_number', label: 'Número', render: (r) => r.phone_number || '—' },
    {
      key: 'plan_name', label: 'Plano',
      render: (r) => r.plan_name ? <Badge variant="secondary" className="text-xs">{r.plan_name}</Badge> : <span className="text-muted-foreground text-xs">—</span>,
    },
    {
      key: 'created_at', label: 'Criada em', sortable: true,
      render: (r) => new Date(r.created_at).toLocaleDateString('pt-BR'),
    },
    {
      key: 'last_connected_at', label: 'Última conexão',
      render: (r) => r.last_connected_at ? new Date(r.last_connected_at).toLocaleString('pt-BR') : 'Nunca',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Instâncias — Admin</h1>
          <p className="text-muted-foreground text-sm">Visão gerencial de todas as instâncias do sistema</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium">Total</CardTitle>
            <Smartphone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{total}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium">Online</CardTitle>
            <Wifi className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">{online}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium">Offline</CardTitle>
            <WifiOff className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{offline}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium">Conectando</CardTitle>
            <Signal className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{connecting}</div></CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome, empresa ou número..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <Select value={filterCompany} onValueChange={setFilterCompany}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Empresa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas empresas</SelectItem>
                {companies.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterProvider} onValueChange={setFilterProvider}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="evolution">Evolution</SelectItem>
                <SelectItem value="wuzapi">Wuzapi</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="online">Online</SelectItem>
                <SelectItem value="offline">Offline</SelectItem>
                <SelectItem value="connecting">Conectando</SelectItem>
                <SelectItem value="error">Erro</SelectItem>
              </SelectContent>
            </Select>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="h-4 w-4 mr-1" /> Limpar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <DataTable
        data={filtered}
        columns={columns}
        loading={isLoading}
        emptyMessage="Nenhuma instância encontrada"
        actions={(row) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate(`/instances/${row.id}`)}>
                <Eye className="mr-2 h-4 w-4" /> Ver detalhes
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(row)}>
                <Trash2 className="mr-2 h-4 w-4" /> Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Excluir instância"
        description={`Tem certeza que deseja excluir a instância "${deleteTarget?.name}" da empresa "${deleteTarget?.company_name}"? Esta ação é irreversível.`}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}

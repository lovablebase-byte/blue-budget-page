import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DataTable, Column } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { RefreshCw, Eye, MoreHorizontal, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { toast } from 'sonner';

import { ProviderBadge } from '@/components/instances/ProviderBadge';
import { StatusBadge } from '@/components/instances/StatusBadge';
import { InstanceStatsCards } from '@/components/instances/InstanceStatsCards';
import { InstanceFilters } from '@/components/instances/InstanceFilters';
import { providerLabels } from '@/components/instances/constants';

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

export default function AdminInstances() {
  const navigate = useNavigate();
  const [filterCompany, setFilterCompany] = useState('all');
  const [filterProvider, setFilterProvider] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<AdminInstance | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data: instances = [], isLoading, refetch } = useQuery({
    queryKey: ['admin-instances'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('instances')
        .select('id, name, phone_number, status, provider, created_at, last_connected_at, company_id, companies(name)')
        .order('created_at', { ascending: false });
      if (error) throw error;

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

  const { data: companies = [] } = useQuery({
    queryKey: ['admin-companies-filter'],
    queryFn: async () => {
      const { data } = await supabase.from('companies').select('id, name').order('name');
      return data || [];
    },
  });

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
    setFilterCompany('all'); setFilterProvider('all'); setFilterStatus('all'); setSearchText('');
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
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

  const total = filtered.length;
  const online = filtered.filter(i => i.status === 'online' || i.status === 'connected').length;
  const offline = filtered.filter(i => i.status === 'offline').length;
  const connecting = filtered.filter(i => i.status === 'connecting' || i.status === 'pairing').length;

  const providerBreakdown: Record<string, number> = {};
  filtered.forEach(i => {
    const label = providerLabels[i.provider] || i.provider;
    providerBreakdown[label] = (providerBreakdown[label] || 0) + 1;
  });

  const columns: Column<AdminInstance>[] = [
    { key: 'name', label: 'Nome', sortable: true },
    { key: 'company_name', label: 'Empresa', sortable: true },
    {
      key: 'provider', label: 'Provider',
      render: (r) => <ProviderBadge provider={r.provider} />,
    },
    {
      key: 'status', label: 'Status',
      render: (r) => <StatusBadge status={r.status} />,
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
          <p className="text-muted-foreground text-sm">Visão gerencial de todas as instâncias — Evolution API e WuzAPI</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
        </Button>
      </div>

      <InstanceStatsCards
        total={total}
        online={online}
        offline={offline}
        connecting={connecting}
        providerBreakdown={providerBreakdown}
      />

      <InstanceFilters
        searchText={searchText}
        onSearchChange={setSearchText}
        filterProvider={filterProvider}
        onProviderChange={setFilterProvider}
        filterStatus={filterStatus}
        onStatusChange={setFilterStatus}
        hasFilters={hasFilters}
        onClear={clearFilters}
        filterCompany={filterCompany}
        onCompanyChange={setFilterCompany}
        companies={companies}
      />

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

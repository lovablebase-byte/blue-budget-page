import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DataTable, Column } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { toast } from '@/hooks/use-toast';
import { Trash2, Key, Building2, Eye, EyeOff, Copy } from 'lucide-react';

export default function AdminChatbotKeys() {
  const queryClient = useQueryClient();
  const [companyFilter, setCompanyFilter] = useState('all');
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());

  const { data: companies = [] } = useQuery({
    queryKey: ['admin-companies'],
    queryFn: async () => {
      const { data } = await supabase.from('companies').select('id, name').order('name');
      return data || [];
    },
  });

  const { data: keys = [], isLoading } = useQuery({
    queryKey: ['admin-chatbot-keys', companyFilter],
    queryFn: async () => {
      let q = supabase.from('chatbot_keys').select('*, companies(name)').order('created_at', { ascending: false });
      if (companyFilter !== 'all') q = q.eq('company_id', companyFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('chatbot_keys').update({ is_active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-chatbot-keys'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('chatbot_keys').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-chatbot-keys'] }); toast({ title: 'Chave revogada' }); },
  });

  const toggleReveal = (id: string) => {
    setRevealedKeys(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const copyKey = (key: string) => { navigator.clipboard.writeText(key); toast({ title: 'Chave copiada!' }); };

  const activeCount = keys.filter((k: any) => k.is_active).length;

  const columns: Column<any>[] = [
    { key: 'companies', label: 'Empresa', render: (row) => <Badge variant="outline"><Building2 className="h-3 w-3 mr-1" />{(row.companies as any)?.name || '—'}</Badge> },
    { key: 'name', label: 'Nome', sortable: true },
    {
      key: 'api_key', label: 'Chave API',
      render: (row) => (
        <div className="flex items-center gap-1 font-mono text-xs">
          <span>{revealedKeys.has(row.id) ? row.api_key : `${row.api_key.slice(0, 8)}...`}</span>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => toggleReveal(row.id)}>
            {revealedKeys.has(row.id) ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyKey(row.api_key)}>
            <Copy className="h-3 w-3" />
          </Button>
        </div>
      ),
    },
    {
      key: 'scopes', label: 'Escopos',
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {(row.scopes || []).map((s: string) => <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>)}
        </div>
      ),
    },
    { key: 'is_active', label: 'Ativa', render: (row) => <Switch checked={row.is_active} onCheckedChange={(v) => toggleMutation.mutate({ id: row.id, is_active: v })} /> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Chatbot Keys — Visão Global</h1>
          <p className="text-muted-foreground">Todas as chaves de API de todas as empresas</p>
        </div>
        <Select value={companyFilter} onValueChange={setCompanyFilter}>
          <SelectTrigger className="w-[220px]"><SelectValue placeholder="Filtrar empresa" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as empresas</SelectItem>
            {companies.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Key className="h-8 w-8 text-primary" /><div><p className="text-2xl font-bold">{keys.length}</p><p className="text-sm text-muted-foreground">Total</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-2xl font-bold text-green-500">{activeCount}</p><p className="text-sm text-muted-foreground">Ativas</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-2xl font-bold text-destructive">{keys.length - activeCount}</p><p className="text-sm text-muted-foreground">Revogadas</p></CardContent></Card>
      </div>

      <DataTable data={keys} columns={columns} searchKey="name" searchPlaceholder="Buscar chave..." loading={isLoading} emptyMessage="Nenhuma chave encontrada"
        actions={(row) => (
          <ConfirmDialog title="Revogar chave?" description="Esta ação é irreversível." onConfirm={() => deleteMutation.mutate(row.id)}
            trigger={<Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>} />
        )}
      />
    </div>
  );
}

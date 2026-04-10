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
import { Trash2, Bot, Building2, Brain, Zap } from 'lucide-react';

const PROVIDERS: Record<string, string> = { openai: 'OpenAI', google: 'Gemini', anthropic: 'Claude', lovable: 'Lovable AI' };

export default function AdminAIAgents() {
  const queryClient = useQueryClient();
  const [companyFilter, setCompanyFilter] = useState('all');

  const { data: companies = [] } = useQuery({
    queryKey: ['admin-companies'],
    queryFn: async () => {
      const { data } = await supabase.from('companies').select('id, name').order('name');
      return data || [];
    },
  });

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ['admin-ai-agents', companyFilter],
    queryFn: async () => {
      let q = supabase.from('ai_agents').select('*, companies(name)').order('created_at', { ascending: false });
      if (companyFilter !== 'all') q = q.eq('company_id', companyFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('ai_agents').update({ is_active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-ai-agents'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ai_agents').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-ai-agents'] }); toast({ title: 'Agente excluído' }); },
  });

  const activeCount = agents.filter((a: any) => a.is_active).length;
  const providerCount = new Set(agents.map((a: any) => a.provider)).size;

  const columns: Column<any>[] = [
    { key: 'companies', label: 'Empresa', render: (row) => <Badge variant="outline"><Building2 className="h-3 w-3 mr-1" />{(row.companies as any)?.name || '—'}</Badge> },
    { key: 'name', label: 'Nome', sortable: true },
    { key: 'provider', label: 'Provedor', render: (row) => <Badge variant="outline">{PROVIDERS[row.provider] || row.provider}</Badge> },
    { key: 'objective', label: 'Objetivo', render: (row) => <span className="line-clamp-1 max-w-[200px]">{row.objective || '—'}</span> },
    {
      key: 'tools', label: 'Capacidades',
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.understand_audio && <Badge variant="secondary" className="text-[10px]">🎤</Badge>}
          {row.understand_image && <Badge variant="secondary" className="text-[10px]">🖼️</Badge>}
          {row.function_calling && <Badge variant="secondary" className="text-[10px]">⚡</Badge>}
        </div>
      ),
    },
    { key: 'is_active', label: 'Ativo', render: (row) => <Switch checked={row.is_active} onCheckedChange={(v) => toggleMutation.mutate({ id: row.id, is_active: v })} /> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agentes IA — Visão Global</h1>
          <p className="text-muted-foreground">Todos os agentes de IA de todas as empresas</p>
        </div>
        <Select value={companyFilter} onValueChange={setCompanyFilter}>
          <SelectTrigger className="w-[220px]"><SelectValue placeholder="Filtrar empresa" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as empresas</SelectItem>
            {companies.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Bot className="h-8 w-8 text-primary" /><div><p className="text-2xl font-bold">{agents.length}</p><p className="text-sm text-muted-foreground">Total</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Zap className="h-8 w-8 text-green-500" /><div><p className="text-2xl font-bold">{activeCount}</p><p className="text-sm text-muted-foreground">Ativos</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-2xl font-bold text-muted-foreground">{agents.length - activeCount}</p><p className="text-sm text-muted-foreground">Inativos</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Brain className="h-8 w-8 text-purple-500" /><div><p className="text-2xl font-bold">{providerCount}</p><p className="text-sm text-muted-foreground">Provedores</p></div></div></CardContent></Card>
      </div>

      <DataTable data={agents} columns={columns} searchKey="name" searchPlaceholder="Buscar agente..." loading={isLoading} emptyMessage="Nenhum agente encontrado"
        actions={(row) => (
          <ConfirmDialog title="Excluir agente?" description="Esta ação é irreversível." onConfirm={() => deleteMutation.mutate(row.id)}
            trigger={<Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>} />
        )}
      />
    </div>
  );
}

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useResourceLimit, useFeatureEnabled } from '@/hooks/use-plan-enforcement';
import { LimitReachedBanner, FeatureLockedBanner, GuardedButton } from '@/components/PlanEnforcementGuard';
import { DataTable, Column } from '@/components/DataTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FlowCanvas } from '@/components/workflow/FlowCanvas';
import { toast } from '@/hooks/use-toast';
import { Plus, Trash2, GitBranch, ArrowLeft } from 'lucide-react';
import { type Node, type Edge } from '@xyflow/react';

export default function Workflows() {
  const { company } = useAuth();
  const wfFeature = useFeatureEnabled('workflows_enabled');
  const wfLimit = useResourceLimit('max_workflows', 'workflows');
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [editingWorkflow, setEditingWorkflow] = useState<any | null>(null);

  const { data: workflows = [], isLoading } = useQuery({
    queryKey: ['workflows', company?.id],
    queryFn: async () => {
      if (!company?.id) return [];
      const { data, error } = await supabase
        .from('workflows')
        .select('*')
        .eq('company_id', company.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!company?.id,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('workflows').insert({
        company_id: company!.id,
        name,
        description: description || null,
        definition: { nodes: [], edges: [] } as any,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      setCreateOpen(false);
      setName('');
      setDescription('');
      toast({ title: 'Workflow criado' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const saveMutation = useMutation({
    mutationFn: async ({ id, nodes, edges }: { id: string; nodes: Node[]; edges: Edge[] }) => {
      const { error } = await supabase.from('workflows').update({
        definition: { nodes, edges } as any,
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      toast({ title: 'Fluxo salvo com sucesso' });
    },
    onError: (e: any) => toast({ title: 'Erro ao salvar', description: e.message, variant: 'destructive' }),
  });

  const togglePublish = useMutation({
    mutationFn: async ({ id, is_published }: { id: string; is_published: boolean }) => {
      const { error } = await supabase.from('workflows').update({ is_published, is_active: is_published }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workflows'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('workflows').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      toast({ title: 'Workflow excluído' });
    },
  });

  // If editing a workflow, show the canvas
  if (editingWorkflow) {
    const def = editingWorkflow.definition as any;
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setEditingWorkflow(null)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">{editingWorkflow.name}</h1>
            <p className="text-sm text-muted-foreground">Arraste blocos para o canvas e conecte-os</p>
          </div>
        </div>
        <FlowCanvas
          initialNodes={def?.nodes || []}
          initialEdges={def?.edges || []}
          onSave={(nodes, edges) => saveMutation.mutate({ id: editingWorkflow.id, nodes, edges })}
          saving={saveMutation.isPending}
        />
      </div>
    );
  }

  const columns: Column<any>[] = [
    { key: 'name', label: 'Nome', sortable: true },
    { key: 'description', label: 'Descrição', render: (row) => row.description || '—' },
    {
      key: 'is_published', label: 'Status',
      render: (row) => (
        <Badge variant={row.is_published ? 'default' : 'secondary'}>
          {row.is_published ? 'Publicado' : 'Rascunho'}
        </Badge>
      ),
    },
    { key: 'version', label: 'Versão', render: (row) => `v${row.version}` },
    {
      key: 'is_active', label: 'Publicar',
      render: (row) => (
        <Switch
          checked={row.is_published}
          onCheckedChange={(v) => togglePublish.mutate({ id: row.id, is_published: v })}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Workflows</h1>
          <p className="text-muted-foreground">Construtor visual de fluxos de chatbot</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> Novo Workflow</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo Workflow</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Nome</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
              <div><Label>Descrição</Label><Input value={description} onChange={e => setDescription(e.target.value)} /></div>
              <Button onClick={() => createMutation.mutate()} disabled={!name || createMutation.isPending} className="w-full">
                Criar Workflow
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <DataTable
        data={workflows}
        columns={columns}
        searchKey="name"
        searchPlaceholder="Buscar workflow..."
        loading={isLoading}
        emptyMessage="Nenhum workflow criado"
        actions={(row) => (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => setEditingWorkflow(row)}>
              <GitBranch className="h-4 w-4 mr-1" /> Editar Fluxo
            </Button>
            <ConfirmDialog
              title="Excluir workflow?"
              description="Esta ação é irreversível."
              onConfirm={() => deleteMutation.mutate(row.id)}
              trigger={<Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>}
            />
          </div>
        )}
      />
    </div>
  );
}

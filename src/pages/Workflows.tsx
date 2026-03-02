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
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { toast } from '@/hooks/use-toast';
import { Plus, Trash2, Play, GitBranch, Zap, Filter, MessageSquare, ArrowRight } from 'lucide-react';

interface WorkflowBlock {
  id: string;
  type: 'trigger' | 'condition' | 'action';
  config: Record<string, any>;
}

const TRIGGERS = [
  { value: 'message_received', label: 'Mensagem recebida' },
  { value: 'tag_added', label: 'Tag adicionada' },
  { value: 'status_changed', label: 'Status alterado' },
];

const CONDITIONS = [
  { value: 'text_contains', label: 'Texto contém' },
  { value: 'time_range', label: 'Horário entre' },
  { value: 'has_tag', label: 'Possui tag' },
];

const ACTIONS = [
  { value: 'reply', label: 'Responder' },
  { value: 'forward', label: 'Encaminhar' },
  { value: 'call_webhook', label: 'Chamar webhook' },
  { value: 'add_tag', label: 'Marcar tag' },
];

export default function Workflows() {
  const { company } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [blocks, setBlocks] = useState<WorkflowBlock[]>([
    { id: '1', type: 'trigger', config: { event: 'message_received' } },
  ]);

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

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        company_id: company!.id,
        name,
        description: description || null,
        definition: { blocks } as any,
      };
      if (editId) {
        const { error } = await supabase.from('workflows').update(payload).eq('id', editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('workflows').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      resetForm();
      toast({ title: editId ? 'Workflow atualizado' : 'Workflow criado' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
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

  const resetForm = () => {
    setOpen(false);
    setEditId(null);
    setName('');
    setDescription('');
    setBlocks([{ id: '1', type: 'trigger', config: { event: 'message_received' } }]);
  };

  const openEdit = (wf: any) => {
    setEditId(wf.id);
    setName(wf.name);
    setDescription(wf.description || '');
    const def = wf.definition as any;
    setBlocks(def?.blocks || []);
    setOpen(true);
  };

  const addBlock = (type: WorkflowBlock['type']) => {
    setBlocks(prev => [...prev, { id: String(Date.now()), type, config: {} }]);
  };

  const updateBlock = (id: string, config: Record<string, any>) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, config: { ...b.config, ...config } } : b));
  };

  const removeBlock = (id: string) => {
    setBlocks(prev => prev.filter(b => b.id !== id));
  };

  const getBlockIcon = (type: string) => {
    switch (type) {
      case 'trigger': return <Zap className="h-4 w-4 text-warning" />;
      case 'condition': return <Filter className="h-4 w-4 text-primary" />;
      case 'action': return <MessageSquare className="h-4 w-4 text-success" />;
      default: return null;
    }
  };

  const getOptions = (type: string) => {
    switch (type) {
      case 'trigger': return TRIGGERS;
      case 'condition': return CONDITIONS;
      case 'action': return ACTIONS;
      default: return [];
    }
  };

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
          <p className="text-muted-foreground">Automações com gatilhos, condições e ações</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); else setOpen(true); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> Novo Workflow</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editId ? 'Editar Workflow' : 'Novo Workflow'}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Nome</Label>
                  <Input value={name} onChange={e => setName(e.target.value)} />
                </div>
                <div>
                  <Label>Descrição</Label>
                  <Input value={description} onChange={e => setDescription(e.target.value)} />
                </div>
              </div>

              <div className="space-y-3">
                <Label>Blocos do workflow</Label>
                {blocks.map((block, i) => (
                  <div key={block.id}>
                    {i > 0 && (
                      <div className="flex justify-center py-1">
                        <ArrowRight className="h-4 w-4 text-muted-foreground rotate-90" />
                      </div>
                    )}
                    <Card>
                      <CardContent className="p-3">
                        <div className="flex items-center gap-2 mb-2">
                          {getBlockIcon(block.type)}
                          <Badge variant="outline" className="capitalize">{block.type === 'trigger' ? 'Gatilho' : block.type === 'condition' ? 'Condição' : 'Ação'}</Badge>
                          {blocks.length > 1 && (
                            <Button variant="ghost" size="icon" className="h-6 w-6 ml-auto" onClick={() => removeBlock(block.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                        <Select
                          value={block.config.event || block.config.type || ''}
                          onValueChange={(v) => updateBlock(block.id, block.type === 'trigger' ? { event: v } : { type: v })}
                        >
                          <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                          <SelectContent>
                            {getOptions(block.type).map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {(block.type === 'condition' && block.config.type === 'text_contains') && (
                          <Input className="mt-2" placeholder="Texto a buscar..." value={block.config.value || ''} onChange={e => updateBlock(block.id, { value: e.target.value })} />
                        )}
                        {(block.type === 'action' && block.config.type === 'reply') && (
                          <Textarea className="mt-2" placeholder="Mensagem de resposta..." value={block.config.message || ''} onChange={e => updateBlock(block.id, { message: e.target.value })} />
                        )}
                        {(block.type === 'action' && block.config.type === 'call_webhook') && (
                          <Input className="mt-2" placeholder="URL do webhook..." value={block.config.url || ''} onChange={e => updateBlock(block.id, { url: e.target.value })} />
                        )}
                      </CardContent>
                    </Card>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => addBlock('condition')}>
                  <Filter className="h-3 w-3 mr-1" /> Condição
                </Button>
                <Button variant="outline" size="sm" onClick={() => addBlock('action')}>
                  <MessageSquare className="h-3 w-3 mr-1" /> Ação
                </Button>
              </div>

              <Button onClick={() => saveMutation.mutate()} disabled={!name || saveMutation.isPending} className="w-full">
                {editId ? 'Salvar' : 'Criar Workflow'}
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
            <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>Editar</Button>
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

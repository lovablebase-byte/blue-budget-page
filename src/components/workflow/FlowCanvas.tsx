import { useCallback, useState, useRef, DragEvent } from 'react';
import {
  ReactFlow,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  BackgroundVariant,
  MiniMap,
  type Connection,
  type Edge,
  type Node,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { nodeTypes, BLOCK_TYPES } from './FlowNodeTypes';
import { NodeConfigPanel } from './NodeConfigPanel';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Save, Play, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface FlowCanvasProps {
  initialNodes?: Node[];
  initialEdges?: Edge[];
  onSave: (nodes: Node[], edges: Edge[]) => void;
  saving?: boolean;
}

function validateFlow(nodes: Node[], edges: Edge[]) {
  const issues: string[] = [];
  const starts = nodes.filter(n => n.type === 'start');
  const ends = nodes.filter(n => n.type === 'end');
  if (starts.length === 0) issues.push('Adicione um bloco "Início"');
  if (starts.length > 1) issues.push('Apenas um bloco "Início" é permitido');
  if (ends.length === 0) issues.push('Adicione um bloco "Finalizar"');
  
  const connectedIds = new Set(edges.flatMap(e => [e.source, e.target]));
  const orphans = nodes.filter(n => !connectedIds.has(n.id) && nodes.length > 1);
  if (orphans.length > 0) issues.push(`${orphans.length} bloco(s) desconectado(s)`);
  
  return issues;
}

export function FlowCanvas({ initialNodes = [], initialEdges = [], onSave, saving }: FlowCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const [testOpen, setTestOpen] = useState(false);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  const onConnect = useCallback((params: Connection) => {
    setEdges(eds => addEdge({ ...params, animated: true, style: { stroke: 'hsl(var(--primary))' } }, eds));
  }, [setEdges]);

  const onNodeClick = useCallback((_: any, node: Node) => setSelectedNode(node), []);

  const updateNodeData = useCallback((id: string, data: Record<string, any>) => {
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, ...data } } : n));
    setSelectedNode(prev => prev && prev.id === id ? { ...prev, data: { ...prev.data, ...data } } : prev);
  }, [setNodes]);

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('application/reactflow');
    if (!type || !reactFlowInstance) return;
    const position = reactFlowInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const newNode: Node = {
      id: `${type}_${Date.now()}`,
      type,
      position,
      data: { message: '', delay: 0, options: [], seconds: 5, caption: '', media_url: '', department: '', condition: '' },
    };
    setNodes(nds => [...nds, newNode]);
  }, [reactFlowInstance, setNodes]);

  const onDragStart = (e: DragEvent, nodeType: string) => {
    e.dataTransfer.setData('application/reactflow', nodeType);
    e.dataTransfer.effectAllowed = 'move';
  };

  const issues = validateFlow(nodes, edges);

  // Simple test simulation
  const simulateFlow = () => {
    const startNode = nodes.find(n => n.type === 'start');
    if (!startNode) return [];

    const steps: { type: string; label: string; content: string }[] = [];
    const visited = new Set<string>();
    let current: string | null = startNode.id;

    while (current && !visited.has(current)) {
      visited.add(current);
      const node = nodes.find(n => n.id === current);
      if (!node) break;

      const d = node.data as any;
      let content = d.message || d.caption || d.condition || d.department || `${d.seconds}s`;
      // Replace variables with sample data
      content = content
        .replace(/\[wa_name\]/g, 'João')
        .replace(/\[phone\]/g, '5511999999999')
        .replace(/\[data\]/g, new Date().toLocaleDateString('pt-BR'))
        .replace(/\[hora\]/g, new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));

      const block = BLOCK_TYPES.find(b => b.type === node.type);
      steps.push({ type: node.type || '', label: block?.label || node.type || '', content });

      if (node.type === 'end') break;
      const edge = edges.find(e => e.source === current);
      current = edge ? edge.target : null;
    }
    return steps;
  };

  return (
    <div className="flex h-[calc(100vh-220px)] border rounded-lg overflow-hidden bg-background">
      {/* Sidebar blocks */}
      <div className="w-48 border-r border-border bg-card p-3 space-y-2 overflow-y-auto shrink-0">
        <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Blocos</p>
        {BLOCK_TYPES.map(block => (
          <div
            key={block.type}
            draggable
            onDragStart={e => onDragStart(e, block.type)}
            className="flex items-center gap-2 p-2 rounded-md border border-border bg-background cursor-grab hover:bg-accent transition-colors text-sm"
          >
            <block.icon className={`h-4 w-4 ${block.color}`} />
            {block.label}
          </div>
        ))}
      </div>

      {/* Canvas */}
      <div className="flex-1" ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={setReactFlowInstance}
          onNodeClick={onNodeClick}
          onPaneClick={() => setSelectedNode(null)}
          onDrop={onDrop}
          onDragOver={onDragOver}
          nodeTypes={nodeTypes}
          fitView
          deleteKeyCode={['Backspace', 'Delete']}
          className="bg-muted/30"
        >
          <Controls className="!bg-card !border-border !shadow-md" />
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} className="!bg-background" />
          <MiniMap className="!bg-card !border-border" />
          <Panel position="top-right">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setTestOpen(true)} disabled={issues.length > 0}>
                <Play className="h-4 w-4 mr-1" /> Testar Fluxo
              </Button>
              <Button onClick={() => onSave(nodes, edges)} disabled={saving} size="sm">
                <Save className="h-4 w-4 mr-1" /> {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </Panel>
          {issues.length > 0 && (
            <Panel position="bottom-left">
              <div className="bg-destructive/10 border border-destructive/30 rounded-md p-2 text-xs space-y-1 max-w-xs">
                {issues.map((issue, i) => (
                  <div key={i} className="flex items-center gap-1 text-destructive">
                    <AlertTriangle className="h-3 w-3 shrink-0" /> {issue}
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </ReactFlow>
      </div>

      {/* Config panel */}
      {selectedNode && (
        <NodeConfigPanel node={selectedNode} onUpdate={updateNodeData} onClose={() => setSelectedNode(null)} />
      )}

      {/* Test dialog */}
      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Simulação do Fluxo</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {simulateFlow().map((step, i) => (
              <div key={i} className="flex items-start gap-2 p-2 rounded border border-border">
                <Badge variant="outline" className="text-[10px] shrink-0">{step.label}</Badge>
                <p className="text-sm">{step.content}</p>
              </div>
            ))}
            {simulateFlow().length === 0 && <p className="text-sm text-muted-foreground">Nenhum passo encontrado.</p>}
            <div className="flex items-center gap-1 text-success text-sm pt-2">
              <CheckCircle2 className="h-4 w-4" /> Simulação concluída
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

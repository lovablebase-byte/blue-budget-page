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
import { Save } from 'lucide-react';

interface FlowCanvasProps {
  initialNodes?: Node[];
  initialEdges?: Edge[];
  onSave: (nodes: Node[], edges: Edge[]) => void;
  saving?: boolean;
}

export function FlowCanvas({ initialNodes = [], initialEdges = [], onSave, saving }: FlowCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);

  const onConnect = useCallback((params: Connection) => {
    setEdges(eds => addEdge({ ...params, animated: true, style: { stroke: 'hsl(var(--primary))' } }, eds));
  }, [setEdges]);

  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNode(node);
  }, []);

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
      data: { message: '', delay: 0, options: [], seconds: 5 },
    };
    setNodes(nds => [...nds, newNode]);
  }, [reactFlowInstance, setNodes]);

  const onDragStart = (e: DragEvent, nodeType: string) => {
    e.dataTransfer.setData('application/reactflow', nodeType);
    e.dataTransfer.effectAllowed = 'move';
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
            <Button onClick={() => onSave(nodes, edges)} disabled={saving} size="sm">
              <Save className="h-4 w-4 mr-1" /> {saving ? 'Salvando...' : 'Salvar Fluxo'}
            </Button>
          </Panel>
        </ReactFlow>
      </div>

      {/* Config panel */}
      {selectedNode && (
        <NodeConfigPanel
          node={selectedNode}
          onUpdate={updateNodeData}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  );
}

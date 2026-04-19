import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { MessageSquare, HelpCircle, GitBranch, Clock, UserCheck, XCircle, Play, List, Image } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const handleStyle = { width: 10, height: 10 };

function BaseNode({ label, icon: Icon, color, children, hasTarget = true, hasSource = true }: {
  label: string;
  icon: React.ElementType;
  color: string;
  children?: React.ReactNode;
  id?: string;
  hasTarget?: boolean;
  hasSource?: boolean;
}) {
  return (
    <div className={`rounded-lg border-2 bg-card shadow-md min-w-[200px] max-w-[260px] ${color}`}>
      {hasTarget && <Handle type="target" position={Position.Top} style={handleStyle} className="!bg-primary" />}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="text-sm font-semibold truncate">{label}</span>
      </div>
      <div className="px-3 py-2 text-xs text-muted-foreground space-y-1">
        {children}
      </div>
      {hasSource && <Handle type="source" position={Position.Bottom} style={handleStyle} className="!bg-primary" />}
    </div>
  );
}

export const StartNode = memo(({ data, id }: NodeProps) => (
  <BaseNode label="Início" icon={Play} color="border-success" hasTarget={false}>
    <p>{(data as any).message || 'Início do fluxo'}</p>
  </BaseNode>
));

export const MessageNode = memo(({ data, id }: NodeProps) => (
  <BaseNode label="Mensagem" icon={MessageSquare} color="border-blue-500" id={id}>
    <p className="line-clamp-2">{(data as any).message || 'Configurar mensagem...'}</p>
    {(data as any).delay > 0 && <Badge variant="outline" className="text-[10px]">Delay: {(data as any).delay}s</Badge>}
    {(data as any).media_url && <Badge variant="outline" className="text-[10px]">📎 Mídia</Badge>}
  </BaseNode>
));

export const QuestionNode = memo(({ data, id }: NodeProps) => (
  <BaseNode label="Pergunta" icon={HelpCircle} color="border-amber-500" id={id}>
    <p className="line-clamp-2">{(data as any).message || 'Configurar pergunta...'}</p>
    {(data as any).options?.length > 0 && (
      <div className="flex flex-wrap gap-1 mt-1">
        {((data as any).options as string[]).map((o, i) => (
          <Badge key={i} variant="secondary" className="text-[10px]">{o}</Badge>
        ))}
      </div>
    )}
  </BaseNode>
));

export const MenuNode = memo(({ data, id }: NodeProps) => (
  <BaseNode label="Menu" icon={List} color="border-cyan-500" id={id}>
    <p className="line-clamp-2">{(data as any).message || 'Configurar menu...'}</p>
    {(data as any).options?.length > 0 && (
      <div className="space-y-0.5 mt-1">
        {((data as any).options as string[]).map((o, i) => (
          <div key={i} className="text-[10px] bg-muted rounded px-1 py-0.5">{i + 1}. {o}</div>
        ))}
      </div>
    )}
  </BaseNode>
));

export const ConditionNode = memo(({ data, id }: NodeProps) => (
  <BaseNode label="Condição" icon={GitBranch} color="border-purple-500" id={id}>
    <p>{(data as any).condition || 'Configurar condição...'}</p>
    <div className="flex gap-1 mt-1">
      <Badge variant="default" className="text-[10px] bg-success text-success-foreground hover:bg-success/90">Sim</Badge>
      <Badge variant="destructive" className="text-[10px]">Não</Badge>
    </div>
  </BaseNode>
));

export const DelayNode = memo(({ data, id }: NodeProps) => (
  <BaseNode label="Delay" icon={Clock} color="border-orange-500" id={id}>
    <p>{(data as any).seconds || 5} segundos</p>
  </BaseNode>
));

export const ForwardNode = memo(({ data, id }: NodeProps) => (
  <BaseNode label="Transferir p/ Atendente" icon={UserCheck} color="border-success" id={id}>
    <p>{(data as any).department || 'Atendimento geral'}</p>
  </BaseNode>
));

export const MediaNode = memo(({ data, id }: NodeProps) => (
  <BaseNode label="Enviar Mídia" icon={Image} color="border-pink-500" id={id}>
    <p className="line-clamp-1">{(data as any).media_url || 'Configurar mídia...'}</p>
    {(data as any).caption && <p className="line-clamp-1 italic">{(data as any).caption}</p>}
  </BaseNode>
));

export const EndNode = memo(({ data, id }: NodeProps) => (
  <BaseNode label="Finalizar Fluxo" icon={XCircle} color="border-red-500" id={id} hasSource={false}>
    <p>{(data as any).message || 'Fluxo encerrado'}</p>
  </BaseNode>
));

export const nodeTypes = {
  start: StartNode,
  message: MessageNode,
  question: QuestionNode,
  menu: MenuNode,
  condition: ConditionNode,
  delay: DelayNode,
  forward: ForwardNode,
  media: MediaNode,
  end: EndNode,
};

export const BLOCK_TYPES = [
  { type: 'start', label: 'Início', icon: Play, color: 'text-success' },
  { type: 'message', label: 'Mensagem', icon: MessageSquare, color: 'text-blue-500' },
  { type: 'question', label: 'Pergunta', icon: HelpCircle, color: 'text-amber-500' },
  { type: 'menu', label: 'Menu', icon: List, color: 'text-cyan-500' },
  { type: 'condition', label: 'Condição', icon: GitBranch, color: 'text-purple-500' },
  { type: 'delay', label: 'Delay', icon: Clock, color: 'text-orange-500' },
  { type: 'forward', label: 'Transferir', icon: UserCheck, color: 'text-success' },
  { type: 'media', label: 'Enviar Mídia', icon: Image, color: 'text-pink-500' },
  { type: 'end', label: 'Finalizar', icon: XCircle, color: 'text-red-500' },
];

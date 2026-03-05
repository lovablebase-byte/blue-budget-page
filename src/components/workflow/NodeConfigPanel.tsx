import { useState, useEffect } from 'react';
import { type Node } from '@xyflow/react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { X, Plus, Trash2 } from 'lucide-react';

interface NodeConfigPanelProps {
  node: Node;
  onUpdate: (id: string, data: Record<string, any>) => void;
  onClose: () => void;
}

export function NodeConfigPanel({ node, onUpdate, onClose }: NodeConfigPanelProps) {
  const [data, setData] = useState<Record<string, any>>({ ...node.data });

  useEffect(() => {
    setData({ ...node.data });
  }, [node.id, node.data]);

  const update = (key: string, value: any) => {
    const next = { ...data, [key]: value };
    setData(next);
    onUpdate(node.id, next);
  };

  return (
    <div className="w-72 border-l border-border bg-card p-4 space-y-4 overflow-y-auto">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Configurar Bloco</h3>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {(node.type === 'message' || node.type === 'question' || node.type === 'end') && (
        <div>
          <Label>Mensagem</Label>
          <Textarea value={data.message || ''} onChange={e => update('message', e.target.value)} placeholder="Digite a mensagem..." rows={3} />
        </div>
      )}

      {(node.type === 'message' || node.type === 'question') && (
        <>
          <div>
            <Label>Delay (segundos)</Label>
            <Input type="number" min={0} value={data.delay || 0} onChange={e => update('delay', Number(e.target.value))} />
          </div>
          <div>
            <Label>URL da Mídia (opcional)</Label>
            <Input value={data.media_url || ''} onChange={e => update('media_url', e.target.value)} placeholder="https://..." />
          </div>
        </>
      )}

      {node.type === 'question' && (
        <div>
          <Label>Opções de resposta</Label>
          <div className="space-y-1 mt-1">
            {(data.options || []).map((opt: string, i: number) => (
              <div key={i} className="flex gap-1">
                <Input value={opt} onChange={e => {
                  const opts = [...(data.options || [])];
                  opts[i] = e.target.value;
                  update('options', opts);
                }} className="h-8 text-xs" />
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => {
                  const opts = (data.options || []).filter((_: any, j: number) => j !== i);
                  update('options', opts);
                }}><Trash2 className="h-3 w-3" /></Button>
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full" onClick={() => update('options', [...(data.options || []), ''])}>
              <Plus className="h-3 w-3 mr-1" /> Opção
            </Button>
          </div>
        </div>
      )}

      {node.type === 'condition' && (
        <div>
          <Label>Condição</Label>
          <Input value={data.condition || ''} onChange={e => update('condition', e.target.value)} placeholder="ex: contém 'sim'" />
        </div>
      )}

      {node.type === 'delay' && (
        <div>
          <Label>Segundos</Label>
          <Input type="number" min={1} value={data.seconds || 5} onChange={e => update('seconds', Number(e.target.value))} />
        </div>
      )}

      {node.type === 'forward' && (
        <div>
          <Label>Departamento</Label>
          <Input value={data.department || ''} onChange={e => update('department', e.target.value)} placeholder="Atendimento geral" />
        </div>
      )}
    </div>
  );
}

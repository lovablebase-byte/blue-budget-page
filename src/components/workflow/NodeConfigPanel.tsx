import { useState, useEffect } from 'react';
import { type Node } from '@xyflow/react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, Plus, Trash2 } from 'lucide-react';

interface NodeConfigPanelProps {
  node: Node;
  onUpdate: (id: string, data: Record<string, any>) => void;
  onClose: () => void;
}

const VARIABLES = [
  { token: '[wa_name]', label: 'Nome' },
  { token: '[phone]', label: 'Telefone' },
  { token: '[data]', label: 'Data' },
  { token: '[hora]', label: 'Hora' },
];

const messageTypes = ['start', 'message', 'question', 'menu', 'end', 'media'];
const hasDelay = ['message', 'question', 'menu', 'media'];
const hasMedia = ['message', 'question', 'media'];
const hasOptions = ['question', 'menu'];

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

  const insertVariable = (token: string) => {
    update('message', (data.message || '') + token);
  };

  const t = node.type || '';

  return (
    <div className="w-72 border-l border-border bg-card p-4 space-y-4 overflow-y-auto">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Configurar Bloco</h3>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Message field */}
      {messageTypes.includes(t) && (
        <div>
          <Label>{t === 'media' ? 'Legenda' : 'Mensagem'}</Label>
          <Textarea
            value={t === 'media' ? (data.caption || '') : (data.message || '')}
            onChange={e => update(t === 'media' ? 'caption' : 'message', e.target.value)}
            placeholder="Digite o texto..."
            rows={3}
          />
          <div className="flex flex-wrap gap-1 mt-2">
            {VARIABLES.map(v => (
              <Badge
                key={v.token}
                variant="outline"
                className="text-[10px] cursor-pointer hover:bg-accent"
                onClick={() => t === 'media' ? update('caption', (data.caption || '') + v.token) : insertVariable(v.token)}
              >
                {v.label}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Delay */}
      {hasDelay.includes(t) && (
        <div>
          <Label>Delay (segundos)</Label>
          <Input type="number" min={0} value={data.delay || 0} onChange={e => update('delay', Number(e.target.value))} />
        </div>
      )}

      {/* Media URL */}
      {hasMedia.includes(t) && (
        <div>
          <Label>URL da Mídia</Label>
          <Input value={data.media_url || ''} onChange={e => update('media_url', e.target.value)} placeholder="https://..." />
        </div>
      )}

      {/* Options (question / menu) */}
      {hasOptions.includes(t) && (
        <div>
          <Label>Opções</Label>
          <div className="space-y-1 mt-1">
            {(data.options || []).map((opt: string, i: number) => (
              <div key={i} className="flex gap-1">
                <Input value={opt} onChange={e => {
                  const opts = [...(data.options || [])];
                  opts[i] = e.target.value;
                  update('options', opts);
                }} className="h-8 text-xs" />
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => {
                  update('options', (data.options || []).filter((_: any, j: number) => j !== i));
                }}><Trash2 className="h-3 w-3" /></Button>
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full" onClick={() => update('options', [...(data.options || []), ''])}>
              <Plus className="h-3 w-3 mr-1" /> Opção
            </Button>
          </div>
        </div>
      )}

      {/* Condition */}
      {t === 'condition' && (
        <div>
          <Label>Condição</Label>
          <Input value={data.condition || ''} onChange={e => update('condition', e.target.value)} placeholder="ex: contém 'sim'" />
        </div>
      )}

      {/* Delay node */}
      {t === 'delay' && (
        <div>
          <Label>Segundos</Label>
          <Input type="number" min={1} value={data.seconds || 5} onChange={e => update('seconds', Number(e.target.value))} />
        </div>
      )}

      {/* Forward */}
      {t === 'forward' && (
        <div>
          <Label>Departamento</Label>
          <Input value={data.department || ''} onChange={e => update('department', e.target.value)} placeholder="Atendimento geral" />
        </div>
      )}
    </div>
  );
}

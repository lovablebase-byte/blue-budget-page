import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { DataTable, Column } from '@/components/DataTable';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  Plus, Trash2, Edit, MoreHorizontal, Loader2,
  MessageSquare, Smartphone, Image, Clock, Link2, Eye,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ChatbotKeyword {
  id: string;
  company_id: string;
  instance_id: string | null;
  keywords: string[];
  response: string;
  match_type: string;
  audience: string;
  delay_seconds: number;
  save_history: boolean;
  media_url: string | null;
  chain_to_id: string | null;
  is_active: boolean;
  created_at: string;
}

interface InstanceOption { id: string; name: string; }

const MATCH_TYPES = [
  { value: 'contains', label: 'Contém na mensagem' },
  { value: 'exact', label: 'Mensagem exata' },
];

const AUDIENCE_TYPES = [
  { value: 'private', label: 'Privado' },
  { value: 'groups', label: 'Grupos' },
  { value: 'all', label: 'Todos' },
];

export default function ChatbotKeywords() {
  const { company, hasPermission, isReadOnly } = useAuth();
  const [items, setItems] = useState<ChatbotKeyword[]>([]);
  const [instances, setInstances] = useState<InstanceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [selected, setSelected] = useState<ChatbotKeyword | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Form
  const [keywords, setKeywords] = useState('');
  const [response, setResponse] = useState('');
  const [instanceId, setInstanceId] = useState('');
  const [matchType, setMatchType] = useState('contains');
  const [audience, setAudience] = useState('private');
  const [delaySeconds, setDelaySeconds] = useState(2);
  const [saveHistory, setSaveHistory] = useState(true);
  const [mediaUrl, setMediaUrl] = useState('');
  const [chainToId, setChainToId] = useState('');
  const [isActive, setIsActive] = useState(true);

  const fetchData = async () => {
    if (!company) return;
    setLoading(true);
    const [{ data: bots }, { data: inst }] = await Promise.all([
      supabase.from('chatbot_keywords').select('*').eq('company_id', company.id).order('created_at', { ascending: false }),
      supabase.from('instances').select('id, name').eq('company_id', company.id).order('name'),
    ]);
    setItems((bots as ChatbotKeyword[]) || []);
    setInstances((inst as InstanceOption[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [company]);

  const resetForm = () => {
    setKeywords(''); setResponse(''); setInstanceId(''); setMatchType('contains');
    setAudience('private'); setDelaySeconds(2); setSaveHistory(true);
    setMediaUrl(''); setChainToId(''); setIsActive(true);
  };

  const openEdit = (item: ChatbotKeyword) => {
    setSelected(item);
    setKeywords(item.keywords?.join(', ') || '');
    setResponse(item.response);
    setInstanceId(item.instance_id || '');
    setMatchType(item.match_type);
    setAudience(item.audience);
    setDelaySeconds(item.delay_seconds);
    setSaveHistory(item.save_history);
    setMediaUrl(item.media_url || '');
    setChainToId(item.chain_to_id || '');
    setIsActive(item.is_active);
    setShowForm(true);
  };

  const openNew = () => { setSelected(null); resetForm(); setShowForm(true); };

  const handleSave = async () => {
    if (!company || !keywords.trim() || !response.trim()) return;
    setSaving(true);
    try {
      const payload: any = {
        company_id: company.id,
        instance_id: instanceId || null,
        keywords: keywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean),
        response,
        match_type: matchType,
        audience,
        delay_seconds: delaySeconds,
        save_history: saveHistory,
        media_url: mediaUrl.trim() || null,
        chain_to_id: chainToId || null,
        is_active: isActive,
      };
      if (selected) {
        const { error } = await supabase.from('chatbot_keywords').update(payload).eq('id', selected.id);
        if (error) throw error;
        toast.success('Chatbot atualizado!');
      } else {
        const { error } = await supabase.from('chatbot_keywords').insert(payload);
        if (error) throw error;
        toast.success('Chatbot criado!');
      }
      setShowForm(false);
      resetForm();
      fetchData();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!selected) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('chatbot_keywords').delete().eq('id', selected.id);
      if (error) throw error;
      toast.success('Chatbot excluído');
      setShowDelete(false); setSelected(null); fetchData();
    } catch (e: any) { toast.error(e.message); } finally { setDeleting(false); }
  };

  const getInstanceName = (id: string | null) => {
    if (!id) return 'Todas';
    return instances.find(i => i.id === id)?.name || '—';
  };

  const getChainName = (id: string | null) => {
    if (!id) return null;
    const item = items.find(i => i.id === id);
    return item ? item.keywords?.slice(0, 2).join(', ') : '—';
  };

  const columns: Column<ChatbotKeyword>[] = [
    {
      key: 'keywords', label: 'Palavras-chave', render: (r) => (
        <div className="flex flex-wrap gap-1 max-w-[200px]">
          {r.keywords?.slice(0, 3).map(k => (
            <Badge key={k} variant="outline" className="text-xs">{k}</Badge>
          ))}
          {(r.keywords?.length || 0) > 3 && (
            <Badge variant="secondary" className="text-xs">+{r.keywords.length - 3}</Badge>
          )}
        </div>
      ),
    },
    {
      key: 'response', label: 'Resposta', render: (r) =>
        <span className="truncate max-w-[180px] block text-sm text-muted-foreground">{r.response}</span>
    },
    {
      key: 'instance_id', label: 'Instância', render: (r) =>
        <Badge variant="outline" className="text-xs">{getInstanceName(r.instance_id)}</Badge>
    },
    {
      key: 'match_type', label: 'Tipo', render: (r) =>
        <Badge variant="secondary" className="text-xs">
          {r.match_type === 'exact' ? 'Exata' : 'Contém'}
        </Badge>
    },
    {
      key: 'audience', label: 'Público', render: (r) =>
        <span className="text-xs text-muted-foreground capitalize">{r.audience === 'private' ? 'Privado' : r.audience === 'groups' ? 'Grupos' : 'Todos'}</span>
    },
    {
      key: 'is_active', label: 'Ativo', render: (r) =>
        <Badge variant={r.is_active ? 'default' : 'secondary'}>{r.is_active ? 'Sim' : 'Não'}</Badge>
    },
  ];

  const activeCount = items.filter(i => i.is_active).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Chatbot por Palavras-chave</h1>
          <p className="text-muted-foreground">Respostas automáticas baseadas em palavras detectadas nas mensagens</p>
        </div>
        {hasPermission('chatbot_keys', 'create') && !isReadOnly && (
          <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Novo chatbot</Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total de regras</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{items.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Ativas</CardTitle>
            <MessageSquare className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-primary">{activeCount}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Palavras-chave</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {items.reduce((acc, i) => acc + (i.keywords?.length || 0), 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      <DataTable
        data={items} columns={columns} searchKey="response"
        searchPlaceholder="Buscar chatbot..." loading={loading}
        emptyMessage="Nenhum chatbot configurado."
        actions={(row) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => openEdit(row)}><Edit className="mr-2 h-4 w-4" /> Editar</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={() => { setSelected(row); setShowDelete(true); }}>
                <Trash2 className="mr-2 h-4 w-4" /> Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      />

      {/* Form */}
      <Dialog open={showForm} onOpenChange={(o) => { setShowForm(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selected ? 'Editar' : 'Novo'} chatbot</DialogTitle>
            <DialogDescription>Configure respostas automáticas por palavras-chave</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Instância</Label>
              <Select value={instanceId || 'all'} onValueChange={v => setInstanceId(v === 'all' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Todas as instâncias" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as instâncias</SelectItem>
                  {instances.map(inst => (
                    <SelectItem key={inst.id} value={inst.id}>{inst.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Palavras-chave *</Label>
              <Input
                value={keywords} onChange={e => setKeywords(e.target.value)}
                placeholder="preço, valor, cardápio, horário"
              />
              <p className="text-xs text-muted-foreground">Separe por vírgula. Se qualquer palavra for detectada, a resposta será enviada</p>
            </div>

            <div className="space-y-2">
              <Label>Resposta *</Label>
              <Textarea
                value={response} onChange={e => setResponse(e.target.value)} rows={4}
                placeholder="Nosso cardápio está disponível em: https://exemplo.com/cardapio"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Tipo de ativação</Label>
                <Select value={matchType} onValueChange={setMatchType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MATCH_TYPES.map(m => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Público alvo</Label>
                <Select value={audience} onValueChange={setAudience}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AUDIENCE_TYPES.map(a => (
                      <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Delay da resposta (segundos)</Label>
              <Input type="number" min={0} value={delaySeconds} onChange={e => setDelaySeconds(Number(e.target.value))} />
              <p className="text-xs text-muted-foreground">Aguarda {delaySeconds}s antes de enviar para parecer mais natural</p>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><Image className="h-3.5 w-3.5" /> Mídia (opcional)</Label>
              <Input value={mediaUrl} onChange={e => setMediaUrl(e.target.value)} placeholder="https://exemplo.com/imagem.jpg" />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><Link2 className="h-3.5 w-3.5" /> Encadear com outro chatbot</Label>
              <Select value={chainToId || 'none'} onValueChange={v => setChainToId(v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {items.filter(i => i.id !== selected?.id).map(item => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.keywords?.slice(0, 2).join(', ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Após responder, ativa outro chatbot automaticamente</p>
            </div>

            <Separator />

            <div className="flex items-center gap-2">
              <Switch checked={saveHistory} onCheckedChange={setSaveHistory} />
              <Label>Salvar resposta no histórico</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <Label>Chatbot ativo</Label>
            </div>

            <Button onClick={handleSave} disabled={saving || !keywords.trim() || !response.trim()} className="w-full">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar chatbot
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={showDelete} onOpenChange={setShowDelete} title="Excluir chatbot"
        description={`Excluir este chatbot? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir" variant="destructive" onConfirm={handleDelete} loading={deleting} />
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  Plus, RefreshCw, Trash2, QrCode, Send, Power, PowerOff,
  MoreHorizontal, Eye, Loader2, Smartphone, Wifi, WifiOff, AlertCircle,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Instance {
  id: string;
  name: string;
  phone_number: string | null;
  status: string;
  webhook_url: string | null;
  tags: string[];
  timezone: string;
  reconnect_policy: string;
  last_connected_at: string | null;
  created_at: string;
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof Wifi }> = {
  online: { label: 'Online', variant: 'default', icon: Wifi },
  offline: { label: 'Offline', variant: 'secondary', icon: WifiOff },
  pairing: { label: 'Pareando', variant: 'outline', icon: QrCode },
  error: { label: 'Erro', variant: 'destructive', icon: AlertCircle },
};

export default function Instances() {
  const { company, hasPermission, isReadOnly } = useAuth();
  const navigate = useNavigate();
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showTestMsg, setShowTestMsg] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [selectedInstance, setSelectedInstance] = useState<Instance | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Form states
  const [newName, setNewName] = useState('');
  const [newTags, setNewTags] = useState('');
  const [newTimezone, setNewTimezone] = useState('America/Sao_Paulo');
  const [newReconnect, setNewReconnect] = useState('auto');
  const [testNumber, setTestNumber] = useState('');
  const [testMessage, setTestMessage] = useState('');
  const [sendingTest, setSendingTest] = useState(false);

  const fetchInstances = async () => {
    if (!company) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('instances')
      .select('*')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false });
    if (error) toast.error(error.message);
    else setInstances((data as Instance[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchInstances(); }, [company]);

  const handleCreate = async () => {
    if (!company || !newName.trim()) return;
    setCreating(true);
    try {
      const webhookUrl = `${window.location.origin}/api/webhooks/${company.slug}`;
      const { error } = await supabase.from('instances').insert({
        company_id: company.id,
        name: newName.trim(),
        webhook_url: webhookUrl,
        tags: newTags ? newTags.split(',').map(t => t.trim()) : [],
        timezone: newTimezone,
        reconnect_policy: newReconnect,
      });
      if (error) throw error;
      toast.success('Instância criada com sucesso!');
      setShowCreate(false);
      setNewName(''); setNewTags('');
      fetchInstances();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedInstance) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('instances').delete().eq('id', selectedInstance.id);
      if (error) throw error;
      toast.success('Instância excluída');
      setShowDelete(false);
      setSelectedInstance(null);
      fetchInstances();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleStatusChange = async (instance: Instance, newStatus: string) => {
    const { error } = await supabase.from('instances').update({ status: newStatus }).eq('id', instance.id);
    if (error) toast.error(error.message);
    else {
      toast.success(`Status alterado para ${newStatus}`);
      fetchInstances();
    }
  };

  const handleSendTest = async () => {
    if (!testNumber || !testMessage) return;
    setSendingTest(true);
    // In production, this calls the Evolution API via edge function
    setTimeout(() => {
      toast.success('Mensagem teste enviada (simulação)');
      setSendingTest(false);
      setShowTestMsg(false);
      setTestNumber(''); setTestMessage('');
    }, 1000);
  };

  const columns: Column<Instance>[] = [
    { key: 'name', label: 'Nome', sortable: true },
    { key: 'phone_number', label: 'Número', render: (r) => r.phone_number || '—' },
    {
      key: 'status', label: 'Status', render: (r) => {
        const cfg = statusConfig[r.status] || statusConfig.offline;
        const Icon = cfg.icon;
        return (
          <Badge variant={cfg.variant} className="gap-1">
            <Icon className="h-3 w-3" /> {cfg.label}
          </Badge>
        );
      }
    },
    {
      key: 'tags', label: 'Tags', render: (r) =>
        r.tags?.length ? r.tags.map(t => <Badge key={t} variant="outline" className="mr-1 text-xs">{t}</Badge>) : '—'
    },
    {
      key: 'last_connected_at', label: 'Última conexão', render: (r) =>
        r.last_connected_at ? new Date(r.last_connected_at).toLocaleString('pt-BR') : 'Nunca'
    },
  ];

  const canCreate = hasPermission('instances', 'create');
  const canDelete = hasPermission('instances', 'delete');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Instâncias WhatsApp</h1>
          <p className="text-muted-foreground">Gerencie suas conexões do WhatsApp</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchInstances}>
            <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
          </Button>
          {canCreate && !isReadOnly && (
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-1" /> Nova instância
            </Button>
          )}
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <Smartphone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{instances.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Online</CardTitle>
            <Wifi className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{instances.filter(i => i.status === 'online').length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Offline</CardTitle>
            <WifiOff className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{instances.filter(i => i.status === 'offline').length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Data table */}
      <DataTable
        data={instances}
        columns={columns}
        searchKey="name"
        searchPlaceholder="Buscar instância..."
        loading={loading}
        emptyMessage="Nenhuma instância criada ainda."
        actions={(row) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => { setSelectedInstance(row); setShowQR(true); }}>
                <QrCode className="mr-2 h-4 w-4" /> Parear QR Code
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setSelectedInstance(row); setShowTestMsg(true); }}>
                <Send className="mr-2 h-4 w-4" /> Enviar teste
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {row.status === 'online' ? (
                <DropdownMenuItem onClick={() => handleStatusChange(row, 'offline')}>
                  <PowerOff className="mr-2 h-4 w-4" /> Desconectar
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => handleStatusChange(row, 'online')}>
                  <Power className="mr-2 h-4 w-4" /> Reconectar
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => navigate(`/instances/${row.id}`)}>
                <Eye className="mr-2 h-4 w-4" /> Ver detalhes
              </DropdownMenuItem>
              {canDelete && !isReadOnly && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive" onClick={() => { setSelectedInstance(row); setShowDelete(true); }}>
                    <Trash2 className="mr-2 h-4 w-4" /> Excluir
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      />

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova instância</DialogTitle>
            <DialogDescription>Crie uma nova conexão WhatsApp</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome amigável *</Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ex: Suporte Principal" />
            </div>
            <div className="space-y-2">
              <Label>Tags (separadas por vírgula)</Label>
              <Input value={newTags} onChange={e => setNewTags(e.target.value)} placeholder="suporte, vendas" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fuso horário</Label>
                <Select value={newTimezone} onValueChange={setNewTimezone}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['America/Sao_Paulo','America/Manaus','America/Fortaleza','America/Cuiaba'].map(tz => (
                      <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Reconexão</Label>
                <Select value={newReconnect} onValueChange={setNewReconnect}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Automática</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={handleCreate} disabled={creating || !newName.trim()} className="w-full">
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Criar instância
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* QR Code dialog */}
      <Dialog open={showQR} onOpenChange={setShowQR}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Parear WhatsApp</DialogTitle>
            <DialogDescription>Escaneie o QR Code com o WhatsApp no celular</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="w-64 h-64 bg-muted rounded-lg flex items-center justify-center border-2 border-dashed border-border">
              <div className="text-center text-muted-foreground">
                <QrCode className="h-16 w-16 mx-auto mb-2" />
                <p className="text-sm">QR Code aparecerá aqui</p>
                <p className="text-xs">Conecte a Evolution API para gerar</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Instância: <strong>{selectedInstance?.name}</strong>
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Test message dialog */}
      <Dialog open={showTestMsg} onOpenChange={setShowTestMsg}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar mensagem teste</DialogTitle>
            <DialogDescription>Envie uma mensagem de teste via {selectedInstance?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Número (com DDI)</Label>
              <Input value={testNumber} onChange={e => setTestNumber(e.target.value)} placeholder="5511999999999" />
            </div>
            <div className="space-y-2">
              <Label>Mensagem</Label>
              <Textarea value={testMessage} onChange={e => setTestMessage(e.target.value)} placeholder="Olá! Esta é uma mensagem de teste." rows={3} />
            </div>
            <Button onClick={handleSendTest} disabled={sendingTest || !testNumber || !testMessage} className="w-full">
              {sendingTest && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Send className="mr-2 h-4 w-4" /> Enviar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <ConfirmDialog
        open={showDelete}
        onOpenChange={setShowDelete}
        title="Excluir instância"
        description={`Tem certeza que deseja excluir "${selectedInstance?.name}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        variant="destructive"
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}

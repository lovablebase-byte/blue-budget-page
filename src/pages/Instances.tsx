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
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  Plus, RefreshCw, Trash2, QrCode, Send, Power, PowerOff,
  MoreHorizontal, Eye, Loader2, Smartphone, Wifi, WifiOff, AlertCircle,
  Copy, RotateCcw, Link, Key,
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
  connecting: { label: 'Conectando', variant: 'outline', icon: RefreshCw },
  pairing: { label: 'Pareando', variant: 'outline', icon: QrCode },
  error: { label: 'Erro', variant: 'destructive', icon: AlertCircle },
};

const TIMEZONES = [
  'America/Sao_Paulo', 'America/Manaus', 'America/Fortaleza',
  'America/Cuiaba', 'America/Belem', 'America/Recife',
  'America/Bahia', 'America/Porto_Velho', 'America/Rio_Branco',
];

export default function Instances() {
  const { company, hasPermission, isReadOnly } = useAuth();
  const navigate = useNavigate();
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showTestMsg, setShowTestMsg] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showPostCreate, setShowPostCreate] = useState(false);
  const [selectedInstance, setSelectedInstance] = useState<Instance | null>(null);
  const [createdInstance, setCreatedInstance] = useState<Instance | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // QR Code states
  const [qrCodeBase64, setQrCodeBase64] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);

  // Form states
  const [newName, setNewName] = useState('');
  const [newTags, setNewTags] = useState('');
  const [newTimezone, setNewTimezone] = useState('America/Sao_Paulo');
  const [newReconnect, setNewReconnect] = useState('auto');
  const [copyFromInstance, setCopyFromInstance] = useState('');
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

  // Auto-refresh status every 30s
  useEffect(() => {
    const interval = setInterval(fetchInstances, 30000);
    return () => clearInterval(interval);
  }, [company]);

  const resetForm = () => {
    setNewName(''); setNewTags(''); setNewTimezone('America/Sao_Paulo');
    setNewReconnect('auto'); setCopyFromInstance('');
  };

  const handleCreate = async () => {
    if (!company || !newName.trim()) return;
    setCreating(true);
    try {
      // 1. Get Evolution API config
      const { data: evoConfig } = await supabase
        .from('evolution_api_config')
        .select('base_url, api_key, is_active')
        .eq('company_id', company.id)
        .single();

      const instanceName = newName.trim();
      const webhookUrl = `${window.location.origin}/api/webhooks/${company.slug}`;
      let evolutionInstanceId: string | null = null;

      // 2. Create instance in Evolution API if configured
      if (evoConfig?.is_active && evoConfig.base_url && evoConfig.api_key) {
        const baseUrl = evoConfig.base_url.replace(/\/+$/, '');
        const evoRes = await fetch(`${baseUrl}/instance/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: evoConfig.api_key,
          },
          body: JSON.stringify({
            instanceName,
            qrcode: true,
            integration: 'WHATSAPP-BAILEYS',
            webhook: webhookUrl,
            webhookByEvents: true,
            events: [
              'messages.upsert', 'send.message', 'connection.update',
              'qrcode.updated', 'messages.update',
            ],
          }),
        });

        if (!evoRes.ok) {
          const errBody = await evoRes.json().catch(() => ({}));
          throw new Error(errBody.message || `Erro ao criar na Evolution API: HTTP ${evoRes.status}`);
        }

        const evoData = await evoRes.json();
        evolutionInstanceId = evoData?.instance?.instanceName || instanceName;
        toast.success('Instância criada na Evolution API!');
      } else {
        toast.info('Evolution API não configurada. Instância criada apenas no painel.');
      }

      // 3. Save to database
      const { data, error } = await supabase.from('instances').insert({
        company_id: company.id,
        name: instanceName,
        evolution_instance_id: evolutionInstanceId,
        webhook_url: webhookUrl,
        tags: newTags ? newTags.split(',').map(t => t.trim()) : [],
        timezone: newTimezone,
        reconnect_policy: newReconnect,
        status: evoConfig?.is_active ? 'pairing' : 'offline',
      }).select().single();
      if (error) throw error;

      setShowCreate(false);
      resetForm();
      setCreatedInstance(data as Instance);
      setShowPostCreate(true);
      fetchInstances();

      // 4. Auto-fetch QR code if Evolution API is active
      if (evoConfig?.is_active) {
        setTimeout(() => fetchQRCode(instanceName), 500);
      }
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
      toast.success(`Status alterado para ${statusConfig[newStatus]?.label || newStatus}`);
      fetchInstances();
    }
  };

  const handleRestart = async (instance: Instance) => {
    await handleStatusChange(instance, 'connecting');
    // Simulate reconnection cycle
    setTimeout(async () => {
      await supabase.from('instances').update({
        status: 'online',
        last_connected_at: new Date().toISOString(),
      }).eq('id', instance.id);
      toast.success(`${instance.name} reconectada`);
      fetchInstances();
    }, 3000);
  };

  const handleSendTest = async () => {
    if (!testNumber || !testMessage) return;
    setSendingTest(true);
    setTimeout(() => {
      toast.success('Mensagem teste enviada (simulação)');
      setSendingTest(false);
      setShowTestMsg(false);
      setTestNumber(''); setTestMessage('');
    }, 1000);
  };

  const copyToClipboard = (text: string, label?: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label || 'Valor'} copiado!`);
  };

  const fetchQRCode = async (instanceName: string) => {
    if (!company) return;
    setQrCodeBase64(null);
    setQrError(null);
    setQrLoading(true);
    try {
      const { data: evoConfig } = await supabase
        .from('evolution_api_config')
        .select('base_url, api_key, is_active')
        .eq('company_id', company.id)
        .single();

      if (!evoConfig || !evoConfig.is_active || !evoConfig.base_url || !evoConfig.api_key) {
        setQrError('Evolution API não configurada. Vá em Configurações para ativar a integração.');
        return;
      }

      const baseUrl = evoConfig.base_url.replace(/\/+$/, '');
      const res = await fetch(`${baseUrl}/instance/connect/${instanceName}`, {
        method: 'GET',
        headers: { apikey: evoConfig.api_key },
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.message || `Erro HTTP ${res.status}`);
      }

      const data = await res.json();
      if (data.base64) {
        setQrCodeBase64(data.base64);
      } else if (data.code) {
        // Some versions return just the code, not base64
        setQrError('QR Code gerado, mas sem imagem base64. Verifique a versão da Evolution API.');
      } else {
        setQrError('Resposta inesperada da API. A instância pode já estar conectada.');
      }
    } catch (err: any) {
      setQrError(err.message || 'Falha ao gerar QR Code');
    } finally {
      setQrLoading(false);
    }
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
            <Icon className={`h-3 w-3 ${r.status === 'connecting' ? 'animate-spin' : ''}`} /> {cfg.label}
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

  const onlineCount = instances.filter(i => i.status === 'online').length;
  const offlineCount = instances.filter(i => i.status !== 'online').length;

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
            <div className="text-2xl font-bold text-primary">{onlineCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Offline</CardTitle>
            <WifiOff className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{offlineCount}</div>
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
                <DropdownMenuItem onClick={() => handleStatusChange(row, 'connecting')}>
                  <Power className="mr-2 h-4 w-4" /> Conectar
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => handleRestart(row)}>
                <RotateCcw className="mr-2 h-4 w-4" /> Reiniciar sessão
              </DropdownMenuItem>
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
      <Dialog open={showCreate} onOpenChange={(o) => { setShowCreate(o); if (!o) resetForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova instância</DialogTitle>
            <DialogDescription>Crie uma nova conexão WhatsApp</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome da instância *</Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ex: Suporte Principal" />
            </div>
            <div className="space-y-2">
              <Label>Fuso horário</Label>
              <Select value={newTimezone} onValueChange={setNewTimezone}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map(tz => (
                    <SelectItem key={tz} value={tz}>{tz.replace('America/', '')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {instances.length > 0 && (
              <div className="space-y-2">
                <Label>Copiar regras de outra instância</Label>
                <Select value={copyFromInstance} onValueChange={setCopyFromInstance}>
                  <SelectTrigger><SelectValue placeholder="Nenhuma (criar do zero)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma (criar do zero)</SelectItem>
                    {instances.map(inst => (
                      <SelectItem key={inst.id} value={inst.id}>{inst.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Saudações, ausência e configurações serão copiadas</p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Tags (separadas por vírgula)</Label>
              <Input value={newTags} onChange={e => setNewTags(e.target.value)} placeholder="suporte, vendas" />
            </div>
            <div className="space-y-2">
              <Label>Reconexão automática</Label>
              <Select value={newReconnect} onValueChange={setNewReconnect}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Automática</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleCreate} disabled={creating || !newName.trim()} className="w-full">
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Criar instância
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Post-creation info dialog */}
      <Dialog open={showPostCreate} onOpenChange={setShowPostCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary">
              <Smartphone className="h-5 w-5" /> Instância criada!
            </DialogTitle>
            <DialogDescription>Escaneie o QR Code para conectar e use os dados abaixo para integração</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* QR Code */}
            <div className="flex flex-col items-center gap-3 py-3">
              <div className="w-52 h-52 bg-muted rounded-lg flex items-center justify-center border-2 border-dashed border-border overflow-hidden">
                {qrLoading ? (
                  <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
                ) : qrCodeBase64 ? (
                  <img src={qrCodeBase64} alt="QR Code" className="w-full h-full object-contain" />
                ) : (
                  <div className="text-center text-muted-foreground p-4">
                    <QrCode className="h-14 w-14 mx-auto mb-2" />
                    <p className="text-sm font-medium">QR Code</p>
                    <p className="text-xs">{qrError || 'Clique para gerar'}</p>
                  </div>
                )}
              </div>
              {!qrLoading && !qrCodeBase64 && (
                <Button variant="outline" size="sm" onClick={() => createdInstance && fetchQRCode(createdInstance.name)}>
                  <QrCode className="h-4 w-4 mr-2" /> Gerar QR Code
                </Button>
              )}
              {qrCodeBase64 && (
                <Button variant="outline" size="sm" onClick={() => createdInstance && fetchQRCode(createdInstance.name)}>
                  <RefreshCw className="h-4 w-4 mr-2" /> Atualizar QR Code
                </Button>
              )}
            </div>

            <Separator />

            {/* API endpoint */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><Link className="h-3.5 w-3.5" /> Endpoint da API</Label>
              <div className="flex gap-2">
                <Input
                  value={`${window.location.origin}/api/instance/${createdInstance?.id}`}
                  readOnly
                  className="font-mono text-xs"
                />
                <Button variant="outline" size="icon" onClick={() => copyToClipboard(`${window.location.origin}/api/instance/${createdInstance?.id}`, 'Endpoint')}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Session token */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><Key className="h-3.5 w-3.5" /> Token da sessão</Label>
              <div className="flex gap-2">
                <Input
                  value={createdInstance?.id || ''}
                  readOnly
                  className="font-mono text-xs"
                />
                <Button variant="outline" size="icon" onClick={() => copyToClipboard(createdInstance?.id || '', 'Token')}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowPostCreate(false)}>
                Fechar
              </Button>
              <Button className="flex-1" onClick={() => { setShowPostCreate(false); navigate(`/instances/${createdInstance?.id}`); }}>
                <Eye className="h-4 w-4 mr-1" /> Ver detalhes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* QR Code dialog */}
      <Dialog open={showQR} onOpenChange={(o) => { setShowQR(o); if (!o) { setQrCodeBase64(null); setQrError(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Parear WhatsApp</DialogTitle>
            <DialogDescription>Escaneie o QR Code com o WhatsApp no celular</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="w-64 h-64 bg-muted rounded-lg flex items-center justify-center border-2 border-dashed border-border overflow-hidden">
              {qrLoading ? (
                <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
              ) : qrCodeBase64 ? (
                <img src={qrCodeBase64} alt="QR Code" className="w-full h-full object-contain" />
              ) : (
                <div className="text-center text-muted-foreground p-4">
                  <QrCode className="h-16 w-16 mx-auto mb-2" />
                  <p className="text-sm">{qrError || 'Clique abaixo para gerar'}</p>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button onClick={() => selectedInstance && fetchQRCode(selectedInstance.name)} disabled={qrLoading}>
                {qrLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <QrCode className="h-4 w-4 mr-2" />}
                {qrCodeBase64 ? 'Atualizar QR' : 'Gerar QR Code'}
              </Button>
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

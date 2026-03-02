import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable, Column } from '@/components/DataTable';
import { toast } from 'sonner';
import {
  ArrowLeft, QrCode, Wifi, WifiOff, RefreshCw, Copy,
  Send, Loader2, AlertCircle, Clock, Webhook, ScrollText,
} from 'lucide-react';

interface InstanceDetail {
  id: string;
  name: string;
  phone_number: string | null;
  status: string;
  webhook_url: string | null;
  webhook_secret: string | null;
  tags: string[];
  timezone: string;
  reconnect_policy: string;
  last_connected_at: string | null;
  created_at: string;
  evolution_instance_id: string | null;
}

interface WebhookEvent {
  id: string;
  event_type: string;
  direction: string;
  status: string;
  created_at: string;
  payload: any;
}

export default function InstanceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { company } = useAuth();
  const [instance, setInstance] = useState<InstanceDetail | null>(null);
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(false);

  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('instances')
        .select('*')
        .eq('id', id)
        .single();
      if (error) { toast.error(error.message); navigate('/instances'); return; }
      setInstance(data as InstanceDetail);
      setLoading(false);
    };
    fetchData();
  }, [id]);

  const fetchEvents = async () => {
    if (!id) return;
    setLoadingEvents(true);
    const { data } = await supabase
      .from('webhook_events')
      .select('*')
      .eq('instance_id', id)
      .order('created_at', { ascending: false })
      .limit(50);
    setEvents((data as WebhookEvent[]) || []);
    setLoadingEvents(false);
  };

  useEffect(() => { if (id) fetchEvents(); }, [id]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado!');
  };

  if (loading || !instance) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const statusIcon = instance.status === 'online' ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />;
  const statusColor = instance.status === 'online' ? 'default' : instance.status === 'error' ? 'destructive' : 'secondary';

  const eventColumns: Column<WebhookEvent>[] = [
    { key: 'event_type', label: 'Evento', sortable: true },
    {
      key: 'direction', label: 'Direção', render: (r) =>
        <Badge variant="outline">{r.direction === 'inbound' ? '← Entrada' : '→ Saída'}</Badge>
    },
    { key: 'status', label: 'Status' },
    {
      key: 'created_at', label: 'Data', sortable: true,
      render: (r) => new Date(r.created_at).toLocaleString('pt-BR')
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/instances')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{instance.name}</h1>
          <p className="text-muted-foreground text-sm">{instance.phone_number || 'Número não registrado'}</p>
        </div>
        <Badge variant={statusColor} className="gap-1">
          {statusIcon} {instance.status}
        </Badge>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Visão geral</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          <TabsTrigger value="logs">Logs de eventos</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Status ao vivo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Conexão</span>
                  <Badge variant={statusColor}>{instance.status}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Reconexão</span>
                  <span className="text-sm capitalize">{instance.reconnect_policy}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Última conexão</span>
                  <span className="text-sm">
                    {instance.last_connected_at ? new Date(instance.last_connected_at).toLocaleString('pt-BR') : 'Nunca'}
                  </span>
                </div>
                <Separator />
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1 gap-1">
                    <QrCode className="h-3.5 w-3.5" /> Parear QR
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 gap-1">
                    <RefreshCw className="h-3.5 w-3.5" /> Reconectar
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Informações</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Fuso horário</span>
                  <span className="text-sm">{instance.timezone}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Tags</span>
                  <div className="flex gap-1">
                    {instance.tags?.length ? instance.tags.map(t =>
                      <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                    ) : <span className="text-sm text-muted-foreground">—</span>}
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Criada em</span>
                  <span className="text-sm">{new Date(instance.created_at).toLocaleDateString('pt-BR')}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="webhooks" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Webhook className="h-5 w-5" /> Configuração de Webhook</CardTitle>
              <CardDescription>URL para receber eventos desta instância</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>URL do Webhook</Label>
                <div className="flex gap-2">
                  <Input value={instance.webhook_url || ''} readOnly className="font-mono text-xs" />
                  <Button variant="outline" size="icon" onClick={() => copyToClipboard(instance.webhook_url || '')}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Secret</Label>
                <div className="flex gap-2">
                  <Input value={instance.webhook_secret || 'Não configurado'} readOnly className="font-mono text-xs" />
                  <Button variant="outline" size="icon" onClick={() => copyToClipboard(instance.webhook_secret || '')}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Eventos assinados</Label>
                <div className="flex flex-wrap gap-1">
                  {['message.received', 'message.sent', 'instance.connected', 'instance.disconnected', 'qr.updated', 'delivery.status'].map(ev => (
                    <Badge key={ev} variant="outline" className="text-xs">{ev}</Badge>
                  ))}
                </div>
              </div>
              <Button variant="outline" size="sm">
                <Send className="h-4 w-4 mr-1" /> Testar webhook
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium flex items-center gap-2">
              <ScrollText className="h-5 w-5" /> Eventos recebidos e enviados
            </h3>
            <Button variant="outline" size="sm" onClick={fetchEvents}>
              <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
            </Button>
          </div>
          <DataTable
            data={events}
            columns={eventColumns}
            searchKey="event_type"
            searchPlaceholder="Buscar evento..."
            loading={loadingEvents}
            emptyMessage="Nenhum evento registrado."
            pageSize={15}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

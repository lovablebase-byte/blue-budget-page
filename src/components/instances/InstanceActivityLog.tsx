/**
 * InstanceActivityLog — Timeline of instance events combining
 * webhook_events and audit_logs into a rich, filterable history.
 * Gated behind advanced_logs_enabled feature flag.
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FeatureLockedBanner } from '@/components/PlanEnforcementGuard';
import {
  RefreshCw, Loader2, Wifi, WifiOff, QrCode, Send,
  RotateCcw, AlertTriangle, ShieldAlert, Plus, Clock,
  Zap, ArrowDownRight, ArrowUpRight, Filter,
} from 'lucide-react';

interface ActivityEvent {
  id: string;
  type: string;
  label: string;
  description?: string;
  timestamp: string;
  source: 'webhook' | 'audit';
  direction?: string;
  status?: string;
  icon: React.ElementType;
  variant: 'success' | 'warning' | 'error' | 'info' | 'neutral';
}

const eventTypeConfig: Record<string, { label: string; icon: React.ElementType; variant: ActivityEvent['variant'] }> = {
  // Webhook events
  'connection.update': { label: 'Atualização de conexão', icon: Wifi, variant: 'info' },
  'messages.upsert': { label: 'Mensagem recebida', icon: ArrowDownRight, variant: 'neutral' },
  'messages.update': { label: 'Mensagem atualizada', icon: Zap, variant: 'neutral' },
  'send.message': { label: 'Mensagem enviada', icon: ArrowUpRight, variant: 'success' },
  'qrcode.updated': { label: 'QR Code atualizado', icon: QrCode, variant: 'info' },
  'Connected': { label: 'Conectado', icon: Wifi, variant: 'success' },
  'Disconnected': { label: 'Desconectado', icon: WifiOff, variant: 'warning' },
  'Message': { label: 'Mensagem', icon: Send, variant: 'neutral' },
  // Audit log actions
  'instance_create': { label: 'Instância criada', icon: Plus, variant: 'success' },
  'instance_delete_sync': { label: 'Instância excluída', icon: AlertTriangle, variant: 'error' },
  'instance_connect': { label: 'Conexão solicitada', icon: Wifi, variant: 'info' },
  'instance_disconnect': { label: 'Desconexão solicitada', icon: WifiOff, variant: 'warning' },
  'instance_restart': { label: 'Sessão reiniciada', icon: RotateCcw, variant: 'info' },
  'instance_qr_generated': { label: 'QR Code gerado', icon: QrCode, variant: 'info' },
  'instance_test_message': { label: 'Mensagem de teste', icon: Send, variant: 'info' },
  'instance_name_update': { label: 'Nome alterado', icon: Zap, variant: 'neutral' },
  'instance_blocked': { label: 'Bloqueio administrativo', icon: ShieldAlert, variant: 'error' },
};

const variantStyles: Record<ActivityEvent['variant'], string> = {
  success: 'bg-success/10 text-success border-success/30',
  warning: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30',
  error: 'bg-destructive/10 text-destructive border-destructive/30',
  info: 'bg-primary/10 text-primary border-primary/30',
  neutral: 'bg-muted/50 text-muted-foreground border-border/50',
};

const FILTER_OPTIONS = [
  { value: 'all', label: 'Todos os eventos' },
  { value: 'connection', label: 'Conexão' },
  { value: 'message', label: 'Mensagens' },
  { value: 'action', label: 'Ações' },
  { value: 'error', label: 'Erros' },
];

interface Props {
  instanceId: string;
}

export function InstanceActivityLog({ instanceId }: Props) {
  const { hasFeature } = useCompany();
  const { isAdmin } = useAuth();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const logsEnabled = isAdmin || hasFeature('advanced_logs_enabled');

  const fetchActivity = useCallback(async () => {
    if (!logsEnabled) { setLoading(false); return; }
    setLoading(true);

    // Fetch webhook_events and audit_logs in parallel
    const [webhookRes, auditRes] = await Promise.all([
      supabase
        .from('webhook_events')
        .select('id, event_type, direction, status, created_at, payload')
        .eq('instance_id', instanceId)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('audit_logs')
        .select('id, action, entity_type, created_at, payload')
        .eq('entity_type', 'instance')
        .eq('entity_id', instanceId)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    const mapped: ActivityEvent[] = [];

    // Map webhook events
    (webhookRes.data || []).forEach((e: any) => {
      const config = eventTypeConfig[e.event_type] || {
        label: e.event_type,
        icon: Zap,
        variant: 'neutral' as const,
      };
      const payload = e.payload as any;
      let description: string | undefined;
      if (e.event_type === 'connection.update' || e.event_type === 'Connected' || e.event_type === 'Disconnected') {
        const state = payload?.data?.state || payload?.state || '';
        description = state ? `Estado: ${state}` : undefined;
      }
      mapped.push({
        id: e.id,
        type: e.event_type,
        label: config.label,
        description,
        timestamp: e.created_at,
        source: 'webhook',
        direction: e.direction,
        status: e.status,
        icon: config.icon,
        variant: config.variant,
      });
    });

    // Map audit logs
    (auditRes.data || []).forEach((e: any) => {
      const config = eventTypeConfig[e.action] || {
        label: e.action,
        icon: Clock,
        variant: 'neutral' as const,
      };
      const payload = e.payload as any;
      let description: string | undefined;
      if (payload?.provider) description = `Provider: ${payload.provider}`;
      if (payload?.name) description = (description ? description + ' · ' : '') + `Nome: ${payload.name}`;
      mapped.push({
        id: e.id,
        type: e.action,
        label: config.label,
        description,
        timestamp: e.created_at,
        source: 'audit',
        icon: config.icon,
        variant: config.variant,
      });
    });

    // Sort by timestamp descending
    mapped.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    setEvents(mapped);
    setLoading(false);
  }, [instanceId, logsEnabled]);

  useEffect(() => { fetchActivity(); }, [fetchActivity]);

  // Filter events
  const filtered = events.filter(e => {
    if (filter === 'all') return true;
    if (filter === 'connection') return ['connection.update', 'Connected', 'Disconnected', 'instance_connect', 'instance_disconnect', 'instance_restart', 'qrcode.updated', 'instance_qr_generated'].includes(e.type);
    if (filter === 'message') return ['messages.upsert', 'messages.update', 'send.message', 'Message', 'instance_test_message'].includes(e.type);
    if (filter === 'action') return e.source === 'audit';
    if (filter === 'error') return e.variant === 'error' || e.variant === 'warning';
    return true;
  });

  if (!logsEnabled) {
    return <FeatureLockedBanner featureLabel="Logs avançados por instância" />;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[200px] h-9">
              <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILTER_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge variant="outline" className="text-xs">
            {filtered.length} evento{filtered.length !== 1 ? 's' : ''}
          </Badge>
        </div>
        <Button variant="outline" size="sm" onClick={fetchActivity} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </Button>
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Clock className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">Nenhum evento encontrado</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              {filter !== 'all' ? 'Tente alterar o filtro.' : 'Os eventos aparecerão aqui conforme a instância for utilizada.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[19px] top-0 bottom-0 w-px bg-border/60" />

          <div className="space-y-0">
            {filtered.map((event, idx) => {
              const Icon = event.icon;
              const isFirst = idx === 0;
              const prevEvent = idx > 0 ? filtered[idx - 1] : null;
              const showDateSeparator = isFirst || (prevEvent && new Date(prevEvent.timestamp).toLocaleDateString('pt-BR') !== new Date(event.timestamp).toLocaleDateString('pt-BR'));

              return (
                <div key={event.id}>
                  {showDateSeparator && (
                    <div className="flex items-center gap-3 pl-12 py-2">
                      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                        {new Date(event.timestamp).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                      </span>
                    </div>
                  )}
                  <div className="flex items-start gap-3 py-2 group hover:bg-muted/30 rounded-lg px-1 transition-colors">
                    {/* Icon dot */}
                    <div className={`relative z-10 flex items-center justify-center w-10 h-10 rounded-full border shrink-0 ${variantStyles[event.variant]}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    {/* Content */}
                    <div className="flex-1 min-w-0 pt-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{event.label}</span>
                        <Badge variant="outline" className="text-[10px] h-4">
                          {event.source === 'webhook' ? 'Webhook' : 'Sistema'}
                        </Badge>
                        {event.direction && (
                          <Badge variant="outline" className="text-[10px] h-4">
                            {event.direction === 'inbound' ? '← Entrada' : '→ Saída'}
                          </Badge>
                        )}
                      </div>
                      {event.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{event.description}</p>
                      )}
                    </div>
                    {/* Timestamp */}
                    <span className="text-[10px] text-muted-foreground shrink-0 pt-1.5">
                      {new Date(event.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

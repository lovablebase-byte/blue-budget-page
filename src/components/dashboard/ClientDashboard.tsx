import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/contexts/CompanyContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { LimitReachedBanner } from '@/components/PlanEnforcementGuard';
import {
  Smartphone, AlertTriangle, Plus, ArrowRight,
  Send, CheckCircle2, Wifi, WifiOff, Ban, Signal,
  TrendingUp, BarChart3, Shield, Lock, CreditCard,
  FileText, Zap, Bot, Megaphone, Globe, ExternalLink,
  Activity, Clock, RefreshCw, ChevronRight, Loader2,
} from 'lucide-react';
import { PLAN_FEATURES } from '@/lib/plan-features';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const REFRESH_INTERVAL = 15000;

/* ── Helpers ── */
function UsageBar({ label, used, max, icon: Icon }: { label: string; used: number; max: number; icon: any }) {
  const pct = max > 0 ? Math.min((used / max) * 100, 100) : 0;
  const isAtLimit = used >= max && max > 0;
  const isNearLimit = pct >= 80 && !isAtLimit;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Icon className={`h-3.5 w-3.5 ${isAtLimit ? 'text-destructive' : isNearLimit ? 'text-warning' : 'text-primary/70'}`} />
          {label}
        </span>
        <span className={`font-semibold tabular-nums ${isAtLimit ? 'text-destructive' : isNearLimit ? 'text-warning' : 'text-foreground'}`}>
          {used.toLocaleString('pt-BR')}<span className="text-muted-foreground font-normal">/{max.toLocaleString('pt-BR')}</span>
        </span>
      </div>
      <Progress value={pct} className={`h-1.5 ${isAtLimit ? '[&>div]:bg-destructive' : isNearLimit ? '[&>div]:bg-warning' : '[&>div]:bg-primary'}`} />
    </div>
  );
}

function SubscriptionBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'success' | 'warning' }> = {
    active: { label: 'Ativa', variant: 'success' },
    trialing: { label: 'Trial', variant: 'warning' },
    past_due: { label: 'Inadimplente', variant: 'destructive' },
    canceled: { label: 'Cancelada', variant: 'destructive' },
    suspended: { label: 'Suspensa', variant: 'destructive' },
  };
  const s = map[status] || { label: status, variant: 'secondary' as const };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

function KpiCard({ label, value, sub, icon: Icon, iconColor = 'text-primary', iconBg = 'bg-primary/10' }: {
  label: string; value: string | number; sub?: string; icon: any; iconColor?: string; iconBg?: string;
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`rounded-lg p-2.5 ${iconBg} shrink-0`}>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold tabular-nums tracking-tight">{typeof value === 'number' ? value.toLocaleString('pt-BR') : value}</p>
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          {sub && <p className="text-[10px] text-muted-foreground/70">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}


/* ── Main Component ── */
export default function ClientDashboard() {
  const navigate = useNavigate();
  const { company, isReadOnly } = useAuth();
  const { plan, planLoading, allowedProviders, isActive, isSuspended, isTrialing, hasFeature, getLimit } = useCompany();

  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [loading, setLoading] = useState(true);

  // Metrics state
  const [msgMetrics, setMsgMetrics] = useState({ today: 0, week: 0, month: 0, failed: 0 });
  const [instanceStatus, setInstanceStatus] = useState({ online: 0, offline: 0, blocked: 0, connecting: 0, total: 0 });
  const [recentInstances, setRecentInstances] = useState<any[]>([]);
  const [recentInvoices, setRecentInvoices] = useState<any[]>([]);
  const [pendingInvoices, setPendingInvoices] = useState(0);
  const [alerts, setAlerts] = useState<{ type: 'error' | 'warning' | 'info'; message: string; action?: string }[]>([]);
  const [hourlyData, setHourlyData] = useState<{ hour: string; envios: number }[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);

  const fetchMetrics = useCallback(async () => {
    if (!company?.id) return;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekStart = new Date(now.getTime() - 7 * 86400000).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [todayRes, weekRes, monthRes, failedRes, instancesRes, invoicesRes, pendingInvRes, activityRes] = await Promise.all([
      supabase.from('webhook_events').select('id', { count: 'exact', head: true })
        .eq('company_id', company.id).eq('direction', 'outbound').gte('created_at', todayStart),
      supabase.from('webhook_events').select('id', { count: 'exact', head: true })
        .eq('company_id', company.id).eq('direction', 'outbound').gte('created_at', weekStart),
      supabase.from('webhook_events').select('id', { count: 'exact', head: true })
        .eq('company_id', company.id).eq('direction', 'outbound').gte('created_at', monthStart),
      supabase.from('webhook_events').select('id', { count: 'exact', head: true })
        .eq('company_id', company.id).eq('direction', 'outbound').eq('status', 'failed').gte('created_at', monthStart),
      supabase.from('instances').select('id, name, status, provider, last_connected_at, created_at')
        .eq('company_id', company.id).order('created_at', { ascending: false }),
      supabase.from('invoices').select('id, amount_cents, status, due_date, paid_at')
        .eq('company_id', company.id).order('due_date', { ascending: false }).limit(3),
      supabase.from('invoices').select('id', { count: 'exact', head: true })
        .eq('company_id', company.id).in('status', ['pending', 'overdue']),
      supabase.from('webhook_events').select('id, event_type, status, created_at, instance_id')
        .eq('company_id', company.id).order('created_at', { ascending: false }).limit(8),
    ]);

    setMsgMetrics({
      today: todayRes.count ?? 0,
      week: weekRes.count ?? 0,
      month: monthRes.count ?? 0,
      failed: failedRes.count ?? 0,
    });

    const instances = instancesRes.data || [];
    const sm = { online: 0, offline: 0, blocked: 0, connecting: 0, total: instances.length };
    instances.forEach((inst: any) => {
      if (inst.status === 'online' || inst.status === 'connected') sm.online++;
      else if (inst.status === 'blocked') sm.blocked++;
      else if (inst.status === 'connecting') sm.connecting++;
      else sm.offline++;
    });
    setInstanceStatus(sm);
    setRecentInstances(instances.slice(0, 5));
    setRecentInvoices(invoicesRes.data || []);
    setPendingInvoices(pendingInvRes.count ?? 0);
    setRecentActivity(activityRes.data || []);

    // Hourly chart
    const { data: hourlyEvents } = await supabase
      .from('webhook_events').select('created_at')
      .eq('company_id', company.id).eq('direction', 'outbound').gte('created_at', todayStart);
    const hours = Array.from({ length: 24 }, (_, i) => ({ hour: `${i.toString().padStart(2, '0')}h`, envios: 0 }));
    (hourlyEvents || []).forEach((evt: any) => { hours[new Date(evt.created_at).getHours()].envios++; });
    setHourlyData(hours);

    // Build alerts
    const monthCount = monthRes.count ?? 0;
    const failedCount = failedRes.count ?? 0;
    const newAlerts: typeof alerts = [];
    const failRate = monthCount > 0 ? (failedCount / monthCount) * 100 : 0;
    if (failRate > 10) newAlerts.push({ type: 'error', message: `Taxa de falha em ${failRate.toFixed(1)}% — acima do recomendado` });
    if (sm.offline > 0) newAlerts.push({ type: 'warning', message: `${sm.offline} instância(s) offline`, action: '/instances' });
    if (sm.blocked > 0) newAlerts.push({ type: 'error', message: `${sm.blocked} instância(s) bloqueada(s)`, action: '/instances' });
    if ((pendingInvRes.count ?? 0) > 0) newAlerts.push({ type: 'warning', message: `${pendingInvRes.count} fatura(s) pendente(s)`, action: '/subscription' });
    setAlerts(newAlerts);
    setLastRefresh(new Date());
    setLoading(false);
  }, [company?.id]);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  const maxInstances = getLimit('max_instances');
  const instancesAtLimit = instanceStatus.total >= maxInstances && maxInstances > 0;
  const deliveredCount = msgMetrics.month - msgMetrics.failed;
  const deliveryRate = msgMetrics.month > 0 ? ((deliveredCount / msgMetrics.month) * 100).toFixed(1) : '100';
  const formatCents = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;

  if (loading && planLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Olá{company ? `, ${company.name}` : ''} 👋
          </h1>
          <p className="text-sm text-muted-foreground">Visão geral da sua conta e instâncias</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          Atualizado {formatDistanceToNow(lastRefresh, { addSuffix: true, locale: ptBR })}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={fetchMetrics}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* ── Critical Banners ── */}
      {isSuspended && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-sm">Assinatura suspensa</p>
            <p className="text-xs text-muted-foreground">Sua conta está em modo somente leitura. Regularize para continuar operando.</p>
          </div>
          <Button size="sm" variant="destructive" onClick={() => navigate('/subscription')}>
            Ver assinatura
          </Button>
        </div>
      )}
      {isReadOnly && !isSuspended && (
        <div className="flex items-center gap-3 rounded-lg border border-warning/50 bg-warning/10 p-4">
          <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-sm">Conta com pendências</p>
            <p className="text-xs text-muted-foreground">Operação em modo somente leitura até regularização.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => navigate('/subscription')}>
            Resolver
          </Button>
        </div>
      )}

      {/* ── Alerts ── */}
      {alerts.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {alerts.map((alert, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors hover:bg-muted/50 ${
                alert.type === 'error'
                  ? 'border-destructive/30 bg-destructive/5'
                  : 'border-warning/30 bg-warning/5'
              }`}
              onClick={() => alert.action && navigate(alert.action)}
            >
              {alert.type === 'error'
                ? <Ban className="h-4 w-4 text-destructive shrink-0" />
                : <AlertTriangle className="h-4 w-4 text-warning shrink-0" />}
              <p className="text-sm font-medium flex-1">{alert.message}</p>
              {alert.action && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </div>
          ))}
        </div>
      )}

      {instancesAtLimit && (
        <LimitReachedBanner current={instanceStatus.total} max={maxInstances} resourceLabel="instâncias" />
      )}

      {/* ── KPI Row ── */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Instâncias online" value={instanceStatus.online} sub={`de ${instanceStatus.total} total`} icon={Wifi} iconColor="text-primary" iconBg="bg-primary/10" />
        <KpiCard label="Mensagens hoje" value={msgMetrics.today} icon={Send} iconColor="text-primary" iconBg="bg-primary/10" />
        <KpiCard label="Mensagens no mês" value={msgMetrics.month} sub={`${deliveryRate}% entregue`} icon={TrendingUp} iconColor="text-accent-foreground" iconBg="bg-accent/10" />
        <KpiCard
          label={pendingInvoices > 0 ? 'Faturas pendentes' : 'Financeiro em dia'}
          value={pendingInvoices > 0 ? pendingInvoices : '✓'}
          icon={CreditCard}
          iconColor={pendingInvoices > 0 ? 'text-destructive' : 'text-success'}
          iconBg={pendingInvoices > 0 ? 'bg-destructive/10' : 'bg-success/10'}
        />
      </div>

      {/* ── Quick Actions ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" /> Ações rápidas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {hasFeature('instances_enabled') && !instancesAtLimit && !isReadOnly && (
              <QuickAction label="Nova instância" icon={Plus} onClick={() => navigate('/instances')} />
            )}
            <QuickAction label="Instâncias" icon={Smartphone} onClick={() => navigate('/instances')} />
            <QuickAction label="Assinatura" icon={CreditCard} onClick={() => navigate('/subscription')} />
            {hasFeature('invoices_enabled') && (
              <QuickAction label="Faturas" icon={FileText} onClick={() => navigate('/subscription')} />
            )}
            {hasFeature('ai_agents_enabled') && (
              <QuickAction label="Agentes IA" icon={Bot} onClick={() => navigate('/ai-agents')} />
            )}
            {hasFeature('campaigns_enabled') && (
              <QuickAction label="Campanhas" icon={Megaphone} onClick={() => navigate('/campaigns')} />
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Main Grid: Plan + Usage + Instance Status ── */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Plan Summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="h-4 w-4" /> Plano atual
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {plan ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold">{plan.plan_name}</span>
                  <SubscriptionBadge status={plan.status} />
                </div>
                <div className="text-sm text-muted-foreground space-y-1">
                  <div className="flex justify-between">
                    <span>Ciclo</span>
                    <span className="capitalize font-medium text-foreground">{plan.billing_cycle}</span>
                  </div>
                  {plan.price_cents > 0 && (
                    <div className="flex justify-between">
                      <span>Valor</span>
                      <span className="font-medium text-foreground">{formatCents(plan.price_cents)}</span>
                    </div>
                  )}
                  {plan.renewal_date && (
                    <div className="flex justify-between">
                      <span>Renovação</span>
                      <span className="font-medium text-foreground">{format(new Date(plan.renewal_date), 'dd/MM/yyyy')}</span>
                    </div>
                  )}
                  {plan.expires_at && (
                    <div className="flex justify-between">
                      <span>Expira</span>
                      <span className="font-medium text-foreground">{format(new Date(plan.expires_at), 'dd/MM/yyyy')}</span>
                    </div>
                  )}
                </div>
                <div className="pt-2 border-t space-y-1.5">
                  <p className="text-xs text-muted-foreground font-medium">Recursos</p>
                  <div className="flex flex-wrap gap-1">
                    {PLAN_FEATURES.map(f => {
                      const enabled = hasFeature(f.key);
                      return (
                        <Badge key={f.key} variant={enabled ? 'default' : 'outline'} className={`text-[10px] ${!enabled ? 'opacity-50' : ''}`}>
                          {!enabled && <Lock className="h-2.5 w-2.5 mr-0.5" />}
                          {f.label}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="w-full mt-1 text-xs" onClick={() => navigate('/subscription')}>
                  Ver detalhes <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{planLoading ? 'Carregando...' : 'Nenhum plano ativo'}</p>
            )}
          </CardContent>
        </Card>

        {/* Usage / Limits */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4" /> Consumo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {plan ? (
              <>
                <UsageBar label="Instâncias" used={instanceStatus.total} max={plan.limits.max_instances} icon={Smartphone} />
                <UsageBar label="Msgs/dia" used={msgMetrics.today} max={plan.limits.max_messages_day} icon={Send} />
                <UsageBar label="Msgs/mês" used={msgMetrics.month} max={plan.limits.max_messages_month} icon={TrendingUp} />
                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground mb-2">Providers permitidos</p>
                  <div className="flex gap-1.5">
                    {allowedProviders.map(p => (
                      <Badge key={p} variant="secondary" className="text-xs capitalize">{p}</Badge>
                    ))}
                    {allowedProviders.length === 0 && <span className="text-xs text-muted-foreground">Nenhum configurado</span>}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Sem dados de plano</p>
            )}
          </CardContent>
        </Card>

        {/* Instance Fleet Status */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4" /> Status das instâncias
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {instanceStatus.total > 0 ? (
              <>
                {[
                  { label: 'Online', value: instanceStatus.online, icon: Wifi, color: 'text-primary', bg: 'bg-primary/10' },
                  { label: 'Offline', value: instanceStatus.offline, icon: WifiOff, color: 'text-muted-foreground', bg: 'bg-muted/60' },
                  { label: 'Bloqueadas', value: instanceStatus.blocked, icon: Ban, color: 'text-destructive', bg: 'bg-destructive/10' },
                  { label: 'Conectando', value: instanceStatus.connecting, icon: Signal, color: 'text-warning', bg: 'bg-warning/10' },
                ].filter(s => s.value > 0).map(s => (
                  <div key={s.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`rounded-full p-1.5 ${s.bg}`}>
                        <s.icon className={`h-3.5 w-3.5 ${s.color}`} />
                      </div>
                      <span className="text-sm">{s.label}</span>
                    </div>
                    <span className="text-lg font-bold tabular-nums">{s.value}</span>
                  </div>
                ))}
                <div className="pt-2 border-t text-center">
                  <span className="text-xs text-muted-foreground">
                    {instanceStatus.online}/{instanceStatus.total} instâncias operando
                  </span>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-2 py-4 text-center">
                <Smartphone className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">Nenhuma instância criada</p>
                {hasFeature('instances_enabled') && !isReadOnly && (
                  <Button size="sm" variant="outline" onClick={() => navigate('/instances')}>
                    <Plus className="h-4 w-4 mr-1" /> Criar primeira
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Chart: Hourly sends ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Envios por hora — Hoje</CardTitle>
        </CardHeader>
        <CardContent className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hourlyData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="hour" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
              <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, color: 'hsl(var(--foreground))', fontSize: 12 }} />
              <Bar dataKey="envios" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ── Bottom Grid: Recent Instances + Invoices + Activity ── */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Recent Instances */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Smartphone className="h-4 w-4" /> Instâncias
            </CardTitle>
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => navigate('/instances')}>
              Ver todas <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
            </Button>
          </CardHeader>
          <CardContent>
            {recentInstances.length > 0 ? (
              <div className="space-y-2">
                {recentInstances.map((inst: any) => (
                  <div
                    key={inst.id}
                    className="flex items-center justify-between text-sm py-1.5 border-b last:border-0 cursor-pointer hover:bg-muted/30 -mx-2 px-2 rounded transition-colors"
                    onClick={() => navigate(`/instances/${inst.id}`)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {inst.status === 'online' || inst.status === 'connected'
                        ? <Wifi className="h-3.5 w-3.5 text-primary shrink-0" />
                        : <WifiOff className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                      <span className="font-medium truncate">{inst.name}</span>
                    </div>
                    <Badge variant={inst.status === 'online' || inst.status === 'connected' ? 'default' : 'secondary'} className="text-[10px] capitalize shrink-0">
                      {inst.status}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhuma instância</p>
            )}
          </CardContent>
        </Card>

        {/* Recent Invoices */}
        {hasFeature('invoices_enabled') && (
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="h-4 w-4" /> Últimas faturas
              </CardTitle>
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => navigate('/subscription')}>
                Ver todas <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
              </Button>
            </CardHeader>
            <CardContent>
              {recentInvoices.length > 0 ? (
                <div className="space-y-2">
                  {recentInvoices.map((inv: any) => (
                    <div key={inv.id} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                      <div>
                        <p className="font-medium tabular-nums">{formatCents(inv.amount_cents)}</p>
                        <p className="text-[10px] text-muted-foreground">
                          Venc. {format(new Date(inv.due_date), 'dd/MM/yyyy')}
                        </p>
                      </div>
                      <Badge
                        variant={inv.status === 'paid' ? 'success' : inv.status === 'pending' ? 'warning' : 'destructive'}
                        className="text-[10px]"
                      >
                        {inv.status === 'paid' ? 'Paga' : inv.status === 'pending' ? 'Pendente' : 'Atrasada'}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhuma fatura</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Recent Activity */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4" /> Atividade recente
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentActivity.length > 0 ? (
              <div className="space-y-2">
                {recentActivity.slice(0, 6).map((evt: any) => (
                  <div key={evt.id} className="flex items-center justify-between text-xs py-1 border-b last:border-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                        evt.status === 'failed' ? 'bg-destructive' : 'bg-primary'
                      }`} />
                      <span className="truncate text-muted-foreground">{evt.event_type}</span>
                    </div>
                    <span className="text-muted-foreground/70 shrink-0 ml-2">
                      {formatDistanceToNow(new Date(evt.created_at), { addSuffix: true, locale: ptBR })}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">Sem atividade recente</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

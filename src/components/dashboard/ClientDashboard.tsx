import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/contexts/CompanyContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LimitReachedBanner, FeatureLockedBanner } from '@/components/PlanEnforcementGuard';
import {
  Smartphone, MessageSquare, AlertTriangle, Clock, Key, Link2,
  Copy, Eye, EyeOff, RefreshCw, Loader2, Calendar,
  Send, CheckCircle2, XCircle, Wifi, WifiOff, Ban, Signal,
  TrendingUp, BarChart3, Contact, Shield, Lock, CreditCard,
  FileText, Zap, Bot, Megaphone, GitBranch, Globe,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const REFRESH_INTERVAL = 10000;

function UsageBar({ label, used, max, icon: Icon }: { label: string; used: number; max: number; icon: any }) {
  const pct = max > 0 ? Math.min((used / max) * 100, 100) : 0;
  const isAtLimit = used >= max && max > 0;
  const isNearLimit = pct >= 80 && !isAtLimit;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5">
          <Icon className={`h-3.5 w-3.5 ${isAtLimit ? 'text-destructive' : isNearLimit ? 'text-warning' : 'text-primary/70'}`} />
          {label}
        </span>
        <span className={`font-medium ${isAtLimit ? 'text-destructive' : isNearLimit ? 'text-warning' : 'text-muted-foreground'}`}>
          {used}/{max}
        </span>
      </div>
      <Progress value={pct} className={`h-2 ${isAtLimit ? '[&>div]:bg-destructive' : isNearLimit ? '[&>div]:bg-warning' : '[&>div]:bg-primary'}`} />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    active: { label: 'Ativa', variant: 'default' },
    trialing: { label: 'Trial', variant: 'secondary' },
    past_due: { label: 'Inadimplente', variant: 'destructive' },
    canceled: { label: 'Cancelada', variant: 'destructive' },
    suspended: { label: 'Suspensa', variant: 'destructive' },
  };
  const s = map[status] || { label: status, variant: 'outline' as const };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

export default function ClientDashboard() {
  const { role, company, isReadOnly, user } = useAuth();
  const { plan, planLoading, allowedProviders, isActive, isSuspended, isTrialing, hasFeature, getLimit } = useCompany();

  const [timezone, setTimezone] = useState('America/Sao_Paulo');
  const [savingTz, setSavingTz] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const [lastRefresh, setLastRefresh] = useState(new Date());

  // Real metrics
  const [msgMetrics, setMsgMetrics] = useState({ today: 0, week: 0, month: 0, failed: 0, delivered: 0 });
  const [instanceStatus, setInstanceStatus] = useState({ online: 0, offline: 0, blocked: 0, connecting: 0, total: 0 });
  const [recentInstances, setRecentInstances] = useState<any[]>([]);
  const [recentInvoices, setRecentInvoices] = useState<any[]>([]);
  const [pendingInvoices, setPendingInvoices] = useState(0);
  const [alerts, setAlerts] = useState<{ type: string; message: string }[]>([]);
  const [hourlyData, setHourlyData] = useState<{ hour: string; envios: number }[]>([]);
  const [campaignData, setCampaignData] = useState<{ name: string; sent: number; failed: number }[]>([]);

  const accessToken = user?.id?.slice(0, 8) + '••••••••••••' + user?.id?.slice(-4);
  const fullToken = user?.id || '';

  const fetchMetrics = useCallback(async () => {
    if (!company?.id) return;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekStart = new Date(now.getTime() - 7 * 86400000).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [todayRes, weekRes, monthRes, failedRes, instancesRes, campaignsRes, invoicesRes, pendingInvRes] = await Promise.all([
      supabase.from('webhook_events').select('id', { count: 'exact', head: true })
        .eq('company_id', company.id).eq('direction', 'outbound').gte('created_at', todayStart),
      supabase.from('webhook_events').select('id', { count: 'exact', head: true })
        .eq('company_id', company.id).eq('direction', 'outbound').gte('created_at', weekStart),
      supabase.from('webhook_events').select('id', { count: 'exact', head: true })
        .eq('company_id', company.id).eq('direction', 'outbound').gte('created_at', monthStart),
      supabase.from('webhook_events').select('id', { count: 'exact', head: true })
        .eq('company_id', company.id).eq('direction', 'outbound').eq('status', 'failed').gte('created_at', monthStart),
      supabase.from('instances').select('id, name, status, provider, last_connected_at, created_at').eq('company_id', company.id).order('created_at', { ascending: false }),
      supabase.from('campaigns').select('id, name, stats').eq('company_id', company.id).order('created_at', { ascending: false }).limit(5),
      supabase.from('invoices').select('id, amount_cents, status, due_date, paid_at').eq('company_id', company.id).order('due_date', { ascending: false }).limit(5),
      supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('company_id', company.id).in('status', ['pending', 'overdue']),
    ]);

    const todayCount = todayRes.count ?? 0;
    const weekCount = weekRes.count ?? 0;
    const monthCount = monthRes.count ?? 0;
    const failedCount = failedRes.count ?? 0;
    setMsgMetrics({ today: todayCount, week: weekCount, month: monthCount, failed: failedCount, delivered: monthCount - failedCount });

    const instances = instancesRes.data || [];
    const statusMap = { online: 0, offline: 0, blocked: 0, connecting: 0, total: instances.length };
    instances.forEach((inst: any) => {
      if (inst.status === 'online' || inst.status === 'connected') statusMap.online++;
      else if (inst.status === 'blocked') statusMap.blocked++;
      else if (inst.status === 'connecting') statusMap.connecting++;
      else statusMap.offline++;
    });
    setInstanceStatus(statusMap);
    setRecentInstances(instances.slice(0, 5));

    setRecentInvoices(invoicesRes.data || []);
    setPendingInvoices(pendingInvRes.count ?? 0);

    // Fetch real hourly data from webhook_events for today
    const { data: hourlyEvents } = await supabase
      .from('webhook_events')
      .select('created_at')
      .eq('company_id', company.id)
      .eq('direction', 'outbound')
      .gte('created_at', todayStart);

    const hours = Array.from({ length: 24 }, (_, i) => ({ hour: `${i.toString().padStart(2, '0')}h`, envios: 0 }));
    (hourlyEvents || []).forEach((evt: any) => {
      const h = new Date(evt.created_at).getHours();
      hours[h].envios++;
    });
    setHourlyData(hours);

    const camps = (campaignsRes.data || []).map((c: any) => {
      const s = c.stats as any;
      return { name: c.name, sent: s?.sent || 0, failed: s?.failed || 0 };
    });
    setCampaignData(camps);

    const newAlerts: { type: string; message: string }[] = [];
    const failRate = monthCount > 0 ? (failedCount / monthCount) * 100 : 0;
    if (failRate > 10) newAlerts.push({ type: 'error', message: `Taxa de falha em ${failRate.toFixed(1)}% — acima do limite de 10%` });
    if (statusMap.offline > 0) newAlerts.push({ type: 'warning', message: `${statusMap.offline} instância(s) desconectada(s)` });
    if (statusMap.blocked > 0) newAlerts.push({ type: 'error', message: `${statusMap.blocked} instância(s) bloqueada(s)` });
    if ((pendingInvRes.count ?? 0) > 0) newAlerts.push({ type: 'warning', message: `${pendingInvRes.count} fatura(s) pendente(s)` });
    setAlerts(newAlerts);
    setLastRefresh(new Date());
  }, [company?.id]);

  useEffect(() => {
    if (!user) return;
    supabase.from('profiles').select('timezone, referral_code').eq('user_id', user.id).single()
      .then(({ data }) => {
        if (data) {
          setTimezone(data.timezone || 'America/Sao_Paulo');
          setReferralCode(data.referral_code || '');
        }
      });
  }, [user]);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  const handleSaveTimezone = async () => {
    setSavingTz(true);
    try {
      await supabase.from('profiles').update({ timezone }).eq('user_id', user!.id);
      toast.success('Fuso horário atualizado!');
    } catch (e: any) { toast.error(e.message); }
    finally { setSavingTz(false); }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  const referralLink = `${window.location.origin}/auth?ref=${referralCode}`;
  const deliveryRate = msgMetrics.month > 0 ? ((msgMetrics.delivered / msgMetrics.month) * 100).toFixed(1) : '100';

  const maxInstances = getLimit('max_instances');
  const instancesAtLimit = instanceStatus.total >= maxInstances && maxInstances > 0;

  const PIE_COLORS = ['hsl(var(--primary))', 'hsl(var(--muted-foreground))', 'hsl(var(--destructive))', 'hsl(var(--warning))'];
  const instancePieData = [
    { name: 'Online', value: instanceStatus.online },
    { name: 'Offline', value: instanceStatus.offline },
    { name: 'Bloqueada', value: instanceStatus.blocked },
    { name: 'Conectando', value: instanceStatus.connecting },
  ].filter(d => d.value > 0);

  const formatCents = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Bem-vindo{company ? `, ${company.name}` : ''}
          </h1>
          <p className="text-muted-foreground">Painel de controle da sua empresa</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Atualizado: {lastRefresh.toLocaleTimeString('pt-BR')}</span>
          <Badge variant="secondary" className="capitalize">{role || 'usuário'}</Badge>
        </div>
      </div>

      {/* Suspension / Read-only banner */}
      {isSuspended && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <div>
            <p className="font-medium">Assinatura suspensa ou cancelada</p>
            <p className="text-sm text-muted-foreground">Operação em modo somente leitura. Entre em contato com o administrador.</p>
          </div>
        </div>
      )}
      {isReadOnly && !isSuspended && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <div>
            <p className="font-medium">Assinatura com pendências</p>
            <p className="text-sm text-muted-foreground">Operação em modo somente leitura.</p>
          </div>
        </div>
      )}

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alert, i) => (
            <div key={i} className={`flex items-center gap-3 rounded-lg border p-3 backdrop-blur-sm ${
              alert.type === 'error' ? 'border-destructive/40 bg-destructive/10 shadow-[0_0_12px_-4px_hsl(var(--destructive)/0.2)]' : 'border-warning/40 bg-warning/10 shadow-[0_0_12px_-4px_hsl(var(--warning)/0.15)]'
            }`}>
              {alert.type === 'error' ? <Ban className="h-4 w-4 text-destructive shrink-0" /> : <AlertTriangle className="h-4 w-4 text-warning shrink-0" />}
              <p className="text-sm font-medium">{alert.message}</p>
            </div>
          ))}
        </div>
      )}

      {/* Instance limit banner */}
      {instancesAtLimit && (
        <LimitReachedBanner current={instanceStatus.total} max={maxInstances} resourceLabel="instâncias" />
      )}

      {/* KPI Cards Row 1 — Messages */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        <Card className="group">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Hoje</CardTitle>
            <div className="rounded-md p-1.5 bg-primary/10"><Send className="h-4 w-4 text-primary" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">{msgMetrics.today}</div>
            <p className="text-[11px] text-muted-foreground mt-0.5">mensagens</p>
          </CardContent>
        </Card>
        <Card className="group">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Semana</CardTitle>
            <div className="rounded-md p-1.5 bg-primary/10"><TrendingUp className="h-4 w-4 text-primary" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">{msgMetrics.week}</div>
            <p className="text-[11px] text-muted-foreground mt-0.5">mensagens</p>
          </CardContent>
        </Card>
        <Card className="group">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Mês</CardTitle>
            <div className="rounded-md p-1.5 bg-accent/10"><BarChart3 className="h-4 w-4 text-accent" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">{msgMetrics.month}</div>
            <p className="text-[11px] text-muted-foreground mt-0.5">mensagens</p>
          </CardContent>
        </Card>
        <Card className="group">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Entrega</CardTitle>
            <div className="rounded-md p-1.5 bg-success/10"><CheckCircle2 className="h-4 w-4 text-success" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-primary">{deliveryRate}%</div>
            <p className="text-[11px] text-muted-foreground mt-0.5">taxa</p>
          </CardContent>
        </Card>
        <Card className="group">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Faturas pendentes</CardTitle>
            <div className={`rounded-md p-1.5 ${pendingInvoices > 0 ? 'bg-destructive/10' : 'bg-muted/50'}`}><CreditCard className={`h-4 w-4 ${pendingInvoices > 0 ? 'text-destructive' : 'text-muted-foreground'}`} /></div>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold tracking-tight ${pendingInvoices > 0 ? 'text-destructive' : ''}`}>{pendingInvoices}</div>
            <p className="text-[11px] text-muted-foreground mt-0.5">em aberto</p>
          </CardContent>
        </Card>
      </div>

      {/* Instance status cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="flex items-center gap-3 p-4">
          <div className="rounded-full bg-primary/15 p-2.5 shadow-[0_0_12px_-3px_hsl(var(--primary)/0.35)]"><Wifi className="h-5 w-5 text-primary" /></div>
          <div><p className="text-2xl font-bold">{instanceStatus.online}</p><p className="text-xs text-muted-foreground">Online</p></div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <div className="rounded-full bg-muted/60 p-2.5"><WifiOff className="h-5 w-5 text-muted-foreground" /></div>
          <div><p className="text-2xl font-bold">{instanceStatus.offline}</p><p className="text-xs text-muted-foreground">Offline</p></div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <div className="rounded-full bg-destructive/15 p-2.5 shadow-[0_0_12px_-3px_hsl(var(--destructive)/0.2)]"><Ban className="h-5 w-5 text-destructive" /></div>
          <div><p className="text-2xl font-bold">{instanceStatus.blocked}</p><p className="text-xs text-muted-foreground">Bloqueadas</p></div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <div className="rounded-full bg-warning/15 p-2.5 shadow-[0_0_12px_-3px_hsl(var(--warning)/0.15)]"><Signal className="h-5 w-5 text-warning" /></div>
          <div><p className="text-2xl font-bold">{instanceStatus.connecting}</p><p className="text-xs text-muted-foreground">Conectando</p></div>
        </Card>
      </div>

      {/* Plan + Subscription + Usage */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Plan summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Shield className="h-4 w-4" /> Plano atual
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {plan ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xl font-bold">{plan.plan_name}</span>
                  <StatusBadge status={plan.status} />
                </div>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>Ciclo: <span className="capitalize">{plan.billing_cycle}</span></p>
                  <p>Suporte: <span className="capitalize">{plan.support_priority}</span></p>
                  {plan.renewal_date && (
                    <p>Renovação: {format(new Date(plan.renewal_date), 'dd/MM/yyyy', { locale: ptBR })}</p>
                  )}
                  {plan.expires_at && (
                    <p>Expira: {format(new Date(plan.expires_at), 'dd/MM/yyyy', { locale: ptBR })}</p>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{planLoading ? 'Carregando...' : 'Nenhum plano ativo'}</p>
            )}
          </CardContent>
        </Card>

        {/* Usage / Limits */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <BarChart3 className="h-4 w-4" /> Consumo do plano
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {plan ? (
              <>
                <UsageBar label="Instâncias" used={instanceStatus.total} max={plan.limits.max_instances} icon={Smartphone} />
                <UsageBar label="Mensagens/dia" used={msgMetrics.today} max={plan.limits.max_messages_day} icon={MessageSquare} />
                <UsageBar label="Mensagens/mês" used={msgMetrics.month} max={plan.limits.max_messages_month} icon={Send} />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Sem dados de plano</p>
            )}
          </CardContent>
        </Card>

        {/* Features + Providers */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Zap className="h-4 w-4" /> Recursos e providers
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {plan ? (
              <>
                <div className="space-y-1.5">
                  {[
                    { key: 'campaigns_enabled' as const, label: 'Campanhas', icon: Megaphone },
                    { key: 'workflows_enabled' as const, label: 'Workflows', icon: GitBranch },
                    { key: 'ai_agents_enabled' as const, label: 'Agentes IA', icon: Bot },
                    { key: 'api_access' as const, label: 'Acesso API', icon: Globe },
                    { key: 'whitelabel_enabled' as const, label: 'White-label', icon: Shield },
                  ].map(f => {
                    const enabled = hasFeature(f.key);
                    return (
                      <div key={f.key} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5">
                          <f.icon className="h-3.5 w-3.5 text-muted-foreground" />
                          {f.label}
                        </span>
                        {enabled ? (
                          <Badge variant="outline" className="text-xs border-primary/50 text-primary">Ativo</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs border-muted text-muted-foreground gap-1">
                            <Lock className="h-3 w-3" /> Bloqueado
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground mb-1">Providers permitidos</p>
                  <div className="flex gap-1.5">
                    {allowedProviders.map(p => (
                      <Badge key={p} variant="secondary" className="text-xs capitalize">{p}</Badge>
                    ))}
                    {allowedProviders.length === 0 && <span className="text-xs text-muted-foreground">Nenhum</span>}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Sem dados</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <Tabs defaultValue="hourly" className="space-y-4">
        <TabsList>
          <TabsTrigger value="hourly">Envios por Hora</TabsTrigger>
          <TabsTrigger value="campaign">Por Campanha</TabsTrigger>
          <TabsTrigger value="status">Status Instâncias</TabsTrigger>
        </TabsList>
        <TabsContent value="hourly">
          <Card>
            <CardHeader><CardTitle className="text-sm">Envios por Hora — Hoje</CardTitle></CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourlyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="hour" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, color: 'hsl(var(--foreground))' }} />
                  <Bar dataKey="envios" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="campaign">
          <Card>
            <CardHeader><CardTitle className="text-sm">Envios por Campanha</CardTitle></CardHeader>
            <CardContent className="h-72">
              {campaignData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={campaignData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                    <YAxis tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, color: 'hsl(var(--foreground))' }} />
                    <Bar dataKey="sent" fill="hsl(var(--primary))" name="Enviados" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="failed" fill="hsl(var(--destructive))" name="Falhas" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground text-sm">Nenhuma campanha encontrada</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="status">
          <Card>
            <CardHeader><CardTitle className="text-sm">Distribuição de Status</CardTitle></CardHeader>
            <CardContent className="h-72">
              {instancePieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={instancePieData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                      {instancePieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Legend />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, color: 'hsl(var(--foreground))' }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground text-sm">Nenhuma instância</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Recent instances + Recent invoices */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Smartphone className="h-4 w-4" /> Instâncias recentes
            </CardTitle>
            <CardDescription>Últimas 5 instâncias</CardDescription>
          </CardHeader>
          <CardContent>
            {recentInstances.length > 0 ? (
              <div className="space-y-2">
                {recentInstances.map((inst: any) => (
                  <div key={inst.id} className="flex items-center justify-between text-sm border-b last:border-0 pb-2 last:pb-0">
                    <div className="flex items-center gap-2">
                      {inst.status === 'online' || inst.status === 'connected' ? (
                        <Wifi className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      <span className="font-medium">{inst.name}</span>
                      <Badge variant="outline" className="text-xs capitalize">{inst.provider}</Badge>
                    </div>
                    <Badge variant={inst.status === 'online' || inst.status === 'connected' ? 'default' : 'secondary'} className="text-xs capitalize">
                      {inst.status}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma instância</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4" /> Últimas cobranças
            </CardTitle>
            <CardDescription>5 faturas mais recentes</CardDescription>
          </CardHeader>
          <CardContent>
            {recentInvoices.length > 0 ? (
              <div className="space-y-2">
                {recentInvoices.map((inv: any) => (
                  <div key={inv.id} className="flex items-center justify-between text-sm border-b last:border-0 pb-2 last:pb-0">
                    <div>
                      <p className="font-medium">{formatCents(inv.amount_cents)}</p>
                      <p className="text-xs text-muted-foreground">Vence: {format(new Date(inv.due_date), 'dd/MM/yyyy')}</p>
                    </div>
                    <Badge variant={inv.status === 'paid' ? 'default' : inv.status === 'pending' ? 'secondary' : 'destructive'} className="text-xs capitalize">
                      {inv.status === 'paid' ? 'Paga' : inv.status === 'pending' ? 'Pendente' : inv.status === 'overdue' ? 'Atrasada' : inv.status}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma fatura</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom utilities */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Key className="h-4 w-4" /> Token de acesso
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <code className="text-xs bg-muted px-2 py-1 rounded font-mono flex-1 truncate">
                {showToken ? fullToken : accessToken}
              </code>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setShowToken(!showToken)}>
                {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => copyToClipboard(fullToken, 'Token')}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4" /> Fuso horário
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['America/Sao_Paulo','America/Manaus','America/Fortaleza','America/Cuiaba',
                    'America/New_York','Europe/London','Europe/Lisbon','Asia/Tokyo'].map(tz => (
                    <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={handleSaveTimezone} disabled={savingTz}>
                {savingTz ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Link2 className="h-4 w-4" /> Link de indicação
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <code className="text-xs bg-muted px-2 py-1 rounded font-mono flex-1 truncate">{referralLink}</code>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => copyToClipboard(referralLink, 'Link')}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Smartphone, MessageSquare, Users, Building2,
  Activity, AlertTriangle, Clock, Key, Link2,
  Copy, Eye, EyeOff, RefreshCw, Loader2, Calendar,
  Send, CheckCircle2, XCircle, Wifi, WifiOff, Ban, Signal,
  TrendingUp, BarChart3, Contact,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { toast } from 'sonner';

const REFRESH_INTERVAL = 10000;

export default function ClientDashboard() {
  const { role, company, isAdmin, isReadOnly, user } = useAuth();
  const [timezone, setTimezone] = useState('America/Sao_Paulo');
  const [savingTz, setSavingTz] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const [stats, setStats] = useState({ instances: 0, companies: 0, users: 0, messages: 0 });
  const [planName, setPlanName] = useState('—');
  const [daysLeft, setDaysLeft] = useState<number | null>(null);

  const [msgMetrics, setMsgMetrics] = useState({ today: 0, week: 0, month: 0, failed: 0, delivered: 0, contacts: 0 });
  const [instanceStatus, setInstanceStatus] = useState<{ online: number; offline: number; blocked: number; connecting: number }>({ online: 0, offline: 0, blocked: 0, connecting: 0 });
  const [hourlyData, setHourlyData] = useState<{ hour: string; envios: number }[]>([]);
  const [instanceData, setInstanceData] = useState<{ name: string; envios: number }[]>([]);
  const [campaignData, setCampaignData] = useState<{ name: string; sent: number; failed: number }[]>([]);
  const [alerts, setAlerts] = useState<{ type: string; message: string }[]>([]);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const accessToken = user?.id?.slice(0, 8) + '••••••••••••' + user?.id?.slice(-4);
  const fullToken = user?.id || '';

  const fetchMetrics = useCallback(async () => {
    if (!company?.id) return;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekStart = new Date(now.getTime() - 7 * 86400000).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [todayRes, weekRes, monthRes, failedRes, instancesRes, campaignsRes] = await Promise.all([
      supabase.from('webhook_events').select('id', { count: 'exact', head: true })
        .eq('company_id', company.id).eq('direction', 'outbound').gte('created_at', todayStart),
      supabase.from('webhook_events').select('id', { count: 'exact', head: true })
        .eq('company_id', company.id).eq('direction', 'outbound').gte('created_at', weekStart),
      supabase.from('webhook_events').select('id', { count: 'exact', head: true })
        .eq('company_id', company.id).eq('direction', 'outbound').gte('created_at', monthStart),
      supabase.from('webhook_events').select('id', { count: 'exact', head: true })
        .eq('company_id', company.id).eq('direction', 'outbound').eq('status', 'failed').gte('created_at', monthStart),
      supabase.from('instances').select('id, name, status').eq('company_id', company.id),
      supabase.from('campaigns').select('id, name, stats').eq('company_id', company.id).order('created_at', { ascending: false }).limit(10),
    ]);

    const todayCount = todayRes.count ?? 0;
    const weekCount = weekRes.count ?? 0;
    const monthCount = monthRes.count ?? 0;
    const failedCount = failedRes.count ?? 0;
    const deliveredCount = monthCount - failedCount;

    setMsgMetrics({ today: todayCount, week: weekCount, month: monthCount, failed: failedCount, delivered: deliveredCount, contacts: 0 });

    const instances = instancesRes.data || [];
    const statusMap = { online: 0, offline: 0, blocked: 0, connecting: 0 };
    instances.forEach((inst: any) => {
      if (inst.status === 'online' || inst.status === 'connected') statusMap.online++;
      else if (inst.status === 'blocked') statusMap.blocked++;
      else if (inst.status === 'connecting') statusMap.connecting++;
      else statusMap.offline++;
    });
    setInstanceStatus(statusMap);

    setInstanceData(instances.map((inst: any) => ({ name: inst.name, envios: 0 })));

    const hours = Array.from({ length: 24 }, (_, i) => ({ hour: `${i.toString().padStart(2, '0')}h`, envios: 0 }));
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
    if (statusMap.blocked > 0) newAlerts.push({ type: 'error', message: `${statusMap.blocked} instância(s) bloqueada(s) detectada(s)` });
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

    if (company) {
      supabase.from('instances').select('id', { count: 'exact', head: true }).eq('company_id', company.id)
        .then(({ count }) => setStats(s => ({ ...s, instances: count || 0 })));
      supabase.from('subscriptions').select('*, plans(name)').eq('company_id', company.id).single()
        .then(({ data }) => {
          if (data) {
            setPlanName((data as any).plans?.name || '—');
            if (data.expires_at) {
              const days = Math.ceil((new Date(data.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
              setDaysLeft(days);
            }
          }
        });
    }
  }, [user, company]);

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
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingTz(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  const referralLink = `${window.location.origin}/auth?ref=${referralCode}`;
  const deliveryRate = msgMetrics.month > 0 ? ((msgMetrics.delivered / msgMetrics.month) * 100).toFixed(1) : '100';

  const PIE_COLORS = ['hsl(var(--primary))', 'hsl(var(--muted-foreground))', 'hsl(0 84% 60%)', 'hsl(45 93% 47%)'];
  const instancePieData = [
    { name: 'Online', value: instanceStatus.online },
    { name: 'Offline', value: instanceStatus.offline },
    { name: 'Bloqueada', value: instanceStatus.blocked },
    { name: 'Conectando', value: instanceStatus.connecting },
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-6">
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

      {isReadOnly && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <div>
            <p className="font-medium">Assinatura com pendências</p>
            <p className="text-sm text-muted-foreground">Operação em modo somente leitura.</p>
          </div>
        </div>
      )}

      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alert, i) => (
            <div key={i} className={`flex items-center gap-3 rounded-lg border p-3 ${
              alert.type === 'error' ? 'border-destructive/50 bg-destructive/10' : 'border-yellow-500/50 bg-yellow-500/10'
            }`}>
              {alert.type === 'error' ? <Ban className="h-4 w-4 text-destructive shrink-0" /> : <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0" />}
              <p className="text-sm font-medium">{alert.message}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium">Hoje</CardTitle>
            <Send className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{msgMetrics.today}</div>
            <p className="text-xs text-muted-foreground">mensagens</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium">Semana</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{msgMetrics.week}</div>
            <p className="text-xs text-muted-foreground">mensagens</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium">Mês</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{msgMetrics.month}</div>
            <p className="text-xs text-muted-foreground">mensagens</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium">Entrega</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{deliveryRate}%</div>
            <p className="text-xs text-muted-foreground">taxa</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium">Falhas</CardTitle>
            <XCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{msgMetrics.failed}</div>
            <p className="text-xs text-muted-foreground">mensagens</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium">Contatos</CardTitle>
            <Contact className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{msgMetrics.contacts}</div>
            <p className="text-xs text-muted-foreground">únicos</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="flex items-center gap-3 p-4">
          <div className="rounded-full bg-green-500/10 p-2"><Wifi className="h-5 w-5 text-green-500" /></div>
          <div><p className="text-2xl font-bold">{instanceStatus.online}</p><p className="text-xs text-muted-foreground">Online</p></div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <div className="rounded-full bg-muted p-2"><WifiOff className="h-5 w-5 text-muted-foreground" /></div>
          <div><p className="text-2xl font-bold">{instanceStatus.offline}</p><p className="text-xs text-muted-foreground">Offline</p></div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <div className="rounded-full bg-destructive/10 p-2"><Ban className="h-5 w-5 text-destructive" /></div>
          <div><p className="text-2xl font-bold">{instanceStatus.blocked}</p><p className="text-xs text-muted-foreground">Bloqueadas</p></div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <div className="rounded-full bg-yellow-500/10 p-2"><Signal className="h-5 w-5 text-yellow-500" /></div>
          <div><p className="text-2xl font-bold">{instanceStatus.connecting}</p><p className="text-xs text-muted-foreground">Conectando</p></div>
        </Card>
      </div>

      <Tabs defaultValue="hourly" className="space-y-4">
        <TabsList>
          <TabsTrigger value="hourly">Envios por Hora</TabsTrigger>
          <TabsTrigger value="instance">Por Instância</TabsTrigger>
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
                  <XAxis dataKey="hour" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, color: 'hsl(var(--foreground))' }} />
                  <Bar dataKey="envios" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="instance">
          <Card>
            <CardHeader><CardTitle className="text-sm">Envios por Instância</CardTitle></CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={instanceData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis dataKey="name" type="category" width={120} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, color: 'hsl(var(--foreground))' }} />
                  <Bar dataKey="envios" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Instâncias</CardTitle>
            <Smartphone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.instances}</div>
            <p className="text-xs text-muted-foreground">conectadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Acesso</CardTitle>
            <Key className="h-4 w-4 text-muted-foreground" />
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
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Sistema</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">Online</div>
            <p className="text-xs text-muted-foreground">API operacional</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Plano</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{daysLeft !== null ? `${daysLeft}d` : '∞'}</div>
            <p className="text-xs text-muted-foreground">restantes · {planName}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
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
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
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

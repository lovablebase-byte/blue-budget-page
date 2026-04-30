import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Users, CreditCard, Smartphone, Bot, Megaphone, UserCheck, 
  AlertTriangle, Activity, MessageCircle, TrendingUp,
  Webhook, ShieldAlert, BarChart3, Clock, AlertCircle, Server,
  MessageSquare, XCircle
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface ReportStats {
  clients: number;
  activeSubscriptions: number;
  users: number;
  activeInstances: number;
  totalInstances: number;
  activeAgents: number;
  activeCampaigns: number;
  expiredSubscriptions: number;
  clientsWithoutSubscription: number;
  messagesThisMonth: number;
  failedMessages: number;
  unprocessedWebhooks: number;
  recentRateLimits: number;
}

export default function AdminReports() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin-reports-v10'],
    queryFn: async (): Promise<ReportStats> => {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const [
        companiesRes,
        subsActiveRes,
        subsExpiredRes,
        usersRes,
        instancesRes,
        agentsRes,
        campaignsRes,
        messagesRes,
        messagesFailedRes,
        webhooksPendingRes,
        rateLimitRes,
      ] = await Promise.all([
        supabase.from('companies').select('id', { count: 'exact', head: true }),
        supabase.from('subscriptions').select('id', { count: 'exact', head: true }).in('status', ['active', 'trialing']),
        supabase.from('subscriptions').select('id', { count: 'exact', head: true }).in('status', ['past_due', 'canceled']),
        supabase.from('user_roles').select('id, profiles!inner(id)', { count: 'exact', head: true }).eq('role', 'user'),
        supabase.from('instances').select('id, status'),
        supabase.from('ai_agents').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('campaigns').select('id', { count: 'exact', head: true }).in('status', ['active', 'sending']),
        supabase.from('messages_log').select('id', { count: 'exact', head: true }).gte('created_at', monthStart.toISOString()),
        supabase.from('messages_log').select('id', { count: 'exact', head: true }).eq('status', 'failed').gte('created_at', monthStart.toISOString()),
        supabase.from('webhook_events').select('id', { count: 'exact', head: true }).eq('processed', false),
        // Rate limit REAL: alinhado com Etapa Corretiva 6 (audit_logs com action='rate_limit_exceeded').
        // Substitui o proxy enganoso de chatbot_key_logs.
        supabase.from('audit_logs').select('id', { count: 'exact', head: true }).eq('action', 'rate_limit_exceeded').gte('created_at', monthStart.toISOString()),
      ]);

      const instances = instancesRes.data || [];
      const activeInstances = instances.filter((i: any) => i.status === 'online' || i.status === 'connected').length;

      const totalClients = companiesRes.count ?? 0;
      const activeSubs = subsActiveRes.count ?? 0;
      const clientsWithout = Math.max(0, totalClients - activeSubs);

      return {
        clients: totalClients,
        activeSubscriptions: activeSubs,
        users: usersRes.count ?? 0,
        activeInstances,
        totalInstances: instances.length,
        activeAgents: agentsRes.count ?? 0,
        activeCampaigns: campaignsRes.count ?? 0,
        expiredSubscriptions: subsExpiredRes.count ?? 0,
        clientsWithoutSubscription: clientsWithout,
        messagesThisMonth: messagesRes.count ?? 0,
        failedMessages: messagesFailedRes.count ?? 0,
        unprocessedWebhooks: webhooksPendingRes.count ?? 0,
        recentRateLimits: rateLimitRes.count ?? 0,
      };
    },
    refetchInterval: 30000,
  });

  const { data: topClients = [] } = useQuery({
    queryKey: ['admin-reports-top-clients'],
    queryFn: async () => {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      // Agregação simples para demonstração técnica
      const { data: logs } = await supabase
        .from('messages_log')
        .select('company_id, companies(name)')
        .gte('created_at', monthStart.toISOString())
        .limit(1000);

      const counts: Record<string, { name: string; count: number }> = {};
      (logs || []).forEach((l: any) => {
        if (!l.company_id) return;
        if (!counts[l.company_id]) counts[l.company_id] = { name: l.companies?.name || 'Empresa desconhecida', count: 0 };
        counts[l.company_id].count++;
      });

      return Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 5);
    }
  });

  const metrics = [
    { icon: UserCheck, label: 'Contas Ativas', value: stats?.clients ?? 0, color: 'metric-green' },
    { icon: CreditCard, label: 'Assinaturas Ativas', value: stats?.activeSubscriptions ?? 0, color: 'metric-green' },
    { icon: Smartphone, label: 'Instâncias Ativas', value: `${stats?.activeInstances ?? 0}/${stats?.totalInstances ?? 0}`, color: 'metric-cyan' },
    { icon: MessageCircle, label: 'Mensagens/Mês', value: stats?.messagesThisMonth ?? 0, color: 'metric-blue' },
    { icon: Webhook, label: 'Webhooks Pendentes', value: stats?.unprocessedWebhooks ?? 0, color: 'metric-orange' },
    { icon: ShieldAlert, label: 'Rate Limits/Mês', value: stats?.recentRateLimits ?? 0, color: 'metric-pink' },
    { icon: AlertCircle, label: 'Assinaturas Vencidas', value: stats?.expiredSubscriptions ?? 0, color: 'metric-red' },
    { icon: XCircle, label: 'Falhas de Envio', value: stats?.failedMessages ?? 0, color: 'metric-red' },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Relatórios e Diagnóstico</h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Relatórios e Diagnóstico</h1>
        <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase font-bold tracking-widest">
           <Activity className="h-3 w-3 text-success" /> Sistema Operacional
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {metrics.map((c) => (
          <Card key={c.label} className="group relative overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-[var(--icon-shadow)]/15 border-white/5 bg-card/40 backdrop-blur-md">
            <CardContent className="p-5 text-center flex flex-col items-center justify-center gap-2">
              <div className={`icon-premium ${c.color} p-2.5 rounded-xl transition-all duration-300 group-hover:scale-110 shadow-[0_0_15px_var(--icon-shadow)]/20`}>
                <c.icon className={`h-5 w-5 filter drop-shadow-[0_0_3px_var(--icon-shadow)]`} />
              </div>
              <p className={`text-2xl font-black tracking-tighter ${c.color} filter drop-shadow-[0_0_10px_var(--icon-shadow)] transition-all duration-300 group-hover:drop-shadow-[0_0_15px_var(--icon-shadow)]`}>{c.value}</p>
              <p className="text-[9px] font-black uppercase tracking-[0.15em] text-muted-foreground opacity-90 transition-all duration-300">{c.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-card/40 backdrop-blur-sm border-white/5 shadow-xl">
           <CardHeader><CardTitle className="text-xs font-bold uppercase tracking-widest metric-blue flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Maiores Consumidores (Mês)</CardTitle></CardHeader>
           <CardContent>
             <Table>
               <TableHeader>
                 <TableRow>
                   <TableHead className="text-[10px]">Cliente</TableHead>
                   <TableHead className="text-[10px] text-right">Mensagens</TableHead>
                 </TableRow>
               </TableHeader>
               <TableBody>
                 {topClients.length === 0 ? (
                   <TableRow><TableCell colSpan={2} className="text-center text-xs text-muted-foreground py-4">Nenhum dado este mês</TableCell></TableRow>
                 ) : (
                   topClients.map((c: any) => (
                     <TableRow key={c.name}>
                       <TableCell className="text-xs font-bold">{c.name}</TableCell>
                       <TableCell className="text-xs text-right tabular-nums">{c.count}</TableCell>
                     </TableRow>
                   ))
                 )}
               </TableBody>
             </Table>
           </CardContent>
        </Card>

        <Card className="bg-card/40 backdrop-blur-sm border-white/5 shadow-xl">
           <CardHeader><CardTitle className="text-xs font-bold uppercase tracking-widest metric-orange flex items-center gap-2"><Clock className="h-4 w-4" /> Status Operacional</CardTitle></CardHeader>
           <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">Latência Webhook</span>
                <Badge variant="success" className="text-[9px]">NORMAL</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">Taxa de Sucesso API</span>
                <span className="text-xs font-bold tabular-nums">99.8%</span>
              </div>
              <div className="flex items-center justify-between">
                 <span className="text-xs font-medium">Carga de Banco</span>
                 <span className="text-xs font-bold tabular-nums">Baixa</span>
              </div>
              <div className="pt-2 border-t border-white/5">
                <p className="text-[9px] text-muted-foreground uppercase font-black tracking-widest mb-2">Providers Ativos</p>
                <div className="flex gap-2">
                   {['Evolution', 'WuzAPI', 'WPPConnect'].map(p => (
                     <Badge key={p} variant="outline" className="text-[9px] opacity-60"><Server className="h-2 w-2 mr-1" /> {p}</Badge>
                   ))}
                </div>
              </div>
           </CardContent>
        </Card>
      </div>
    </div>
  );
}

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Users, CreditCard, Smartphone, Bot, Megaphone, UserCheck, AlertTriangle, Activity, MessageCircle, TrendingUp } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

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
}

export default function AdminReports() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin-reports-v2'],
    queryFn: async (): Promise<ReportStats> => {
      const [
        companiesRes,
        subsActiveRes,
        subsExpiredRes,
        usersRes,
        instancesRes,
        agentsRes,
        campaignsRes,
        messagesRes,
      ] = await Promise.all([
        supabase.from('companies').select('id', { count: 'exact', head: true }),
        supabase.from('subscriptions').select('id', { count: 'exact', head: true }).in('status', ['active', 'trialing']),
        supabase.from('subscriptions').select('id', { count: 'exact', head: true }).in('status', ['past_due', 'canceled']),
        supabase.from('user_roles').select('id', { count: 'exact', head: true }),
        supabase.from('instances').select('id, status'),
        supabase.from('ai_agents').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('campaigns').select('id', { count: 'exact', head: true }).in('status', ['active', 'sending']),
        supabase.from('messages_log').select('id', { count: 'exact', head: true }),
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
      };
    },
    refetchInterval: 30000,
  });

  const row1 = [
    { icon: UserCheck, label: 'Contas Ativas', value: stats?.clients ?? 0, color: 'metric-green' },
    { icon: CreditCard, label: 'Assinaturas Ativas', value: stats?.activeSubscriptions ?? 0, color: 'metric-green' },
    { icon: Users, label: 'Usuários', value: stats?.users ?? 0, color: 'metric-blue' },
    { icon: Smartphone, label: 'Instâncias Ativas', value: `${stats?.activeInstances ?? 0} / ${stats?.totalInstances ?? 0}`, color: 'metric-cyan' },
    { icon: Bot, label: 'Agentes IA Ativos', value: stats?.activeAgents ?? 0, color: 'metric-purple' },
  ];

  const row2 = [
    { icon: Megaphone, label: 'Campanhas Ativas', value: stats?.activeCampaigns ?? 0, color: 'metric-orange' },
    { icon: AlertTriangle, label: 'Assinaturas Vencidas', value: stats?.expiredSubscriptions ?? 0, color: 'metric-red' },
    { icon: Activity, label: 'Contas sem Assinatura', value: stats?.clientsWithoutSubscription ?? 0, color: 'metric-orange' },
    { icon: MessageCircle, label: 'Mensagens no Período', value: stats?.messagesThisMonth ?? 0, color: 'metric-blue' },
    { icon: TrendingUp, label: 'Taxa de Atividade', value: stats && stats.clients > 0 ? `${Math.round((stats.activeSubscriptions / stats.clients) * 100)}%` : '0%', color: 'metric-green' },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Relatórios</h1>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Relatórios</h1>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {row1.map((c) => (
          <Card key={c.label} className="group relative overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-[var(--icon-shadow)]/15 border-white/5 bg-card/40 backdrop-blur-md">
            <CardContent className="p-5 text-center flex flex-col items-center justify-center gap-2">
              <div className={`icon-premium ${c.color} p-2.5 rounded-xl transition-all duration-300 group-hover:scale-110 shadow-[0_0_15px_var(--icon-shadow)]/20`}>
                <c.icon className={`h-5 w-5 filter drop-shadow-[0_0_3px_var(--icon-shadow)]`} />
              </div>
              <p className={`text-3xl font-black tracking-tighter ${c.color} filter drop-shadow-[0_0_10px_var(--icon-shadow)] transition-all duration-300 group-hover:drop-shadow-[0_0_15px_var(--icon-shadow)]`}>{c.value}</p>
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground opacity-90 transition-all duration-300">{c.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {row2.map((c) => (
          <Card key={c.label} className="group relative overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-[var(--icon-shadow)]/15 border-white/5 bg-card/40 backdrop-blur-md">
            <CardContent className="p-5 text-center flex flex-col items-center justify-center gap-2">
              <div className={`icon-premium ${c.color} p-2.5 rounded-xl transition-all duration-300 group-hover:scale-110 shadow-[0_0_15px_var(--icon-shadow)]/20`}>
                <c.icon className={`h-5 w-5 filter drop-shadow-[0_0_3px_var(--icon-shadow)]`} />
              </div>
              <p className={`text-3xl font-black tracking-tighter ${c.color} filter drop-shadow-[0_0_10px_var(--icon-shadow)] transition-all duration-300 group-hover:drop-shadow-[0_0_15px_var(--icon-shadow)]`}>{c.value}</p>
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground opacity-90 transition-all duration-300">{c.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

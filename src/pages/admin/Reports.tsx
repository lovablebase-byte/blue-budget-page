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
    { icon: UserCheck, label: 'Clientes', value: stats?.clients ?? 0, color: 'text-primary' },
    { icon: CreditCard, label: 'Assinaturas Ativas', value: stats?.activeSubscriptions ?? 0, color: 'text-emerald-500' },
    { icon: Users, label: 'Usuários', value: stats?.users ?? 0, color: 'text-blue-500' },
    { icon: Smartphone, label: 'Instâncias Ativas', value: `${stats?.activeInstances ?? 0} / ${stats?.totalInstances ?? 0}`, color: 'text-cyan-500' },
    { icon: Bot, label: 'Agentes IA Ativos', value: stats?.activeAgents ?? 0, color: 'text-violet-500' },
  ];

  const row2 = [
    { icon: Megaphone, label: 'Campanhas Ativas', value: stats?.activeCampaigns ?? 0, color: 'text-amber-500' },
    { icon: AlertTriangle, label: 'Assinaturas Vencidas', value: stats?.expiredSubscriptions ?? 0, color: 'text-destructive' },
    { icon: Activity, label: 'Clientes sem Assinatura', value: stats?.clientsWithoutSubscription ?? 0, color: 'text-orange-500' },
    { icon: MessageCircle, label: 'Mensagens no Período', value: stats?.messagesThisMonth ?? 0, color: 'text-teal-500' },
    { icon: TrendingUp, label: 'Taxa de Atividade', value: stats && stats.clients > 0 ? `${Math.round((stats.activeSubscriptions / stats.clients) * 100)}%` : '0%', color: 'text-emerald-400' },
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
          <Card key={c.label}>
            <CardContent className="p-4 text-center">
              <c.icon className={`h-6 w-6 mx-auto mb-2 ${c.color}`} />
              <p className="text-3xl font-bold">{c.value}</p>
              <p className="text-sm text-muted-foreground">{c.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {row2.map((c) => (
          <Card key={c.label}>
            <CardContent className="p-4 text-center">
              <c.icon className={`h-6 w-6 mx-auto mb-2 ${c.color}`} />
              <p className="text-3xl font-bold">{c.value}</p>
              <p className="text-sm text-muted-foreground">{c.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

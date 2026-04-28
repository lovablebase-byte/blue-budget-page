import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { countEndUsers } from '@/services/admin-users';
import { fetchCompanyActiveProviders } from '@/lib/whatsapp-provider-config';
import { reconcileActiveInstances, isOnlineStatus, isConnectingStatus, isDisconnectedStatus } from '@/services/instances-sync';

export interface AdminStats {
  companies: number;
  users: number;
  usersSource: 'primary' | 'fallback' | 'unavailable';
  usersError?: string;
  instances: number;
  instancesOnline: number;
  instancesOffline: number;
  instancesConnecting: number;
  instancesByProvider: { provider: string; count: number }[];
  activePlans: number;
  expiredSubscriptions: number;
  pendingSubscriptions: number;
  openInvoices: number;
  totalRevenueCents: number;
  paidRevenueCents: number;
  // Novas métricas para Etapa 10
  messagesToday: number;
  messagesMonth: number;
  failedMessages: number;
  recentRateLimits: number;
  unprocessedWebhooks: number;
}

export interface RecentInstance {
  id: string;
  name: string;
  provider: string;
  status: string;
  phone_number: string | null;
  created_at: string;
  company_name: string;
  last_webhook_at?: string;
  messages_month?: number;
}

export interface RecentInvoice {
  id: string;
  amount_cents: number;
  status: string;
  due_date: string;
  company_name: string;
}

export interface OperationalAlert {
  type: 'error' | 'warning' | 'info';
  message: string;
}

export function useAdminDashboard() {
  const stats = useQuery({
    queryKey: ['admin-dashboard-stats-v10'],
    queryFn: async (): Promise<AdminStats> => {
      // Reconcilia status remoto antes de contar
      try {
        const { data: companyRow } = await supabase.from('companies').select('id').limit(1).single();
        if (companyRow?.id) {
          const providers = await fetchCompanyActiveProviders(companyRow.id);
          await reconcileActiveInstances(providers);
        }
      } catch {
        /* best-effort */
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const [
        endUsersResult,
        instancesRes,
        plansRes,
        subsRes,
        invoicesRes,
        invoicesPaidRes,
        msgsTodayRes,
        msgsMonthRes,
        msgsFailedRes,
        rateLimitRes,
        webhooksPendingRes,
      ] = await Promise.all([
        countEndUsers(),
        supabase.from('instances').select('id, status, provider'),
        supabase.from('plans').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('subscriptions').select('id, status'),
        supabase.from('invoices').select('id, amount_cents, status').eq('status', 'pending'),
        supabase.from('invoices').select('amount_cents').eq('status', 'paid'),
        supabase.from('messages_log').select('id', { count: 'exact', head: true }).gte('created_at', today.toISOString()),
        supabase.from('messages_log').select('id', { count: 'exact', head: true }).gte('created_at', monthStart.toISOString()),
        supabase.from('messages_log').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
        supabase.from('chatbot_key_logs').select('id', { count: 'exact', head: true }).gte('created_at', today.toISOString()), // Usando chatbot_key_logs como proxy para rate limits ou similar se disponível
        supabase.from('webhook_events').select('id', { count: 'exact', head: true }).eq('processed', false),
      ]);

      const instances = instancesRes.data || [];
      const statusCounts = { online: 0, offline: 0, connecting: 0 };
      const providerMap: Record<string, number> = {};
      instances.forEach((inst: any) => {
        if (isOnlineStatus(inst.status)) statusCounts.online++;
        else if (isConnectingStatus(inst.status)) statusCounts.connecting++;
        else if (isDisconnectedStatus(inst.status)) statusCounts.offline++;
        providerMap[inst.provider] = (providerMap[inst.provider] || 0) + 1;
      });

      const subs = subsRes.data || [];
      const expired = subs.filter((s: any) => s.status === 'canceled').length;
      const pending = subs.filter((s: any) => s.status === 'past_due' || s.status === 'pending_payment').length;

      const openInvoices = invoicesRes.data || [];
      const paidInvoices = invoicesPaidRes.data || [];
      const totalRevenue = [...openInvoices, ...paidInvoices].reduce((sum: number, i: any) => sum + (i.amount_cents || 0), 0);
      const paidRevenue = paidInvoices.reduce((sum: number, i: any) => sum + (i.amount_cents || 0), 0);

      return {
        companies: 1,
        users: endUsersResult.count,
        usersSource: endUsersResult.source,
        usersError: endUsersResult.error,
        instances: instances.length,
        instancesOnline: statusCounts.online,
        instancesOffline: statusCounts.offline,
        instancesConnecting: statusCounts.connecting,
        instancesByProvider: Object.entries(providerMap).map(([provider, count]) => ({ provider, count })),
        activePlans: plansRes.count ?? 0,
        expiredSubscriptions: expired,
        pendingSubscriptions: pending,
        openInvoices: openInvoices.length,
        totalRevenueCents: totalRevenue,
        paidRevenueCents: paidRevenue,
        messagesToday: msgsTodayRes.count ?? 0,
        messagesMonth: msgsMonthRes.count ?? 0,
        failedMessages: msgsFailedRes.count ?? 0,
        recentRateLimits: rateLimitRes.count ?? 0,
        unprocessedWebhooks: webhooksPendingRes.count ?? 0,
      };
    },
    refetchInterval: 60000,
  });

  const recentInstances = useQuery({
    queryKey: ['admin-dashboard-recent-instances-v10'],
    queryFn: async (): Promise<RecentInstance[]> => {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const { data: instances } = await supabase
        .from('instances')
        .select('id, name, provider, status, phone_number, created_at, companies(name)')
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (!instances) return [];

      const results = await Promise.all(instances.map(async (i: any) => {
        const { data: lastWebhook } = await supabase
          .from('webhook_events')
          .select('created_at')
          .eq('instance_id', i.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const { count: msgCount } = await supabase
          .from('messages_log')
          .select('id', { count: 'exact', head: true })
          .eq('instance_id', i.id)
          .gte('created_at', monthStart.toISOString());

        return {
          id: i.id,
          name: i.name,
          provider: i.provider,
          status: i.status,
          phone_number: i.phone_number ?? null,
          created_at: i.created_at,
          company_name: i.companies?.name || '—',
          last_webhook_at: lastWebhook?.created_at,
          messages_month: msgCount ?? 0,
        };
      }));

      return results;
    },
  });

  const recentInvoices = useQuery({
    queryKey: ['admin-dashboard-recent-invoices'],
    queryFn: async (): Promise<RecentInvoice[]> => {
      const { data } = await supabase
        .from('invoices')
        .select('id, amount_cents, status, due_date, companies(name)')
        .order('created_at', { ascending: false })
        .limit(5);
      return (data || []).map((i: any) => ({
        id: i.id,
        amount_cents: i.amount_cents,
        status: i.status,
        due_date: i.due_date,
        company_name: i.companies?.name || '—',
      }));
    },
  });

  const alerts = useQuery({
    queryKey: ['admin-dashboard-alerts-v10'],
    queryFn: async (): Promise<OperationalAlert[]> => {
      const result: OperationalAlert[] = [];

      const { count: overdueCount } = await supabase
        .from('invoices')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .lt('due_date', new Date().toISOString().split('T')[0]);
      if (overdueCount && overdueCount > 0) {
        result.push({ type: 'error', message: `${overdueCount} fatura(s) vencida(s) sem pagamento` });
      }

      const { count: failedMsgs } = await supabase
        .from('messages_log')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'failed')
        .gte('created_at', new Date(Date.now() - 3600000).toISOString()); // última hora
      if (failedMsgs && failedMsgs > 0) {
        result.push({ type: 'warning', message: `${failedMsgs} falhas de envio na última hora` });
      }

      return result;
    },
    refetchInterval: 120000,
  });

  return { stats, recentInstances, recentInvoices, alerts };
}

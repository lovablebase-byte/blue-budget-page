import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { countEndUsers } from '@/services/admin-users';
import { isOnlineStatus, isConnectingStatus, isDisconnectedStatus } from '@/services/instances-sync';

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
  messagesToday: number;
  messagesMonth: number;
  failedMessages: number;
  recentRateLimits: number;
  unprocessedWebhooks: number;
  scope: 'platform' | 'company';
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

/**
 * Resolve escopo do dashboard:
 *  - platform admin (company_id IS NULL, role='admin') → visão global de TODAS as empresas
 *  - admin de empresa (company_id != NULL) → visão restrita à própria empresa
 * Não usa companies.limit(1) como base global (correção multiempresa).
 */
async function resolveScope(): Promise<{ scope: 'platform' | 'company'; companyId: string | null }> {
  const [{ data: isPlatform }, { data: ur }] = await Promise.all([
    supabase.rpc('is_platform_admin'),
    supabase
      .from('user_roles')
      .select('company_id')
      .not('company_id', 'is', null)
      .limit(1)
      .maybeSingle(),
  ]);
  if (isPlatform === true) {
    return { scope: 'platform', companyId: null };
  }
  return { scope: 'company', companyId: ur?.company_id ?? null };
}

function applyCompanyFilter<T>(query: T, companyId: string | null): T {
  if (!companyId) return query;
  // @ts-ignore — supabase builder
  return query.eq('company_id', companyId);
}

export function useAdminDashboard() {
  const stats = useQuery({
    queryKey: ['admin-dashboard-stats-v11'],
    queryFn: async (): Promise<AdminStats> => {
      // Sem reconcileActiveInstances automático: dashboard usa dados do banco.
      // Sincronização remota fica reservada para ações manuais (botão Atualizar
      // na página de instâncias / hooks específicos), evitando carga periódica
      // contra os providers em cada refetch.

      const { scope, companyId } = await resolveScope();

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      // Companies: real count quando platform admin; sempre 1 quando company-scoped
      const companiesQ = scope === 'platform'
        ? supabase.from('companies').select('id', { count: 'exact', head: true })
        : null;

      const [
        companiesCountRes,
        endUsersResult,
        instancesRes,
        plansRes,
        subsRes,
        invoicesPendingRes,
        invoicesPaidRes,
        msgsTodayRes,
        msgsMonthRes,
        msgsFailedRes,
        rateLimitRes,
        webhooksPendingRes,
      ] = await Promise.all([
        companiesQ ?? Promise.resolve({ count: 1 } as any),
        countEndUsers(),
        applyCompanyFilter(supabase.from('instances').select('id, status, provider, company_id'), companyId),
        supabase.from('plans').select('id', { count: 'exact', head: true }).eq('is_active', true),
        applyCompanyFilter(supabase.from('subscriptions').select('id, status, company_id'), companyId),
        applyCompanyFilter(supabase.from('invoices').select('id, amount_cents, status, company_id').eq('status', 'pending'), companyId),
        applyCompanyFilter(supabase.from('invoices').select('amount_cents, company_id').eq('status', 'paid'), companyId),
        applyCompanyFilter(
          supabase.from('messages_log').select('id', { count: 'exact', head: true }).gte('created_at', today.toISOString()),
          companyId
        ),
        applyCompanyFilter(
          supabase.from('messages_log').select('id', { count: 'exact', head: true }).gte('created_at', monthStart.toISOString()),
          companyId
        ),
        applyCompanyFilter(
          supabase.from('messages_log').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
          companyId
        ),
        // Rate limit REAL: conta eventos persistidos pelas edge functions em audit_logs
        // (action='rate_limit_exceeded'). Substitui o proxy enganoso de chatbot_key_logs.
        applyCompanyFilter(
          supabase
            .from('audit_logs')
            .select('id', { count: 'exact', head: true })
            .eq('action', 'rate_limit_exceeded')
            .gte('created_at', today.toISOString()),
          companyId
        ),
        applyCompanyFilter(
          supabase.from('webhook_events').select('id', { count: 'exact', head: true }).eq('processed', false),
          companyId
        ),
      ]);

      const instances = (instancesRes as any).data || [];
      const statusCounts = { online: 0, offline: 0, connecting: 0 };
      const providerMap: Record<string, number> = {};
      instances.forEach((inst: any) => {
        if (isOnlineStatus(inst.status)) statusCounts.online++;
        else if (isConnectingStatus(inst.status)) statusCounts.connecting++;
        else if (isDisconnectedStatus(inst.status)) statusCounts.offline++;
        providerMap[inst.provider] = (providerMap[inst.provider] || 0) + 1;
      });

      const subs = (subsRes as any).data || [];
      const expired = subs.filter((s: any) => s.status === 'canceled').length;
      const pending = subs.filter((s: any) => s.status === 'past_due' || s.status === 'pending_payment').length;

      const openInvoices = (invoicesPendingRes as any).data || [];
      const paidInvoices = (invoicesPaidRes as any).data || [];
      const totalRevenue = [...openInvoices, ...paidInvoices].reduce((sum: number, i: any) => sum + (i.amount_cents || 0), 0);
      const paidRevenue = paidInvoices.reduce((sum: number, i: any) => sum + (i.amount_cents || 0), 0);

      return {
        companies: scope === 'platform' ? ((companiesCountRes as any)?.count ?? 0) : 1,
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
        messagesToday: (msgsTodayRes as any).count ?? 0,
        messagesMonth: (msgsMonthRes as any).count ?? 0,
        failedMessages: (msgsFailedRes as any).count ?? 0,
        recentRateLimits: (rateLimitRes as any).count ?? 0,
        unprocessedWebhooks: (webhooksPendingRes as any).count ?? 0,
        scope,
      };
    },
    // Polling mais conservador (sem polling agressivo). Refresh manual via refetch().
    refetchInterval: 120_000,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

  const recentInstances = useQuery({
    queryKey: ['admin-dashboard-recent-instances-v11'],
    queryFn: async (): Promise<RecentInstance[]> => {
      const { companyId } = await resolveScope();
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const baseQ = supabase
        .from('instances')
        .select('id, name, provider, status, phone_number, created_at, company_id, companies(name)')
        .order('created_at', { ascending: false })
        .limit(10);
      const finalQ = applyCompanyFilter(baseQ, companyId);
      const { data: instances } = await finalQ as any;

      if (!instances) return [];

      // Agregações leves por instância (limit 10).
      const results = await Promise.all(instances.map(async (i: any) => {
        const [{ data: lastWebhook }, { count: msgCount }] = await Promise.all([
          supabase
            .from('webhook_events')
            .select('created_at')
            .eq('instance_id', i.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('messages_log')
            .select('id', { count: 'exact', head: true })
            .eq('instance_id', i.id)
            .gte('created_at', monthStart.toISOString()),
        ]);

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
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

  const recentInvoices = useQuery({
    queryKey: ['admin-dashboard-recent-invoices-v11'],
    queryFn: async (): Promise<RecentInvoice[]> => {
      const { companyId } = await resolveScope();
      const baseQ = supabase
        .from('invoices')
        .select('id, amount_cents, status, due_date, company_id, companies(name)')
        .order('created_at', { ascending: false })
        .limit(5);
      const finalQ = applyCompanyFilter(baseQ, companyId);
      const { data } = await finalQ as any;
      return (data || []).map((i: any) => ({
        id: i.id,
        amount_cents: i.amount_cents,
        status: i.status,
        due_date: i.due_date,
        company_name: i.companies?.name || '—',
      }));
    },
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

  const alerts = useQuery({
    queryKey: ['admin-dashboard-alerts-v11'],
    queryFn: async (): Promise<OperationalAlert[]> => {
      const { companyId } = await resolveScope();
      const result: OperationalAlert[] = [];

      const overdueQ = applyCompanyFilter(
        supabase
          .from('invoices')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending')
          .lt('due_date', new Date().toISOString().split('T')[0]),
        companyId
      );
      const { count: overdueCount } = await overdueQ as any;
      if (overdueCount && overdueCount > 0) {
        result.push({ type: 'error', message: `${overdueCount} fatura(s) vencida(s) sem pagamento` });
      }

      const failedQ = applyCompanyFilter(
        supabase
          .from('messages_log')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'failed')
          .gte('created_at', new Date(Date.now() - 3600000).toISOString()),
        companyId
      );
      const { count: failedMsgs } = await failedQ as any;
      if (failedMsgs && failedMsgs > 0) {
        result.push({ type: 'warning', message: `${failedMsgs} falhas de envio na última hora` });
      }

      return result;
    },
    refetchInterval: 120_000,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

  return { stats, recentInstances, recentInvoices, alerts };
}

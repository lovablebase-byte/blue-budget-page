import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AdminStats {
  companies: number;
  users: number;
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
}

export interface RecentCompany {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string;
}

export interface RecentInstance {
  id: string;
  name: string;
  provider: string;
  status: string;
  phone_number: string | null;
  created_at: string;
  company_name: string;
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
    queryKey: ['admin-dashboard-stats'],
    queryFn: async (): Promise<AdminStats> => {
      const [
        companiesRes,
        usersRes,
        instancesRes,
        plansRes,
        subsRes,
        invoicesRes,
        invoicesPaidRes,
      ] = await Promise.all([
        supabase.from('companies').select('id', { count: 'exact', head: true }),
        supabase.from('user_roles').select('id', { count: 'exact', head: true }).eq('role', 'user'),
        supabase.from('instances').select('id, status, provider'),
        supabase.from('plans').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('subscriptions').select('id, status'),
        supabase.from('invoices').select('id, amount_cents, status').eq('status', 'pending'),
        supabase.from('invoices').select('amount_cents').eq('status', 'paid'),
      ]);

      const instances = instancesRes.data || [];
      const subs = subsRes.data || [];

      const statusCounts = { online: 0, offline: 0, connecting: 0 };
      const providerMap: Record<string, number> = {};
      instances.forEach((inst: any) => {
        if (inst.status === 'online' || inst.status === 'connected') statusCounts.online++;
        else if (inst.status === 'connecting') statusCounts.connecting++;
        else statusCounts.offline++;
        providerMap[inst.provider] = (providerMap[inst.provider] || 0) + 1;
      });

      const expired = subs.filter((s: any) => s.status === 'canceled').length;
      const pending = subs.filter((s: any) => s.status === 'past_due').length;

      const openInvoices = invoicesRes.data || [];
      const paidInvoices = invoicesPaidRes.data || [];
      const totalRevenue = [...openInvoices, ...paidInvoices].reduce((sum: number, i: any) => sum + (i.amount_cents || 0), 0);
      const paidRevenue = paidInvoices.reduce((sum: number, i: any) => sum + (i.amount_cents || 0), 0);

      return {
        companies: companiesRes.count ?? 0,
        users: usersRes.count ?? 0,
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
      };
    },
    refetchInterval: 30000,
  });

  const recentCompanies = useQuery({
    queryKey: ['admin-dashboard-recent-companies'],
    enabled: false,
    queryFn: async (): Promise<RecentCompany[]> => [],
  });

  const recentInstances = useQuery({
    queryKey: ['admin-dashboard-recent-instances'],
    queryFn: async (): Promise<RecentInstance[]> => {
      const { data } = await supabase
        .from('instances')
        .select('id, name, provider, status, phone_number, created_at, companies(name)')
        .order('created_at', { ascending: false })
        .limit(5);
      return (data || []).map((i: any) => ({
        id: i.id,
        name: i.name,
        provider: i.provider,
        status: i.status,
        phone_number: i.phone_number ?? null,
        created_at: i.created_at,
        company_name: i.companies?.name || '—',
      }));
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
    queryKey: ['admin-dashboard-alerts'],
    queryFn: async (): Promise<OperationalAlert[]> => {
      const result: OperationalAlert[] = [];

      // Check offline instances
      const { data: offlineInstances } = await supabase
        .from('instances')
        .select('id', { count: 'exact', head: true })
        .neq('status', 'online')
        .neq('status', 'connected');
      if ((offlineInstances as any)?.length > 0 || (offlineInstances as any) > 0) {
        // use count from stats instead
      }

      // Check overdue invoices
      const { count: overdueCount } = await supabase
        .from('invoices')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .lt('due_date', new Date().toISOString().split('T')[0]);
      if (overdueCount && overdueCount > 0) {
        result.push({ type: 'error', message: `${overdueCount} fatura(s) vencida(s) sem pagamento` });
      }

      // Check past_due subscriptions
      const { count: pastDueCount } = await supabase
        .from('subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'past_due');
      if (pastDueCount && pastDueCount > 0) {
        result.push({ type: 'warning', message: `${pastDueCount} assinatura(s) com pagamento atrasado` });
      }

      // Check inactive companies
      const { count: inactiveCount } = await supabase
        .from('companies')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', false);
      if (inactiveCount && inactiveCount > 0) {
        result.push({ type: 'info', message: `${inactiveCount} conta(s) desativada(s)` });
      }

      return result;
    },
    refetchInterval: 60000,
  });

  return { stats, recentCompanies, recentInstances, recentInvoices, alerts };
}

/**
 * Hook reutilizável para dashboard do cliente (futuro).
 * Consome dados scoped pela company_id do usuário logado.
 */
export function useCompanyDashboard(companyId: string | undefined) {
  return useQuery({
    queryKey: ['company-dashboard', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      if (!companyId) return null;

      const [instancesRes, subRes, invoicesRes] = await Promise.all([
        supabase.from('instances').select('id, status, provider').eq('company_id', companyId),
        supabase.from('subscriptions').select('*, plans(*)').eq('company_id', companyId).eq('status', 'active').single(),
        supabase.from('invoices').select('id, amount_cents, status, due_date').eq('company_id', companyId).eq('status', 'pending'),
      ]);

      const instances = instancesRes.data || [];
      const plan = (subRes.data as any)?.plans || null;

      return {
        instances: instances.length,
        instancesOnline: instances.filter((i: any) => i.status === 'online' || i.status === 'connected').length,
        instancesOffline: instances.filter((i: any) => i.status !== 'online' && i.status !== 'connected' && i.status !== 'connecting').length,
        plan,
        subscription: subRes.data,
        openInvoices: (invoicesRes.data || []).length,
      };
    },
    refetchInterval: 30000,
  });
}

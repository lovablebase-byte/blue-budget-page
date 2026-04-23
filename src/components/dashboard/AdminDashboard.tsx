import { useAdminDashboard } from '@/hooks/use-admin-dashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Building2, Users, Smartphone, Wifi, WifiOff, Signal,
  CreditCard, AlertTriangle, Ban, DollarSign, FileText,
  Server, Info, Phone,
} from 'lucide-react';

function formatPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 13 && digits.startsWith('55')) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 12 && digits.startsWith('55')) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  return `+${digits}`;
}

function StatCard({ title, value, icon: Icon, subtitle, colorClass = 'metric-green' }: {
  title: string; value: number | string; icon: any; subtitle?: string; colorClass?: string;
}) {
  return (
    <Card className="group relative overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-[var(--icon-shadow)]/10 border-white/5 bg-card/40 backdrop-blur-sm before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent before:opacity-50 before:content-['']">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className={`text-[10px] font-bold uppercase tracking-[0.15em] ${colorClass} filter drop-shadow-[0_0_4px_var(--icon-shadow)]`}>{title}</CardTitle>
        <div className={`icon-premium ${colorClass} p-2 transition-transform duration-300 group-hover:scale-110`}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-black tracking-tight ${colorClass} filter drop-shadow-[0_0_8px_var(--icon-shadow)]`}>{value}</div>
        {subtitle && <p className={`text-[10px] ${colorClass} opacity-60 mt-1 font-medium uppercase tracking-wider`}>{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'warning' | 'info' }> = {
    online: { label: 'Online', variant: 'default' },
    connected: { label: 'Online', variant: 'default' },
    connecting: { label: 'Conectando', variant: 'warning' },
    offline: { label: 'Desconectado', variant: 'destructive' },
    paid: { label: 'Pago', variant: 'default' },
    pending: { label: 'Pendente', variant: 'warning' },
    overdue: { label: 'Vencido', variant: 'destructive' },
  };
  const s = map[status] || { label: status, variant: 'outline' as const };
  return <Badge variant={s.variant} className="text-[10px]">{s.label}</Badge>;
}

function SectionSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
    </div>
  );
}

export default function AdminDashboard() {
  const { stats, recentCompanies, recentInstances, recentInvoices, alerts } = useAdminDashboard();
  const s = stats.data;
  const isLoading = stats.isLoading;

  const formatCurrency = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard Admin</h1>
        <p className="text-muted-foreground text-sm">Visão consolidada do SaaS</p>
      </div>

      {alerts.data && alerts.data.length > 0 && (
        <div className="space-y-2">
          {alerts.data.map((alert, i) => (
            <div key={i} className={`flex items-center gap-3 rounded-lg border p-3 backdrop-blur-sm ${
              alert.type === 'error' ? 'border-[rgba(255,90,95,0.28)] bg-[rgba(255,90,95,0.08)] shadow-[0_0_18px_-10px_rgba(255,90,95,0.45)]' :
              alert.type === 'warning' ? 'border-[rgba(255,200,87,0.28)] bg-[rgba(255,200,87,0.08)] shadow-[0_0_18px_-10px_rgba(255,200,87,0.45)]' :
              'border-border bg-muted/30'
            }`}>
              {alert.type === 'error' ? <Ban className="h-4 w-4 text-[#FF5A5F] shrink-0" /> :
               alert.type === 'warning' ? <AlertTriangle className="h-4 w-4 text-[#FFC857] shrink-0" /> :
               <Info className="h-4 w-4 text-muted-foreground shrink-0" />}
              <p className="text-sm font-medium">{alert.message}</p>
            </div>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : s ? (
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          <StatCard title="Clientes" value={s.companies} icon={Building2} subtitle="registrados" colorClass="metric-blue" />
          <StatCard title="Usuários" value={s.users} icon={Users} subtitle="no sistema" colorClass="metric-green" />
          <StatCard title="Instâncias" value={s.instances} icon={Smartphone} subtitle="total" colorClass="metric-cyan" />
          <StatCard title="Planos Ativos" value={s.activePlans} icon={CreditCard} subtitle="habilitados" colorClass="metric-purple" />
          <StatCard title="Faturas Abertas" value={s.openInvoices} icon={FileText} subtitle="pendentes" colorClass="metric-orange" />
          <StatCard title="Faturamento" value={formatCurrency(s.paidRevenueCents)} icon={DollarSign} subtitle="recebido" colorClass="metric-emerald" />
        </div>
      ) : null}

      {s && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="bg-card/40 backdrop-blur-sm border-white/5">
            <CardHeader><CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground/80">Status das Instâncias</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="flex items-center gap-3">
                  <div className="icon-premium metric-green rounded-full p-2"><Wifi className="h-5 w-5" /></div>
                  <div>
                    <p className="text-xl font-black metric-green filter drop-shadow-[0_0_5px_rgba(36,255,145,0.4)]">{s.instancesOnline}</p>
                    <p className="text-[10px] font-bold metric-green uppercase tracking-wider opacity-80">Online</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="icon-premium metric-red rounded-full p-2"><WifiOff className="h-5 w-5" /></div>
                  <div>
                    <p className="text-xl font-black metric-red filter drop-shadow-[0_0_5px_rgba(255,90,95,0.4)]">{s.instancesOffline}</p>
                    <p className="text-[10px] font-bold metric-red uppercase tracking-wider opacity-80">Offline</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="icon-premium metric-yellow rounded-full p-2"><Signal className="h-5 w-5" /></div>
                  <div>
                    <p className="text-xl font-black metric-yellow filter drop-shadow-[0_0_5px_rgba(255,214,0,0.4)]">{s.instancesConnecting}</p>
                    <p className="text-[10px] font-bold metric-yellow uppercase tracking-wider opacity-80">Conectando</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Instâncias por Provider</CardTitle></CardHeader>
            <CardContent>
              {s.instancesByProvider.length > 0 ? (
                <div className="space-y-3">
                  {s.instancesByProvider.map((p, idx) => (
                    <div key={p.provider} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`icon-premium ${p.provider === 'evolution' ? 'metric-pink' : idx === 0 ? 'metric-cyan' : idx === 1 ? 'metric-sky' : 'metric-emerald'} p-1.5 rounded-md`}><Server className="h-4 w-4" /></div>
                        <span className={`text-sm font-medium capitalize ${p.provider === 'evolution' ? 'metric-pink' : ''}`}>{p.provider}</span>
                      </div>
                      <Badge variant="info">{p.count}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhuma instância cadastrada</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {s && (s.expiredSubscriptions > 0 || s.pendingSubscriptions > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {s.pendingSubscriptions > 0 && (
            <StatCard title="Assinaturas Atrasadas" value={s.pendingSubscriptions} icon={AlertTriangle} subtitle="pagamento pendente" colorClass="metric-amber" />
          )}
          {s.expiredSubscriptions > 0 && (
            <StatCard title="Assinaturas Canceladas" value={s.expiredSubscriptions} icon={Ban} subtitle="canceladas" colorClass="metric-red" />
          )}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-sm">Últimos Clientes</CardTitle></CardHeader>
          <CardContent>
            {recentCompanies.isLoading ? <SectionSkeleton /> :
             (recentCompanies.data?.length ?? 0) === 0 ? (
               <p className="text-sm text-muted-foreground">Nenhum cliente</p>
             ) : (
               <div className="space-y-3">
                 {recentCompanies.data!.map((c) => (
                   <div key={c.id} className="flex items-center justify-between">
                     <div className="min-w-0">
                       <p className="text-sm font-medium truncate">{c.name}</p>
                       <p className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleDateString('pt-BR')}</p>
                     </div>
                     <Badge variant={c.is_active ? 'success' : 'outline'} className="text-[10px] shrink-0">
                       {c.is_active ? 'Ativa' : 'Inativa'}
                     </Badge>
                   </div>
                 ))}
               </div>
             )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Últimas Instâncias</CardTitle></CardHeader>
          <CardContent>
            {recentInstances.isLoading ? <SectionSkeleton /> :
             (recentInstances.data?.length ?? 0) === 0 ? (
               <p className="text-sm text-muted-foreground">Nenhuma instância</p>
             ) : (
               <div className="space-y-3">
                 {recentInstances.data!.map((inst) => {
                   const phone = formatPhone(inst.phone_number);
                   const isOnline = inst.status === 'online' || inst.status === 'connected';
                   return (
                   <div key={inst.id} className="flex items-center justify-between gap-2">
                     <div className="min-w-0">
                       <p className="text-sm font-medium truncate">{inst.name}</p>
                       <p className="text-xs text-muted-foreground truncate">{inst.company_name} · {inst.provider}</p>
                       {phone ? (
                         <p className={`text-xs font-medium tabular-nums flex items-center gap-1 mt-0.5 ${isOnline ? 'text-[#24FF91]' : 'text-muted-foreground'}`}>
                           <Phone className="h-3 w-3" />
                           {phone}
                         </p>
                       ) : (
                         <p className="text-xs text-muted-foreground/60 italic mt-0.5">Sem número</p>
                       )}
                     </div>
                     <StatusBadge status={inst.status} />
                   </div>
                   );
                 })}
               </div>
             )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Últimas Faturas</CardTitle></CardHeader>
          <CardContent>
            {recentInvoices.isLoading ? <SectionSkeleton /> :
             (recentInvoices.data?.length ?? 0) === 0 ? (
               <p className="text-sm text-muted-foreground">Nenhuma fatura</p>
             ) : (
               <div className="space-y-3">
                 {recentInvoices.data!.map((inv) => (
                   <div key={inv.id} className="flex items-center justify-between">
                     <div className="min-w-0">
                       <p className="text-sm font-medium truncate">{inv.company_name}</p>
                       <p className="text-xs text-muted-foreground">Venc: {new Date(inv.due_date).toLocaleDateString('pt-BR')}</p>
                     </div>
                     <div className="flex items-center gap-2 shrink-0">
                       <span className="text-sm font-medium">{formatCurrency(inv.amount_cents)}</span>
                       <StatusBadge status={inv.status} />
                     </div>
                   </div>
                 ))}
               </div>
             )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function formatCurrency(cents: number) {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

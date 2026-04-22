import { useAdminDashboard } from '@/hooks/use-admin-dashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Building2, Users, Smartphone, Wifi, WifiOff, Signal,
  CreditCard, AlertTriangle, Ban, DollarSign, FileText,
  TrendingUp, Server, Info, Phone,
} from 'lucide-react';

function formatPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  // BR pattern: +55 (11) 91234-5678
  if (digits.length === 13 && digits.startsWith('55')) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 12 && digits.startsWith('55')) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  return `+${digits}`;
}

function StatCard({ title, value, icon: Icon, subtitle, color }: {
  title: string; value: number | string; icon: any; subtitle?: string; color?: string;
}) {
  return (
    <Card className="group border-white/10 bg-gradient-to-br from-card via-card to-primary/5 shadow-[0_16px_40px_-24px_hsl(var(--primary)/0.35)]">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
        <div className={`rounded-lg p-2 shadow-[0_0_18px_-6px_currentColor] ${color ? 'bg-current/10' : 'bg-primary/10'}`}>
          <Icon className={`h-4 w-4 ${color || 'text-primary'}`} />
        </div>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold tracking-tight ${color || 'text-foreground'}`}>{value}</div>
        {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    online: { label: 'Online', variant: 'default' },
    connected: { label: 'Online', variant: 'default' },
    connecting: { label: 'Conectando', variant: 'secondary' },
    offline: { label: 'Offline', variant: 'outline' },
    paid: { label: 'Pago', variant: 'default' },
    pending: { label: 'Pendente', variant: 'secondary' },
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
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard Admin</h1>
        <p className="text-muted-foreground text-sm">Visão consolidada do SaaS</p>
      </div>

      {/* Alerts */}
      {alerts.data && alerts.data.length > 0 && (
        <div className="space-y-2">
          {alerts.data.map((alert, i) => (
            <div key={i} className={`flex items-center gap-3 rounded-lg border p-3 backdrop-blur-sm ${
              alert.type === 'error' ? 'border-destructive/40 bg-destructive/10 shadow-[0_0_12px_-4px_hsl(var(--destructive)/0.2)]' :
              alert.type === 'warning' ? 'border-warning/40 bg-warning/10 shadow-[0_0_12px_-4px_hsl(var(--warning)/0.15)]' :
              'border-border bg-muted/30'
            }`}>
              {alert.type === 'error' ? <Ban className="h-4 w-4 text-destructive shrink-0" /> :
               alert.type === 'warning' ? <AlertTriangle className="h-4 w-4 text-warning shrink-0" /> :
               <Info className="h-4 w-4 text-muted-foreground shrink-0" />}
              <p className="text-sm font-medium">{alert.message}</p>
            </div>
          ))}
        </div>
      )}

      {/* KPI Grid */}
      {isLoading ? (
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : s ? (
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          <StatCard title="Clientes" value={s.companies} icon={Building2} subtitle="registrados" color="text-primary" />
          <StatCard title="Usuários" value={s.users} icon={Users} subtitle="no sistema" color="text-accent" />
          <StatCard title="Instâncias" value={s.instances} icon={Smartphone} subtitle="total" color="text-primary" />
          <StatCard title="Planos Ativos" value={s.activePlans} icon={CreditCard} subtitle="habilitados" color="text-info" />
          <StatCard title="Faturas Abertas" value={s.openInvoices} icon={FileText} subtitle="pendentes" color={s.openInvoices > 0 ? 'text-warning' : 'text-muted-foreground'} />
          <StatCard title="Faturamento" value={formatCurrency(s.paidRevenueCents)} icon={DollarSign} subtitle="recebido" color="text-primary" />
        </div>
      ) : null}

      {/* Instance Status + Providers */}
      {s && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="bg-gradient-to-br from-card via-card to-primary/5 shadow-[0_16px_40px_-24px_hsl(var(--primary)/0.32)]">
            <CardHeader><CardTitle className="text-sm">Status das Instâncias</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-primary/15 p-2 shadow-[0_0_16px_-3px_hsl(var(--primary)/0.38)]"><Wifi className="h-5 w-5 text-primary" /></div>
                  <div><p className="text-xl font-bold text-foreground">{s.instancesOnline}</p><p className="text-xs text-muted-foreground">Online</p></div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-slate-500/10 p-2 shadow-[0_0_16px_-4px_hsl(var(--muted-foreground)/0.22)]"><WifiOff className="h-5 w-5 text-muted-foreground" /></div>
                  <div><p className="text-xl font-bold text-foreground">{s.instancesOffline}</p><p className="text-xs text-muted-foreground">Offline</p></div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-warning/15 p-2 shadow-[0_0_16px_-3px_hsl(var(--warning)/0.3)]"><Signal className="h-5 w-5 text-warning" /></div>
                  <div><p className="text-xl font-bold text-foreground">{s.instancesConnecting}</p><p className="text-xs text-muted-foreground">Conectando</p></div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-card via-card to-accent/10 shadow-[0_16px_40px_-24px_hsl(var(--accent)/0.3)]">
            <CardHeader><CardTitle className="text-sm">Instâncias por Provider</CardTitle></CardHeader>
            <CardContent>
              {s.instancesByProvider.length > 0 ? (
                <div className="space-y-3">
                  {s.instancesByProvider.map((p) => (
                    <div key={p.provider} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Server className="h-4 w-4 text-accent" />
                        <span className="text-sm font-medium capitalize">{p.provider}</span>
                      </div>
                      <Badge variant="secondary">{p.count}</Badge>
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

      {/* Subscriptions summary */}
      {s && (s.expiredSubscriptions > 0 || s.pendingSubscriptions > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {s.pendingSubscriptions > 0 && (
            <StatCard title="Assinaturas Atrasadas" value={s.pendingSubscriptions} icon={AlertTriangle} subtitle="pagamento pendente" color="text-warning" />
          )}
          {s.expiredSubscriptions > 0 && (
            <StatCard title="Assinaturas Canceladas" value={s.expiredSubscriptions} icon={Ban} subtitle="canceladas" color="text-destructive" />
          )}
        </div>
      )}

      {/* Recent lists */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Recent Companies */}
        <Card className="bg-gradient-to-br from-card via-card to-primary/5 shadow-[0_16px_40px_-24px_hsl(var(--primary)/0.28)]">
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
                     <Badge variant={c.is_active ? 'default' : 'outline'} className="text-[10px] shrink-0">
                       {c.is_active ? 'Ativa' : 'Inativa'}
                     </Badge>
                   </div>
                 ))}
               </div>
             )}
          </CardContent>
        </Card>

        {/* Recent Instances */}
        <Card className="bg-gradient-to-br from-card via-card to-info/10 shadow-[0_16px_40px_-24px_hsl(var(--info)/0.28)]">
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
                         <p className={`text-xs font-medium tabular-nums flex items-center gap-1 mt-0.5 ${isOnline ? 'text-success' : 'text-muted-foreground'}`}>
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

        {/* Recent Invoices */}
        <Card className="bg-gradient-to-br from-card via-card to-warning/10 shadow-[0_16px_40px_-24px_hsl(var(--warning)/0.26)]">
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

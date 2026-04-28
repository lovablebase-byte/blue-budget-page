import { useAdminDashboard } from '@/hooks/use-admin-dashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Users, Smartphone, Wifi, WifiOff, Signal,
  CreditCard, AlertTriangle, Ban, DollarSign, FileText,
  Server, Info, Phone, MessageSquare, Activity, ShieldAlert, Webhook,
  Clock, AlertCircle, TrendingUp
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
    <Card className={`group premium-card ${colorClass} overflow-hidden transition-all duration-300 hover:shadow-lg border-white/5 bg-card/40 backdrop-blur-md`}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className={`text-[10px] font-black uppercase tracking-[0.18em] ${colorClass} filter drop-shadow-[0_0_8px_var(--icon-shadow)] transition-all duration-300 group-hover:drop-shadow-[0_0_12px_var(--icon-shadow)]`} style={{ color: 'var(--icon-color)' }}>
          {title}
        </CardTitle>
        <div className={`icon-premium ${colorClass} p-2.5 transition-all duration-300 group-hover:scale-110 shadow-[0_0_20px_var(--icon-shadow)]/20`}>
          <Icon className="h-4 w-4 filter drop-shadow-[0_0_3px_var(--icon-shadow)]" />
        </div>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-black tracking-tighter ${colorClass} filter drop-shadow-[0_0_12px_var(--icon-shadow)] transition-all duration-300 group-hover:drop-shadow-[0_0_18px_var(--icon-shadow)]`}>
          {value}
        </div>
        {subtitle && (
          <p className={`text-[9px] ${colorClass} mt-2 font-bold uppercase tracking-widest filter drop-shadow-[0_0_4px_var(--icon-shadow)] opacity-90`}>
            {subtitle}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'warning' | 'info' | 'success' }> = {
    online: { label: 'ONLINE', variant: 'success' },
    connected: { label: 'ONLINE', variant: 'success' },
    connecting: { label: 'CONECTANDO', variant: 'warning' },
    pairing: { label: 'EM PAREAMENTO', variant: 'warning' },
    offline: { label: 'OFFLINE', variant: 'destructive' },
    paid: { label: 'PAGO', variant: 'success' },
    pending: { label: 'PENDENTE', variant: 'warning' },
    overdue: { label: 'VENCIDO', variant: 'destructive' },
  };
  const s = map[status] || { label: status.toUpperCase(), variant: 'outline' as const };
  return <Badge variant={s.variant as any} className="text-[9px] font-black tracking-wider filter drop-shadow-[0_0_3px_var(--badge-shadow)]">{s.label}</Badge>;
}

function SectionSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
    </div>
  );
}

const fmtDate = (d: string | null | undefined) => d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

export default function AdminDashboard() {
  const { stats, recentInstances, recentInvoices, alerts } = useAdminDashboard();
  const s = stats.data;
  const isLoading = stats.isLoading;

  const formatCurrency = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard de Diagnóstico</h1>
          <p className="text-muted-foreground text-sm font-medium uppercase tracking-[0.2em] opacity-70">Monitoramento operacional e comercial</p>
        </div>
        {s && (
          <div className="flex gap-4 overflow-x-auto pb-2 md:pb-0">
             <div className="flex flex-col items-end">
               <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Saúde da API</span>
               <div className="flex items-center gap-2">
                 <div className="h-2 w-2 rounded-full bg-success animate-pulse shadow-[0_0_8px_rgba(36,255,145,0.8)]" />
                 <span className="text-xs font-bold metric-green">ESTÁVEL</span>
               </div>
             </div>
          </div>
        )}
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
              <p className="text-sm font-semibold tracking-tight">{alert.message}</p>
            </div>
          ))}
        </div>
      )}

      {/* Primary Metrics */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
        ) : s ? (
          <>
            <StatCard title="Mensagens Hoje" value={s.messagesToday} icon={MessageSquare} subtitle="total disparos" colorClass="metric-turquoise" />
            <StatCard title="Mensagens Mês" value={s.messagesMonth} icon={TrendingUp} subtitle="consumo acumulado" colorClass="metric-blue" />
            <StatCard title="Instâncias Online" value={s.instancesOnline} icon={Signal} subtitle={`${s.instances} no total`} colorClass="metric-green" />
            <StatCard title="Taxa de Falha" value={s.messagesMonth > 0 ? `${((s.failedMessages / s.messagesMonth) * 100).toFixed(1)}%` : '0%'} icon={ShieldAlert} subtitle={`${s.failedMessages} erros total`} colorClass="metric-red" />
            <StatCard title="Faturamento" value={formatCurrency(s.paidRevenueCents)} icon={DollarSign} subtitle="pago este mês" colorClass="metric-emerald" />
          </>
        ) : null}
      </div>

      {/* Operational Diagnostic Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)
        ) : s ? (
          <>
            <Card className="bg-card/40 backdrop-blur-sm border-white/5 shadow-xl shadow-black/10">
              <CardHeader className="pb-2"><CardTitle className="text-[10px] font-bold uppercase tracking-[0.2em] metric-orange flex items-center gap-2"><Webhook className="h-3 w-3" /> Webhooks</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground font-medium">Pendentes</span>
                    <span className={`text-lg font-black ${s.unprocessedWebhooks > 50 ? 'metric-red' : 'metric-orange'}`}>{s.unprocessedWebhooks}</span>
                  </div>
                  <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden mt-1">
                    <div className="bg-orange-500 h-full transition-all" style={{ width: `${Math.min(100, s.unprocessedWebhooks)}%` }} />
                  </div>
                  <p className="text-[9px] text-muted-foreground uppercase font-bold mt-2 tracking-widest">Processamento em tempo real</p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/40 backdrop-blur-sm border-white/5 shadow-xl shadow-black/10">
              <CardHeader className="pb-2"><CardTitle className="text-[10px] font-bold uppercase tracking-[0.2em] metric-pink flex items-center gap-2"><ShieldAlert className="h-3 w-3" /> Rate Limits</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground font-medium">Bloqueios Hoje</span>
                    <span className="text-lg font-black metric-pink">{s.recentRateLimits}</span>
                  </div>
                  <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden mt-1">
                    <div className="bg-pink-500 h-full transition-all" style={{ width: `${Math.min(100, s.recentRateLimits * 5)}%` }} />
                  </div>
                  <p className="text-[9px] text-muted-foreground uppercase font-bold mt-2 tracking-widest">Proteção contra abuso ativa</p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/40 backdrop-blur-sm border-white/5 shadow-xl shadow-black/10">
              <CardHeader className="pb-2"><CardTitle className="text-[10px] font-bold uppercase tracking-[0.2em] metric-purple flex items-center gap-2"><Users className="h-3 w-3" /> Comercial</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Planos</p>
                    <p className="text-lg font-black metric-purple">{s.activePlans}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Assinaturas</p>
                    <p className="text-lg font-black metric-purple">{s.users}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="bg-card/40 backdrop-blur-sm border-white/5 shadow-xl shadow-black/10">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-[10px] font-bold uppercase tracking-[0.2em] metric-cyan filter drop-shadow-[0_0_8px_var(--icon-shadow)]">Status das Instâncias</CardTitle>
            <Badge variant="outline" className="text-[9px] font-bold opacity-50">TOP 10 RECENTES</Badge>
          </CardHeader>
          <CardContent>
            {recentInstances.isLoading ? <SectionSkeleton /> :
             (recentInstances.data?.length ?? 0) === 0 ? (
               <p className="text-sm text-muted-foreground/60 italic font-medium">Nenhuma instância</p>
             ) : (
               <div className="space-y-4">
                 {recentInstances.data!.map((inst) => {
                   const phone = formatPhone(inst.phone_number);
                   const isOnline = inst.status === 'online' || inst.status === 'connected';
                   const statusColor = isOnline ? 'metric-green' : (inst.status === 'connecting' || inst.status === 'pairing') ? 'metric-yellow' : 'metric-red';
                   return (
                    <div key={inst.id} className="flex flex-col border-b border-white/5 pb-3 last:border-0 last:pb-0 group">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-black truncate ${statusColor} filter drop-shadow-[0_0_8px_var(--icon-shadow)]/30 transition-all duration-300 group-hover:drop-shadow-[0_0_12px_var(--icon-shadow)]`}>{inst.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                             <span className="text-[9px] text-muted-foreground opacity-60 uppercase tracking-widest font-black flex items-center gap-1">
                               <Server className="h-2 w-2" /> {inst.provider}
                             </span>
                             <span className="text-[9px] text-muted-foreground opacity-60 uppercase tracking-widest font-black flex items-center gap-1">
                               <Users className="h-2 w-2" /> {inst.company_name}
                             </span>
                          </div>
                        </div>
                        <StatusBadge status={inst.status} />
                      </div>
                      
                      <div className="flex items-center justify-between text-[10px] font-medium text-muted-foreground/80 mt-1">
                        <div className="flex items-center gap-3">
                          {phone && (
                            <span className="flex items-center gap-1"><Phone className="h-2.5 w-2.5 opacity-50" /> {phone}</span>
                          )}
                          <span className="flex items-center gap-1" title="Mensagens este mês"><MessageSquare className="h-2.5 w-2.5 opacity-50" /> {inst.messages_month} msg/mês</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5 opacity-50" />
                          <span className="truncate">Ult. Hook: {inst.last_webhook_at ? fmtDate(inst.last_webhook_at) : 'Nunca'}</span>
                        </div>
                      </div>
                    </div>
                   );
                 })}
               </div>
             )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="bg-card/40 backdrop-blur-sm border-white/5 shadow-xl shadow-black/10">
            <CardHeader><CardTitle className="text-[10px] font-bold uppercase tracking-[0.2em] metric-turquoise filter drop-shadow-[0_0_8px_var(--icon-shadow)]">Consumo por Provider</CardTitle></CardHeader>
            <CardContent>
              {s && s.instancesByProvider.length > 0 ? (
                <div className="space-y-3">
                  {s.instancesByProvider.map((p, idx) => {
                    const colorClass = p.provider === 'evolution' ? 'metric-pink' : idx === 0 ? 'metric-cyan' : idx === 1 ? 'metric-sky' : 'metric-emerald';
                    return (
                      <div key={p.provider} className="flex items-center justify-between group">
                        <div className="flex items-center gap-2">
                          <div className={`icon-premium ${colorClass} p-1.5 rounded-md transition-transform duration-300 group-hover:scale-110 shadow-[0_0_10px_var(--icon-shadow)]/20`}><Server className="h-4 w-4" /></div>
                          <span className={`text-[10px] font-black uppercase tracking-widest ${colorClass} filter drop-shadow-[0_0_6px_var(--icon-shadow)] transition-all duration-300 group-hover:drop-shadow-[0_0_10px_var(--icon-shadow)]`}>{p.provider}</span>
                        </div>
                        <div className={`px-2 py-0.5 rounded-full border border-[var(--icon-border)] bg-[var(--icon-bg)] ${colorClass} text-[11px] font-black tabular-nums filter drop-shadow-[0_0_8px_var(--icon-shadow)] transition-all duration-300 group-hover:scale-105 group-hover:drop-shadow-[0_0_12px_var(--icon-shadow)]`}>
                          {p.count} inst.
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground/60 italic font-medium">Nenhum dado de provider</p>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card/40 backdrop-blur-sm border-white/5 shadow-xl shadow-black/10">
            <CardHeader><CardTitle className="text-[10px] font-bold uppercase tracking-[0.2em] metric-orange filter drop-shadow-[0_0_8px_var(--icon-shadow)]">Saúde Financeira</CardTitle></CardHeader>
            <CardContent>
              {recentInvoices.isLoading ? <SectionSkeleton /> :
               (recentInvoices.data?.length ?? 0) === 0 ? (
                 <p className="text-sm text-muted-foreground/60 italic font-medium">Nenhuma fatura</p>
               ) : (
                 <div className="space-y-3">
                   {recentInvoices.data!.map((inv) => {
                     const statusColor = inv.status === 'paid' ? 'metric-green' : inv.status === 'pending' ? 'metric-yellow' : 'metric-red';
                     return (
                     <div key={inv.id} className="flex items-center justify-between group">
                       <div className="min-w-0">
                          <p className={`text-sm font-black truncate ${statusColor} filter drop-shadow-[0_0_8px_var(--icon-shadow)]/30 transition-all duration-300 group-hover:drop-shadow-[0_0_12px_var(--icon-shadow)]`}>Fatura #{inv.id.slice(0, 8)}</p>
                          <p className="text-[9px] text-muted-foreground opacity-50 uppercase tracking-widest font-black">{inv.company_name} · Venc: {new Date(inv.due_date).toLocaleDateString('pt-BR')}</p>
                       </div>
                       <div className="flex items-center gap-2 shrink-0">
                         <span className={`text-sm font-black tabular-nums tracking-tighter ${statusColor} filter drop-shadow-[0_0_8px_var(--icon-shadow)]`}>{formatCurrency(inv.amount_cents)}</span>
                         <StatusBadge status={inv.status} />
                       </div>
                     </div>
                     );
                   })}
                 </div>
               )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

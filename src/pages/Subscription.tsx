/**
 * Subscription — Client-facing page for subscription, invoices, and usage.
 * All data comes from backend (plan, subscription, invoices, instance counts).
 */
import { useState, useEffect } from 'react';
import { useCompany } from '@/contexts/CompanyContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Crown, CreditCard, BarChart3, CheckCircle2, XCircle, Clock,
  AlertTriangle, ArrowUpRight, MessageCircle, Receipt, Smartphone,
  Bot, Megaphone, Users, FileText, Shield, Zap,
} from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';

type Invoice = Tables<'invoices'>;

const statusConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  active: { label: 'Ativa', icon: CheckCircle2, color: 'text-success' },
  trialing: { label: 'Período de teste', icon: Clock, color: 'text-info' },
  past_due: { label: 'Pagamento pendente', icon: AlertTriangle, color: 'text-warning' },
  canceled: { label: 'Cancelada', icon: XCircle, color: 'text-destructive' },
  suspended: { label: 'Suspensa', icon: XCircle, color: 'text-destructive' },
};

const invoiceStatusMap: Record<string, { label: string; variant: 'default' | 'destructive' | 'secondary' | 'outline' }> = {
  paid: { label: 'Pago', variant: 'default' },
  pending: { label: 'Pendente', variant: 'secondary' },
  overdue: { label: 'Vencida', variant: 'destructive' },
  canceled: { label: 'Cancelada', variant: 'outline' },
};

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR');
}

export default function Subscription() {
  const { plan, planLoading, allowedProviders, isActive, isSuspended } = useCompany();
  const { company, isAdmin } = useAuth();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [usageLoading, setUsageLoading] = useState(true);

  // Fetch invoices
  useEffect(() => {
    if (!company?.id) return;
    setInvoicesLoading(true);
    supabase
      .from('invoices')
      .select('*')
      .eq('company_id', company.id)
      .order('due_date', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        setInvoices(data || []);
        setInvoicesLoading(false);
      });
  }, [company?.id]);

  // Fetch usage counts
  useEffect(() => {
    if (!company?.id) return;
    setUsageLoading(true);
    Promise.all([
      supabase.from('instances').select('id, provider', { count: 'exact' }).eq('company_id', company.id),
      supabase.from('ai_agents').select('id', { count: 'exact' }).eq('company_id', company.id),
      supabase.from('campaigns').select('id', { count: 'exact' }).eq('company_id', company.id),
      supabase.from('user_roles').select('id', { count: 'exact' }).eq('company_id', company.id),
    ]).then(([inst, agents, campaigns, users]) => {
      // Count instances by provider
      const providerCounts: Record<string, number> = {};
      (inst.data || []).forEach((i: any) => {
        providerCounts[i.provider] = (providerCounts[i.provider] || 0) + 1;
      });

      setUsage({
        instances: inst.count ?? 0,
        ai_agents: agents.count ?? 0,
        campaigns: campaigns.count ?? 0,
        users: users.count ?? 0,
        ...Object.fromEntries(Object.entries(providerCounts).map(([k, v]) => [`provider_${k}`, v])),
      });
      setUsageLoading(false);
    });
  }, [company?.id]);

  if (planLoading) {
    return (
      <div className="space-y-6 max-w-4xl">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const status = plan ? (statusConfig[plan.status] || statusConfig.active) : null;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Assinatura</h1>
        <p className="text-muted-foreground">Gerencie seu plano, faturas e acompanhe o consumo</p>
      </div>

      <Tabs defaultValue="plan" className="space-y-4">
        <TabsList>
          <TabsTrigger value="plan" className="gap-1.5">
            <Crown className="h-4 w-4" /> Plano
          </TabsTrigger>
          <TabsTrigger value="invoices" className="gap-1.5">
            <Receipt className="h-4 w-4" /> Faturas
          </TabsTrigger>
          <TabsTrigger value="usage" className="gap-1.5">
            <BarChart3 className="h-4 w-4" /> Consumo
          </TabsTrigger>
        </TabsList>

        {/* ── PLANO ── */}
        <TabsContent value="plan" className="space-y-4">
          {!plan ? (
            <Card className="border-destructive/50 bg-destructive/5">
              <CardContent className="p-6 flex items-start gap-4">
                <div className="rounded-lg p-2.5 bg-destructive/10 shrink-0">
                  <AlertTriangle className="h-6 w-6 text-destructive" />
                </div>
                <div>
                  <p className="font-semibold text-lg">Nenhum plano ativo</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Sua conta não possui uma assinatura ativa. Entre em contato com o administrador.
                  </p>
                  <Button size="sm" variant="outline" className="mt-3" onClick={() => window.open('mailto:suporte@exemplo.com', '_blank')}>
                    <MessageCircle className="h-3.5 w-3.5 mr-1.5" /> Falar com suporte
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Plan card */}
              <Card className="border-border/40 bg-card/80">
                <CardHeader>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <CardTitle className="flex items-center gap-2">
                      <div className="p-1.5 rounded-md bg-primary/10">
                        <Crown className="h-5 w-5 text-primary" />
                      </div>
                      Plano {plan.plan_name}
                    </CardTitle>
                    {status && (
                      <Badge variant={isSuspended ? 'destructive' : 'secondary'} className="gap-1">
                        <status.icon className={`h-3 w-3 ${status.color}`} />
                        {status.label}
                      </Badge>
                    )}
                  </div>
                  {plan.plan_description && (
                    <CardDescription>{plan.plan_description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground text-xs uppercase tracking-wider block mb-1">Valor</span>
                      <span className="font-semibold text-lg">{formatCurrency(plan.price_cents)}</span>
                      <span className="text-muted-foreground text-xs">/{plan.billing_cycle === 'monthly' ? 'mês' : plan.billing_cycle === 'yearly' ? 'ano' : plan.billing_cycle}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs uppercase tracking-wider block mb-1">Renovação</span>
                      <span className="font-medium">{formatDate(plan.renewal_date)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs uppercase tracking-wider block mb-1">Vencimento</span>
                      <span className="font-medium">{formatDate(plan.expires_at)}</span>
                    </div>
                  </div>

                  <Separator className="bg-border/30" />

                  {/* Limits overview */}
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2 font-medium">Limites do plano</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: 'Instâncias', value: plan.limits.max_instances, icon: Smartphone },
                        { label: 'Agentes IA', value: plan.limits.max_ai_agents, icon: Bot },
                        { label: 'Campanhas', value: plan.limits.max_campaigns, icon: Megaphone },
                        { label: 'Usuários', value: plan.limits.max_users, icon: Users },
                        { label: 'Msgs/dia', value: plan.limits.max_messages_day, icon: Zap },
                        { label: 'Msgs/mês', value: plan.limits.max_messages_month, icon: FileText },
                        { label: 'Contatos', value: plan.limits.max_contacts, icon: Users },
                      ].map((item) => (
                        <div key={item.label} className="flex items-center gap-2 p-2 rounded-md bg-muted/20 border border-border/30">
                          <item.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div>
                            <p className="text-[11px] text-muted-foreground">{item.label}</p>
                            <p className="text-sm font-semibold">{item.value.toLocaleString('pt-BR')}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Separator className="bg-border/30" />

                  {/* Features */}
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2 font-medium">Recursos</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {[
                        { label: 'Instâncias', enabled: plan.features.instances_enabled },
                        { label: 'Campanhas', enabled: plan.features.campaigns_enabled },
                        { label: 'Agentes IA', enabled: plan.features.ai_agents_enabled },
                        { label: 'Faturas', enabled: plan.features.invoices_enabled },
                        { label: 'Marca própria', enabled: plan.features.branding_enabled },
                        { label: 'API externa', enabled: plan.features.api_access },
                        { label: 'White-label', enabled: plan.features.whitelabel_enabled },
                        { label: 'Logs avançados', enabled: plan.features.advanced_logs_enabled },
                        { label: 'Webhooks avançados', enabled: plan.features.advanced_webhooks_enabled },
                      ].map((f) => (
                        <div key={f.label} className="flex items-center gap-2 text-sm">
                          {f.enabled ? (
                            <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                          ) : (
                            <XCircle className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                          )}
                          <span className={f.enabled ? 'text-foreground' : 'text-muted-foreground/60'}>{f.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Separator className="bg-border/30" />

                  {/* Providers */}
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2 font-medium">Providers liberados</p>
                    <div className="flex flex-wrap gap-2">
                      {allowedProviders.length === 0 ? (
                        <span className="text-sm text-muted-foreground">Nenhum provider configurado</span>
                      ) : (
                        allowedProviders.map((p) => (
                          <Badge key={p} variant="outline" className="capitalize">{p}</Badge>
                        ))
                      )}
                    </div>
                  </div>

                  {/* CTAs */}
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button size="sm" variant="outline" onClick={() => window.open('mailto:suporte@exemplo.com', '_blank')}>
                      <ArrowUpRight className="h-3.5 w-3.5 mr-1.5" /> Solicitar upgrade
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => window.open('mailto:suporte@exemplo.com', '_blank')}>
                      <MessageCircle className="h-3.5 w-3.5 mr-1.5" /> Falar com suporte
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ── FATURAS ── */}
        <TabsContent value="invoices" className="space-y-4">
          <Card className="border-border/40 bg-card/80">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-primary/10">
                  <Receipt className="h-5 w-5 text-primary" />
                </div>
                Faturas
              </CardTitle>
              <CardDescription>Histórico de faturas e pagamentos</CardDescription>
            </CardHeader>
            <CardContent>
              {invoicesLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : invoices.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div className="rounded-full p-3 bg-muted/30">
                    <Receipt className="h-8 w-8 text-muted-foreground/40" />
                  </div>
                  <div className="text-center space-y-1 max-w-xs">
                    <p className="font-medium">Nenhuma fatura emitida</p>
                    <p className="text-sm text-muted-foreground">
                      Suas faturas aparecerão aqui conforme forem geradas pelo sistema de cobrança.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-border/30">
                  {invoices.map((inv) => {
                    const st = invoiceStatusMap[inv.status] || invoiceStatusMap.pending;
                    return (
                      <div key={inv.id} className="flex items-center justify-between py-3 gap-4">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            Fatura {formatDate(inv.due_date)}
                          </p>
                          {inv.period_start && inv.period_end && (
                            <p className="text-xs text-muted-foreground">
                              Período: {formatDate(inv.period_start)} — {formatDate(inv.period_end)}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-sm font-semibold">{formatCurrency(inv.amount_cents)}</span>
                          <Badge variant={st.variant} className="text-[10px]">{st.label}</Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── CONSUMO ── */}
        <TabsContent value="usage" className="space-y-4">
          <Card className="border-border/40 bg-card/80">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-primary/10">
                  <BarChart3 className="h-5 w-5 text-primary" />
                </div>
                Consumo atual
              </CardTitle>
              <CardDescription>Utilização dos recursos do seu plano</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {usageLoading || !plan ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : (
                <>
                  {[
                    { label: 'Instâncias', current: usage.instances || 0, max: plan.limits.max_instances, icon: Smartphone },
                    { label: 'Agentes IA', current: usage.ai_agents || 0, max: plan.limits.max_ai_agents, icon: Bot },
                    { label: 'Campanhas', current: usage.campaigns || 0, max: plan.limits.max_campaigns, icon: Megaphone },
                    { label: 'Usuários', current: usage.users || 0, max: plan.limits.max_users, icon: Users },
                  ].map((r) => {
                    const percent = r.max > 0 ? Math.min(100, (r.current / r.max) * 100) : 0;
                    const atLimit = r.current >= r.max && r.max > 0;
                    const nearLimit = percent >= 80 && !atLimit;
                    return (
                      <div key={r.label} className="space-y-1.5">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <r.icon className="h-4 w-4 text-muted-foreground" />
                            <span>{r.label}</span>
                          </div>
                          <span className={`font-medium text-xs ${atLimit ? 'text-destructive' : nearLimit ? 'text-yellow-600' : 'text-foreground'}`}>
                            {r.current} / {r.max}
                            {atLimit && ' (limite)'}
                            {!atLimit && r.max > 0 && ` · ${r.max - r.current} disponíveis`}
                          </span>
                        </div>
                        <Progress
                          value={percent}
                          className={`h-2 ${atLimit ? '[&>div]:bg-destructive' : nearLimit ? '[&>div]:bg-yellow-500' : ''}`}
                        />
                      </div>
                    );
                  })}

                  {/* Per-provider breakdown */}
                  {Object.keys(usage).filter(k => k.startsWith('provider_')).length > 0 && (
                    <>
                      <Separator className="bg-border/30" />
                      <div>
                        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2 font-medium">Instâncias por provider</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {Object.entries(usage)
                            .filter(([k]) => k.startsWith('provider_'))
                            .map(([k, v]) => (
                              <div key={k} className="flex items-center gap-2 p-2 rounded-md bg-muted/20 border border-border/30">
                                <Shield className="h-4 w-4 text-muted-foreground" />
                                <div>
                                  <p className="text-[11px] text-muted-foreground capitalize">{k.replace('provider_', '')}</p>
                                  <p className="text-sm font-semibold">{v}</p>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  CreditCard, Calendar, Package, Users, MessageSquare, Bot,
  Shield, Sparkles, CheckCircle2, XCircle,
  AlertTriangle, Info
} from 'lucide-react';

function UsageBar({ label, used, max, icon: Icon }: { label: string; used: number; max: number; icon: any }) {
  const pct = max > 0 ? Math.min((used / max) * 100, 100) : 0;
  const color = pct >= 90 ? 'text-destructive' : pct >= 70 ? 'text-warning' : 'text-muted-foreground';
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5"><Icon className="h-3.5 w-3.5 text-muted-foreground" />{label}</span>
        <span className={`font-medium ${color}`}>{used}/{max}</span>
      </div>
      <Progress value={pct} className="h-2" />
    </div>
  );
}

function FeatureItem({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {enabled ? <CheckCircle2 className="h-4 w-4 text-success" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}
      <span className={enabled ? '' : 'text-muted-foreground line-through'}>{label}</span>
    </div>
  );
}

const statusLabel: Record<string, string> = {
  active: 'Ativa', past_due: 'Vencida', canceled: 'Cancelada',
  trialing: 'Trial', suspended: 'Suspensa', expired: 'Expirada',
};
const statusVariant = (s: string) =>
  s === 'active' || s === 'trialing' ? 'success' as const : 'destructive' as const;

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR');
}

export default function Subscription() {
  const { company } = useAuth();
  const { plan, isSuspended, isActive: subActive, isTrialing, allowedProviders, hasFeature } = useCompany();

  const { data: subscription } = useQuery({
    queryKey: ['subscription-detail', company?.id],
    queryFn: async () => {
      if (!company?.id) return null;
      const { data } = await supabase
        .from('subscriptions')
        .select('*, plans(*)')
        .eq('company_id', company.id)
        .in('status', ['active', 'trialing', 'past_due', 'suspended', 'canceled', 'expired'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      return data;
    },
    enabled: !!company?.id,
  });

  const { data: usage } = useQuery({
    queryKey: ['usage', company?.id],
    queryFn: async () => {
      if (!company?.id) return null;
      const [instances, campaigns, agents, users] = await Promise.all([
        supabase.from('instances').select('id', { count: 'exact', head: true }).eq('company_id', company.id),
        supabase.from('campaigns').select('id', { count: 'exact', head: true }).eq('company_id', company.id),
        supabase.from('ai_agents').select('id', { count: 'exact', head: true }).eq('company_id', company.id),
        supabase.from('user_roles').select('id', { count: 'exact', head: true }).eq('company_id', company.id),
      ]);
      return {
        instances: instances.count ?? 0,
        campaigns: campaigns.count ?? 0,
        ai_agents: agents.count ?? 0,
        users: users.count ?? 0,
      };
    },
    enabled: !!company?.id,
  });

  const subStatus = subscription?.status ?? plan?.status ?? 'unknown';

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Plano e Assinatura</h1>

      {isSuspended && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Assinatura Suspensa</AlertTitle>
          <AlertDescription>Sua assinatura está suspensa. Algumas funcionalidades podem estar bloqueadas.</AlertDescription>
        </Alert>
      )}
      {subStatus === 'past_due' && (
        <Alert className="border-warning/50 bg-warning/10">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <AlertTitle className="text-warning">Pagamento Pendente</AlertTitle>
          <AlertDescription>Existe um pagamento pendente. Regularize para evitar a suspensão.</AlertDescription>
        </Alert>
      )}
      {subStatus === 'canceled' && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>Assinatura Cancelada</AlertTitle>
          <AlertDescription>Sua assinatura foi cancelada. Entre em contato para reativação.</AlertDescription>
        </Alert>
      )}
      {isTrialing && (
        <Alert className="border-accent/50 bg-accent/10">
          <Info className="h-4 w-4 text-accent" />
          <AlertTitle className="text-accent">Período de Teste</AlertTitle>
          <AlertDescription>Você está no período de avaliação.</AlertDescription>
        </Alert>
      )}

      {plan ? (
        <>
          <Card className="border-primary/30 bg-gradient-to-br from-card to-card/80">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-primary/10"><Sparkles className="h-5 w-5 text-primary" /></div>
                  <span className="tracking-tight">{plan.plan_name}</span>
                </span>
                <Badge variant={statusVariant(subStatus)}>
                  {statusLabel[subStatus] || subStatus}
                </Badge>
              </CardTitle>
              {plan.plan_description && (
                <p className="text-sm text-muted-foreground mt-1">{plan.plan_description}</p>
              )}
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Preço</p>
                    <p className="font-semibold text-sm">
                      R$ {(plan.price_cents / 100).toFixed(2)}/{plan.billing_cycle === 'yearly' ? 'ano' : 'mês'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Início</p>
                    <p className="font-semibold text-sm">{formatDate(subscription?.started_at)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Renovação</p>
                    <p className="font-semibold text-sm">
                      {formatDate(plan.renewal_date || plan.expires_at)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Suporte</p>
                    <p className="font-semibold text-sm capitalize">
                      {plan.support_priority === 'standard' ? 'Padrão' : plan.support_priority === 'priority' ? 'Prioritário' : 'Premium'}
                    </p>
                  </div>
                </div>
              </div>

              {subscription?.notes && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Observações</p>
                    <p className="text-sm">{subscription.notes}</p>
                  </div>
                </>
              )}

              <Separator />

              {(subscription?.suspended_at || subscription?.canceled_at || subscription?.expires_at) && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                    {subscription?.expires_at && (
                      <div>
                        <span className="text-muted-foreground">Vencimento: </span>
                        <span className="font-medium">{formatDate(subscription.expires_at)}</span>
                      </div>
                    )}
                    {subscription?.suspended_at && (
                      <div>
                        <span className="text-muted-foreground">Suspensa em: </span>
                        <span className="font-medium text-destructive">{formatDate(subscription.suspended_at)}</span>
                      </div>
                    )}
                    {subscription?.canceled_at && (
                      <div>
                        <span className="text-muted-foreground">Cancelada em: </span>
                        <span className="font-medium text-destructive">{formatDate(subscription.canceled_at)}</span>
                      </div>
                    )}
                  </div>
                  <Separator />
                </>
              )}

              {/* All features */}
              <div>
                <h3 className="text-sm font-semibold mb-3">Recursos do Plano</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  <FeatureItem label="Instâncias" enabled={hasFeature('instances_enabled')} />
                  <FeatureItem label="Campanhas" enabled={hasFeature('campaigns_enabled')} />
                  <FeatureItem label="Agentes IA" enabled={hasFeature('ai_agents_enabled')} />
                  <FeatureItem label="Faturas" enabled={hasFeature('invoices_enabled')} />
                  <FeatureItem label="Branding" enabled={hasFeature('branding_enabled')} />
                  <FeatureItem label="API Externa" enabled={hasFeature('api_access')} />
                  <FeatureItem label="White Label" enabled={hasFeature('whitelabel_enabled')} />
                  <FeatureItem label="Logs Avançados" enabled={hasFeature('advanced_logs_enabled')} />
                  <FeatureItem label="Webhooks Avançados" enabled={hasFeature('advanced_webhooks_enabled')} />
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="text-sm font-semibold mb-2">Providers Permitidos</h3>
                <div className="flex gap-2">
                  {allowedProviders.length > 0 ? allowedProviders.map(p => (
                    <Badge key={p} variant="outline" className="capitalize">{p}</Badge>
                  )) : (
                    <span className="text-sm text-muted-foreground">Nenhum provider configurado</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-lg tracking-tight">Consumo Atual</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <UsageBar label="Instâncias" used={usage?.instances ?? 0} max={plan.limits.max_instances} icon={Package} />
              <UsageBar label="Campanhas" used={usage?.campaigns ?? 0} max={plan.limits.max_campaigns} icon={MessageSquare} />
              <UsageBar label="Agentes IA" used={usage?.ai_agents ?? 0} max={plan.limits.max_ai_agents} icon={Bot} />
              <UsageBar label="Usuários" used={usage?.users ?? 0} max={plan.limits.max_users} icon={Users} />
              <div className="text-xs text-muted-foreground pt-2">
                Msgs/dia: {plan.limits.max_messages_day} · Msgs/mês: {plan.limits.max_messages_month.toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Nenhuma assinatura ativa encontrada.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

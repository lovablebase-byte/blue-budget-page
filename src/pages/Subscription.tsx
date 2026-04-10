import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  CreditCard, Calendar, Package, Users, MessageSquare, Bot,
  Workflow, Shield, Sparkles, Lock, CheckCircle2, XCircle,
  AlertTriangle, Info
} from 'lucide-react';

function UsageBar({ label, used, max, icon: Icon }: { label: string; used: number; max: number; icon: any }) {
  const pct = max > 0 ? Math.min((used / max) * 100, 100) : 0;
  const color = pct >= 90 ? 'text-destructive' : pct >= 70 ? 'text-yellow-500' : 'text-muted-foreground';
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5"><Icon className="h-3.5 w-3.5 text-muted-foreground" />{label}</span>
        <span className={color}>{used}/{max}</span>
      </div>
      <Progress value={pct} className="h-2" />
    </div>
  );
}

function FeatureItem({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {enabled ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}
      <span className={enabled ? '' : 'text-muted-foreground line-through'}>{label}</span>
    </div>
  );
}

const statusLabel: Record<string, string> = {
  active: 'Ativa', past_due: 'Vencida', canceled: 'Cancelada',
  trialing: 'Trial', suspended: 'Suspensa', expired: 'Expirada',
};
const statusVariant = (s: string) =>
  s === 'active' || s === 'trialing' ? 'default' as const : 'destructive' as const;

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR');
}

export default function Subscription() {
  const { company } = useAuth();
  const { plan, isSuspended, isActive: subActive, isTrialing, allowedProviders } = useCompany();

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
      const [instances, campaigns, agents, workflows, users] = await Promise.all([
        supabase.from('instances').select('id', { count: 'exact', head: true }).eq('company_id', company.id),
        supabase.from('campaigns').select('id', { count: 'exact', head: true }).eq('company_id', company.id),
        supabase.from('ai_agents').select('id', { count: 'exact', head: true }).eq('company_id', company.id),
        supabase.from('workflows').select('id', { count: 'exact', head: true }).eq('company_id', company.id),
        supabase.from('user_roles').select('id', { count: 'exact', head: true }).eq('company_id', company.id),
      ]);
      return {
        instances: instances.count ?? 0,
        campaigns: campaigns.count ?? 0,
        ai_agents: agents.count ?? 0,
        workflows: workflows.count ?? 0,
        users: users.count ?? 0,
      };
    },
    enabled: !!company?.id,
  });

  const planData = (subscription?.plans ?? plan) as any;
  const subStatus = subscription?.status ?? plan?.status ?? 'unknown';

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Plano e Assinatura</h1>

      {/* Banners de alerta */}
      {isSuspended && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Assinatura Suspensa</AlertTitle>
          <AlertDescription>
            Sua assinatura está suspensa. Algumas funcionalidades podem estar bloqueadas.
            Entre em contato com o suporte para regularizar.
          </AlertDescription>
        </Alert>
      )}
      {subStatus === 'past_due' && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Pagamento Pendente</AlertTitle>
          <AlertDescription>
            Existe um pagamento pendente. Regularize para evitar a suspensão dos serviços.
          </AlertDescription>
        </Alert>
      )}
      {subStatus === 'canceled' && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>Assinatura Cancelada</AlertTitle>
          <AlertDescription>
            Sua assinatura foi cancelada. Entre em contato para reativação.
          </AlertDescription>
        </Alert>
      )}
      {isTrialing && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Período de Teste</AlertTitle>
          <AlertDescription>
            Você está no período de avaliação. Após o encerramento será necessário assinar um plano.
          </AlertDescription>
        </Alert>
      )}

      {planData ? (
        <>
          {/* Plano Atual */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  {planData.name}
                </span>
                <Badge variant={statusVariant(subStatus)}>
                  {statusLabel[subStatus] || subStatus}
                </Badge>
              </CardTitle>
              {planData.description && (
                <p className="text-sm text-muted-foreground mt-1">{planData.description}</p>
              )}
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Informações gerais */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Preço</p>
                    <p className="font-semibold text-sm">
                      R$ {(planData.price_cents / 100).toFixed(2)}/{planData.billing_cycle === 'yearly' ? 'ano' : 'mês'}
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
                      {formatDate(subscription?.renewal_date || subscription?.expires_at)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Suporte</p>
                    <p className="font-semibold text-sm capitalize">
                      {planData.support_priority === 'standard' ? 'Padrão' : planData.support_priority === 'priority' ? 'Prioritário' : 'Premium'}
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

              {/* Datas relevantes da assinatura */}
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

              {/* Recursos */}
              <div>
                <h3 className="text-sm font-semibold mb-3">Recursos do Plano</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  <FeatureItem label="Campanhas" enabled={planData.campaigns_enabled} />
                  <FeatureItem label="Workflows" enabled={planData.workflows_enabled} />
                  <FeatureItem label="Agentes IA" enabled={planData.ai_agents_enabled} />
                  <FeatureItem label="API Externa" enabled={planData.api_access} />
                  <FeatureItem label="White Label" enabled={planData.whitelabel_enabled} />
                </div>
              </div>

              <Separator />

              {/* Providers permitidos */}
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

          {/* Uso do Plano */}
          <Card>
            <CardHeader><CardTitle className="text-lg">Consumo Atual</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <UsageBar label="Instâncias" used={usage?.instances ?? 0} max={plan?.limits.max_instances ?? planData.max_instances} icon={Package} />
              <UsageBar label="Campanhas" used={usage?.campaigns ?? 0} max={plan?.limits.max_campaigns ?? planData.max_campaigns ?? 5} icon={MessageSquare} />
              <UsageBar label="Agentes IA" used={usage?.ai_agents ?? 0} max={plan?.limits.max_ai_agents ?? planData.max_ai_agents ?? 1} icon={Bot} />
              <UsageBar label="Workflows" used={usage?.workflows ?? 0} max={plan?.limits.max_workflows ?? planData.max_workflows ?? 3} icon={Workflow} />
              <UsageBar label="Usuários" used={usage?.users ?? 0} max={plan?.limits.max_users ?? planData.max_users} icon={Users} />
              <div className="text-xs text-muted-foreground pt-2">
                Msgs/dia: {plan?.limits.max_messages_day ?? planData.max_messages_day ?? 0} · Msgs/mês: {(plan?.limits.max_messages_month ?? planData.max_messages_month ?? 0).toLocaleString()}
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

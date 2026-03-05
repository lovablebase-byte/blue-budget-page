import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { CreditCard, Calendar, Package, Users, MessageSquare, Bot, Workflow, Contact, Shield, Sparkles } from 'lucide-react';

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

export default function Subscription() {
  const { company } = useAuth();

  const { data: subscription } = useQuery({
    queryKey: ['subscription', company?.id],
    queryFn: async () => {
      if (!company?.id) return null;
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*, plans(*)')
        .eq('company_id', company.id)
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!company?.id,
  });

  const { data: usage } = useQuery({
    queryKey: ['usage', company?.id],
    queryFn: async () => {
      if (!company?.id) return null;
      const [instances, campaigns, agents, workflows] = await Promise.all([
        supabase.from('instances').select('id', { count: 'exact', head: true }).eq('company_id', company.id),
        supabase.from('campaigns').select('id', { count: 'exact', head: true }).eq('company_id', company.id),
        supabase.from('ai_agents').select('id', { count: 'exact', head: true }).eq('company_id', company.id),
        supabase.from('workflows').select('id', { count: 'exact', head: true }).eq('company_id', company.id),
      ]);
      return {
        instances: instances.count ?? 0,
        campaigns: campaigns.count ?? 0,
        ai_agents: agents.count ?? 0,
        workflows: workflows.count ?? 0,
      };
    },
    enabled: !!company?.id,
  });

  const { data: plans = [] } = useQuery({
    queryKey: ['plans'],
    queryFn: async () => {
      const { data } = await supabase.from('plans').select('*').eq('is_active', true).order('price_cents');
      return data || [];
    },
  });

  const plan = subscription?.plans as any;
  const statusLabel: Record<string, string> = { active: 'Ativa', past_due: 'Vencida', canceled: 'Cancelada', trialing: 'Trial', suspended: 'Suspensa', expired: 'Expirada' };
  const statusVariant = (s: string) => s === 'active' || s === 'trialing' ? 'default' as const : 'destructive' as const;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Assinatura</h1>

      {subscription && plan ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" />{plan.name}</span>
                <Badge variant={statusVariant(subscription.status)}>{statusLabel[subscription.status] || subscription.status}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-muted-foreground" /><div><p className="text-sm text-muted-foreground">Preço</p><p className="font-semibold">R$ {(plan.price_cents / 100).toFixed(2)}/mês</p></div></div>
                <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-muted-foreground" /><div><p className="text-sm text-muted-foreground">Renovação</p><p className="font-semibold">{(subscription as any).renewal_date ? new Date((subscription as any).renewal_date).toLocaleDateString('pt-BR') : subscription.expires_at ? new Date(subscription.expires_at).toLocaleDateString('pt-BR') : '—'}</p></div></div>
                <div className="flex items-center gap-2"><Shield className="h-4 w-4 text-muted-foreground" /><div><p className="text-sm text-muted-foreground">Suporte</p><p className="font-semibold capitalize">{plan.support_priority === 'standard' ? 'Padrão' : plan.support_priority === 'priority' ? 'Prioritário' : 'Premium'}</p></div></div>
                <div className="flex items-center gap-2"><Package className="h-4 w-4 text-muted-foreground" /><div><p className="text-sm text-muted-foreground">API</p><p className="font-semibold">{plan.api_access ? 'Liberado' : 'Bloqueado'}</p></div></div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-lg">Uso do Plano</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <UsageBar label="Instâncias" used={usage?.instances ?? 0} max={plan.max_instances} icon={Package} />
              <UsageBar label="Campanhas" used={usage?.campaigns ?? 0} max={plan.max_campaigns ?? 5} icon={MessageSquare} />
              <UsageBar label="Agentes IA" used={usage?.ai_agents ?? 0} max={plan.max_ai_agents ?? 1} icon={Bot} />
              <UsageBar label="Workflows" used={usage?.workflows ?? 0} max={plan.max_workflows ?? 3} icon={Workflow} />
              <UsageBar label="Usuários" used={0} max={plan.max_users} icon={Users} />
              <UsageBar label="Contatos" used={0} max={plan.max_contacts ?? 1000} icon={Contact} />
            </CardContent>
          </Card>
        </>
      ) : (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Nenhuma assinatura ativa</CardContent></Card>
      )}

      <h2 className="text-xl font-semibold">Planos Disponíveis</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {plans.map((p: any) => (
          <Card key={p.id} className={plan?.id === p.id ? 'border-primary ring-1 ring-primary' : ''}>
            <CardHeader><CardTitle>{p.name}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <p className="text-2xl font-bold">R$ {(p.price_cents / 100).toFixed(2)}<span className="text-sm text-muted-foreground">/mês</span></p>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>{p.max_instances} instâncias</li>
                <li>{(p.max_messages_month ?? 0).toLocaleString()} msgs/mês</li>
                <li>{p.max_users} usuários</li>
                <li>{p.max_contacts?.toLocaleString() ?? 1000} contatos</li>
                {p.campaigns_enabled && <li>✓ Campanhas</li>}
                {p.workflows_enabled && <li>✓ Workflows</li>}
                {p.ai_agents_enabled && <li>✓ Agentes IA</li>}
                {p.api_access && <li>✓ API Externa</li>}
                {p.whitelabel_enabled && <li>✓ White Label</li>}
              </ul>
              {plan?.id !== p.id && <Button variant="outline" className="w-full mt-2">Selecionar</Button>}
              {plan?.id === p.id && <Badge className="w-full justify-center mt-2">Plano Atual</Badge>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

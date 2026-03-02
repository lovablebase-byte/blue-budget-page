import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CreditCard, Calendar, Package, Users } from 'lucide-react';

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

  const { data: plans = [] } = useQuery({
    queryKey: ['plans'],
    queryFn: async () => {
      const { data } = await supabase.from('plans').select('*').eq('is_active', true).order('price_cents');
      return data || [];
    },
  });

  const plan = subscription?.plans as any;
  const statusLabel: Record<string, string> = { active: 'Ativa', past_due: 'Vencida', canceled: 'Cancelada', trialing: 'Trial' };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Assinatura</h1>

      {subscription && plan ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{plan.name}</span>
              <Badge variant={subscription.status === 'active' ? 'default' : 'destructive'}>{statusLabel[subscription.status] || subscription.status}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-muted-foreground" /><div><p className="text-sm text-muted-foreground">Preço</p><p className="font-semibold">R$ {(plan.price_cents / 100).toFixed(2)}/mês</p></div></div>
              <div className="flex items-center gap-2"><Package className="h-4 w-4 text-muted-foreground" /><div><p className="text-sm text-muted-foreground">Instâncias</p><p className="font-semibold">{plan.max_instances}</p></div></div>
              <div className="flex items-center gap-2"><Users className="h-4 w-4 text-muted-foreground" /><div><p className="text-sm text-muted-foreground">Usuários</p><p className="font-semibold">{plan.max_users}</p></div></div>
              <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-muted-foreground" /><div><p className="text-sm text-muted-foreground">Expira em</p><p className="font-semibold">{subscription.expires_at ? new Date(subscription.expires_at).toLocaleDateString('pt-BR') : 'Sem data'}</p></div></div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Nenhuma assinatura ativa</CardContent></Card>
      )}

      <h2 className="text-xl font-semibold">Planos Disponíveis</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {plans.map((p: any) => (
          <Card key={p.id} className={plan?.id === p.id ? 'border-primary' : ''}>
            <CardHeader><CardTitle>{p.name}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <p className="text-2xl font-bold">R$ {(p.price_cents / 100).toFixed(2)}<span className="text-sm text-muted-foreground">/mês</span></p>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>{p.max_instances} instâncias</li>
                <li>{p.max_messages_month.toLocaleString()} msgs/mês</li>
                <li>{p.max_users} usuários</li>
                {p.campaigns_enabled && <li>✓ Campanhas</li>}
                {p.workflows_enabled && <li>✓ Workflows</li>}
                {p.ai_agents_enabled && <li>✓ Agentes IA</li>}
              </ul>
              {plan?.id !== p.id && <Button variant="outline" className="w-full mt-2">Selecionar</Button>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

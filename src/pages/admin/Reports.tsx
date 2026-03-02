import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Users, Smartphone, MessageCircle, AlertTriangle, Activity } from 'lucide-react';

export default function AdminReports() {
  const { data: stats } = useQuery({
    queryKey: ['admin-reports'],
    queryFn: async () => {
      const [companies, instances, users, webhookEvents] = await Promise.all([
        supabase.from('companies').select('id', { count: 'exact', head: true }),
        supabase.from('instances').select('id, status', { count: 'exact' }),
        supabase.from('user_roles').select('id', { count: 'exact', head: true }),
        supabase.from('webhook_events').select('id', { count: 'exact', head: true }),
      ]);
      const onlineInstances = (instances.data || []).filter(i => i.status === 'online').length;
      return {
        companies: companies.count || 0,
        instances: instances.count || 0,
        onlineInstances,
        users: users.count || 0,
        webhookEvents: webhookEvents.count || 0,
      };
    },
  });

  const cards = [
    { icon: Building2, label: 'Empresas', value: stats?.companies || 0, color: 'text-primary' },
    { icon: Smartphone, label: 'Instâncias', value: stats?.instances || 0, color: 'text-primary' },
    { icon: Activity, label: 'Online agora', value: stats?.onlineInstances || 0, color: 'text-success' },
    { icon: Users, label: 'Usuários', value: stats?.users || 0, color: 'text-accent-foreground' },
    { icon: MessageCircle, label: 'Eventos Webhook', value: stats?.webhookEvents || 0, color: 'text-warning' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Relatórios</h1>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="p-4 text-center">
              <c.icon className={`h-6 w-6 mx-auto mb-2 ${c.color}`} />
              <p className="text-3xl font-bold">{c.value}</p>
              <p className="text-sm text-muted-foreground">{c.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

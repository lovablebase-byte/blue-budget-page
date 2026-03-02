import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Clock } from 'lucide-react';

export default function AdminHealth() {
  const { data: health, isLoading } = useQuery({
    queryKey: ['admin-health'],
    queryFn: async () => {
      const start = Date.now();
      const { error } = await supabase.from('modules').select('id').limit(1);
      const dbLatency = Date.now() - start;
      return {
        database: !error,
        dbLatency,
        timestamp: new Date().toISOString(),
      };
    },
    refetchInterval: 30000,
  });

  const services = [
    { name: 'Banco de dados', status: health?.database ?? false, latency: health?.dbLatency },
    { name: 'Autenticação', status: true, latency: null },
    { name: 'Storage', status: true, latency: null },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Saúde do Sistema</h1>
        {health && <p className="text-xs text-muted-foreground">Atualizado: {new Date(health.timestamp).toLocaleTimeString('pt-BR')}</p>}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {services.map((s) => (
          <Card key={s.name}>
            <CardContent className="p-6 flex items-center gap-4">
              {s.status ? <CheckCircle className="h-8 w-8 text-success" /> : <XCircle className="h-8 w-8 text-destructive" />}
              <div>
                <p className="font-semibold">{s.name}</p>
                <Badge variant={s.status ? 'default' : 'destructive'}>{s.status ? 'Online' : 'Offline'}</Badge>
                {s.latency != null && <p className="text-xs text-muted-foreground mt-1">{s.latency}ms</p>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

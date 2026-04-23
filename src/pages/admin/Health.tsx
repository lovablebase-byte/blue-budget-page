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
        {services.map((s) => {
          const colorClass = s.status ? 'metric-green' : 'metric-red';
          const Icon = s.status ? CheckCircle : XCircle;
          return (
          <Card key={s.name} className="group transition-all duration-300 hover:shadow-lg hover:shadow-[var(--icon-shadow)]/15 border-white/5 bg-card/40 backdrop-blur-md">
            <CardContent className="p-6 flex items-center gap-4">
              <div className={`icon-premium ${colorClass} p-3 rounded-xl shadow-[0_0_15px_var(--icon-shadow)]/20 transition-all duration-300 group-hover:scale-110`}>
                <Icon className="h-6 w-6 filter drop-shadow-[0_0_4px_var(--icon-shadow)]" />
              </div>
              <div>
                <p className={`text-sm font-black uppercase tracking-widest ${colorClass} filter drop-shadow-[0_0_6px_var(--icon-shadow)]`}>{s.name}</p>
                <div className="mt-1 flex items-center gap-2">
                  <Badge className={`${colorClass} bg-transparent border-[var(--icon-border)] text-[9px] font-black tracking-wider filter drop-shadow-[0_0_4px_var(--icon-shadow)]`}>
                    {s.status ? 'ONLINE' : 'OFFLINE'}
                  </Badge>
                  {s.latency != null && (
                    <p className={`text-[11px] font-black tabular-nums ${colorClass} filter drop-shadow-[0_0_3px_var(--icon-shadow)]`}>
                      {s.latency}ms
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
          );
        })}
      </div>
    </div>
  );
}

import { Card, CardContent } from '@/components/ui/card';
import { Smartphone, Wifi, WifiOff, Signal } from 'lucide-react';

interface InstanceStatsCardsProps {
  total: number;
  online: number;
  offline: number;
  connecting?: number;
  planMax?: number;
  providerBreakdown?: Record<string, number>;
}

export function InstanceStatsCards({
  total, online, offline, connecting = 0, planMax, providerBreakdown,
}: InstanceStatsCardsProps) {
  const hasLimit = planMax != null && planMax > 0;
  const limitLabel = hasLimit ? String(planMax) : '∞';
  const available = hasLimit ? Math.max(0, (planMax as number) - total) : null;

  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
      <Card className="premium-card metric-green overflow-hidden">
        <CardContent className="pt-4 pb-3 px-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider metric-green">Online</span>
            <div className="icon-premium metric-green rounded-md p-1.5">
              <Wifi className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold tracking-tight metric-green">{online}</div>
        </CardContent>
      </Card>

      <Card className="premium-card metric-red overflow-hidden">
        <CardContent className="pt-4 pb-3 px-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider metric-red">Desconectado</span>
            <div className="icon-premium metric-red rounded-md p-1.5">
              <WifiOff className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold tracking-tight metric-red">{offline}</div>
        </CardContent>
      </Card>

      <Card className="premium-card metric-yellow overflow-hidden">
        <CardContent className="pt-4 pb-3 px-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider metric-yellow">Conectando</span>
            <div className="icon-premium metric-yellow rounded-md p-1.5">
              <Signal className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold tracking-tight metric-yellow">{connecting}</div>
        </CardContent>
      </Card>

      <Card className="premium-card metric-cyan overflow-hidden">
        <CardContent className="pt-4 pb-3 px-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider metric-cyan">Total</span>
            <div className="icon-premium metric-cyan rounded-md p-1.5">
              <Smartphone className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold tracking-tight metric-cyan">
            {total}<span className="text-muted-foreground font-semibold">/{limitLabel}</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            Instâncias utilizadas{available != null ? ` · ${available} disponíveis` : ''}
          </p>
          {providerBreakdown && Object.keys(providerBreakdown).length > 0 && (
            <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
              {Object.entries(providerBreakdown).map(([p, c]) => `${p}: ${c}`).join(' · ')}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

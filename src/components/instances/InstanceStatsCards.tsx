import { Card, CardContent } from '@/components/ui/card';
import { Smartphone, Wifi, WifiOff, Signal, Shield } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

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
  const available = planMax != null && planMax > 0 ? Math.max(0, planMax - total) : null;
  const usagePercent = planMax && planMax > 0 ? Math.min(100, (total / planMax) * 100) : 0;

  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
      <Card className="premium-card __TOKEN__ overflow-hidden">
        <CardContent className="pt-4 pb-3 px-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider metric-cyan">Total</span>
            <div className="icon-premium metric-cyan rounded-md p-1.5">
              <Smartphone className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold tracking-tight metric-cyan">{total}</div>
          {providerBreakdown && Object.keys(providerBreakdown).length > 0 && (
            <p className="text-[10px] text-muted-foreground mt-1 truncate">
              {Object.entries(providerBreakdown).map(([p, c]) => `${p}: ${c}`).join(' · ')}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="premium-card __TOKEN__ overflow-hidden">
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

      <Card className="premium-card __TOKEN__ overflow-hidden">
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

      <Card className="premium-card __TOKEN__ overflow-hidden">
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

      <Card className="premium-card __TOKEN__ overflow-hidden">
        <CardContent className="pt-4 pb-3 px-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider metric-amber">Limite do plano</span>
            <div className="icon-premium metric-amber rounded-md p-1.5">
              <Shield className="h-3.5 w-3.5" />
            </div>
          </div>
          {planMax != null && planMax > 0 ? (
            <>
              <div className="text-2xl font-bold tracking-tight metric-amber">
                {available} <span className="text-xs font-normal text-muted-foreground">disponíveis</span>
              </div>
              <Progress value={usagePercent} className="h-1.5 mt-2 [&>div]:bg-[#FFB300]" />
              <p className="text-[10px] text-muted-foreground mt-1">
                {total}/{planMax} utilizadas
              </p>
            </>
          ) : (
            <>
              <div className="text-2xl font-bold tracking-tight text-foreground">∞</div>
              <p className="text-[10px] text-muted-foreground mt-1">Sem limite</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

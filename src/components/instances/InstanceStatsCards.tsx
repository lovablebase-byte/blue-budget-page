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
      {/* Total */}
      <Card className="overflow-hidden">
        <CardContent className="pt-4 pb-3 px-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-muted-foreground">Total</span>
            <div className="rounded-md p-1.5 bg-primary/10 shadow-[0_0_16px_-6px_hsl(var(--primary)/0.45)]">
              <Smartphone className="h-3.5 w-3.5 text-primary" />
            </div>
          </div>
          <div className="text-2xl font-bold tracking-tight text-primary">{total}</div>
          {providerBreakdown && Object.keys(providerBreakdown).length > 0 && (
            <p className="text-[10px] text-muted-foreground mt-1 truncate">
              {Object.entries(providerBreakdown).map(([p, c]) => `${p}: ${c}`).join(' · ')}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Online */}
      <Card className="overflow-hidden">
        <CardContent className="pt-4 pb-3 px-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-muted-foreground">Online</span>
            <div className="rounded-md p-1.5 bg-success/10 shadow-[0_0_16px_-6px_hsl(var(--success)/0.45)]">
              <Wifi className="h-3.5 w-3.5 text-success" />
            </div>
          </div>
          <div className="text-2xl font-bold tracking-tight text-success">{online}</div>
        </CardContent>
      </Card>

      {/* Offline */}
      <Card className="overflow-hidden">
        <CardContent className="pt-4 pb-3 px-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-muted-foreground">Desconectadas</span>
            <div className="rounded-md p-1.5 bg-sky-500/10 shadow-[0_0_16px_-6px_rgba(56,189,248,0.45)]">
              <WifiOff className="h-3.5 w-3.5 text-sky-500" />
            </div>
          </div>
          <div className="text-2xl font-bold tracking-tight text-sky-500">{offline}</div>
        </CardContent>
      </Card>

      {/* Connecting */}
      <Card className="overflow-hidden">
        <CardContent className="pt-4 pb-3 px-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-muted-foreground">Conectando</span>
            <div className="rounded-md p-1.5 bg-info/10 shadow-[0_0_16px_-6px_hsl(var(--info)/0.45)]">
              <Signal className="h-3.5 w-3.5 text-info" />
            </div>
          </div>
          <div className="text-2xl font-bold tracking-tight text-info">{connecting}</div>
        </CardContent>
      </Card>

      {/* Plan usage */}
      <Card className="overflow-hidden">
        <CardContent className="pt-4 pb-3 px-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-muted-foreground">Limite do plano</span>
            <div className="rounded-md p-1.5 bg-warning/10 shadow-[0_0_16px_-6px_hsl(var(--warning)/0.45)]">
              <Shield className="h-3.5 w-3.5 text-warning" />
            </div>
          </div>
          {planMax != null && planMax > 0 ? (
            <>
              <div className="text-2xl font-bold tracking-tight text-warning">
                {available} <span className="text-xs font-normal text-muted-foreground">disponíveis</span>
              </div>
              <Progress value={usagePercent} className="h-1.5 mt-2" />
              <p className="text-[10px] text-muted-foreground mt-1">
                {total}/{planMax} utilizadas
              </p>
            </>
          ) : (
            <>
              <div className="text-2xl font-bold tracking-tight text-warning">∞</div>
              <p className="text-[10px] text-muted-foreground mt-1">Sem limite</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

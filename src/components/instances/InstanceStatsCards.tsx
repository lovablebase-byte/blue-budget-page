import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Smartphone, Wifi, WifiOff, Signal } from 'lucide-react';

interface InstanceStatsCardsProps {
  total: number;
  online: number;
  offline: number;
  connecting?: number;
  providerBreakdown?: Record<string, number>;
}

export function InstanceStatsCards({ total, online, offline, connecting = 0, providerBreakdown }: InstanceStatsCardsProps) {
  return (
    <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground">Total</CardTitle>
          <div className="rounded-md p-1.5 bg-primary/10">
            <Smartphone className="h-4 w-4 text-primary" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold tracking-tight">{total}</div>
          {providerBreakdown && (
            <p className="text-xs text-muted-foreground mt-1">
              {Object.entries(providerBreakdown).map(([p, c]) => `${p}: ${c}`).join(' • ')}
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground">Online</CardTitle>
          <div className="rounded-md p-1.5 bg-success/10">
            <Wifi className="h-4 w-4 text-success" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold tracking-tight text-primary">{online}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground">Offline</CardTitle>
          <div className="rounded-md p-1.5 bg-muted/50">
            <WifiOff className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold tracking-tight">{offline}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground">Conectando</CardTitle>
          <div className="rounded-md p-1.5 bg-info/10">
            <Signal className="h-4 w-4 text-info" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold tracking-tight">{connecting}</div>
        </CardContent>
      </Card>
    </div>
  );
}

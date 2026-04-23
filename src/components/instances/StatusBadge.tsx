import { Badge } from '@/components/ui/badge';
import { getStatusConfig } from './constants';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const statusVariantMap: Record<string, 'success' | 'outline' | 'warning' | 'destructive' | 'info' | 'secondary' | 'default'> = {
  online: 'success',
  connected: 'success',
  active: 'success',
  success: 'success',
  offline: 'outline',
  disconnected: 'outline',
  pending: 'warning',
  waiting: 'warning',
  connecting: 'info',
  syncing: 'info',
  processing: 'info',
  error: 'destructive',
  failed: 'destructive',
  rejected: 'destructive',
  blocked: 'destructive',
};

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const cfg = getStatusConfig(status);
  const Icon = cfg.icon;
  const variant = statusVariantMap[status] || cfg.variant;

  return (
    <Badge variant={variant} className={`gap-1.5 ${className}`}>
      <Icon className={`h-3 w-3 ${status === 'connecting' ? 'animate-spin' : ''}`} />
      {cfg.label}
    </Badge>
  );
}

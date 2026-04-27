import { Badge } from '@/components/ui/badge';
import { getStatusConfig } from './constants';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const statusVariantMap: Record<string, 'success' | 'outline' | 'warning' | 'destructive' | 'info' | 'secondary' | 'default'> = {
  online: 'success',
  connected: 'success',
  open: 'success',
  active: 'success',
  success: 'success',
  offline: 'destructive',
  disconnected: 'destructive',
  close: 'destructive',
  closed: 'destructive',
  logout: 'destructive',
  logged_out: 'destructive',
  not_logged: 'destructive',
  not_found: 'destructive',
  pending: 'warning',
  waiting: 'warning',
  connecting: 'info',
  pairing: 'warning',
  qrcode: 'warning',
  qr: 'warning',
  scan: 'warning',
  syncing: 'info',
  processing: 'info',
  error: 'destructive',
  failed: 'destructive',
  rejected: 'destructive',
  blocked: 'destructive',
};

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const key = String(status || '').toLowerCase().trim();
  const cfg = getStatusConfig(key);
  const Icon = cfg.icon;
  const variant = statusVariantMap[key] || cfg.variant;

  return (
    <Badge variant={variant} className={`gap-1.5 ${className}`}>
      <Icon className={`h-3 w-3 ${key === 'connecting' ? 'animate-spin' : ''}`} />
      {cfg.label}
    </Badge>
  );
}

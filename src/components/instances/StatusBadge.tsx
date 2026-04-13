import { Badge } from '@/components/ui/badge';
import { getStatusConfig } from './constants';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const cfg = getStatusConfig(status);
  const Icon = cfg.icon;
  return (
    <Badge variant={cfg.variant} className={`gap-1.5 ${className}`}>
      <Icon className={`h-3 w-3 ${status === 'connecting' ? 'animate-spin' : ''}`} />
      {cfg.label}
    </Badge>
  );
}

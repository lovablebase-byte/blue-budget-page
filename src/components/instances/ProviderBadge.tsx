import { Badge } from '@/components/ui/badge';
import { providerLabels, providerColors } from './constants';

interface ProviderBadgeProps {
  provider: string;
  className?: string;
}

export function ProviderBadge({ provider, className = '' }: ProviderBadgeProps) {
  const colors = providerColors[provider] || 'border-border text-foreground';
  return (
    <Badge variant="outline" className={`text-xs font-semibold tracking-wide ${colors} ${className}`}>
      {providerLabels[provider] || provider}
    </Badge>
  );
}

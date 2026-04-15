/**
 * Reusable empty state component for consistent UX across the client panel.
 * Supports: empty data, feature locked, subscription blocked, permission denied.
 */
import { type LucideIcon, Lock, AlertTriangle, ShieldAlert, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: LucideIcon;
    variant?: 'default' | 'outline' | 'ghost';
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  variant?: 'empty' | 'locked' | 'suspended' | 'no-permission' | 'error';
  className?: string;
  compact?: boolean;
}

const variantDefaults: Record<string, { icon: LucideIcon; color: string; bg: string }> = {
  empty: { icon: Inbox, color: 'text-muted-foreground/50', bg: 'bg-muted/30' },
  locked: { icon: Lock, color: 'text-warning', bg: 'bg-warning/10' },
  suspended: { icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10' },
  'no-permission': { icon: ShieldAlert, color: 'text-warning', bg: 'bg-warning/10' },
  error: { icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10' },
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  variant = 'empty',
  className,
  compact = false,
}: EmptyStateProps) {
  const defaults = variantDefaults[variant];
  const Icon = icon || defaults.icon;
  const ActionIcon = action?.icon;

  return (
    <div className={cn(
      'flex flex-col items-center justify-center text-center',
      compact ? 'py-6 gap-2' : 'py-12 gap-3',
      className,
    )}>
      <div className={cn('rounded-full p-3', defaults.bg)}>
        <Icon className={cn('h-8 w-8', compact && 'h-6 w-6', defaults.color)} />
      </div>
      <div className="space-y-1 max-w-sm">
        <p className={cn('font-semibold', compact ? 'text-sm' : 'text-base')}>{title}</p>
        {description && (
          <p className={cn('text-muted-foreground', compact ? 'text-xs' : 'text-sm')}>{description}</p>
        )}
      </div>
      {(action || secondaryAction) && (
        <div className="flex items-center gap-2 mt-1">
          {action && (
            <Button
              size={compact ? 'sm' : 'default'}
              variant={action.variant || 'outline'}
              onClick={action.onClick}
            >
              {ActionIcon && <ActionIcon className="h-4 w-4 mr-1.5" />}
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button size={compact ? 'sm' : 'default'} variant="ghost" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * PlanStatusBanner — Rich, user-friendly banner showing plan status,
 * usage limits, and smart CTAs. Replaces raw limit/feature banners.
 */
import { useCompany } from '@/contexts/CompanyContext';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  AlertTriangle, Lock, Crown, ArrowUpRight,
  MessageCircle, CheckCircle2, XCircle, Clock,
} from 'lucide-react';

interface ResourceUsage {
  label: string;
  current: number;
  max: number;
}

interface PlanStatusBannerProps {
  /** Optional resource usages to display (e.g. instances, campaigns) */
  resources?: ResourceUsage[];
  /** If the feature itself is blocked by plan */
  featureBlocked?: boolean;
  featureLabel?: string;
}

const statusConfig: Record<string, { label: string; icon: React.ElementType; variant: 'default' | 'destructive' | 'secondary' | 'outline' }> = {
  active: { label: 'Ativa', icon: CheckCircle2, variant: 'default' },
  trialing: { label: 'Período de teste', icon: Clock, variant: 'secondary' },
  past_due: { label: 'Pagamento pendente', icon: AlertTriangle, variant: 'destructive' },
  canceled: { label: 'Cancelada', icon: XCircle, variant: 'destructive' },
  suspended: { label: 'Suspensa', icon: XCircle, variant: 'destructive' },
};

export function PlanStatusBanner({ resources, featureBlocked, featureLabel }: PlanStatusBannerProps) {
  const { plan, planLoading, isSuspended, isActive, isTrialing } = useCompany();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  // Admin bypasses everything
  if (isAdmin) return null;
  if (planLoading) return null;

  // No plan at all
  if (!plan) {
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg p-2 bg-destructive/10 shrink-0">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">Nenhum plano ativo</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Sua conta não possui uma assinatura ativa. Entre em contato com o administrador para ativar seu acesso.
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                <Button size="sm" variant="outline" onClick={() => window.open('mailto:suporte@exemplo.com', '_blank')}>
                  <MessageCircle className="h-3.5 w-3.5 mr-1.5" /> Falar com suporte
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const statusInfo = statusConfig[plan.status] || statusConfig.active;
  const StatusIcon = statusInfo.icon;
  const blocked = isSuspended || featureBlocked;

  // Check if any resource is at limit
  const hasLimitReached = resources?.some(r => r.current >= r.max && r.max > 0);

  // Only show banner when there's something noteworthy
  const shouldShowBanner = blocked || featureBlocked || hasLimitReached || isSuspended || plan.status === 'past_due' || plan.status === 'canceled';

  if (!shouldShowBanner && !resources?.length) return null;

  // Determine banner severity
  const isCritical = isSuspended || plan.status === 'canceled' || plan.status === 'past_due';
  const isWarning = hasLimitReached || featureBlocked;

  const borderColor = isCritical
    ? 'border-destructive/50'
    : isWarning
    ? 'border-warning/40'
    : 'border-border/60';
  const bgColor = isCritical
    ? 'bg-destructive/5'
    : isWarning
    ? 'bg-warning/5'
    : 'bg-card';

  return (
    <Card className={`${borderColor} ${bgColor}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className={`rounded-lg p-2 shrink-0 ${
            isCritical ? 'bg-destructive/10' : isWarning ? 'bg-warning/10' : 'bg-primary/10'
          }`}>
            {featureBlocked ? (
              <Lock className={`h-5 w-5 ${isCritical ? 'text-destructive' : 'text-warning'}`} />
            ) : isCritical ? (
              <AlertTriangle className="h-5 w-5 text-destructive" />
            ) : hasLimitReached ? (
              <AlertTriangle className="h-5 w-5 text-warning" />
            ) : (
              <Crown className="h-5 w-5 text-primary" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Header row: plan name + status */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-sm">
                Plano {plan.plan_name}
              </span>
              <Badge variant={statusInfo.variant} className="text-[10px] h-5 gap-1">
                <StatusIcon className="h-3 w-3" />
                {statusInfo.label}
              </Badge>
              {isTrialing && plan.expires_at && (
                <span className="text-[10px] text-muted-foreground">
                  Expira em {new Date(plan.expires_at).toLocaleDateString('pt-BR')}
                </span>
              )}
            </div>

            {/* Suspension / cancellation message */}
            {isCritical && (
              <p className="text-sm text-muted-foreground mt-1">
                {plan.status === 'past_due'
                  ? 'Seu pagamento está pendente. Regularize para continuar usando os recursos.'
                  : plan.status === 'canceled'
                  ? 'Sua assinatura foi cancelada. Entre em contato para reativar o acesso.'
                  : 'Sua assinatura está suspensa. Não é possível criar ou gerenciar recursos.'}
              </p>
            )}

            {/* Feature blocked message */}
            {featureBlocked && featureLabel && !isCritical && (
              <p className="text-sm text-muted-foreground mt-1">
                <span className="font-medium">{featureLabel}</span> não está disponível no seu plano atual.
              </p>
            )}

            {/* Resource usage bars */}
            {resources && resources.length > 0 && !featureBlocked && (
              <div className="mt-3 space-y-2">
                {resources.map((r) => {
                  const percent = r.max > 0 ? Math.min(100, (r.current / r.max) * 100) : 0;
                  const atLimit = r.current >= r.max && r.max > 0;
                  const nearLimit = percent >= 80 && !atLimit;
                  return (
                    <div key={r.label}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-muted-foreground">{r.label}</span>
                        <span className={`font-medium ${atLimit ? 'text-destructive' : nearLimit ? 'text-warning' : 'text-foreground'}`}>
                          {r.current}/{r.max}
                          {atLimit && ' (limite atingido)'}
                          {r.max > 0 && !atLimit && ` · ${r.max - r.current} disponíveis`}
                        </span>
                      </div>
                      <Progress
                        value={percent}
                        className={`h-1.5 ${atLimit ? '[&>div]:bg-destructive' : nearLimit ? '[&>div]:bg-warning' : ''}`}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {/* CTAs */}
            {(isCritical || hasLimitReached || featureBlocked) && (
              <div className="flex flex-wrap gap-2 mt-3">
                <Button size="sm" variant="outline" onClick={() => navigate('/subscription')}>
                  <Crown className="h-3.5 w-3.5 mr-1.5" /> Ver meu plano
                </Button>
                {(hasLimitReached || featureBlocked) && (
                  <Button size="sm" variant="outline" onClick={() => window.open('mailto:suporte@exemplo.com', '_blank')}>
                    <ArrowUpRight className="h-3.5 w-3.5 mr-1.5" /> Solicitar upgrade
                  </Button>
                )}
                {isCritical && (
                  <Button size="sm" variant="outline" onClick={() => window.open('mailto:suporte@exemplo.com', '_blank')}>
                    <MessageCircle className="h-3.5 w-3.5 mr-1.5" /> Falar com suporte
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

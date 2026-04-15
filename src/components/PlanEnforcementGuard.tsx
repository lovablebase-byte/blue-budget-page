/**
 * Reusable components for plan enforcement in client pages.
 */
import { AlertCircle, Lock, ArrowUpRight, ShieldAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface LimitBannerProps {
  current: number;
  max: number;
  resourceLabel: string;
}

export function LimitReachedBanner({ current, max, resourceLabel }: LimitBannerProps) {
  if (current < max) return null;
  return (
    <Alert variant="destructive" className="mb-4 border-destructive/30 bg-destructive/5">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Limite de {resourceLabel} atingido</AlertTitle>
      <AlertDescription className="flex items-center justify-between gap-4 flex-wrap">
        <span>
          Você está usando <strong>{current}</strong> de <strong>{max}</strong> {resourceLabel} disponíveis no seu plano.
          Para ampliar, entre em contato com o administrador.
        </span>
        <Button size="sm" variant="outline" className="shrink-0 gap-1.5" onClick={() => window.open('mailto:suporte@exemplo.com', '_blank')}>
          <ArrowUpRight className="h-3.5 w-3.5" /> Solicitar upgrade
        </Button>
      </AlertDescription>
    </Alert>
  );
}

interface FeatureLockedProps {
  featureLabel: string;
  description?: string;
}

export function FeatureLockedBanner({ featureLabel, description }: FeatureLockedProps) {
  return (
    <Alert className="mb-4 border-warning/30 bg-warning/5">
      <Lock className="h-4 w-4 text-warning" />
      <AlertTitle className="text-warning">Recurso não disponível</AlertTitle>
      <AlertDescription className="flex items-center justify-between gap-4 flex-wrap">
        <span>
          {description || `${featureLabel} não está incluído no seu plano atual. Para acessar, solicite um upgrade.`}
        </span>
        <Button size="sm" variant="outline" className="shrink-0 gap-1.5" onClick={() => window.open('mailto:suporte@exemplo.com', '_blank')}>
          <ArrowUpRight className="h-3.5 w-3.5" /> Solicitar upgrade
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export function SuspendedBanner() {
  return (
    <Alert variant="destructive" className="mb-4 border-destructive/40 bg-destructive/5">
      <ShieldAlert className="h-4 w-4" />
      <AlertTitle>Conta suspensa</AlertTitle>
      <AlertDescription>
        Sua assinatura está suspensa ou cancelada. A conta está em modo somente leitura.
        Regularize o pagamento para voltar a operar normalmente.
      </AlertDescription>
    </Alert>
  );
}

interface GuardedButtonProps {
  allowed: boolean;
  reason?: string;
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
}

export function GuardedButton({ allowed, reason, children, onClick, className }: GuardedButtonProps) {
  if (allowed) {
    return <Button onClick={onClick} className={className}>{children}</Button>;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>
          <Button disabled className={className}>{children}</Button>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[250px]">{reason || 'Recurso indisponível no seu plano atual'}</TooltipContent>
    </Tooltip>
  );
}

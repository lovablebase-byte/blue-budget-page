/**
 * Reusable components for plan enforcement in client pages.
 */
import { AlertCircle, Lock } from 'lucide-react';
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
    <Alert variant="destructive" className="mb-4">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Limite atingido</AlertTitle>
      <AlertDescription>
        Você atingiu o limite de {max} {resourceLabel} do seu plano ({current}/{max}).
        Entre em contato com o administrador para ampliar.
      </AlertDescription>
    </Alert>
  );
}

interface FeatureLockedProps {
  featureLabel: string;
}

export function FeatureLockedBanner({ featureLabel }: FeatureLockedProps) {
  return (
    <Alert className="mb-4 border-yellow-500/50 bg-yellow-500/5">
      <Lock className="h-4 w-4 text-yellow-600" />
      <AlertTitle>Recurso bloqueado</AlertTitle>
      <AlertDescription>
        {featureLabel} não está disponível no seu plano atual.
        Entre em contato com o administrador para habilitar.
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
      <TooltipContent>{reason || 'Recurso bloqueado pelo plano'}</TooltipContent>
    </Tooltip>
  );
}

import { Wifi, WifiOff, RefreshCw, QrCode, AlertCircle } from 'lucide-react';

export interface StatusConfig {
  label: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info';
  icon: typeof Wifi;
}

export const statusConfig: Record<string, StatusConfig> = {
  online: { label: 'Conectado', variant: 'success', icon: Wifi },
  connected: { label: 'Conectado', variant: 'success', icon: Wifi },
  offline: { label: 'Desconectado', variant: 'secondary', icon: WifiOff },
  connecting: { label: 'Conectando', variant: 'info', icon: RefreshCw },
  pairing: { label: 'Aguardando QR', variant: 'warning', icon: QrCode },
  error: { label: 'Erro', variant: 'destructive', icon: AlertCircle },
};

export const providerLabels: Record<string, string> = {
  evolution: 'Evolution API',
  wuzapi: 'WuzAPI',
};

export const providerColors: Record<string, string> = {
  evolution: 'border-primary/40 text-primary bg-primary/10',
  wuzapi: 'border-accent/40 text-accent bg-accent/10',
};

export const TIMEZONES = [
  'America/Sao_Paulo', 'America/Manaus', 'America/Fortaleza',
  'America/Cuiaba', 'America/Belem', 'America/Recife',
  'America/Bahia', 'America/Porto_Velho', 'America/Rio_Branco',
];

/**
 * Returns the correct webhook events array for a given provider.
 * Evolution uses dot-notation events, Wuzapi uses simple names.
 */
export function getProviderEvents(provider: string): string[] {
  if (provider === 'wuzapi') {
    return ['Message'];
  }
  return ['messages.upsert', 'send.message', 'connection.update', 'qrcode.updated', 'messages.update'];
}

export function getStatusConfig(status: string): StatusConfig {
  return statusConfig[status] || statusConfig.offline;
}

import { Wifi, WifiOff, RefreshCw, QrCode, AlertCircle } from 'lucide-react';

export interface StatusConfig {
  label: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info';
  icon: typeof Wifi;
}

export const statusConfig: Record<string, StatusConfig> = {
  online: { label: 'Conectado', variant: 'success', icon: Wifi },
  connected: { label: 'Conectado', variant: 'success', icon: Wifi },
  offline: { label: 'Desconectado', variant: 'destructive', icon: WifiOff },
  connecting: { label: 'Conectando', variant: 'warning', icon: RefreshCw },
  pairing: { label: 'Aguardando QR', variant: 'warning', icon: QrCode },
  error: { label: 'Erro', variant: 'destructive', icon: AlertCircle },
};

export const providerLabels: Record<string, string> = {
  evolution: 'Evolution API',
  wuzapi: 'WuzAPI',
  evolution_go: 'Evolution Go',
};

export const providerColors: Record<string, string> = {
  evolution: 'border-pink-500/40 text-pink-500 bg-pink-500/10',
  wuzapi: 'border-sky-500/40 text-sky-500 bg-sky-500/10',
  evolution_go: 'border-success/40 text-success bg-success/10',
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
  if (provider === 'evolution_go') {
    // Evolution Go (v2) uses UPPERCASE event names per the official docs
    return ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED', 'MESSAGES_UPDATE', 'PRESENCE_UPDATE'];
  }
  return ['messages.upsert', 'send.message', 'connection.update', 'qrcode.updated', 'messages.update'];
}

export function getStatusConfig(status: string): StatusConfig {
  return statusConfig[status] || statusConfig.offline;
}

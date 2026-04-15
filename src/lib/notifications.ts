/**
 * Centralized notification helpers for consistent toast messages.
 * Standardized tone: professional, concise, action-oriented.
 */
import { toast } from 'sonner';

/* ── Instance events ── */
export const notify = {
  // Instance connection
  instanceConnected: (name: string) =>
    toast.success(`${name} conectada`, { description: 'WhatsApp pareado com sucesso.' }),

  instanceDisconnected: (name: string) =>
    toast.info(`${name} desconectada`, { description: 'A sessão foi encerrada.' }),

  instanceRestarted: (name: string) =>
    toast.info(`${name} reiniciada`, { description: 'Nova sessão sendo estabelecida.' }),

  instanceCreated: (name: string) =>
    toast.success(`Instância "${name}" criada`, { description: 'Configure o QR Code para conectar.' }),

  instanceDeleted: (name: string) =>
    toast.success(`Instância "${name}" removida`),

  // QR Code
  qrExpired: () =>
    toast.warning('QR Code expirado', { description: 'Gere um novo QR Code para continuar.' }),

  qrGenerated: () =>
    toast('QR Code gerado', { description: 'Escaneie com o WhatsApp do celular.' }),

  // Plan limits
  limitReached: (resource: string, max: number) =>
    toast.warning(`Limite de ${resource} atingido`, {
      description: `Seu plano permite até ${max}. Entre em contato para ampliar.`,
    }),

  featureBlocked: (feature: string) =>
    toast.warning(`${feature} indisponível`, {
      description: 'Este recurso não está incluído no seu plano atual.',
    }),

  // Subscription
  subscriptionSuspended: () =>
    toast.error('Assinatura suspensa', {
      description: 'Sua conta está em modo somente leitura. Regularize o pagamento.',
    }),

  invoicePending: (count: number) =>
    toast.warning(`${count} fatura(s) pendente(s)`, {
      description: 'Regularize para evitar suspensão.',
    }),

  // Integration
  integrationError: (detail?: string) =>
    toast.error('Erro de integração', {
      description: detail || 'Não foi possível comunicar com o provider. Tente novamente.',
    }),

  webhookTestSuccess: () =>
    toast.success('Webhook testado', { description: 'O endpoint respondeu corretamente.' }),

  webhookTestFailed: (detail?: string) =>
    toast.error('Falha no teste de webhook', {
      description: detail || 'O endpoint não respondeu como esperado.',
    }),

  // Generic
  saved: (label?: string) =>
    toast.success(label ? `${label} salvo` : 'Salvo com sucesso'),

  copied: (label?: string) =>
    toast.success(`${label || 'Valor'} copiado!`),

  actionBlocked: (reason?: string) =>
    toast.warning('Ação bloqueada', {
      description: reason || 'Você não tem permissão para realizar esta ação.',
    }),

  error: (message: string) =>
    toast.error('Erro', { description: message }),
};

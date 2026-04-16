// Common types for all WhatsApp providers

export type ProviderName = 'evolution' | 'wuzapi' | 'evolution_go';

export interface ProviderConfig {
  baseUrl: string;
  apiKey: string;
}

export interface ProviderResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  raw?: any;
}

export interface InstanceStatusResult {
  state: 'open' | 'close' | 'connecting' | 'not_found' | 'error';
  instanceName: string;
  phoneNumber?: string;
}

export interface QRCodeResult {
  qrCode?: string; // base64 or data URI
  pairingCode?: string;
}

export interface CreateInstanceResult {
  instanceId: string;
  instanceName: string;
  qrCode?: string;
  status: string;
}

export interface SendMessageResult {
  messageId?: string;
  timestamp?: string;
}

export interface FetchInstanceItem {
  instanceName: string;
  instanceId: string | null;
  status: string;
  raw: Record<string, any>;
}

/**
 * Common interface all WhatsApp providers must implement.
 * Each method receives already-resolved config (baseUrl + apiKey)
 * so provider implementations stay pure HTTP adapters.
 */
export interface WhatsAppProvider {
  name: ProviderName;

  testConnection(config: ProviderConfig): Promise<ProviderResult<boolean>>;

  createInstance(
    config: ProviderConfig,
    instanceName: string,
    payload?: Record<string, any>,
  ): Promise<ProviderResult<CreateInstanceResult>>;

  connectInstance(
    config: ProviderConfig,
    instanceName: string,
  ): Promise<ProviderResult<QRCodeResult>>;

  getInstanceStatus(
    config: ProviderConfig,
    instanceName: string,
  ): Promise<ProviderResult<InstanceStatusResult>>;

  deleteInstance(
    config: ProviderConfig,
    instanceName: string,
  ): Promise<ProviderResult<void>>;

  logoutInstance(
    config: ProviderConfig,
    instanceName: string,
  ): Promise<ProviderResult<void>>;

  fetchInstances(
    config: ProviderConfig,
  ): Promise<ProviderResult<FetchInstanceItem[]>>;

  sendTextMessage(
    config: ProviderConfig,
    instanceName: string,
    phone: string,
    text: string,
  ): Promise<ProviderResult<SendMessageResult>>;
}

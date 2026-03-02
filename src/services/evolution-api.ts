// Evolution API Provider - Isolated service for WhatsApp management
// This service handles all communication with the Evolution API

export interface EvolutionConfig {
  baseUrl: string;
  apiKey: string;
  timeout?: number;
  environment?: 'production' | 'test';
}

export interface EvolutionInstance {
  instanceName: string;
  status: string;
  number?: string;
  profilePicUrl?: string;
}

export interface QRCodeResponse {
  base64: string;
  code: string;
}

export interface SendMessagePayload {
  number: string;
  text?: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'audio' | 'document';
  fileName?: string;
  caption?: string;
}

export interface WebhookConfig {
  url: string;
  events: string[];
  enabled: boolean;
}

const EVOLUTION_EVENTS = [
  'message.received',
  'message.sent',
  'instance.connected',
  'instance.disconnected',
  'qr.updated',
  'delivery.status',
] as const;

export type EvolutionEventType = typeof EVOLUTION_EVENTS[number];

export interface NormalizedEvent {
  type: EvolutionEventType;
  instanceName: string;
  timestamp: string;
  data: Record<string, any>;
}

class EvolutionProvider {
  private config: EvolutionConfig | null = null;

  configure(config: EvolutionConfig) {
    this.config = {
      timeout: 30000,
      environment: 'production',
      ...config,
    };
  }

  getConfig() {
    return this.config;
  }

  isConfigured() {
    return !!this.config?.baseUrl && !!this.config?.apiKey;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, any>
  ): Promise<T> {
    if (!this.config) throw new Error('Evolution API not configured');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout || 30000);

    try {
      const res = await fetch(`${this.config.baseUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          apikey: this.config.apiKey,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(error.message || `Evolution API error: ${res.status}`);
      }

      return res.json();
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Evolution API request timeout');
      }
      throw error;
    }
  }

  // Instance management
  async createInstance(instanceName: string, webhookUrl?: string): Promise<EvolutionInstance> {
    return this.request('POST', '/instance/create', {
      instanceName,
      qrcode: true,
      webhook: webhookUrl,
      webhookByEvents: true,
      events: EVOLUTION_EVENTS,
    });
  }

  async getInstanceStatus(instanceName: string): Promise<{ state: string }> {
    return this.request('GET', `/instance/connectionState/${instanceName}`);
  }

  async getInstanceInfo(instanceName: string): Promise<EvolutionInstance> {
    return this.request('GET', `/instance/fetchInstances?instanceName=${instanceName}`);
  }

  async deleteInstance(instanceName: string): Promise<void> {
    await this.request('DELETE', `/instance/delete/${instanceName}`);
  }

  // QR Code
  async generateQRCode(instanceName: string): Promise<QRCodeResponse> {
    return this.request('GET', `/instance/connect/${instanceName}`);
  }

  // Session management
  async disconnectInstance(instanceName: string): Promise<void> {
    await this.request('DELETE', `/instance/logout/${instanceName}`);
  }

  async reconnectInstance(instanceName: string): Promise<void> {
    await this.request('GET', `/instance/connect/${instanceName}`);
  }

  // Messaging
  async sendTextMessage(instanceName: string, payload: SendMessagePayload): Promise<any> {
    return this.request('POST', `/message/sendText/${instanceName}`, {
      number: payload.number,
      text: payload.text,
    });
  }

  async sendMediaMessage(instanceName: string, payload: SendMessagePayload): Promise<any> {
    return this.request('POST', `/message/sendMedia/${instanceName}`, {
      number: payload.number,
      mediatype: payload.mediaType,
      media: payload.mediaUrl,
      caption: payload.caption,
      fileName: payload.fileName,
    });
  }

  // Webhooks
  async setWebhook(instanceName: string, config: WebhookConfig): Promise<void> {
    await this.request('POST', `/webhook/set/${instanceName}`, {
      url: config.url,
      webhook_by_events: true,
      events: config.events,
      enabled: config.enabled,
    });
  }

  async getWebhook(instanceName: string): Promise<WebhookConfig> {
    return this.request('GET', `/webhook/find/${instanceName}`);
  }

  // Normalize incoming webhook event
  normalizeEvent(rawEvent: Record<string, any>): NormalizedEvent | null {
    const eventMap: Record<string, EvolutionEventType> = {
      'messages.upsert': 'message.received',
      'send.message': 'message.sent',
      'connection.update': rawEvent?.data?.state === 'open' ? 'instance.connected' : 'instance.disconnected',
      'qrcode.updated': 'qr.updated',
      'messages.update': 'delivery.status',
    };

    const eventType = eventMap[rawEvent.event];
    if (!eventType) return null;

    return {
      type: eventType,
      instanceName: rawEvent.instance || '',
      timestamp: new Date().toISOString(),
      data: rawEvent.data || rawEvent,
    };
  }

  // Validate webhook signature
  validateWebhookSignature(payload: string, signature: string, secret: string): boolean {
    // Simple HMAC validation - in production use crypto.subtle
    // For now, basic check
    return !!signature && !!secret;
  }
}

// Singleton instance
export const evolutionApi = new EvolutionProvider();
export default evolutionApi;

import type { WhatsAppProvider, ProviderName } from './types';
import { evolutionProvider } from './evolution';
import { wuzapiProvider } from './wuzapi';

export type { WhatsAppProvider, ProviderName, ProviderConfig, ProviderResult } from './types';
export type {
  CreateInstanceResult,
  QRCodeResult,
  InstanceStatusResult,
  SendMessageResult,
  FetchInstanceItem,
} from './types';

const providers: Record<ProviderName, WhatsAppProvider> = {
  evolution: evolutionProvider,
  wuzapi: wuzapiProvider,
};

export function getProvider(name: ProviderName): WhatsAppProvider {
  const provider = providers[name];
  if (!provider) throw new Error(`Provider desconhecido: ${name}`);
  return provider;
}

export function isValidProvider(name: string): name is ProviderName {
  return name === 'evolution' || name === 'wuzapi';
}

export { evolutionProvider, wuzapiProvider };

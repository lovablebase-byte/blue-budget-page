import type { WhatsAppProvider, ProviderName } from './types';
import { evolutionProvider } from './evolution';
import { wuzapiProvider } from './wuzapi';
import { evolutionGoProvider } from './evolution-go';
import { wppconnectProvider } from './wppconnect';
import { quepasaProvider } from './quepasa';

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
  evolution_go: evolutionGoProvider,
  wppconnect: wppconnectProvider,
  quepasa: quepasaProvider,
};

export function getProvider(name: ProviderName): WhatsAppProvider {
  const provider = providers[name];
  if (!provider) throw new Error(`Provider desconhecido: ${name}`);
  return provider;
}

export function isValidProvider(name: string): name is ProviderName {
  return (
    name === 'evolution' ||
    name === 'wuzapi' ||
    name === 'evolution_go' ||
    name === 'wppconnect' ||
    name === 'quepasa'
  );
}

export { evolutionProvider, wuzapiProvider, evolutionGoProvider, wppconnectProvider, quepasaProvider };

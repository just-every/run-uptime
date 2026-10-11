import type { Admission, Database, IdentityProviderConfig, IdentityProviders } from '../../index.mjs';
export interface OidcProvidersConfig {
  origin: string;
  local?: boolean;
  /** Independent high-entropy secret of at least 32 characters; never browser data. */
  transactionSecret: string;
  providers: IdentityProviderConfig[];
  signInPath?: string;
  transactionSeconds?: number;
  timeoutMs?: number;
  clockSkewSeconds?: number;
  maxTokenAgeSeconds?: number;
  startLimit?: number;
}
export interface OidcProvidersOptions {
  admission: Pick<Admission, 'admit'>;
  db: Database;
  config: OidcProvidersConfig;
  clientIp: (request: Request) => string | Promise<string>;
  fetch?: typeof globalThis.fetch;
  clock?: () => number;
  waitUntil?: (promise: Promise<unknown>) => void;
}
export const HIDE_AFTER_MS: number;
export const MINIMUM_PROVIDER_VERSION: string;
export const PRESETS: Readonly<Record<'auth' | 'google' | 'microsoft' | 'okta', { label: string; algorithms: string[]; methods: string[]; email: 'verified-at' | 'google' | 'subject' }>>;
export function createOidcProviders(options: OidcProvidersOptions): IdentityProviders;
export function createOidcHandler(providers: IdentityProviders): (request: Request) => Promise<Response | null>;
export class OidcError extends Error { constructor(code: string, status?: number); code: string; status: number }

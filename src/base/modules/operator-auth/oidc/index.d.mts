import type { Database, OperatorAuth } from '../index.mjs';
export interface OidcConfig {
  /** Exact deployment-owned HTTPS issuer, also present in core externalIssuers. */
  issuer: string;
  origin: string;
  redirectUri: string;
  clientId: string;
  clientSecret?: string;
  /** Independent high-entropy secret of at least 32 characters; never browser data. */
  transactionSecret: string;
  tokenAuthMethod?: 'client_secret_basic' | 'client_secret_post' | 'none';
  /** Default [issuer origin]. Add each cross-origin provider endpoint explicitly. */
  endpointOrigins?: string[];
  algorithms?: Array<'RS256' | 'ES256'>;
  /** Explicitly trusted extra audiences; clientId remains mandatory and azp must match for multiple audiences. */
  additionalAudiences?: string[];
  /** Explicit trusted issuer+sub to existing operator email bindings. Never use mutable IdP email or preferred_username to populate this from a request. */
  subjectEmails?: Record<string, string>;
  startPath?: string;
  local?: boolean;
  transactionSeconds?: number;
  timeoutMs?: number;
  clockSkewSeconds?: number;
  maxTokenAgeSeconds?: number;
  startLimit?: number;
}
export interface OidcOptions {
  auth: Pick<OperatorAuth, 'createIdentityAdmission'>;
  db: Database;
  config: OidcConfig;
  clientIp: (request: Request) => string | Promise<string>;
  fetch?: typeof globalThis.fetch;
  clock?: () => number;
}
export interface OidcClient {
  readonly startPath: string;
  readonly callbackPath: string;
  begin(request: Request, input?: { returnTo?: string }): Promise<Response>;
  callback(request: Request): Promise<Response>;
}
export function createOidcClient(options: OidcOptions): OidcClient;
export function createOidcHandler(client: OidcClient): (request: Request) => Promise<Response | null>;
export class OidcError extends Error { constructor(code: string, status?: number); code: string; status: number }

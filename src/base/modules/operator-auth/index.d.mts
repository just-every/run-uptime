export type Role = 'owner' | 'admin' | 'member';
export type SessionKind = 'native' | 'review' | 'oidc' | 'password' | 'dev';
export interface Operator { id: string; email: string; displayName: string; role: Role; status: 'invited' | 'active' | 'inactive'; version: number; createdAt: number }
export interface Session { id: string; kind: SessionKind; operatorId: string; operator: Operator; createdAt: number; expiresAt: number }
export interface CompletedSession { session: Pick<Session, 'id' | 'kind' | 'createdAt' | 'expiresAt'>; operator: Operator; cookie: string; returnTo: string }
export interface MailMessage { deliveryId: string; from: string; to: string[]; subject: string; text: string; html: string; headers: Record<string, string> }
export interface MailSender { send(message: MailMessage): Promise<{ status: 'accepted' | 'rejected' | 'rate_limited' | 'uncertain' | 'development'; provider: string; providerMessageId: string | null; code?: string }> }
export interface AuthBranding { productName?: string; accentColor?: string; signInPath?: string; /** Same-origin path of the seed's served rer-theme.css. */ theme?: string }
export interface AuthPresentation { readonly productName: string; readonly accentColor: string; readonly signInPath: string; readonly theme?: string }
export interface LinkPreview { kind: 'magic' | 'invite' | 'step_up'; expiresInMinutes: number }
/** A step-up confirmation proves the session's operator again; it issues no new session. */
export interface StepUpConfirmed { stepUp: StepUpAction; returnTo: string; cookie?: undefined }
export type StepUpAction = 'providers:unlink' | 'providers:relink' | 'domains:change' | 'owner:transfer' | 'export' | 'delete' | 'credentials:mint';
export const STEP_UP_ACTIONS: readonly StepUpAction[];
export type ProviderPreset = 'auth' | 'google' | 'microsoft' | 'okta';
/** One identity provider. Secrets and the private key are server bindings, never source text. */
export interface IdentityProviderConfig {
  /** Route and pin id: /auth/oidc/<id>/start and /auth/oidc/<id>/callback. */
  id: string;
  preset: ProviderPreset;
  /** Auth and Okta: the exact HTTPS issuer. Google's is fixed; Microsoft's comes from tenant. */
  issuer?: string;
  tenant?: string;
  clientId: string;
  label?: string;
  /** Default: private_key_jwt (no shared secret). Auth accepts only private_key_jwt. */
  tokenAuthMethod?: 'private_key_jwt' | 'client_secret_basic' | 'client_secret_post';
  clientSecret?: string;
  /** The app's private JWK (ES256 or RS256) with kid; the provider holds its public half. */
  privateKey?: JsonWebKey & { kid: string };
  /** Explicit issuer-scoped sub to existing operator email associations; the only way Microsoft and Okta identify a person. */
  subjectEmails?: Record<string, string>;
  additionalAudiences?: string[];
  endpointOrigins?: string[];
  /** Auth only: the lowest oidc-provider interface version accepted (at least the module's minimum). */
  minimumVersion?: string;
}
export interface AuthConfig {
  /** Name: 1-80 characters; accent: #rrggbb; signInPath: same-origin absolute path. */
  branding?: AuthBranding;
  origin: string; OWNER_EMAIL: string; SESSION_SECRET: string; SETUP_TOKEN?: string; MAIL_FROM?: string;
  /** Local HTTP is allowed only for literal localhost, 127.0.0.1 or [::1] with matching Host. */
  local?: boolean; allowList?: string[]; sessionSeconds?: number; linkSeconds?: number;
  review?: { enabled: boolean; operatorEmail: string }; reviewSeconds?: number;
  limitWindowSeconds?: number; ipLimit?: number; emailLimit?: number;
  /** Issuers the original admitVerifiedIdentity/createIdentityAdmission seams accept. */
  externalIssuers?: string[];
  /** Linked identity providers, offered as "Continue with…" on the sign-in page. */
  providers?: IdentityProviderConfig[];
  /** Independent secret of at least 32 characters for provider transactions; required with providers. */
  OIDC_TRANSACTION_SECRET?: string;
  identityTimeoutMs?: number; identityStartLimit?: number;
}
export type Action = 'operators:list' | 'operators:invite' | 'operators:deactivate' | 'operators:reactivate' | 'operators:role' | 'sessions:list' | 'sessions:revoke' | 'providers:manage' | 'domains:manage';
export interface PolicyInput { actor: Operator; action: Action; target?: Operator; role?: Role }
export type RolePolicy = (input: PolicyInput) => boolean | Promise<boolean>;
/** Minimal structural D1 binding contract, compatible with Workers D1Database. */
export interface Database {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<Result[]>;
}
export interface Statement {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<Result<T>>;
  run<T = Record<string, unknown>>(): Promise<Result<T>>;
}
export interface Result<T = Record<string, unknown>> { results: T[]; meta: { changes: number } }
/**
 * Cryptographically verified principal, the identity layer's output. Its email
 * counts only when emailVerified is true and any emailVerifiedAt (ms) is within
 * 30 days. associatedEmail comes only from trusted server configuration.
 */
export interface VerifiedPrincipal { issuer: string; subject: string; provider?: string; email?: string; emailVerified?: boolean; emailVerifiedAt?: number; amr?: string[] }
export interface Principal extends VerifiedPrincipal { associatedEmail?: string }
export interface VerifiedIdentity extends VerifiedPrincipal { email: string; emailVerified: true }
/** Deployment-owned association, never populated from token claims or HTTP input. */
export interface IdentityAdmissionConfig { issuer: string; subjectEmails?: Record<string, string> }
export type IdentityAdmission = (request: Request, identity: VerifiedPrincipal, input?: { returnTo?: string }) => Promise<CompletedSession>;
export interface AuthHooks {
  /** Before an email link is sent to an active operator. Return false to send nothing; the public answer is unchanged. */
  beforeMagicLink?(input: { request: Request; email: string; operator: Operator }): boolean | void | Promise<boolean | void>;
  /** After an email-link or provider sign-in completes. Return a returnTo to redirect; throw to refuse (the new session is revoked). */
  afterConfirm?(input: { request: Request; operator: Operator; session: CompletedSession['session']; method: 'email' | 'oidc'; returnTo: string }): void | { returnTo?: string } | Promise<void | { returnTo?: string }>;
}
export interface AuthOptions {
  db: Database; config: AuthConfig; mailSender?: MailSender; clientIp: (request: Request) => string | Promise<string>; rolePolicy?: RolePolicy; clock?: () => number;
  hooks?: AuthHooks;
  /** The runtime's fetch for provider discovery, JWKS and token calls (it must honour redirect: 'error' and AbortSignal). */
  fetch?: typeof globalThis.fetch;
  /** The Worker's waitUntil, so a hidden provider is re-checked after the page answers. */
  waitUntil?: (promise: Promise<unknown>) => void;
}
/** A person as the identity layer sees them through an accounts adapter. */
export interface AccountPerson { id: string; email: string; status: 'active' | 'invited' | 'inactive'; owner: boolean; [extra: string]: unknown }
/**
 * The accounts adapter interface: what identity needs from an app's own
 * accounts. Base's oa_ store implements it; a seed with its own tables may too.
 */
export interface AccountsAdapter {
  findByEmail(email: string): Promise<AccountPerson | null>;
  findBinding(principal: { issuer: string; subject: string }): Promise<AccountPerson | null>;
  /** Never rebinds a principal bound to someone else; binds only proven emails or explicit associations; revokes earlier passwords. */
  bind(input: { issuer: string; subject: string; person: AccountPerson; associated: boolean }): Promise<boolean>;
  issueSession(input: { person: AccountPerson; principal: Principal; method: 'oidc'; returnTo?: string; request: Request }): Promise<CompletedSession | null>;
  revokeSession(sessionId: string): Promise<void>;
  owner(): Promise<AccountPerson | null>;
  acceptInvitation?(input: { person: AccountPerson; principal: Principal; returnTo?: string; request: Request }): Promise<CompletedSession | null>;
  requiredProvider?(email: string): Promise<string | null>;
}
export interface Admission {
  admit(request: Request, principal: Principal, input?: { returnTo?: string }): Promise<CompletedSession>;
  readonly accounts: AccountsAdapter;
}
export interface ProviderEntry { id: string; label: string; preset: ProviderPreset; startPath: string; visible: boolean; linked: boolean; pendingRelink: boolean }
export interface ProviderLink {
  id: string; preset: ProviderPreset; status: 'linked' | 'unlinked'; issuer: string; clientId: string; jwks: string; authorization: string; token: string;
  algorithms: Array<'ES256' | 'RS256'>; tokenAuthMethod: string; responseIssuer: boolean; interfaceVersion: string | null; linkedAt: number;
  pendingIssuer: string | null; pendingClientId: string | null; pendingPreset: string | null; pendingAt: number | null;
}
export interface IdentityProviders {
  readonly ids: readonly string[];
  begin(request: Request, id: string, input?: { returnTo?: string }): Promise<Response>;
  callback(request: Request, id: string): Promise<Response>;
  list(): Promise<ProviderEntry[]>;
  relink(id: string): Promise<ProviderLink | null>;
  unlink(id: string): Promise<void>;
  links(): Promise<ProviderLink[]>;
}
export interface DomainRule { domain: string; providerId: string; createdAt: number }
export interface OperatorAuth {
  /** Frozen public branding only; contains no credentials or auth configuration. */
  readonly presentation: AuthPresentation;
  /** Linked identity providers; null when none is configured. */
  readonly providers: IdentityProviders | null;
  readonly admission: Admission;
  readonly accounts: AccountsAdapter;
  bootstrap(request: Request, input: { token: string; displayName: string; returnTo?: string }): Promise<CompletedSession>;
  /** requiredProvider names the provider the address's domain must use, whoever asks. */
  requestMagicLink(request: Request, input: { email: string; returnTo?: string }): Promise<{ status: 'accepted'; requiredProvider?: string }>;
  previewLink(request: Request, token: string | null): Promise<LinkPreview | null>;
  confirmLink(request: Request, input: { token: string }): Promise<CompletedSession | StepUpConfirmed>;
  getSession(request: Request): Promise<Session | null>;
  signOut(request: Request): Promise<{ cookie: string }>;
  invite(request: Request, input: { email: string; displayName: string; role?: Role; returnTo?: string }): Promise<{ status: 'accepted' }>;
  listOperators(request: Request): Promise<Operator[]>;
  /** Cancel a pending invitation using operators:deactivate policy; accepted invitations conflict. */
  cancelInvitation(request: Request, operatorId: string): Promise<Operator>;
  setOperatorStatus(request: Request, operatorId: string, status: 'active' | 'inactive'): Promise<Operator>;
  setRole(request: Request, operatorId: string, role: Role): Promise<Operator>;
  listSessions(request: Request, operatorId?: string): Promise<Array<{ id: string; kind: SessionKind; createdAt: number; expiresAt: number; active: boolean }>>;
  revokeSession(request: Request, sessionId: string): Promise<void>;
  issueReviewSession(request: Request, input?: { returnTo?: string }): Promise<CompletedSession>;
  /** Server-only: caller has verified the full OIDC protocol. Never bind untrusted JSON to this method. */
  admitVerifiedIdentity(request: Request, identity: VerifiedIdentity, input?: { returnTo?: string }): Promise<CompletedSession>;
  /** Server-only configuration: snapshots exact subject associations; caller must verify the full OIDC protocol. */
  createIdentityAdmission(config: IdentityAdmissionConfig): IdentityAdmission;
  /** Server-only: caller has verified a real password against this existing operator. Rate-limit that verifier independently. */
  admitVerifiedPassword(request: Request, operatorId: string, input?: { returnTo?: string }): Promise<CompletedSession>;
  /** Email a step-up link to the signed-in operator's own address. */
  requestStepUp(request: Request, input: { action: StepUpAction; returnTo?: string }): Promise<{ status: 'accepted' }>;
  /** Refuse unless this session holds a fresh (10-minute) app-local email-link proof. Provider sessions never do by themselves. */
  requireStepUp(request: Request, action: StepUpAction): Promise<Session>;
  listDomainRules(request: Request): Promise<DomainRule[]>;
  /** provider null lifts the rule. Needs a fresh step-up proof. */
  setDomainRule(request: Request, input: { domain: string; provider: string | null }): Promise<DomainRule[]>;
  listProviders(request: Request): Promise<ProviderLink[]>;
  unlinkProvider(request: Request, input: { provider: string }): Promise<ProviderLink[]>;
  relinkProvider(request: Request, input: { provider: string }): Promise<ProviderLink[]>;
}
export function createOperatorAuth(options: AuthOptions): OperatorAuth;
export function createAuthHandler(auth: OperatorAuth): (request: Request) => Promise<Response | null>;
export interface SignInPageOptions {
  /** While the first owner is unclaimed: the setup form and its instructions. */
  setup?: (request: Request) => null | false | undefined | { instructions?: string } | Promise<null | false | undefined | { instructions?: string }>;
  /** Extra same-origin links under the form (for example the local development outbox). */
  links?: (request: Request) => Array<{ href: string; label: string }> | Promise<Array<{ href: string; label: string }>>;
  defaultReturnTo?: string;
}
/** The shared server-rendered sign-in page at branding.signInPath (GET and HEAD); null for anything else. */
export function createSignInHandler(auth: OperatorAuth, options?: SignInPageOptions): (request: Request) => Promise<Response | null>;
export class AuthError extends Error { constructor(code: string, status?: number); code: string; status: number }
export const DEFAULT_ROLES: readonly Role[];
export function defaultRolePolicy(input: PolicyInput): boolean;
export function normalizeEmail(value: unknown): string;
export function safeReturnTo(value: unknown, fallback?: string): string;
export function isActiveOperator(operator: Operator | null | undefined, allowList?: string[]): boolean;
export function requireLoopback(request: Request): void;
export function isLoopbackHost(hostname: string): boolean;
export function securityHeaders(): Record<string, string>;
export interface DevGateInput { key: string | undefined; origin: string; local: boolean }
export interface DevGate {
  admits(request: Request): Promise<boolean>;
  setCookie(): Promise<string>;
  /** Handles GET/POST /__dev/key; null for every other path. */
  exchange(request: Request): Promise<Response | null>;
}
export const DEV_KEY_HEADER: 'x-rer-dev-key';
export const DEV_GATE_COOKIE: 'rer_dev_gate';
export function devGate(input: DevGateInput): DevGate | null;
export function devNotFound(): Response;

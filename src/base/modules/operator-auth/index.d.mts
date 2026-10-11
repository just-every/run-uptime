export type Role = 'owner' | 'admin' | 'member';
export type SessionKind = 'native' | 'review' | 'oidc' | 'password';
export interface Operator { id: string; email: string; displayName: string; role: Role; status: 'invited' | 'active' | 'inactive'; version: number; createdAt: number }
export interface Session { id: string; kind: SessionKind; operatorId: string; operator: Operator; createdAt: number; expiresAt: number }
export interface CompletedSession { session: Pick<Session, 'id' | 'kind' | 'createdAt' | 'expiresAt'>; operator: Operator; cookie: string; returnTo: string }
export interface MailMessage { deliveryId: string; from: string; to: string[]; subject: string; text: string; html: string; headers: Record<string, string> }
export interface MailSender { send(message: MailMessage): Promise<{ status: 'accepted' | 'rejected' | 'rate_limited' | 'uncertain' | 'development'; provider: string; providerMessageId: string | null; code?: string }> }
export interface AuthBranding { productName?: string; accentColor?: string; signInPath?: string }
export interface AuthPresentation { readonly productName: string; readonly accentColor: string; readonly signInPath: string }
export interface LinkPreview { kind: 'magic' | 'invite'; expiresInMinutes: number }
export interface AuthConfig {
  /** Name: 1-80 characters; accent: #rrggbb; signInPath: same-origin absolute path. */
  branding?: AuthBranding;
  origin: string; OWNER_EMAIL: string; SESSION_SECRET: string; SETUP_TOKEN?: string; MAIL_FROM?: string;
  /** Local HTTP is allowed only for literal localhost, 127.0.0.1 or [::1] with matching Host. */
  local?: boolean; allowList?: string[]; sessionSeconds?: number; linkSeconds?: number;
  review?: { enabled: boolean; operatorEmail: string }; reviewSeconds?: number;
  limitWindowSeconds?: number; ipLimit?: number; emailLimit?: number;
  externalIssuers?: string[];
}
export type Action = 'operators:list' | 'operators:invite' | 'operators:deactivate' | 'operators:reactivate' | 'operators:role' | 'sessions:list' | 'sessions:revoke';
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
/** Cryptographically verified principal; email is authoritative only when emailVerified is true. */
export interface VerifiedPrincipal { issuer: string; subject: string; email?: string; emailVerified?: boolean }
export interface VerifiedIdentity extends VerifiedPrincipal { email: string; emailVerified: true }
/** Deployment-owned association, never populated from token claims or HTTP input. */
export interface IdentityAdmissionConfig { issuer: string; subjectEmails?: Record<string, string> }
export type IdentityAdmission = (request: Request, identity: VerifiedPrincipal, input?: { returnTo?: string }) => Promise<CompletedSession>;
export interface AuthOptions { db: Database; config: AuthConfig; mailSender?: MailSender; clientIp: (request: Request) => string | Promise<string>; rolePolicy?: RolePolicy; clock?: () => number }
export interface OperatorAuth {
  /** Frozen public branding only; contains no credentials or auth configuration. */
  readonly presentation: AuthPresentation;
  bootstrap(request: Request, input: { token: string; displayName: string; returnTo?: string }): Promise<CompletedSession>;
  requestMagicLink(request: Request, input: { email: string; returnTo?: string }): Promise<{ status: 'accepted' }>;
  previewLink(request: Request, token: string | null): Promise<LinkPreview | null>;
  confirmLink(request: Request, input: { token: string }): Promise<CompletedSession>;
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
}
export function createOperatorAuth(options: AuthOptions): OperatorAuth;
export function createAuthHandler(auth: OperatorAuth): (request: Request) => Promise<Response | null>;
export class AuthError extends Error { constructor(code: string, status?: number); code: string; status: number }
export const DEFAULT_ROLES: readonly Role[];
export function defaultRolePolicy(input: PolicyInput): boolean;
export function normalizeEmail(value: unknown): string;
export function safeReturnTo(value: unknown, fallback?: string): string;
export function isActiveOperator(operator: Operator | null | undefined, allowList?: string[]): boolean;
export function requireLoopback(request: Request): void;
export function isLoopbackHost(hostname: string): boolean;
export function securityHeaders(): Record<string, string>;

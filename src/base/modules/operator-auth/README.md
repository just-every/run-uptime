# Operator auth (IF-055-CORE-v1)

Portable server-only ESM: import `createOperatorAuth` and `createAuthHandler` from
`modules/operator-auth/index.mjs`. TypeScript declarations are `index.d.mts`.
No framework or mail transport is bundled. Apply `schema/operator-auth.sql` once
for a fresh auth database. Preserve applied migration history in an existing
store and follow “Adopting this version” below for its additive upgrade. Tables
use the `oa_` namespace. This module does not seed any product data.

```js
import { createOperatorAuth, createAuthHandler } from './modules/operator-auth/index.mjs';
import { createMailSender } from './modules/mail/index.mjs';
// Secrets are Worker secret bindings, never source text.
const { SESSION_SECRET, SETUP_TOKEN, MAIL_API_KEY: apiKey } = env;
const auth = createOperatorAuth({
  db: env.DB,
  config: {
    origin: 'https://app.example.com', OWNER_EMAIL: env.OWNER_EMAIL,
    SESSION_SECRET, SETUP_TOKEN,
    MAIL_FROM: env.MAIL_FROM,
    // Optional; omit for neutral workspace wording and /signin recovery.
    branding: { productName: 'Example', accentColor: '#334155', signInPath: '/signin' },
    // Optional explicit address list further restricts active operators.
    // allowList: ['owner@example.com', 'staff@example.com'],
  },
  mailSender: createMailSender({ provider: env.MAIL_PROVIDER, mode: 'production', apiKey,
    ...(env.MAIL_PROVIDER === 'cloudflare' ? { accountId: env.MAIL_ACCOUNT_ID } : {}) }),
  // Use only infrastructure-authenticated client addresses. In Cloudflare's
  // public Worker boundary CF-Connecting-IP is edge-owned. Do not reuse this
  // resolver behind a proxy which lets callers supply that header.
  clientIp: request => request.headers.get('CF-Connecting-IP') ?? '',
});
const response = await createAuthHandler(auth)(request);
// response === null means another dispatcher owns this path.
```

For first setup omit `mailSender` and `MAIL_FROM` entirely. Provision independent
random `SESSION_SECRET` and `SETUP_TOKEN` secrets (at least 32 characters; generate
32 random bytes or more). POST `/auth/bootstrap` with `{token,displayName,returnTo}`
creates the configured owner and session atomically only on an empty auth store.
Remove SETUP_TOKEN after bootstrap. Changing it never resets the bootstrap ledger.
No owner is automatically provisioned when requesting a link or invoking OIDC.

All public mutation APIs require POST, the exact configured request origin and
`Origin` header, and reject cross-site Fetch Metadata. Never derive `origin` from
request headers. `Host`, when supplied, must match the configured authority; local
HTTP additionally requires an explicit matching loopback Host. Browser forms and
JSON are accepted by the handler (8 KiB maximum). Parsed query/form parameters
with duplicate decoded names or JSON object keys are rejected with `invalid_input` before
auth processing, including escaped names. POST tokens are accepted only in the
body; a query token on a POST is rejected as an ambiguous credential source.
Protect every private API, server function and document with
`auth.getSession(request)`. Missing/invalid,
expired, revoked, deactivated and disallowed sessions yield null; host violations
throw `AuthError` with 403. Never return a private page then check in the browser.

## HTTP contract

| Path | Method | Input / result |
| --- | --- | --- |
| `/auth/bootstrap` | POST | token, displayName, returnTo?; 303 with cookie and safe Location |
| `/auth/magic-link` | POST | email, returnTo?; 202 `{status:'accepted'}` for admitted/unknown/disallowed address |
| `/auth/confirm?token=…` | GET/HEAD | 200 confirmation form, or 400 expired/invalid; **no writes, no session cookie** |
| `/auth/confirm` | POST | token; consume once, create session and 303 to stored returnTo |
| `/auth/session` | GET | session and operator, or 401 |
| `/auth/signout` | POST | `{}`; revoke current session, clear cookie, 204 |
| `/auth/invite` | POST | email, displayName, role? (member), returnTo?; mail invitation, 202 |
| `/auth/invite/cancel` | POST | operatorId; cancel pending invitation, return inactive operator, 200 |
| `/auth/operators` | GET | authorized operator list |
| `/auth/operator/status` | POST | operatorId, status (`active`/`inactive`) |
| `/auth/operator/role` | POST | operatorId, role |
| `/auth/sessions?operatorId=…` | GET | authorized session metadata, no credentials |
| `/auth/session/revoke` | POST | sessionId; 204 |
| `/auth/review-session` | POST | returnTo?; explicitly configured loopback review session |

Unknown `/auth/*` paths return 404. Unsupported methods return 405. Except for invalid/expired confirmation GET/HEAD documents, known public
errors are JSON `{error:code}`: invalid input 400, unauthenticated 401, policy/host/
Origin rejection 403, missing resource 404, conflict/last owner 409, oversized input
413, unsupported content type 415, rate limit 429, missing mail/database 503.
Internal errors are redacted as `auth_unavailable`. Methods throw typed AuthError;
the Fetch adapter translates it. Every response has no-store headers. Successful
confirmation GET/HEAD responses use `Referrer-Policy: strict-origin` so native
form POSTs retain their Origin without exposing the token path or query in
Referer; HTTPS-to-HTTP downgrade requests omit Referer. Other responses retain
`Referrer-Policy: no-referrer`. Exact Origin/CSRF validation is unchanged.
Do not log confirmation URLs, input tokens, cookies or provider message bodies.

## Confirmation and branding

GET/HEAD confirmation uses a self-contained, responsive document. A magic link
says “Confirm sign-in to Example”; an invitation says “Accept your invitation to
Example”. Both explain that the link works once and show its remaining lifetime,
rounded up to minutes (singular for one minute). The sole primary form button is
“Confirm”. Only its hidden POST field contains the token. Invalid, expired,
consumed or unauthorized links return a styled 400 document with “Request a new
link” pointing to the configured sign-in page. HEAD has the same status and
headers without a body. Preview never writes auth state or sets a cookie.

The heading uses 30px type (28px at viewport widths up to 480px), 1.3 line
height, -.02em tracking and a 24px bottom margin; the brand-to-heading gap is
32px. Confirmation documents contain one inline stylesheet, and the CSP adds
only that stylesheet's exact UTF-8 SHA-256 hash.

Optional `config.branding` fields are independently defaulted and validated:

| Field | Default | Validation |
| --- | --- | --- |
| `productName` | `your workspace` | At most 80 UTF-16 code units before trimming, with at least one visible letter, number, punctuation or symbol; rejects C0/C1 controls, U+2028/U+2029 and default-ignorable code points, except contextual script joiners and emoji presentation described below |
| `accentColor` | `#334155` | Exactly six hexadecimal digits after `#` |
| `signInPath` | `/signin` | Same-origin absolute path, at most 2048 characters; no scheme, network-path reference, backslash or control characters, including encoded variants |

Product names preserve letters and combining marks in every script. ZWNJ
(U+200C) is allowed after a letter (including its combining marks) when a letter
or decimal digit follows, directly or after spaces, as in Persian "کتاب‌ ها" and
"سال‌۱۴۰۰". ZWJ (U+200D) is allowed between letters and after a virama, including
at the end of a word, so legacy Malayalam chillu forms are kept. ZWJ also joins
emoji pictographs, including an emoji presentation selector or skin-tone modifier
on the preceding emoji. U+FE0F is allowed immediately after an emoji pictograph,
and after a keycap base (0–9, # or *) only when U+20E3 follows; all other
variation selectors are rejected. Rejected default-ignorable characters include
U+200B/U+200E/U+200F, bidi overrides and isolates, U+2060–U+206F, U+FEFF, U+061C,
U+180E, U+034F, U+115F/U+1160, U+3164 and U+FFA0. The object replacement
character U+FFFC and lone surrogates (text that is not well formed) are rejected.
Space-only and invisible-only names are invalid; the braille blank U+2800 does not
count as a visible symbol.

The consumer must serve that sign-in path. Query strings and fragments are
allowed; malformed encodings in the configured value are rejected. Encoded
percent data is preserved, and nested encoded separators and controls are still
rejected. Invalid branding throws
`AuthError('invalid_configuration', 503)`. Branding is copied and frozen at
construction. `auth.presentation` exposes only the three normalized branding
fields; it never exposes configuration secrets. `previewLink` returns only
`{kind, expiresInMinutes}` for an authorized link, otherwise null. Names are
HTML-escaped in documents and mail. The accent chooses black or white button
text for contrast, with a visible keyboard focus ring in light and dark schemes.

The module's confirmation HTML responses contain exactly one inline stylesheet. Their
CSP adds only its exact UTF-8 SHA-256 `style-src` hash to the existing restrictive
policy. No scripts, external resources, style attributes, CSS URLs or imports
are included in the document. JSON errors, redirects and other responses retain
the original CSP. Do not add a broad inline-style allowance to an adopting seed.

An application can compose its same-origin brand font head onto this document,
as Base's foundation/reference do. Preserve the inline style hash, private
headers and native form behavior; permit only same-origin styles and fonts,
with no scripts or third-party resources. Set the conformance adapter's
`confirmationFonts: true` for this composition. The same public auth scenarios
then require one fixed same-origin stylesheet and primary font preload, the
unchanged hash and restrictive CSP, and all existing token/session protections.
The standalone module's default conformance still requires no font resources.

## Sessions, tokens and policies

Opaque 256-bit credentials are HMAC-SHA256 hashed with domain separation at rest.
Cookies are host-only, Path=/, HttpOnly, SameSite=Lax; production uses Secure and
`__Host-operator_session`. Explicit `local:true` allows only literal localhost,
127.0.0.1 or [::1] and uses `operator_session_local`. Session expiry defaults to
7 days (maximum 30), links to 15 minutes (maximum 60); no silent sliding renewal.
`returnTo` must be a local absolute path; unsafe values become `/app`. It is stored
with the token, and cannot be replaced on confirmation. Auth methods never return
raw link tokens. `CompletedSession.cookie` is server-only and must only be emitted
as Set-Cookie, never serialized into browser data.

D1 batches transactionally claim setup, consume links, accept invitations, bind
external identities and issue sessions. A unique token/session relation prevents
double consumption. Operator version fences invalidate **all** old links and
sessions after status/role changes, including after reactivation. Mutation SQL
rechecks the actor's active session and authority snapshot. Last active owner
removal/demotion is rejected by SQL triggers, including competing mutations.
Reactivate never bypasses invitation acceptance. Retrying an invitation with the
same email/role resends it and revokes older links; an existing active or
ordinarily inactive operator conflicts. An inactive operator with a durable
cancellation marker can be reinvited as described below. Unknown addresses never
become operators through sign-in.

`cancelInvitation(request, operatorId)` uses the existing `operators:deactivate`
policy with the pending operator as target. It changes only an `invited` operator
to `inactive`, retaining the operator ID, bootstrap ledger and history. The SQL
write fences the actor's session and authority version and the target's status
and version. Its existing version trigger invalidates every outstanding link;
GET/HEAD preview and POST confirmation then fail. A durable cancellation ledger
and SQL trigger reject ordinary activation with `invitation_required`, even after
credentials are pruned. A cancelled identity can receive a fresh invitation only
when the requested role matches its recorded role. Reissue changes that same row
back to `invited`, updates its display name, and leaves its ID and creation/history
intact. Its status trigger advances the version; the fenced D1 batch inserts a new
link and revokes older unconsumed links. The cancellation ledger remains present
while the replacement is pending. Cancelling that pending invitation again is
allowed and refreshes the durable marker, so repeated cancel/reissue cycles retain
the same guard. Existing active and ordinarily deactivated operators still conflict,
as do role mismatches; a same-role pending invitation can still be resent with
status 202. A completed invitation cannot be cancelled.

The cancellation ledger is removed only inside the successful token-consume batch,
witnessed by the session inserted from that invitation immediately before the
operator is activated. Session creation, ledger removal, activation and token
consumption commit atomically. An ordinary status update cannot supply that
acceptance evidence. A confirmation racing with cancellation has one winner: a
completed join makes cancellation conflict; a completed cancellation prevents the
join and session creation. Use `setOperatorStatus` for explicit active-operator
removal; its last-owner protection remains in force.

The full `schema/operator-auth.sql` includes the cancellation ledger and triggers
for a fresh database. In an existing store that lacks these objects, apply
`schema/invitation-cancellation.sql` as a **new numbered migration before switching
to this runtime**: the runtime reads the ledger for reinvitation and consumes it
on confirmation. Inspect the seed's migration history and assign its next unused
number; never rewrite an applied migration. Do not apply both files to a fresh
store. Missing cancellation schema fails closed. The additive migration leaves
existing rows and credentials unchanged and does not infer historical acceptance
for existing active or inactive operators; only a witnessed pending cancellation
writes a ledger row. Keep the ledger and triggers on rollback, and never prune
`oa_invitation_cancellations` as maintenance.

Invitations also bind their issuer's identity and authority version. Preview and
confirmation require that issuer to remain active and allowed, and re-evaluate
the configured `operators:invite` policy for the issued role. Confirmation fences
that issuer/version in the same transaction as invitation acceptance and session
creation. Changing the issuer's status or role permanently invalidates unused
invitations, even after restoration; an authorized operator must issue a fresh
link. Signing out or revoking just the issuing browser session does not invalidate
an invitation whose issuer still has authority.

Durable fixed-window limits pair the client-IP resolver with a normalized email;
defaults are 30 per IP and 5 per email per 15 minutes. `limitWindowSeconds`,
`ipLimit` and `emailLimit` configure those defaults. Bootstrap, magic link,
invitation, confirmation and review use separate scopes. Confirmation limits bind
the presented opaque token instead of the address. `clientIp` is mandatory;
unavailable addresses fail closed (503). Header trust belongs to the deployment
boundary. Do not trust X-Forwarded-For.
Periodically prune old oa_limits rows and expired tokens/sessions in an
edition-owned maintenance job; preserve referenced rows or delete referencing
sessions first. Never delete oa_bootstrap as maintenance.

Default applied: **owner/admin/member**. Owner manages all operators; admin invites
members and manages members; members view/revoke their own sessions. Only owners
can promote roles. `rolePolicy({actor,action,target,role})` replaces this policy
for product variations. It receives current persisted operators, never caller
role claims; keep it deterministic and side-effect-free. Active operator, active
session, allow-list, version fences and last-owner safeguards cannot be overridden.
The exported `isActiveOperator` is the shared admission predicate.

## Mail, OIDC, password and review seams

Magic and invitation mail include both plain text and HTML. Each part has exactly
one confirmation URL; the HTML part presents it as a button with inline mail-safe
styling. The body sets Arial; its centered main content has a 480px maximum width
and 32px by 24px padding. The “Confirm” link opens a page; the copy says “Open this link to review and confirm”.
Both parts direct readers to press Confirm on that page and explain single use and configured expiry.
The invitation subject is “You're invited to Example”; no subject includes a
credential. The product name is escaped in HTML and is plain text in the subject
and text part. Delivery results still control revocation as described below.

Mail consumes actual IF-056-MAIL-v1 `createMailSender(config).send(message)`;
`deliveryId` is the token record UUID. No parallel transport or implicit outbox
exists. Missing/failing/uncertain transport revokes the link and reports
`mail_unavailable`; retries require a new link. Explicit development results are
accepted only in local mode. Auth never claims mailbox receipt.

The OIDC adapter verifies authorization-code/PKCE/state/nonce/issuer/audience/
signature/expiry before passing a principal to the core. The existing server-only
`auth.admitVerifiedIdentity(request, identity, {returnTo})` requires
`{issuer,subject,email,emailVerified:true}`. `config.externalIssuers` is a
deployment-controlled HTTPS issuer allow-list. Verified email can establish an
account's **first** external binding. Once any issuer+subject is bound to that
account, another principal cannot join it merely by presenting the same email,
including from another allowed issuer. Existing identical principals can sign in
again. The absence-of-binding check, binding insertion and session creation run
inside one atomic D1 batch, so competing first admissions cannot both succeed.

An explicit trusted server association may admit an additional principal:

```js
const admit = auth.createIdentityAdmission({
  issuer: 'https://idp.example.com',
  subjectEmails: { 'independently-verified-subject': 'operator@example.com' },
});
// Only after full protocol validation; the mapping supplies the account.
const result = await admit(request, { issuer, subject }, { returnTo });
```

The factory validates and snapshots its issuer and subject map. Its returned
function accepts a `VerifiedPrincipal` (`issuer`, `subject`, optional `email` and
`emailVerified`). A configured subject needs no email claim; every unmapped
subject still needs `emailVerified:true` and the first-binding rule. The map must
come from trusted deployment configuration or independently verified server-side
association records, never HTTP input or token email/role claims. There is no
per-login linking flag. The OIDC adapter builds this function from its existing
`config.subjectEmails`, preserving Microsoft's subject association path.

Neither path provisions operators, moves a bound issuer+subject to another
account, nor changes local roles. Both require existing active, allowed operators
and fence the current authority version when issuing an `oidc` session. No schema
change is needed; retain existing identity rows on upgrade. These are trusted
server seams, not HTTP JSON routes. OIDC correlation storage belongs to its
adapter; operator/session storage does not.

`admitVerifiedPassword(request, operatorId, {returnTo})` supports a seed's existing
real password verifier. It requires POST/Origin and shares active-operator,
allow-list, version and session policy. The caller must verify and rate-limit the
password **before** invoking it. It neither creates an operator nor claims setup;
there is no password checker or password endpoint in this module.

For a loopback review session, configure `review:{enabled:true,operatorEmail}` and invoke
`issueReviewSession`. It requires an already-active operator, POST/Origin, and
literal loopback URL **and Host**. Non-loopback Host returns 403 regardless of
flags or forwarded headers; admission of the resulting review cookie checks the
same boundary every time. Review defaults/maxes at one hour. Disable the flag to
invalidate review admission immediately. Bind the local review listener to a
loopback interface; a forged Host is not network isolation. Production configuration
must never enable review. No fixture/sample operator is created for review.

## Integration and checks

Copy this directory as source; import only its server entry from `.server` modules.
A Start server function must call getSession on each invocation. A Vite SPA must
use protected HTTP APIs and never bundle this implementation, secrets or D1. The
consumer owns its native unauthorized document redirect and API 401 behavior.
Mount `/auth/*` before private namespace guards and before Start; keep private
unknown API paths behind authentication before returning 404.

At the Base repository root, `pnpm run verify:operator-auth` runs the operator-auth
and OIDC `.test.mjs` suites; `pnpm run verify:modules` runs the module `.test.ts`
suites. The default suite includes a static pre-ledger schema and populated-row
upgrade fixture, exercising current handlers and persistent D1 with a fixed test
clock; its provenance is documented in `tests/fixtures/pre-ledger/README.md`.
The "cancelled before the ledger" fixture row represents a state reachable only
by a direct database update, not through the cancellation API before its ledger
exists. The prior-data test executes every statement in the shipped migration
and checks that the applied count matches the file's statement count.
The pre-update source upgrade check is separate from those globs. Prepare
an independently captured pre-update source snapshot containing the complete
`operator-auth/` directory (including `tests/worker.mjs` and
`schema/invitation-cancellation.sql`) and `pre-cancellation.sql` at the snapshot
root. With the frozen workspace dependencies installed, run:

```sh
OA_BASELINE_SOURCE=/path/to/snapshot node --test modules/operator-auth/tests/reinvitation-upgrade.mjs
```

Runtime tests use the locked Wrangler Miniflare/esbuild dependencies and run the
bundled implementation in real workerd with D1. They create disposable test data and
dispose runtimes. Adversarial request tests use a test-only envelope to preserve
literal Host and Origin through Miniflare's local proxy; the production handler,
crypto and D1 execute in workerd. These are module-level checks, not proof of an
adopting seed's emitted browser transport or deployment. Each seed must wire its
corresponding auth and browser checks into CI. Hosted provider/IdP proof and
deployment remain separate.

## Adopting this version

Copy the **complete** `modules/operator-auth/` directory from one reviewed Base
revision into the seed's operator-auth source location. Keep its runtime files,
declarations, schema, OIDC adapter, conformance files and tests from that same
revision; the runtime imports neighboring helpers within the module. Keep imports
server-only, reconcile the seed's route integration, and run that seed's real auth
and browser checks.

Wire `config.branding` with the seed's `productName`, `accentColor` and
`signInPath`; the defaults are `your workspace`, `#334155` and `/signin`. Keep
`MAIL_FROM` in auth config and provide a real `mailSender` that implements
`send(message)`. The Base example builds it with `createMailSender` from
[the mail module](../mail/README.md), using mail config fields `provider`, `mode`, `apiKey` and
Cloudflare-only `accountId`; its sample maps `provider` to `MAIL_PROVIDER`,
`apiKey` to `MAIL_API_KEY`, and Cloudflare `accountId` to `MAIL_ACCOUNT_ID`, with
`mode: 'production'`. `MAIL_FROM` is a separate auth config field. If sending is
intentionally unavailable for first setup, omit both `mailSender` and `MAIL_FROM`
until mail is configured.

For a fresh auth database, install `schema/operator-auth.sql` through the seed's
initial schema or migration process, once. In an existing store that has the
earlier operator-auth schema but lacks cancellation objects,
apply `schema/invitation-cancellation.sql` under the seed's next unused migration
number **before switching the runtime**. The consume path now reads and removes
the ledger during invitation acceptance, so the migration is a runtime prerequisite
for such stores. Never rewrite an applied migration, infer cancellation for old
inactive rows, or apply both schema files to a fresh store. The complete fresh
schema already includes the ledger. This update adds no schema objects beyond
that existing cancellation-capable schema.

The updated invite behavior permits same-role reissue of an inactive identity only
when it carries the durable cancellation marker. Same-role invitations that remain
pending, including expired pending invitations, retain the existing resend path.
Cancelled reissue preserves the identity row and history, creates a fresh invitation
link, invalidates older links and retains the marker until a successful confirmation
creates a session. Repeated cancellation/reissue is supported. Existing active or
ordinarily inactive identities and role mismatches still conflict; an ordinary
status change cannot accept a pending invitation.
Pre-ledger cancelled identities have no cancellation record and remain refused
for reinvitation until the owner deliberately removes the identity and reinvites
the same email; the current status API cannot distinguish them from ordinary
inactive identities.

Seeds copy this module at different revisions, and an older copy lacks the
cancellation migration and the optional OIDC and conformance files. Check each
seed's present source and applied migrations before adopting. A seed owns its
route configuration, CI and release; Base checks do not establish integrated
adoption or deployment.

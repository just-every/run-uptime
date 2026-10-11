# Optional operator OIDC client — IF-055-OIDC-v1

Server-only portable ESM using Fetch, WebCrypto and the existing operator core.
Import `createOidcClient` / `createOidcHandler` from `./oidc/index.mjs`, not the
parent entry. Types are adjacent `index.d.mts`. No dependency installation or
parent export change is required. Apply `schema/oidc.sql` as a **new numbered
migration**, alongside the core schema, using the same primary D1 database.
No operators, fixtures or sessions are seeded by this adapter.

```js
import { createOidcClient, createOidcHandler } from './modules/operator-auth/oidc/index.mjs';
// auth is the real createOperatorAuth instance. Its origin/local setting must
// match below, and externalIssuers must contain the exact configured issuer.
const oidc = createOidcClient({
  auth, db: env.DB,
  clientIp: request => request.headers.get('CF-Connecting-IP'),
  config: {
    origin: 'https://app.example.com',
    issuer: env.OIDC_ISSUER,
    redirectUri: 'https://app.example.com/auth/oidc/callback',
    clientId: env.OIDC_CLIENT_ID,
    // Both secrets are Worker secret bindings, never source text.
    clientSecret: env['OIDC_CLIENT_SECRET'],
    transactionSecret: env['OIDC_TRANSACTION_SECRET'],
    tokenAuthMethod: 'client_secret_basic',
    // Every authorization/token/JWKS origin must be allowed explicitly.
    // Defaults to the configured issuer's origin.
    // endpointOrigins: ['https://accounts.google.com', 'https://oauth2.googleapis.com', 'https://www.googleapis.com'],
  },
});
const response = await createOidcHandler(oidc)(request);
// If null, dispatch to createAuthHandler(auth), then the application's routes.
// Forward the actual Response, preserving EACH Set-Cookie header separately.
```

Only trust the IP header at an infrastructure boundary that overwrites it. Provide
an authenticated client-address resolver on other hosts. Never put configuration,
this implementation, provider responses, tokens or cookies into frontend imports,
loader data, JSON responses, analytics, access logs or error reports. Redact query
strings on callback routes in the hosting layer. The secrets are ordinary server
bindings; no particular environment-variable names are required by the API.
Use an independent randomly generated secret of at least 32 bytes for
`transactionSecret`; the core retains its own `SESSION_SECRET`.

## Routes and API

`begin(request,{returnTo?})` returns a Response. It requires POST to `startPath`
(default `/auth/oidc/start`) without query parameters, the exact configured Origin
header, a matching URL authority/Host and no cross-site Fetch Metadata. It sends
`response_type=code`, `response_mode=query`, `scope=openid email`, independent
state/nonce and mandatory S256 PKCE. Success is a 303 to the discovered trusted
authorization endpoint with a correlation cookie. The optional handler accepts
JSON or URL-encoded form bodies up to 4096 bytes with `returnTo`; consumers can
POST a normal HTML form. GET/HEAD never initiates a transaction.

`callback(request)` accepts GET only at the exact `redirectUri` path and origin.
The URL is limited to 12288 characters, code to 4096 printable ASCII characters,
and duplicate query parameters are rejected. `state`, a unique browser-binding
cookie, a live durable row and unchanged configuration are all required. The
handler returns null outside its two exact paths; mount it before the core's
catch-all `/auth/*` handler. Multiple providers must have distinct start/callback
paths. Configure one exact issuer per instance; never take issuer or endpoints
from query parameters, the request body, token headers or email domains.

Successful callback returns 303 to the **stored** core-sanitized local `returnTo`
(default `/app`), deletes the correlation cookie and sets the core session cookie.
The callback cannot override returnTo. Its identity comes only from the exchanged,
cryptographically validated ID token or the explicit subject binding described
below. The core admission function admits an existing active operator only and
returns a core `kind: 'oidc'` session in `oa_sessions`. Unknown, invited, inactive,
disallowed, or changed issuer+subject/email bindings cannot authenticate. Verified
email establishes only the first principal for an account; another issuer/subject
requires an explicit configured association, even when it presents the same
verified email. Core
revoke/deactivation/reactivation version fencing applies to these sessions.

All responses have no-store, no-referrer and restrictive security headers. Errors
are JSON `{error:code}`, containing neither provider text nor input values:
400 invalid response/correlation; 401 provider denial; 403 origin or core admission
denial; 404 wrong direct-API route; 405 wrong method; 413 oversized input; 415
unsupported body media type; 429 start limit; 502 provider transport/metadata
failure; 503 bad configuration, unavailable client address/storage/internal error.
Bad construction throws `OidcError('oidc_invalid_configuration',503)`.

## Correlation, storage and limits

State is a random 256-bit transaction lookup value, not proof of browser identity.
The cookie has a **separate** random 256-bit binding. Nonce is a third random
256-bit value validated inside the signed ID token. PKCE has an independent random
256-bit verifier; only its SHA-256 challenge goes to the authorization endpoint.

Cookies are unique per state for concurrent tabs: `__Host-oa_oidc_<state>`, Path=/,
HttpOnly, Secure, SameSite=Lax. Callback must be a top-level GET navigation so Lax
cookies are sent. `local:true` allows only literal localhost/127.0.0.1/[::1] with an
explicit matching Host; HTTP local cookies use `oa_oidc_local_<state>`. Provider
issuer/endpoints must still be HTTPS. Cross-site POST callbacks/form_post are
unsupported.

`oa_oidc_transactions` stores domain-separated HMAC hashes of state, cookie and
configuration plus AES-GCM encrypted nonce/verifier/metadata/returnTo/expiry. The
state hash is authenticated additional data. A single conditional
`DELETE … RETURNING` consumes the row **before** exchanging the code: races and
restarts cannot claim twice. Invalid/missing binding never consumes the row. Once
claimed, any exchange, token-validation or admission failure requires a new login;
there is no retry/reuse fallback. A crash after claim may lose the login, never
issue it twice. Secret/configuration changes invalidate pending logins.

`oa_oidc_limits` stores a keyed client-IP bucket with atomic count increments:
default 30 starts per 15-minute fixed window, configurable 1–1000. No raw IP is
stored. Periodically delete expired rows from these two adapter tables using
`expires_at <= now` (milliseconds). Do not touch core bootstrap/session tables as
part of adapter cleanup. Use the primary D1 binding, not a stale read replica;
SQLite adapters must implement the same atomic SQL semantics.

| Option | Default and accepted range |
| --- | --- |
| `transactionSeconds` | 600; 60–900 |
| `timeoutMs` | 5000 per discovery/token/JWKS call, including body; 100–15000 |
| `clockSkewSeconds` | 30; 0–120 |
| `maxTokenAgeSeconds` | 600; 60–3600; limits ID-token iat age |
| `startLimit` | 30; 1–1000 per IP/issuer/client per 15 minutes |
| `algorithms` | `['RS256']`; explicit subset of RS256/ES256 |
| `additionalAudiences` | empty; up to 10 explicitly trusted extra aud values; clientId remains mandatory and multiple audiences require matching azp |
| `tokenAuthMethod` | `client_secret_basic`; also client_secret_post or none |
| `endpointOrigins` | `[new URL(issuer).origin]`; exact trusted HTTPS origins |
| `subjectEmails` | empty; explicit issuer-instance sub → existing email bindings |

The server can supply `fetch` for its real runtime transport and `clock` for its
runtime clock; tests use these seams only inside `tests/`. A custom transport must
honor `redirect:'error'` and AbortSignal. There are no transport retries. Discovery
and token JSON are limited to 64 KiB; JWKS to 256 KiB/100 keys. Metadata must match
the exact issuer, support code/query and configured token authentication/signing.
If PKCE metadata exists it must advertise S256; missing PKCE metadata does not
downgrade S256. Discovered endpoints cannot contain query, fragment, credentials,
or non-HTTPS schemes and must belong to configured endpoint origins. Discovery
is obtained at each start; metadata is bound into that transaction. JWKS is fresh
at each callback, supporting key rotation without stale-key fallback.

The verifier accepts exactly one matching nonempty kid, matching RSA/EC type,
public verification use/operations, matching JWK algorithm if supplied, RSA
2048–8192 bits or P-256. It rejects private and symmetric keys. It also rejects
duplicate or unknown kids, none/HS algorithms, header-directed keys, critical
headers and alternate payload semantics. It verifies the signature, exact issuer, audience and azp, exp/iat/nbf,
nonce, and at_hash/c_hash when present. Only a boolean `email_verified:true` permits
email-based admission by default. Tokens and access/refresh tokens are never
persisted or returned; there is no UserInfo fetch, refresh or logout-at-provider.

## Provider configuration

Google: use exact issuer `https://accounts.google.com`, register the exact HTTPS
callback, configure its client credentials and explicitly allow the discovery
endpoint origins shown in the example after checking your registered provider's
metadata. This implementation requires the exact configured HTTPS issuer; it
does not alias Google's older bare `accounts.google.com` spelling. Google
publishes verified-email claims. See [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect).

Microsoft: use a **tenant-specific** v2 issuer
`https://login.microsoftonline.com/<tenant-id>/v2.0` with an exact matching
registered redirect URI. Do not use `common`/`organizations` issuer templates or
wildcard tenant trust. Microsoft documents email as mutable and not suitable for
authorization. Configure `subjectEmails` from an independently verified tenant
principal's client-specific `sub` to an already-active local operator email; never
populate that map from a callback email, `preferred_username`, or a request body.
This explicit identity association substitutes for a verified email claim; all
signature/issuer/audience/nonce/PKCE validation still runs. The map creates no
operator and the core permanently binds issuer+sub on first admission. It can
explicitly associate an additional principal with an already-bound account. The
core atomically checks association during binding and session creation; two
unassociated principals cannot both win a first-binding race. A map change
cannot move a previously bound principal to another account. Providers
without verified-email claims require the same explicit association. See
[Microsoft ID-token claims](https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference).

Generic IdPs: the supported profile is authorization code, query callback, S256
PKCE, HTTPS discovery/JWKS, RS256 or ES256, and one of the three token auth methods
above. JWE, private_key_jwt, implicit/hybrid, dynamic registration, UserInfo and
multi-tenant issuer templates are intentionally outside this profile. Consult
[OIDC Core](https://openid.net/specs/openid-connect-core-1_0.html) and
[OIDC Discovery](https://openid.net/specs/openid-connect-discovery-1_0.html).

## Core admission interface

At construction, the client calls
`auth.createIdentityAdmission({issuer,subjectEmails})`. The core snapshots that
trusted configuration and returns an issuer-scoped admission function. Callback
passes only the verified principal and stored returnTo to it. Configured subjects
are represented by `{issuer,subject}`; the adapter does not manufacture a
verified-email assertion for them. Unmapped subjects carry the actual verified
email assertion. Request and token fields cannot supply association authority.

Use the updated real core alongside this adapter. A custom auth implementation
must expose `createIdentityAdmission` and preserve the same atomic association,
active membership, issuer scope and immutable principal ownership guarantees.
The older core `admitVerifiedIdentity` API remains available to other verified
server integrations, with first-binding-only email association. No schema change
or additional Microsoft configuration is required.

## Checks and proof boundary

`node --test modules/operator-auth/oidc/tests/*.test.mjs` runs actual Node SQLite
and workerd/D1, real generated RSA/EC keys, signed ID tokens and a test-only IdP
transport that verifies code/redirect/client/PKCE. Tests require Node with
`node:sqlite` and the workspace's pinned Wrangler/Miniflare/esbuild. To reuse an
already-installed identical frozen dependency graph, set
`OIDC_TEST_DEPENDENCY_ROOT=/absolute/path/to/base-checkout`. No root manifest or
lock changes are needed. All runtimes and temporary stores are disposed.

This proves the module protocol, crypto, storage and core integration locally.
It does not claim a real Google/Microsoft account login, provider registration,
hosted deployment, frontend bundle exclusion or an adopting seed's browser flow.
Those require the consumer's integration checks and authorized provider setup.

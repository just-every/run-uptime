# Adopting operator auth

This module is server-only. Copy `modules/operator-auth/` into the product source,
import its server entry from server-owned files, and apply
`schema/operator-auth.sql` as a new numbered migration on the product's primary
D1 database. The integrator assigns the next migration number. Keep applied
migrations unchanged, plan an explicit existing-operator import for populated
systems, and never treat applying the schema as creating an owner or product data.
When upgrading an existing auth store, apply the separate additive
`schema/invitation-cancellation.sql` before enabling pending-invitation cancellation;
do not replay the complete schema. Its ledger is durable admission state, not
credential cleanup data. See the [migration and cancellation contract](../README.md).

Use the standard Worker secrets `OWNER_EMAIL`, `SESSION_SECRET`, and
`SETUP_TOKEN`. Generate independent random values of at least 32 bytes for the
two secrets; retain only `OWNER_EMAIL` after first-owner setup and remove
`SETUP_TOKEN` after bootstrap. `SESSION_SECRET` must remain stable for sessions.
They belong in server bindings, never `VITE_*`, rendered HTML, loaders, browser
storage, logs or responses. Bootstrap creates only the configured owner and its
session. It runs without mail and does not populate product tables. Invoke the
one-time `POST /auth/bootstrap` from an owner-controlled setup operation that
keeps `SETUP_TOKEN` server-side; never add the token to a frontend form or
client-side request payload.

For sign-in and invitations, configure the actual IF-056 sender through
`MAIL_PROVIDER`, `MAIL_API_KEY`, optional `MAIL_ACCOUNT_ID` for Cloudflare, and
`MAIL_FROM`. In server code, construct the sender with the real
`createMailSender({ provider, mode: 'production', apiKey, accountId })` from the
selected `modules/mail/index.mjs` and pass that object to `createOperatorAuth`.
Do not add another sender or select a fallback provider. Auth accepts only an
IF-056 result with `status: 'accepted'` (or the explicit local-only development
result); `rejected`, `rate_limited`, and `uncertain` revoke that link and return
`503 mail_unavailable`. An accepted provider submission is not proof that a
mailbox received the message. Issue a new link after a failed or uncertain
attempt; the auth core does not retry it.

`OWNER_EMAIL` is the first owner. The default roles are `owner`, `admin`, and
`member`. Configure `allowList` only as an additional admission restriction; it
does not grant access. Use the exported `rolePolicy` for deterministic product
policy variations while preserving the module's active-session, allow-list,
version-fence and last-owner checks.

Follow one of these integration recipes:

- [TanStack Start](./tanstack-start.md): keep the module and bindings in dynamic
  server imports, check every private server function, and mount the auth HTTP
  handler before protected Hono routes and Start.
- [Vite SPA](./vite-spa.md): keep auth, D1 and secrets in the Worker API; the SPA
  uses same-origin auth and private APIs and never imports this module.

For first-owner, confirmation, role, revocation, rate-limit and mail-result
coverage, register the shared suite once from the seed's existing test file. See
[`../conformance/README.md`](../conformance/README.md) and its exact adapter
types. The adapter must exercise the adopting Worker and real D1, and the private
request must traverse the product's actual session gate.

## Optional OIDC and local review

Use `modules/operator-auth/oidc/index.mjs` only from a server entry. Construct
`createOidcClient({ auth, db, clientIp, config })` with the same auth instance and
primary D1 database. Set the exact deployment-owned HTTPS issuer in both
`config.issuer` and the core's `externalIssuers`; keep client and transaction
secrets in Worker bindings. Dispatch the OIDC handler before the core auth
handler because both own `/auth/*` paths, and preserve all `Set-Cookie` headers
individually. The client builds a server-only admission closure through
`auth.createIdentityAdmission({ issuer, subjectEmails })`. A persisted
issuer/subject may be admitted again; another principal cannot attach to an
already-bound operator by matching its verified email. Configure any explicit
subject-to-existing-email association from trusted server configuration, never
callback input. Custom auth adapters must provide the same closed-over issuer
and association semantics. The provider-key-free conformance case checks only a
first binding into an unbound active owner; the independent OIDC tests cover the
protocol without live provider credentials.

`review` is a local-only mechanism. Keep `review.enabled` false in production;
bind a local review server to a loopback interface; use literal `localhost`,
`127.0.0.1`, or `[::1]` with a matching Host and exact Origin on POST. The core
does not trust forwarded headers. A matching Host is not network isolation.

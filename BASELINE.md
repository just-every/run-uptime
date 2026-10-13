# BASELINE.md

Shared baseline requirements defined in Base. Editions ship their own copy and
baseline evidence; their reports distinguish implemented checks from planned
coverage. An intentional override identifies the baseline clause and the owner's
authorized replacement requirement, including changed security consequences,
with appropriate verification. Existing owner authorization is sufficient;
ordinary fixes to meet a requirement need no additional acknowledgement.
A product supersession names the baseline ID
in its contract and explains the replacement behavior. Keep these records in the
edition's useful requirements, intent or override documents. Use the override
schema and reporting that the edition actually implements; neither a particular
file path nor automatic `rer verify` supersession reporting is universal. Where
reporting is absent, state that gap and verify the replacement directly. Do not
silently weaken a guarantee or report an untested override as passing. Times are
p95 at the limits in `seed.json`.

## Access

- **BASE-ACCESS-001 — Sign-in.** Operators sign in by magic link to an allow-listed email address; passkeys may be offered in addition. No passwords are stored.
- **BASE-ACCESS-002 — Sessions.** A session expires after at most 30 days of inactivity; sign-out revokes that session. A valid session is required before an operator request reads private product data or performs its requested action. A protected operator document and each private generated server-function handler validate the session independently; a document gate does not authorize a function call. For an otherwise-admissible request that reaches session validation, a protected operator HTTP API returns 401 when the session is missing, expired, or revoked; a protected document returns its native sign-in response; and a generated transport may encode an identifiable session denial or sign-in redirect in its framework protocol, including a 200 serialized redirect. No such denial response exposes private product data or performs the requested mutation. Declared public exceptions remain governed by BASE-ACCESS-003, and host, method, Origin/CSRF, input, and runtime guards retain their normal order.
- **BASE-ACCESS-003 — Public endpoints.** Only paths declared in `seed.json → deploy.publicPaths` are reachable without a session. Entries are exact paths or prefixes and must cover the sign-in flow and the operator app's static assets. Each is rate-limited at the limits in `seed.json` and returns 429 when exceeded.
- **BASE-ACCESS-004 — Server-side authorisation.** Every mutation checks the caller's session and ownership on the server. Client-supplied identity, role, or ownership claims are never trusted.

## Input

- **BASE-INPUT-001 — Validation.** Every request body, query, and path parameter is validated against a schema at the boundary. Invalid input returns 400 in the standard error format and reaches no service.
- **BASE-INPUT-002 — HTML.** User-supplied HTML is sanitised before display: scripts, forms, and tracking pixels are removed; remote images load only on operator request. Channels that carry text are rendered as text.
- **BASE-INPUT-003 — Uploads.** Uploads are accepted only within the size and type limits in `seed.json`, stored in R2, served with their declared content type and a download disposition, and readable only by an authorised session or through a delivery channel the product contract names.

## Secrets and configuration

- **BASE-SECRET-001 — No leakage.** No secret appears in the client bundle, in logs, or in an error response.
- **BASE-SECRET-002 — Startup.** Missing required configuration fails at startup naming the variable. The product never runs in a degraded mode.

## Data ownership

- **BASE-DATA-001 — Export and import.** `rer export --output FILE` produces every record and attachment; `rer import --input FILE --yes` restores it into an empty deployment; export, import, export yields an archive with equivalent contents.
- **BASE-DATA-002 — Retention.** No user data is deleted automatically. Only sessions and rate-limit state expire.
- **BASE-DATA-003 — Erasure.** Every entity that holds personal data can be deleted by an operator. Deletion cascades to dependent records and attachments within 5 minutes and is confirmed when complete. Audit entries are kept with the reference anonymised.
- **BASE-DATA-004 — Outbound flows.** User data leaves the deployment only through externals declared in `seed.json → externals`. No other outbound request carries user data.
- **BASE-DATA-005 — Independence.** The deployment makes no request to the marketplace or the seed author. There is no telemetry, phone-home, licence check, or kill switch.

## Public surfaces

- **BASE-PUBLIC-001 — Privacy.** Public surfaces (widgets, booking pages, forms, status pages) set no cookies, load nothing from third-party domains, and send no visitor data before the visitor's first interaction.
- **BASE-PUBLIC-002 — Origins.** Embeddable surfaces can be embedded only on host origins listed in settings.
- **BASE-PUBLIC-003 — Accessibility.** The operator app and every public surface are keyboard operable and labelled for assistive technology, passing the automated accessibility check at the level in `seed.json`.

## Operations

- **BASE-OPS-001 — Health.** `/health` returns 200 within 1 second when the database, storage, and queues are reachable, and 503 otherwise.
- **BASE-OPS-002 — Migrations.** Migrating from the previous released tag to the current one succeeds on sample data. Destructive changes are expand → migrate → contract with a documented recovery step.
- **BASE-OPS-003 — Idempotency.** Queue consumers and webhook handlers produce the same result when a message is delivered twice.
- **BASE-OPS-004 — Failure is visible.** A job that fails after its retries is marked failed where an operator can see it. Nothing is dropped silently.
- **BASE-OPS-005 — Audit.** Every destructive action and every automated action that reaches a user records the actor, or the feature that acted, and the time. Audit records survive deletion of what they describe.

## Uptime evidence status — 2026-10-11

The clauses above retain Base requirements using the public rer commands. Statuses below describe the
v0.1.2 source and the inspected clause-labelled candidate runs in the evidence
folder. The final committed head and inspected run results are mapped in the external evidence
record. `BASE-*` labels mean clause labels printed by proof outputs, not Git tags.
These local and emitted candidate results do not establish hosted operation, recipient acceptance, a
private Git tag or a published v0.1.2 release.

### Access

- **BASE-ACCESS-001 — Covered by test.** `tests/auth-input-boundary.mjs` signs the owner in by magic link through the emitted Worker, then proves that a link request for an address that is not an operator gets the same acknowledgement and creates no token and no mail, that a password offered with a link request signs nothing in and is kept in no table, and that no column of any migrated table can hold a password. All sessions it issues are native. Passkeys are not offered.
- **BASE-ACCESS-002 — Covered by inspected candidate evidence.** The `BASE-ACCESS-002` output from `tests/access-matrix.mjs` passes missing, expired, revoked and valid sessions through local and emitted hosted Worker documents, reads and every owner mutation; denials leave durable data unchanged, and fixed seven-day expiry stays below 30 days. The fixture-adoption evidence also records passing `tests/operator-security.mjs`, `tests/auth-input-boundary.mjs` and `tests/hosted-auth.mjs` results.
- **BASE-ACCESS-003 — Covered by inspected candidate evidence.** `tests/public-paths.mjs` emits `BASE-ACCESS-003 PASS`: all 63 declarations and 37 served static resources from 38 emitted files are exercised through the public Worker door, including window boundaries, second-IP and concurrent admission, unknown-client and shared-loopback rules, restart persistence, denials and storage failure. Owner-tunable limits remain estimated and are not load-tested; this is not a capacity claim.
- **BASE-ACCESS-004 — Covered by test.** `tests/access-matrix.mjs` takes every owner route from the Worker's route table (`src/domain/request-boundary.ts`): a signed-in member is refused every read and mutation, the owner-only account changes (role, status, invitation) and first-run setup, with every durable table unchanged; an owner request carrying forged identity, role and ownership claims in headers and body is recorded under the session's own operator and no claim is stored anywhere. Runner routes admit only their own key and signature (same test).

### Input

- **BASE-INPUT-001 — Covered by test.** Every `/api` route declares its path, query and body schema in `src/domain/request-boundary.ts`; a route without one is not served. `tests/worker-intake.mjs` sends, to every route in that table, an invalid path parameter, an undeclared query, a stray body on an action that takes none and malformed or non-object JSON: each answers 400 in the standard `{error}` format, repeats nothing that was sent, and leaves every durable table unchanged. Authentication runs first, so an unauthenticated caller still gets 401.
- **BASE-INPUT-002 — Not covered.** Escaping tests cover notification text. No test proves sanitization of arbitrary supplied HTML or the remote-image rule.
- **BASE-INPUT-003 — Not covered.** The product has no R2 upload path and no test proves the required size, type, content-type, disposition and private-access behavior.

### Secrets and configuration

- **BASE-SECRET-001 — Covered by test and one-off evidence.** A planted-value scan of every emitted client file, every served document, the error responses of every refused input and runtime logs found one leak, now fixed: a malformed JSON body's error repeated the start of the body. `tests/worker-intake.mjs` keeps that closed for every route; `tests/startup-config.mjs` keeps configuration values out of responses and logs; flow and drill tests keep credential values out of their transports.
- **BASE-SECRET-002 — Covered by inspected candidate evidence.** `tests/startup-config.mjs` reports a clause-labelled passing `BASE-SECRET-002` result after a complete-health check and missing/malformed-binding matrices across hosted and local emitted Worker health, assets, auth, development gates and scheduled entry. The inspected Vite development, preview and launcher proofs also fail closed, name the binding and retain no sentinel values in logs. This does not establish hosted operation.

### Data ownership

- **BASE-DATA-001 — Overridden, pending owner confirmation.** The owner's brief authorizes the default that installation-local authority (owner sessions, runner grants and claims) and webhook/Slack endpoint credentials and signing keys remain outside portable product data; available email addresses remain portable destination definitions. Authority is established for each target installation. The candidate `tests/archive-roundtrip.mjs` passed the unchanged 10,000-revision boundary. Separately, the real export/erase/reset/setup/import/export flow was inspected; decoded archives had stable audit history, one restore audit entry and the preserved source erasure journal. This is evidence for the replacement archive behavior, not owner confirmation of the exception. If the owner declines it, secure credential portability with explicit receiving-owner reauthorization must be designed before claiming BASE-DATA-001 equivalence.
- **BASE-DATA-002 — Not covered.** Documentation states that observation metadata is not automatically deleted and only session/rate-limit state expires, but no complete test covers all user data and allowed expiry.
- **BASE-DATA-003 — Covered by inspected candidate evidence.** `tests/erasure-audit.mjs` emits `BASE-DATA-003 / BASE-OPS-005 PASS` for owner-door erasures with a 50-table scan, actual scheduled probes, six network-edge sends, populated heartbeat/replay/history dependents, anonymised surviving audit, and native/custom archive later-journal fences. `tests/erasure-races.mjs` additionally exercises batch atomicity, last-owner refusal and concurrent stale-state safety. The evidence describes local candidate flows, not hosted acceptance.
- **BASE-DATA-004 — Not covered.** Target and notification egress have focused tests; no inspected test proves that every request carrying user data is limited to declared externals.
- **BASE-DATA-005 — Not covered.** No inspected check proves the absence of telemetry, marketplace or author requests, licence checks and kill switches across the shipped deployment.

### Public surfaces

- **BASE-PUBLIC-001 — Not covered.** The product has no visitor-facing widget or status surface; no clause-specific test establishes cookie, third-party request and first-interaction behavior.
- **BASE-PUBLIC-002 — Not covered.** No embeddable product surface or allow-listed-origin test exists.
- **BASE-PUBLIC-003 — Not covered.** Browser checks cover selected signed-in console screens. Sign-in and setup surfaces are not included in inspected accessibility evidence, and the broad clause has not been tagged.

### Operations

- **BASE-OPS-001 — Not covered.** `tests/notify-custody-runtime.mjs` checks selected schema readiness responses, but no inspected dependency-failure matrix proves the one-second bound for database, storage and queues.
- **BASE-OPS-002 — Covered by one-off evidence.** A populated 0.1.2 installation (owner, monitors with real observations, heartbeat receipt, destinations, two runners) was upgraded with the current migration command and killed at five points; every rerun of the same command finished, matched a fresh installation's schema, lost no 0.1.2 row and served the owner's monitors, history, destinations and export. Each migration commits with its history row. Recovery: run `rer setup` again (README, Upgrading). `tests/notify-upgrade.mjs` keeps the populated historical upgrade covered.
- **BASE-OPS-003 — Not covered pending result.** `tests/control-runtime.mjs` and `tests/notify-delivery.mjs` are candidates for duplicate-message coverage. They have no explicit BASE-OPS-003 tags or inspected candidate result yet.
- **BASE-OPS-004 — Not covered.** Probe and notification tests show selected failures, but no general test proves every exhausted job is visible and nothing is dropped silently.
- **BASE-OPS-005 — Covered by inspected candidate evidence.** The `BASE-DATA-003 / BASE-OPS-005 PASS` result from `tests/erasure-audit.mjs` shows destructive actions, audited operator authentication-mail captures, plus six separate real network-edge monitor/test notification sends. Local outbox capture and its audit commit in one D1 batch; the hosted mail sender records the feature audit before attempting its provider request. Source audit rows survive erasure, erased-operator actors are anonymised, and a later journal causes restore to refuse old audit actor references for an erased operator. Inactive restore preserves audit history and adds one restore record. `tests/erasure-races.mjs` also covers concurrent erasure safety. This is local candidate evidence, not hosted acceptance.


Local portability uses `rer export --output FILE` and `rer import --input FILE --yes` with a complete versioned product payload. Before a local import, run `rer setup --owner-email EMAIL --non-interactive` on the receiving checkout; its owner and settings are established locally while product/history tables remain empty. `tests/command-journey.mjs` exercises the public transport; `tests/archive-roundtrip.mjs` checks product history, supported archive formats and bounds. The final committed head and inspected run results are mapped in the external evidence record; these local results do not establish hosted acceptance.

Assisted delivery uses `tests/delivery-artifact.mjs`, `tests/owner-claim-admission.mjs` and `tests/owner-editor-browser.mjs` to exercise payloads, native owner admission, role loss and management CSP refusal. Base donor tests are not vendored. Local checks do not establish stage installation or live management acceptance.

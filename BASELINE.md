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
file path nor automatic `node scripts/rer.mjs verify` supersession reporting is universal. Where
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

- **BASE-DATA-001 — Export and import.** `node scripts/rer.mjs export --output FILE` produces every record and attachment; `node scripts/rer.mjs import --input FILE --yes` restores it into an empty deployment; export, import, export yields an archive with equivalent contents.
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

## Uptime evidence status — 2026-10-09

The clauses above retain Base requirements using the public rer commands. Statuses below describe this
candidate. A test reference without an explicit clause tag and an inspected run
is not a satisfied result. BASE-ACCESS-002 is the only clause marked satisfied
in this record.

### Access

- **BASE-ACCESS-001 — Not covered.** The inspected native run of `tests/auth-outbox.mjs` passes local and hosted sign-in, outbox-boundary and mail-configuration checks, but does not prove complete allow-list behavior or the absence of password storage.
- **BASE-ACCESS-002 — Satisfied.** The explicitly tagged `tests/access-matrix.mjs` passed with `node tests/access-matrix.mjs`. The test confirms fixed seven-day absolute expiry within the 30-day inactivity maximum, no expiry extension on authenticated reads, and missing, expired, revoked and valid session behavior across local and emitted hosted documents, reads and every owner mutation; denied operations leave durable data unchanged.
- **BASE-ACCESS-003 — Broken.** `seed.json` does not declare every served static asset path, and there is no inspected test covering rate limits on every declared public path.
- **BASE-ACCESS-004 — Not covered.** Existing origin and owner checks are targeted; there is no complete mutation/ownership matrix proving that client identity and ownership claims are always ignored.

### Input

- **BASE-INPUT-001 — Not covered.** Intake, query and notification tests validate selected boundaries; no inspected test covers every request body, query and path parameter.
- **BASE-INPUT-002 — Not covered.** Escaping tests cover notification text. No test proves sanitization of arbitrary supplied HTML or the remote-image rule.
- **BASE-INPUT-003 — Not covered.** The product has no R2 upload path and no test proves the required size, type, content-type, disposition and private-access behavior.

### Secrets and configuration

- **BASE-SECRET-001 — Not covered.** Credential custody and output-redaction tests are targeted; a complete client-bundle, log and error-response scan has not been inspected.
- **BASE-SECRET-002 — Broken.** Missing configuration is currently rejected during requests rather than failing at startup with the missing variable named; missing hosted mail configuration can leave email unavailable.

### Data ownership

- **BASE-DATA-001 — Overridden, pending owner confirmation.** The owner's brief authorizes the default that installation-local authority (owner sessions, runner grants and claims) and destination credentials remain outside portable product data; authority is established for each target installation. The replacement requirement is export/import/export equivalence for portable product records and histories. `tests/archive-roundtrip.mjs` passed with the pinned native CLI export, `node scripts/rer.mjs import`, and export sequence; its stdout explicitly tags the BASE-DATA-001 replacement and covers complete portable history, inactive restore without dispatch, excluded authority, invalid-history rejection, legacy restore, and row and byte bounds. Owner confirmation of this data exception remains pending.
- **BASE-DATA-002 — Not covered.** Documentation states that observation metadata is not automatically deleted, but no complete test covers all user data and allowed session/rate-limit expiry.
- **BASE-DATA-003 — Broken.** No entity-wide erasure flow with dependent-record cleanup and durable anonymized audit evidence is present.
- **BASE-DATA-004 — Not covered.** Target and notification egress have focused tests; no inspected test proves that every request carrying user data is limited to declared externals.
- **BASE-DATA-005 — Not covered.** No inspected check proves the absence of telemetry, marketplace or author requests, licence checks and kill switches across the shipped deployment.

### Public surfaces

- **BASE-PUBLIC-001 — Not covered.** The product has no visitor-facing widget or status surface; no clause-specific test establishes cookie, third-party request and first-interaction behavior.
- **BASE-PUBLIC-002 — Not covered.** No embeddable product surface or allow-listed-origin test exists.
- **BASE-PUBLIC-003 — Not covered.** Browser checks cover selected signed-in console screens. Sign-in and setup surfaces are not included in inspected accessibility evidence, and the broad clause has not been tagged.

### Operations

- **BASE-OPS-001 — Not covered.** `tests/notify-custody-runtime.mjs` checks selected schema readiness responses, but no inspected dependency-failure matrix proves the one-second bound for database, storage and queues.
- **BASE-OPS-002 — Not covered.** `tests/notify-upgrade.mjs` (with its checksum manifest `tests/applied-migrations.sha256`) covers selected migration states. A previous-release sample-data upgrade with recovery evidence has not been inspected.
- **BASE-OPS-003 — Not covered pending result.** `tests/control-runtime.mjs` and `tests/notify-delivery.mjs` are candidates for duplicate-message coverage. They have no explicit BASE-OPS-003 tags or inspected candidate result yet.
- **BASE-OPS-004 — Not covered.** Probe and notification tests show selected failures, but no general test proves every exhausted job is visible and nothing is dropped silently.
- **BASE-OPS-005 — Broken.** There is no durable actor/time audit record that survives deletion of every described entity.


Local portability uses `node scripts/rer.mjs export --output FILE` and `node scripts/rer.mjs import --input FILE --yes` with a complete versioned product payload. `tests/command-journey.mjs` exercises the public transport; `tests/archive-roundtrip.mjs` checks product history, supported archive formats and bounds. Inspect exact-head results before making acceptance claims.

Assisted delivery uses `tests/delivery-artifact.mjs`, `tests/owner-claim-admission.mjs` and `tests/owner-editor-browser.mjs` to exercise payloads, native owner admission, role loss and management CSP refusal. Base donor tests are not vendored. Local checks do not establish stage installation or live management acceptance.

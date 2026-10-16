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
v0.1.2 source and previously inspected clause-labelled candidate runs in the
evidence folder. The final committed head and inspected run results are mapped
in the external evidence record. `BASE-*` labels mean clause labels printed
by proof outputs, not Git tags. These historical local and emitted results do
not establish hosted operation, recipient acceptance, or acceptance of the
current candidate.

### Current release — 2026-10-15

The previous published version is v0.1.3 at tag commit
`6a7a9eec92331de5f57f78a258f36275a1aee1ff`. This release is v0.2.0, tagged `v0.2.0` on `main`; no tag has a
GitHub Release entry. It pins `@runeditrun/rer` to 0.2.20. Scoped local migration and
ledger recovery evidence is summarized under BASE-OPS-002. Current-candidate
browser-flow recovery remains a separate release acceptance item. The earlier
clause-labelled results below do not substitute for exact-candidate evidence.

The release pack uses the official current Base CLI release producer,
independent of Uptime's `@runeditrun/rer` 0.2.20 product pin. It frozen-installs
the candidate, runs `pnpm run verify` and `pnpm run verify:release`, scans the
source and emits a local dry-run artifact. Exact-head CI, runtime/accessibility
receipts and scan reports accompany candidate review as external evidence; a
dry run does not publish or move a remote tag.

### Access

- **BASE-ACCESS-001 — Covered by test.** `tests/auth-input-boundary.mjs` signs the owner in by magic link through the emitted Worker, then proves that a link request for an address that is not an operator gets the same acknowledgement and creates no token and no mail, that a password offered with a link request signs nothing in and is kept in no table, and that no column of any migrated table can hold a password. All sessions it issues are native. The completed optional-provider probe also passes the public contract check, omitted-provider setup, native email-link sign-in and handoff, session revocation and exact repeat preservation. Selected-provider metadata is read from a local issuer edge, then setup fails before owner creation at the unmounted dependency-approval route (404); no link request or durable link is created. Dependency/OIDC routes remain unmounted after a separate native bootstrap. Linked callback/repeat/revocation are unreachable and belong to a separate adoption round, not provider readiness. Passkeys are not offered.
- **BASE-ACCESS-002 — Covered by inspected candidate evidence.** The `BASE-ACCESS-002` output from `tests/access-matrix.mjs` passes missing, expired, revoked and valid sessions through local and emitted hosted Worker documents, reads and every owner mutation; denials leave durable data unchanged, and fixed seven-day expiry stays below 30 days. The fixture-adoption evidence also records passing `tests/operator-security.mjs`, `tests/auth-input-boundary.mjs` and `tests/hosted-auth.mjs` results.
- **BASE-ACCESS-003 — Covered by inspected candidate evidence.** `tests/public-paths.mjs` emits `BASE-ACCESS-003 PASS`: all 63 declarations and 37 served static resources from 38 emitted files are exercised through the public Worker door, including window boundaries, second-IP and concurrent admission, unknown-client and shared-loopback rules, restart persistence, denials and storage failure. Owner-tunable limits remain estimated and are not load-tested; this is not a capacity claim.
- **BASE-ACCESS-004 — Covered by test.** `tests/access-matrix.mjs` takes every owner route from the Worker's route table (`src/domain/request-boundary.ts`): a signed-in member is refused every read and mutation, the owner-only account changes (role, status, invitation) and first-run setup, with every durable table unchanged; an owner request carrying forged identity, role and ownership claims in headers and body is recorded under the session's own operator and no claim is stored anywhere. Runner routes admit only their own key and signature (same test).

### Input

- **BASE-INPUT-001 — Covered by test.** Every `/api` route declares its path, query and body schema in `src/domain/request-boundary.ts`; a route without one is not served. `tests/worker-intake.mjs` sends, to every route in that table, an invalid path parameter, an undeclared query, a stray body on an action that takes none and malformed or non-object JSON: each answers 400 in the standard `{error}` format, repeats nothing that was sent, and leaves every durable table unchanged. Authentication runs first, so an unauthenticated caller still gets 401.
- **BASE-INPUT-002 — Superseded for this product; replacement scoped.** Uptime offers no owner-supplied HTML field and does not accept arbitrary owner markup. Text stays text. For a public URL the owner asks the runner to inspect, bounded HTML may be fetched and parsed in runner memory; raw response HTML and headers are not returned to the console, stored, logged or rendered as console HTML. The product therefore replaces sanitization and remote-image behavior with no arbitrary-HTML input and isolated, derived-only discovery. A measured emitted-browser probe at 1440/390 accepted hostile image/script markup as monitor, destination and imported-definition names: list, preview and batch history kept it literal, executed no script and requested no planted resource. An arbitrary HTML field was refused without creating a monitor. This is a product-scope replacement, not a general HTML sanitizer.
- **BASE-INPUT-003 — Superseded for this product; no attachment surface.** Uptime has no R2 binding or product attachment-upload route. Definition imports and versioned archives are bounded, schema-validated structured data; they are not user attachments and are never served as uploaded content. The upload size/type/disposition/private-download contract does not apply to those structured interfaces. Measured authenticated unknown uploads returned 404 for JSON and 415 for multipart; the proposed content URL returned 404, every installation table stayed unchanged and no outbound request occurred. This is not an upload implementation or a general baseline pass.

### Secrets and configuration

- **BASE-SECRET-001 — Covered by test and one-off evidence.** A planted-value scan of every emitted client file, every served document, the error responses of every refused input and runtime logs found one leak, now fixed: a malformed JSON body's error repeated the start of the body. `tests/worker-intake.mjs` keeps that closed for every route; `tests/startup-config.mjs` keeps configuration values out of responses and logs; flow and drill tests keep credential values out of their transports.
- **BASE-SECRET-002 — Covered by inspected candidate evidence.** `tests/startup-config.mjs` reports a clause-labelled passing `BASE-SECRET-002` result after a complete-health check and missing/malformed-binding matrices across hosted and local emitted Worker health, assets, auth, development gates and scheduled entry. The inspected Vite development, preview and launcher proofs also fail closed, name the binding and retain no sentinel values in logs. This does not establish hosted operation.

### Data ownership

- **BASE-DATA-001 — Overridden; owner accepted 2026-10-13.** Portable archives exclude installation-local authority (owner sessions, runner grants and claims), webhook/Slack endpoint credentials and signing keys; available email addresses remain portable destination definitions. Each receiving installation establishes its own authority. The inspected candidate `tests/archive-roundtrip.mjs` passed the unchanged 10,000-revision boundary. Separately, the real export/erase/reset/setup/import/export flow was inspected; decoded archives had stable audit history, one restore audit entry and the preserved source erasure journal. This is the accepted archive policy, not BASE-DATA-001 equivalence.
- **BASE-DATA-002 — Partially covered; broad guarantee remains unverified.** An inspected local runtime scan compared all 76 migrated tables in a populated installation; 36 tables contained rows before maintenance. It exercised HTTP/keyword/heartbeat retries, pre-browser flow cancellation, discovery outcomes, local email delivery, started webhook/Slack interruption and drill expiry. Only aged `oa_sessions`, `oa_limits`, `login_attempts` and `public_rate_limits` rows decreased; other preexisting row identities survived the measured cron/lazy-expiry paths, and the database remained equal after Worker restart. Static classification also identifies capability-secret scrubbing, cleanup of a proven-unstarted integration-attempt reservation, logically expired records that remain stored and migration-time removal of stale dependency-approval state. Not every active automatic cleanup transition or optional provider integration was exercised, so this does not establish the broad clause.
- **BASE-DATA-003 — Covered by inspected candidate evidence.** `tests/erasure-audit.mjs` emits `BASE-DATA-003 / BASE-OPS-005 PASS` for owner-door erasures with a 50-table scan, actual scheduled probes, six network-edge sends, populated heartbeat/replay/history dependents, anonymised surviving audit, and native/custom archive later-journal fences. `tests/erasure-races.mjs` additionally exercises batch atomicity, last-owner refusal and concurrent stale-state safety. The evidence describes local candidate flows, not hosted acceptance.
- **BASE-DATA-004 — Declarations updated; runtime completeness unverified.** The static sink inventory in `CONTRACT.md` is mapped to the external data fields in `seed.json`, including DNS, public targets and canaries, discovery, browser requests and subresources, the runner control plane, owner-app readiness, provider messages, setup-time identity-provider linking attempts and the optional exact-origin management editor. No complete emitted deployment and runner network trace has yet shown that every request carrying user data stays within those declarations.
- **BASE-DATA-005 — Superseded for this product; scoped native independence proved.** The native standalone product must operate without a marketplace or author dependency. The owner may configure the optional exact-origin private management editor, which may contact the author if that origin belongs to the author; this exception precludes an absolute author-zero-egress claim for an opted-in editor. It permits no telemetry, licence check or kill switch. `CONTRACT.md` names this replacement. Native local setup/sign-in and repeat preservation passed with no linked provider. With the editor absent and outside Worker/browser access and the exercised runner HTTP(S) transport denied, emitted native sign-in, real local-edge monitoring failure/recovery, history and archive/definitions export passed; the 1440/390 browser trace made zero outside requests. This proves those native flows without an author/marketplace dependency. Complete optional-provider, hosted and deployment egress is not inferred from that scoped trace.

### Public surfaces

- **BASE-PUBLIC-001 — Covered by scoped emitted-browser evidence.** All 84 fresh-context cases passed: the separate marketing landing and app-origin Lobby/docs for unclaimed and claimed installations at 1440/390, each with initial navigation, idle, repeat navigation and separate-tab isolation. No cookies, Set-Cookie, request cookies, localStorage, unrelated session storage, visitor queries/bodies, telemetry endpoints or third-party requests were observed. App documentation retains only source-validated tab-local navigation/scroll coordinates on repeat navigation; those keys were not transmitted. This measures the emitted Worker and static site at local HTTP edges, not live CDN/header behavior. Uptime offers no public widget, booking form or status page.
- **BASE-PUBLIC-002 — Superseded for this product; private editor exception.** Uptime has no public surface intended for embedding; its public landing, Lobby and documentation pages remain ordinary standalone pages. An optional authenticated management editor can use only the exact owner-configured management origin and installation identity; it is private management integration, not public embedding. Rendered page context is shared only after the owner opens the editor and enables sharing. The native console's measured CSP permits only same-origin frame ancestors and forbids child frames/objects when the optional editor is absent; the configured editor test also proves actual Chromium framing refusal. This replacement does not establish a public embed allow-list or a general BASE-PUBLIC-002 pass.
- **BASE-PUBLIC-003 — Current acceptance criteria recorded.** Prior browser evidence covers selected signed-in console screens, not sign-in and setup. Current acceptance requires zero axe violations, keyboard focus returning after dialogs close, responsive reflow without horizontal overflow, and computed accessibility-tree inspection at 1440 and 390 pixels across Lobby, docs, sign-in, setup and operator surfaces. Exact-candidate results accompany release review as external evidence; the broad clause has not been tagged. Spoken-announcement testing is out of scope, and no WCAG certification is claimed.

### Operations

- **BASE-OPS-001 — Covered by scoped local emitted-Worker evidence.** The applicable dependencies are D1, including public admission and credential-custody storage, and actual emitted assets via `ASSETS`; Uptime has no R2 or queue binding. The retained original health log records 15 total cases: one healthy 200 and 14 faults, all 503 within 906 ms, with recovery after every fault. Twenty sequential healthy samples give p95 6 ms and maximum 7 ms. Those measurements used the historical 900 ms deadline. The owner-authorized replacement below now applies. `tests/startup-config.mjs` and unchanged `tests/notify-custody-runtime.mjs` pass. This is local evidence, not hosted latency, configured-limit load capacity, runner health or provider acceptance.
- **BASE-OPS-002 — Scoped local migration and ledger recovery evidence recorded; release acceptance requires external exact-head verification.** A fresh installation completed `rer setup` twice with exact settings preserved. A populated v0.1.2 upgrade preserved existing private values and added only the optional `IDENTITY_PROVIDER` setting. Current CLI import/export, dev, native sign-in and readback were exercised with a genuine rer 0.2.1-bound archive and current-ledger archives. Product rows were compared through live data and retained `archive_history`, allowing inactive restore transformations; archive-file byte equality is not claimed. Unbound v0.1.2 archives are refused with exit 4, and uncertain migration history is refused. This scoped local evidence does not establish exact-head CI, release-pack or hosted acceptance.
- **BASE-OPS-003 — Scoped idempotency coverage recorded; broader guarantee remains unclaimed.** Earlier inspected CI run 38379573738 covered duplicate attempts leaving event/job state unchanged (`tests/resilience/attempts.mjs`), dispatch/restart without duplicate sends (`tests/notify-delivery.mjs`), and replay refusal (`tests/alert-drill.mjs`). These checks do not establish idempotency for every consumer and webhook handler; the final candidate's CI result remains external release evidence.
- **BASE-OPS-004 — Partially covered; auxiliary execution gaps remain.** Measured local execution-retention cases keep exhausted HTTP, keyword and heartbeat attempts, abandoned leases, discovery outcomes, delivery failures/uncertainty and drill expiry visible across restart. A prior local `tests/flow-journey.mjs` result records browser failure with retained step evidence and incident mail, changed-definition recovery, hard-stop profile cleanup and tunnel-custody refusal; current-candidate browser-flow recovery proof remains pending. This is local runner/Worker evidence, not hosted acceptance. Worker monitoring-watch rows keep only the latest per-window outcome and have no lease-expiry reconciliation; external heartbeat watch attempts overwrite their last outcome; runner-local outage/recovery watch state is in memory; authentication-mail audit records an attempt but no durable provider outcome/reconciliation. Therefore the literal all-execution-classes guarantee is not established.
- **BASE-OPS-005 — Covered by inspected candidate evidence.** The `BASE-DATA-003 / BASE-OPS-005 PASS` result from `tests/erasure-audit.mjs` shows destructive actions, audited operator authentication-mail captures, plus six separate real network-edge monitor/test notification sends. Local outbox capture and its audit commit in one D1 batch; the hosted mail sender records the feature audit before attempting its provider request. Source audit rows survive erasure, erased-operator actors are anonymised, and a later journal causes restore to refuse old audit actor references for an erased operator. Inactive restore preserves audit history and adds one restore record. `tests/erasure-races.mjs` also covers concurrent erasure safety. This is local candidate evidence, not hosted acceptance.


Local portability uses `rer export --output FILE` and `rer import --input FILE --yes` with a complete versioned product payload. Before a local import, run `rer setup --owner-email EMAIL --non-interactive` on the receiving checkout; its owner and settings are established locally while product/history tables remain empty. `tests/command-journey.mjs` exercises the public transport; `tests/archive-roundtrip.mjs` checks product history, supported archive formats and bounds. The final committed head and inspected run results are mapped in the external evidence record; these local results do not establish hosted acceptance.

Assisted delivery uses `tests/delivery-artifact.mjs`, `tests/owner-claim-admission.mjs` and `tests/owner-editor-browser.mjs` to exercise payloads, native owner admission, role loss and management CSP refusal. At 1440/390 the editor test also passed two ordinary timer renewals beyond the original grant expiry, preserving the open iframe, its document and private draft. Base donor tests are not vendored. Local checks do not establish stage installation or live management acceptance.

### Global readiness budget — 2026-10-16

For Uptime, the owner authorized replacing BASE-OPS-001’s one-second ceiling with one 3 s budget covering configuration, public admission and dependency readiness from any region. Independent D1 schema/monitor checks and emitted-asset reads run concurrently. Successful health still awaits the key-bearing credential upgrade; missing or hung dependencies answer 503. This seed-owned deadline bounds the response and cannot cancel underlying D1 work.

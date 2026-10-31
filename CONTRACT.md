# Uptime target product contract

Target edition: 16 October 2026. Uptime is a complete website uptime and API monitoring product for a US small-business site or application operator replacing Pingdom (SolarWinds), UptimeRobot, Better Stack Uptime or Site24x7, with the monitoring-as-code and transaction depth buyers seek from Checkly, OpenStatus and Hyperping. Prices/budgets are USD, phone defaults are US numbers, and schedules/reports support US time zones and daylight saving. The product discovers, operates and maintains trustworthy monitoring of the actual customer outcome: HTTP/API, every named protocol below, job heartbeats, multi-region and private checks, browser transactions, expiring assets, actionable alerts and reporting. Oncall owns full responder coordination and Lamp owns customer-facing status communication; their integrations are part of Uptime's monitoring job. No gap in implementation reduces this destination.

## Product target

| | |
| --- | --- |
| Category | Website uptime and API monitoring |
| Incumbents a buyer switches from | Pingdom (SolarWinds), UptimeRobot, Better Stack Uptime, Site24x7 |
| Up-and-comers it must also beat | The monitoring-as-code challengers Checkly, OpenStatus and Hyperping |
| First buyer | A US small-business site or application operator |

The primary journey: an operator moves their monitors from UptimeRobot or Pingdom, checks sites, APIs, jobs and protocols on schedule from independent vantages, is alerted only on confirmed failures through routed contacts, works each incident through to verified recovery and reports uptime against honest denominators.

## How to read this contract

- This follows the RER contract standard. It is a target contract, not a release verdict: every named clause states the buyer behavior and its acceptance journey. Core is what a buyer switching from the named incumbents uses in the first week, plus the push-further work; Agent surface and Later are reported separately.
- Done means every acceptance point passes through Uptime's own doors (the Worker's routes, the signed runner, the console, the CLI and the documented API, with fakes only at the network and provider edge) in a recorded Verify run. The Status table distinguishes done, partial and missing at current code; a cited local test does not establish hosted placement, live migration, provider receipt or accessibility certification.
- Real-world proof Uptime cannot produce in its own repository (managed geographic locations, hosted operation at scale, real incumbent, provider and identity accounts, US carriers and handsets, store listings, a person confirming receipt, a human screen-reader pass) is in the Field proof register. It never blocks done.
- ACCEPTANCE.md and docs/CLAIMS.md are generated from this file. Rulings are in RULINGS.md, history in CHANGELOG.md, and mechanism in docs/; the retained safety rules and implementation detail are in [docs/contract/safety-rules.md](docs/contract/safety-rules.md).

## Shared duties (Base)

| Base duty | Duty | Delta clauses | Base journey |
| --- | --- | --- | --- |
| BASE-ACCESS-001 | Sign-in | ACCESS-003 | not run |
| BASE-ACCESS-002 | Sessions | AUTHORITY-001, INCIDENT-001, ACCESS-003 | not run |
| BASE-ACCESS-003 | Public endpoints | PUBLIC-002 | not run |
| BASE-ACCESS-004 | Server-side authorisation | AUTHORITY-001, MOBILE-001, ACCESS-001 | not run |
| BASE-INPUT-001 | Validation | IMPORT-001, MANAGE-001 | not run |
| BASE-INPUT-002 | HTML | none | not run |
| BASE-INPUT-003 | Uploads | none | not run |
| BASE-SECRET-001 | No leakage | NOTIFY-001, API-002, WEBHOOK-001 | not run |
| BASE-SECRET-002 | Startup | STARTUP-001 | not run |
| BASE-DATA-001 | Export and import | ARCHIVE-001, ARCHIVE-002 | not run |
| BASE-DATA-002 | Retention | RETENTION-001 | not run |
| BASE-DATA-003 | Erasure | ERASURE-001, INCIDENT-005 | not run |
| BASE-DATA-004 | Outbound flows | DEPENDENCY-002, DISCOVERY-001 | not run |
| BASE-DATA-005 | Independence | none | not run |
| BASE-DATA-006 | Erasure respects retention and legal hold | ERASURE-001 | not run |
| BASE-PUBLIC-001 | Privacy | PUBLIC-001, PERF-001 | not run |
| BASE-PUBLIC-002 | Origins | none | not run |
| BASE-PUBLIC-003 | Accessibility | INTERFACE-001 | not run |
| BASE-OPS-001 | Health | STARTUP-001 | not run |
| BASE-OPS-002 | Migrations | none | not run |
| BASE-OPS-003 | Idempotency | DELIVERY-002 | not run |
| BASE-OPS-004 | Failure is visible | DELIVERY-001, OPS-001 | not run |
| BASE-OPS-005 | Audit | AUDIT-001, MOBILE-001, ACCESS-001 | not run |
| BASE-ROLE-001 | Roles through every door | AUTHORITY-001, MOBILE-001, INCIDENT-001, ACCESS-001 | not run |
| BASE-AUDIT-001 | Searchable, durable audit | AUDIT-001, ACCESS-001 | not run |
| BASE-BACKUP-001 | Independent backup, restore and rollback | OPS-001 | not run |
| BASE-SIGNIN-001 | Standards-based SSO and lifecycle | ACCESS-002 | not run |
| BASE-SIGNIN-002 | Native multi-factor authentication | ACCESS-003 | not run |
| BASE-INSTALL-001 | Free self-host and removal | PUBLIC-001 | not run |
| BASE-MAIL-001 | Truthful mail outcomes | DELIVERY-001, DRILL-001 | not run |
| BASE-ACCESSIBILITY-001 | One accessibility bar | INTERFACE-001 | not run |
| BASE-DOCS-001 | On-site docs from one contract | PUBLIC-001 | not run |
| BASE-AGENT-001 | One MCP door per seed | SURFACE-001 | not run |
| BASE-AGENT-002 | The seed's jobs are tools | SURFACE-001 | not run |
| BASE-AGENT-003 | Records are resources | SURFACE-001 | not run |
| BASE-AGENT-004 | Business identity and short-lived tokens | none | not run |
| BASE-AGENT-005 | An agent acts as a person in a role | none | not run |
| BASE-AGENT-006 | Every action declares its risk class | SURFACE-002, SURFACE-003, SURFACE-004 | not run |
| BASE-AGENT-007 | The company's policy decides | SURFACE-005 | not run |
| BASE-AGENT-008 | Truthful attribution | none | not run |
| BASE-AGENT-009 | Every agent action is audited | none | not run |
| BASE-AGENT-010 | Agents can follow changes | none | not run |
| BASE-AGENT-011 | Limits are policy, and Pause stops everything | none | not run |
| BASE-AGENT-012 | Writes are idempotent and conflict-safe | none | not run |
| BASE-AGENT-013 | Manifest, docs and the conformance journey | SURFACE-001, SURFACE-005 | not run |

## Published clauses

- `HTTP-001`: *Tier:* Core
- `EVIDENCE-001`: *Tier:* Core
- `STATE-001`: *Tier:* Core
- `AUTHORITY-001`: *Tier:* Core · *Cites:* BASE-ACCESS-002, BASE-ACCESS-004, BASE-ROLE-001
- `NETWORK-001`: *Tier:* Core
- `HEARTBEAT-001`: *Tier:* Core
- `ARCHIVE-001`: *Tier:* Core · *Cites:* BASE-DATA-001
- `IMPORT-001`: *Tier:* Core · *Cites:* BASE-INPUT-001 · *Register:* R-3
- `RETENTION-001`: *Tier:* Core · *Cites:* BASE-DATA-002
- `ERASURE-001`: *Tier:* Core · *Cites:* BASE-DATA-003, BASE-DATA-006
- `AUDIT-001`: *Tier:* Core · *Cites:* BASE-OPS-005, BASE-AUDIT-001
- `PRESENCE-001`: *Tier:* Core
- `INTERFACE-001`: *Tier:* Core · *Cites:* BASE-PUBLIC-003, BASE-ACCESSIBILITY-001 · *Register:* R-10, R-11
- `NOTIFY-001`: *Tier:* Core · *Cites:* BASE-SECRET-001 · *Register:* R-6
- `DELIVERY-001`: *Tier:* Core · *Cites:* BASE-MAIL-001, BASE-OPS-004
- `PUBLIC-001`: *Tier:* Core · *Cites:* BASE-PUBLIC-001, BASE-INSTALL-001, BASE-DOCS-001
- `BOUNDARY-001`: *Tier:* Core
- `DRILL-001`: *Tier:* Core · *Cites:* BASE-MAIL-001 · *Register:* R-9
- `STARTUP-001`: *Tier:* Core · *Cites:* BASE-SECRET-002, BASE-OPS-001 · *Register:* R-2
- `PUBLIC-002`: *Tier:* Core · *Cites:* BASE-ACCESS-003 · *Register:* R-2
- `FLOW-001`: *Tier:* Core · *Register:* R-1

### Existing guarantees and supported customer journeys

#### HTTP-001 — Signed HTTP monitoring

**Requirement.** Public hosted HTTP(S) and keyword checks run in the Cloudflare Worker; private checks use the separately scoped Node runner. They retain the exact immutable assertion bundle and bounded transport evidence, and require authenticated claims and signed results; the control plane must reject contradictory completion. Hosted Worker checks leave through Cloudflare's shared egress and have no dedicated source address; published allowlistable probe addresses and probe identification are PROBE-002's. See [Integrity and authority](docs/contract/safety-rules.md#integrity-and-authority) and [Network and credentials](docs/contract/safety-rules.md#network-and-credentials).

**Acceptance.**
1. Create an HTTP(S) and keyword monitor through the owner API, run scheduled hosted and signed runner work against a controlled HTTPS service, fail its status/text, recover it and inspect the immutable assertions and transport evidence.

#### EVIDENCE-001 — Immutable scheduled evidence

**Requirement.** Definitions, scheduled slots and every retry attempt retain revision, policy, fixed selected probes, runner identity, timings, status, assertions and error category; retries never erase failures, and observation/state/outbox commit atomically. See [Evidence and state](docs/contract/safety-rules.md#evidence-and-state) and [Integrity and authority](docs/contract/safety-rules.md#integrity-and-authority).

**Acceptance.**
1. Through signed claim/result routes submit failure, retry, late and duplicate attempts, restart, and read history; each attempt and its revision remains identifiable and observation/state/outbox either all commit or none do.

#### STATE-001 — Fixed coverage and incident hysteresis

**Requirement.** Missing or expired passing coverage is Unknown, partial failure stays visible, independent-vantage agreement and scheduled confirmation determine Failing, and complete fresh scheduled passing evidence plus recovery threshold is required for recovery; manual checks and maintenance never rewrite observations or scheduled policy. See [Evidence and state](docs/contract/safety-rules.md#evidence-and-state).

**Acceptance.**
1. Run two assigned network vantages through partial, missing, stale, failing and recovering slots; inspect Unknown/Degraded/Failing and thresholds.
2. A manual pass, absent probe or maintenance expiry cannot fabricate recovery.

#### AUTHORITY-001 — Server-side scoped authority

**Requirement.** Runner claim, result and heartbeat doors accept only scoped runner authority; missing configuration fails closed; browser mutations enforce configured origin; expired or foreign attempts cannot alter current evidence, and duplicate attempt identities cannot overwrite it; a signature identifies a key holder rather than proving truthful observation. See [Integrity and authority](docs/contract/safety-rules.md#integrity-and-authority).

**Acceptance.**
1. Open private documents and call native/framework APIs while signed out, revoked, cross-origin or using a foreign/expired runner signature; require refusal with no product writes, then succeed with the authorized session or scoped runner.

#### NETWORK-001 — Pinned bounded destination execution

**Requirement.** Every public DNS answer and redirect hop is validated fail closed; private-runner numeric sockets preserve Host and TLS identity, hosted checks use Cloudflare’s public Internet fetch transport, unsafe/mixed addresses and HTTPS downgrade are rejected, cross-origin redirects strip request authority, and synthetic grants and protected origin-bound local credential files retain their separate custody limits. The PROBE-002 identification header follows these credential rules and is stripped on cross-origin redirects. See [Network and credentials](docs/contract/safety-rules.md#network-and-credentials).

**Acceptance.**
1. Exercise real controlled HTTP/TLS endpoints with mixed DNS, rebinding, hostname mismatch, redirects, downgrade, forbidden addresses, credentials and execution bounds; inspect requests and prove rejected destinations receive no connection or authority.

#### HEARTBEAT-001 — Revision-scoped receipt evaluation

**Requirement.** Hashed owner-issued tokens and, in the header form, increasing sequences protect server-time receipts, ingress cannot advance health, and scheduled signed completion must match its exact installation-local claim snapshot; stale, future, paused, foreign-revision or imported receipts cannot establish Healthy. These rules bind every receipt form of the buyer-facing job heartbeat in HEARTBEAT-002 and HEARTBEAT-003. See [Network and credentials](docs/contract/safety-rules.md#network-and-credentials).

**Acceptance.**
1. Issue and rotate a heartbeat token through the owner door, send increasing receipts, miss one, and evaluate scheduled signed snapshots; replay, old tokens, imported or foreign-revision receipts cannot change current health.

#### ARCHIVE-001 — Inactive validated restore

**Requirement.** Bounded versioned archives require integrity and semantic validation before transactional restore into empty product data, preserve historical evidence, erasure receipts and the permanent anonymized action audit, create paused current revisions, interrupt leases and quarantine alerts; installation-local sessions, keys, grants, request credential values, heartbeat authority, contact, webhook and Slack URLs, and signing keys are excluded; destination definitions and retained notification histories are portable, and imported evidence cannot establish current health or replay events. The source erasure journal fences copies made before a later erasure when that journal accompanies the restore. A local CLI receiving checkout must run setup first to establish its owner and settings. Supersedes `BASE-DATA-001` for installation authority and endpoint credentials only: the owner accepted this archive policy on 2026-10-13 (RL-1), as an intentional replacement, not BASE-DATA-001 equivalence. See [Portability and retention](docs/contract/safety-rules.md#portability-and-retention) and [Integrity and authority](docs/contract/safety-rules.md#integrity-and-authority).

**Acceptance.**
1. Export a populated installation including TCP, DNS, TLS and domain monitors, establish a different receiving owner, import into empty product data, then export/read history and repeat the restore.
2. Each protocol’s settings and immutable revisions/slots survive; definitions are paused, leases interrupted, delivery quarantined, secrets/authority absent, history retained and later erasure journals enforced; corrupt/nonempty imports write nothing.

#### IMPORT-001 — Reviewed definition files and inactive imports

**Requirement.** A versioned definition file (2 MiB, 500 monitors, UTF-8 JSON, editor fields only, no request secrets or installation authority) or saved UptimeRobot v3 monitor pages are previewed without writes as create, unchanged, change, refused or unsupported per entry with a plan digest, validated by the editor's own validation; apply refuses a digest that no longer matches and otherwise resumes the reviewed plan in bounded transactional batches as new paused monitors or new revisions that keep enabled, maintenance and runner assignments; nothing in a file enables a monitor, issues a heartbeat token, schedules a notification or touches a destination. Undo pauses what it created and restores what it changed while their revisions are unchanged, reports the rest and never removes history. Legacy definition batches travel in archives as restored history without authority; import-door custody stays installation-local. Through this definition-file door a log export is recognized and counted only. Storing it as labeled source history for reports is HISTORY-001's migration import, and no imported history ever becomes evidence. See [Definition files and imports](docs/contract/safety-rules.md#definition-files-and-imports).

**Acceptance.**
1. Preview, apply, export and undo definition JSON and saved UptimeRobot pages through the owner routes and CLI.
2. Malformed/hostile/secret-bearing inputs and stale digests write nothing; creations stay paused, changes keep operational state, unsupported fields are named and history is never made current evidence.

#### RETENTION-001 — Explicit storage custody

**Requirement.** Beyond BASE-DATA-002, short-lived login-attempt counters are cleaned up, and legacy development sign-in records stay until operator erasure or local reset. Expired or confirmed alert-drill links lose their capability material while drill history stays; retired destination secrets are scrubbed only after owner rotation/deletion and in-flight sends finish; a proven-unsent integration-attempt reservation can be removed while its delivery history remains. Expired discovery jobs retain their expired status. Raw target response bodies and probe-request secrets are not retained in observations; the only target content kept is EVIDENCE-002's bounded, redacted, access-controlled failure snapshot, stored apart from observations under owner-set retention, carried in archives and erased with its monitor or on owner request. Webhook and Slack endpoint URLs and signing keys remain installation-local, available email addresses travel as destination definitions, and retention changes must never silently improve the fixed denominator or historical health. Custody and every declared cleanup class are judged at current supported bounds. See [Portability and retention](docs/contract/safety-rules.md#portability-and-retention).

**Acceptance.**
1. Populate product, authentication, rate-limit, drill, credential and attempt records; run expiry, maintenance and restart through runtime doors and compare surviving identities.
2. Only declared transient data/secret material disappears; no cleanup improves uptime or removes retained product history.

#### ERASURE-001 — Operator-directed entity erasure

**Requirement.** An owner can erase a monitor with its evidence and dependent notification/heartbeat records, a destination with its credential copies, or an operator while another active owner remains. Monitor erasure requires typing the current monitor name. Each completed erasure returns a receipt with entity kind, per-table counts and completion time, and returns it only after the transaction containing the erasure, audit entry and portability fence succeeds. Requests based on stale monitor or destination state cannot re-create erased rows. The last active owner cannot be erased: local installations use `rer reset --yes`, while hosted installations require replacement by redeployment. Uptime has no R2 attachment feature; import-door uploads, plan snapshots and archive bytes are held in installation-local custody under the erasure rule in [Erasure and audit](docs/contract/safety-rules.md#erasure-and-audit). Already downloaded archives, messages already sent to external recipients and requests already in progress remain outside local erasure. See [Erasure and audit](docs/contract/safety-rules.md#erasure-and-audit).

**Acceptance.**
1. Erase each supported entity through the owner API, including stale concurrent requests and the original owner with a successor.
2. Inspect the atomic per-table receipt, audit and journal; the last owner is protected and an old archive with the later journal cannot resurrect erased records.

#### AUDIT-001 — Durable anonymized audit

**Requirement.** Destructive actions, automated notification attempts and operator authentication-mail sends also record the action, the subject kind and an opaque subject reference. Audit history is portable. The audit contains no monitor names, target URLs, email addresses or destination URLs. See [Erasure and audit](docs/contract/safety-rules.md#erasure-and-audit) and [Portability and retention](docs/contract/safety-rules.md#portability-and-retention).

**Acceptance.**
1. Perform destructive actions, notification attempts and authentication-mail attempts through public doors, erase an actor and round-trip an archive; inspect durable opaque subjects and anonymized actors without planted names, addresses, URLs or secrets.

#### PRESENCE-001 — Contact separate from health

**Requirement.** Only accepted scoped claims and signed results refresh server-time contact, the 120-second freshness threshold never proves process liveness or target health, and restart, unavailable reads and archive omission preserve that distinction. See [Contact, interface and delivery](docs/contract/safety-rules.md#contact-interface-and-delivery).

**Acceptance.**
1. Read Never seen, make accepted idle claims/results, age contact, reject foreign requests and restart.
2. Reads and health checks do not refresh contact; unavailable reads and restore cannot imply runner or target health.

#### INTERFACE-001 — Honest durable operator feedback

**Requirement.** Textual state/freshness/reasons, immutable history, labels, keyboard controls and responsive layout expose persisted evidence; failed reads show Unknown, action errors survive polling, busy reconciliation excludes controls and editing rejects assertion overrides. Accessibility is Base's one bar (BASE-ACCESSIBILITY-001); the human screen-reader pass and the VPAT are register rows. See [Contact, interface and delivery](docs/contract/safety-rules.md#contact-interface-and-delivery).

**Acceptance.**
1. Use the real owner console at 1440 and 390 with healthy, stale, failing and unavailable monitors; edit assertions, force read/action errors and polling, navigate by keyboard and inspect focus, text state, overflow, accessibility tree and axe results.

#### NOTIFY-001 — Authorized installation-wide destinations

**Requirement.** An owner may configure email, signed JSON webhook, or Slack incoming webhook destinations for all monitors in one installation; only scheduled incident transitions generate automatic notifications, and a test send cannot change monitor evidence or incident state. The hosted Worker submits email through the configured Base mail adapter and sends webhooks and Slack without a private runner; a private runner can also claim notification work. Webhook destinations also take WEBHOOK-001's configurable method, content type, custom headers and payload template. Destination credentials are installation-local and are not restored from archives. See [Contact, interface and delivery](docs/contract/safety-rules.md#contact-interface-and-delivery) and [Network and credentials](docs/contract/safety-rules.md#network-and-credentials).

**Acceptance.**
1. Create/rotate/disable email, Slack and signed webhook destinations, cause scheduled failure/recovery and a test send through actual Worker/runner delivery doors; inspect one job per enabled destination, credentials, exact signing, escaping and unchanged health for tests.

#### DELIVERY-001 — Bounded notification acknowledgment

**Requirement.** Each event and destination without receiver-side deduplication (email, Slack incoming webhooks and the other channels DELIVERY-002 names), every test send and every drill gets one automatic send attempt. A RER relay 429 with Retry-After confirms non-acceptance and queues another submission after that delay. For those sends HTTP 500, connection loss, timeout, and unknown outcomes remain uncertain and are not automatically sent again; deduplicating destinations retry and every route can fall back to another contact under DELIVERY-002. Accepted means the configured provider or endpoint acknowledged the request; it does not mean a person received, read, or acted on it. See [Contact, interface and delivery](docs/contract/safety-rules.md#contact-interface-and-delivery).

**Acceptance.**
1. At authorized provider edges return accepted, proven-unaccepted relay 429, HTTP 500, timeout and connection loss; restart during claims.
2. Only the proven-unaccepted case requeues automatically; uncertain started sends never replay and acceptance remains distinct from receipt.

#### PUBLIC-001 — Public landing and documentation

**Requirement.** At the app origin, `/` is the unauthenticated Lobby, `/docs` is public documentation, `/setup` is first-run setup, and the private operator console and editor are `/app` and `/app/monitor`; private documents require an owner session. The separate marketing site serves `https://run-uptime.com/` and `https://run-uptime.com/run`. The app Lobby at `/` and the marketing landing at the run-site `/` are distinct surfaces.

**Acceptance.**
1. Open app-origin Lobby, docs and setup signed out, then sign in for /app and /app/monitor; separately read the marketing site and /run.
2. Their routes remain distinct and private documents reject unsigned access.

#### BOUNDARY-001 — Monitoring ownership and honest delivery claims

**Requirement.** Uptime owns checks, evidence, routing, repeat reminders and monitoring reports. It feeds full paging and responder coordination to [Oncall](https://github.com/just-every/run-oncall), PagerDuty or Splunk On-Call, and public incidents, branded pages and subscriber updates to [Lamp](https://github.com/just-every/run-lamp) or Atlassian Statuspage. Teams, Discord, Telegram, SMS, voice and push are supported target channels under the clauses below. One network label is one vantage; provider acknowledgment never proves human receipt or response. Geographic placement, browser execution and accessibility require their own measured evidence.

**Acceptance.**
1. Configure an alert and a sibling handoff, inspect acknowledged/received/responded as separate facts and simulate lost probes/providers; no duplicate network labels, acknowledgment or missing evidence becomes a delivery or availability guarantee.

#### DRILL-001 — Recipient-reported alert drills

**Requirement.** An owner can run an alert drill on one destination: the existing test event with drill wording, sent once through the same path with no automatic resend, plus a one-time confirmation link (random capability, stored only as a bound hash, single use, 24-hour expiry, one drill and one destination). Opening the link shows a page; only a same-origin POST confirms, and unknown, used, expired and foreign links answer 404 alike. The console keeps Submitted, Acknowledged (or Uncertain/Failed with its code) and Recipient confirmed as separate lines, and does not measure whether anyone acted. A confirmed drill is a report by the recipient that one message reached a person at one time. It is never evidence of monitoring, a delivery guarantee or a human response, and it changes no monitor evidence, state or incident. Proof belongs to the destination's current credential: a new address or URL or a rotated secret makes it Never proven, and drill history stays with the installation, so a restored destination is Never proven. See [Alert drills](docs/contract/safety-rules.md#alert-drills).

**Acceptance.**
1. Drill email, Slack and signed webhook through the actual delivery runtime: GET/HEAD never confirm, same-origin POST confirms once, expired/replayed/foreign links refuse, 500 stays uncertain, rotation resets proof and archives/logs contain no capability or endpoint secret.

#### STARTUP-001 — Required configuration diagnostics

**Requirement.** A shared configuration table validates required and conditional bindings for the Worker, scheduled entry point, local app, preview, setup, deployment and private runner before each begins work. Missing or malformed required values stop the entry point and name the variable without printing its value; a Worker configuration failure returns 503, including at `/health`. Hosted mode requires the selected Base mail provider and its sender configuration. Supersedes `BASE-OPS-001`'s one-second health budget with the owner-approved three-second readiness response budget of 16 October 2026 (RL-2). See [Configuration diagnostics](docs/contract/safety-rules.md#configuration-diagnostics).

**Acceptance.**
1. Start each runtime entry point with required and conditional bindings missing/malformed; diagnostics name bindings without values and health returns 503.
2. Restore settings and recover; exercise D1/ASSETS faults inside the owner-approved three-second readiness response budget.

#### PUBLIC-002 — Declared sessionless paths and rate limits

**Requirement.** Every sessionless route and emitted static path is declared in `seed.json` with its authentication rule and rate-limit class. D1 applies owner-tunable per-client limits in fixed 60-second windows and returns 429 with `Retry-After` after the class limit. A declaration does not bypass route-specific session, runner, heartbeat or development-key checks. Limit values are marked estimated and not load-tested. See [Public paths and rate limits](docs/contract/safety-rules.md#public-paths-and-rate-limits) and [Integrity and authority](docs/contract/safety-rules.md#integrity-and-authority).

**Acceptance.**
1. Enumerate declared sessionless paths against emitted routes, exceed configured public limits, inspect Retry-After, and remove counter storage; each route retains its own authentication checks and admission fails closed.

#### FLOW-001 — Supported isolated browser transactions

**Requirement.** Login, signup and checkout are supported monitored customer paths with explicit intended outcomes, immutable revisions, safe synthetic accounts and scheduled consensus. A constrained editor and isolated Playwright execution share the same evidence and authority rules. Every required outcome must pass; missing browser/credentials is Unknown. Per-run process/profile isolation, sanitized environment, network filtering, hard time/byte limits and credential-origin binding apply to all scripts. An effect beyond an explicitly authorized synthetic transaction needs the owner's exact effect grant (API-004). A changed-definition recovery is labeled and never presented as proof of the original outcome. Support qualification covers independently placed real-browser vantages and the complete login, signup and sandbox checkout outcomes. Reusable scripts and fixtures are required under FLOW-002, failure artifacts under FLOW-003, browser/device coverage under FLOW-004, and setup/teardown and effects grants under API-004; secret-bearing grants require ACCESS-003 second-factor step-up, and reports spanning migrated history require HISTORY-001 source segments. FLOW-001 is done only when its own acceptance and each of these dependent clauses are done.

**Acceptance.**
1. Configure supported login, signup and sandbox checkout journeys, run independent real-browser vantages, break required outcomes and recover through signed results.
2. Wrong credentials, missing elements, server errors, slow pages, private redirects/subresources, extra origins and absent browsers have distinct retained outcomes; weakened definitions cannot silently clear the original incident.

## Target clauses

### Monitors and checks

#### MONITOR-001 — Owned monitor catalog and lifecycle

*Tier:* Core · *Register:* R-2

**Requirement.** An operator organizes monitors by project, environment, service, tags, owner and dependencies; bulk create/edit/pause/resume/clone/search/filter preserve revision and incident history. Every monitor names its intended customer outcome, schedule, locations, assertions, maintenance and alert policy. Pausing never erases downtime. Bulk add takes a pasted list of URLs (one per line) or an uploaded CSV of up to 500 rows. The CSV has a `url` column and optional `name`, `type`, `keyword`, `interval`, `tags` and `group` columns. Settings shared across the batch (type, interval, locations, alert route, tags) fill whatever the rows leave out. A preview without writes marks each row as create, duplicate of an existing monitor, or refused with its reason (an invalid URL, a forbidden destination under NETWORK-001 or a quota). It also shows COST-001's projected traffic and cost. Apply creates the accepted rows in one transaction, as one IMPORT-001-style undoable batch. The monitors start paused unless the owner chooses "enable after create" in the reviewed preview.

**Acceptance.**
1. Create production/staging monitors in the console/API, bulk change a selected tag, clone one, pause/resume another and compare revision, ownership and incident history before/after.
2. Paste 50 URLs, including a duplicate, an invalid URL and a private address, with a shared 60-second interval, two locations and a route.
3. The preview marks 47 creates, 1 duplicate and 2 refusals with reasons.
4. Apply with "enable after create" and see 47 monitors checking on their first slot.
5. Undo the batch, and a CSV upload with per-row names and tags produces the same plan.

#### API-001 — Complete HTTP and API assertions

*Tier:* Core

**Requirement.** HTTP(S) methods, safe redirects, custom headers/body, expected status sets/ranges, keyword presence and absence, response headers, latency, nested JSONPath and regular-expression assertions evaluate the exact saved bundle with bounded redacted diagnostics. A transport 200 cannot pass a failed business assertion.

**Acceptance.**
1. Save checks through the editor/API against a controlled endpoint; independently break absent/present keywords, status range, response headers, JSON arrays/nested paths, regex and latency, then inspect the distinct failures and unchanged saved criteria.

#### SLOW-001 — Slow-response alerts distinct from outages

*Tier:* Core

**Requirement.** A monitor can set a slow threshold, separate from any API-001 latency assertion: a response time over N consecutive slots, or a percentile over a window, per location or across locations. Crossing it opens a Slow degradation event with its own route, contacts and notices under ROUTING-001/ROUTING-002, plus a slow-recovered notice. A Slow event is not an incident: it does not count as downtime in availability or SLA figures, and REPORT-001 reports it as slow time. A latency assertion stays a failure for buyers who want slowness to count as down. Pingdom `responsetime_threshold` and Site24x7 static greater-than response-time thresholds with consecutive poll-count rules map onto Slow during migration. Site24x7 AI, average/time-window and percentile strategies explicitly refuse conversion and require an owner-set local policy. Better Stack’s [public Uptime API monitor schema](https://betterstack.com/docs/uptime/api/create-a-new-monitor/) exposes `request_timeout`, a transport failure timeout, and no separate slow-threshold field. A Better Stack `request_timeout` maps only to the transport timeout, never to Slow; cutover asks the owner to set a slow threshold explicitly. Uptime retains the full consecutive/percentile, per-location/across-location Slow capability.

**Acceptance.**
1. Set a 2,000 ms slow threshold over 3 slots on a controlled endpoint and slow it to 3,000 ms.
2. A Slow notice reaches its route, no incident opens, uptime is unchanged and the report shows slow time.
3. Recover and see the slow-recovered notice.
4. A latency assertion on another monitor still fails that monitor as down.

#### API-002 — Authenticated monitoring and secret lifecycle

*Tier:* Core · *Cites:* BASE-SECRET-001

**Requirement.** Basic, HTTP Digest and bearer, OAuth 2.0 acquisition/refresh, JWT signing and mTLS client certificates use owner-authorized secret references, least scope, expiry/rotation and exact origins. Test accounts and credentials remain under installation/runner custody; auth errors remain distinguishable from application failures and secrets never enter evidence or exports.

**Acceptance.**
1. Use each authentication mode against an authorized endpoint, expire/rotate/revoke it and redirect cross-origin; show expected failure/recovery, refusal of foreign references and no planted secret in storage, logs, browser artifacts or archives.

#### API-003 — Multi-step API transactions

*Tier:* Core

**Requirement.** A scheduled backend transaction shares scoped authentication, variables and extracted response values across ordered requests, asserts each business outcome and records per-step timing. Setup, failure and cleanup remain visible; a later success cannot erase an earlier failed requirement.

**Acceptance.**
1. Create a login/create/read/delete API journey through the supported configuration door, fail a middle assertion and expire shared auth, then inspect step history and cleanup without leaking extracted secrets.

#### API-004 — Safe setup and teardown

*Tier:* Core

**Requirement.** Browser and API journeys run bounded setup/teardown fixtures using synthetic accounts, Stripe test mode and buyer sandbox resources; cleanup runs after failure or cancellation and leaves durable actionable cleanup debt when it cannot complete. Live purchases, destructive writes or refunds require an exact time-limited grant and spend limit. Setup and cleanup steps make at most 3 attempts inside the wall time and a reserved cleanup share, and the count is retained per step; request steps are never replayed. A browser flow's optional setup and teardown fixtures use the API step vocabulary, engine, origin and network controls, and extracted values stay on the runner. A cancellation stops the journey, still runs cleanup and is recorded as cancelled (Unknown), never a pass; teardown never changes a browser verdict. A cleanup step that cannot complete (denied at the network edge, out of attempts, or missing a value the target reported creating) is a visible cleanup failure and leaves one retained cleanup debt naming the monitor, revision, slot, attempt, step, attempt count, last failure category and created time, with its open or resolved state and resolution note and time; it holds no extracted value, credential or response body, travels in archives and is removed by monitor erasure. Open debt is separate from monitor health: it never makes a failing target Healthy or a healthy one Failed. At 3 open debts for a monitor the next run refuses new setup and reads Unknown with the named reason; only the owner's explicit, idempotent and audited resolution closes debt, never a later passing run. A step is live when the owner marks its effect (`live-payment`, `refund`, `destructive-write`), it is a refund, anything it sends has a Stripe live-mode key shape, or its response says `livemode: true`; it is refused (runner category `grant`, nothing sent except for a live response) unless an active grant names the monitor and effect, with an expiry within 24 hours and an integer spend limit (a request spends its integer `amount`, at least 1), rechecked on every attempt. Grants are revisioned, audited and installation-local; the default is no grant. Stripe test mode and the buyer's sandbox resources need none.

**Acceptance.**
1. Run a sandbox checkout with setup/teardown, cancel mid-flow and deny cleanup at the network edge; inspect bounded attempts, retained cleanup failure and explicit operator resolution without a live charge.

#### TCP-001 — TCP service checks

*Tier:* Core

**Requirement.** TCP monitors test a chosen host/port, handshake latency and optional bounded banner from selected locations with the same confirmation, evidence and alert policy as HTTP. Refused connections, timeout and probe failure remain distinct.

**Acceptance.**
1. Create a TCP monitor through the console/API; open, close and blackhole an authorized port from two locations, then read evidence and trigger/recovery events.

#### PING-001 — ICMP reachability and packet quality

*Tier:* Core

**Requirement.** ICMP ping monitors retain bounded packet loss, round-trip latency and configured thresholds by location for IPv4/IPv6. ICMP blocked by policy is shown explicitly rather than inferred from HTTP success.

**Acceptance.**
1. Configure a ping target, vary loss and latency, disable ICMP and stop a probe; inspect protocol-specific results and Unknown probe coverage.

#### DNS-001 — DNS records and change detection

*Tier:* Core

**Requirement.** Checks query selected recursive and authoritative resolvers for A, AAAA, CNAME, MX, TXT, NS, SOA, SRV and CAA records, expected values, absence/change and response time. NXDOMAIN, SERVFAIL, propagation differences and monitor infrastructure faults are distinguishable; owner-approved expected changes suppress only their own condition.

**Acceptance.**
1. Save DNS monitors via the owner door, change/remove an expected record and induce resolver disagreement/failure; inspect raw bounded record evidence, confirmed alerts, maintenance and recovery without treating a missing answer as success.

#### TLS-001 — SSL certificate and chain monitoring

*Tier:* Core

**Requirement.** TLS checks verify hostname/SNI, certificate chain/trust, validity, expiry and renewal on HTTPS or configured TLS ports from each location. Staged configurable expiry warnings name the certificate and accountable owner, track renewal and resolve only after a newly observed valid chain.

**Acceptance.**
1. Monitor a controlled TLS service; present an expiring certificate, broken chain, wrong name and then renewed certificate, advance the clock and inspect deduplicated warnings, location evidence and renewal resolution.

#### DOMAIN-001 — Domain registration expiry

*Tier:* Core

**Requirement.** Domain monitors use RDAP and authorized registrar/WHOIS data, retain source/freshness, warn the owner before registration expiry and follow through until renewal is independently observed. Redacted, unavailable or conflicting registry data is Unknown; certificate renewal is not domain renewal.

**Acceptance.**
1. Add a domain in the console, drive authorized registry-edge responses through approaching expiry, unavailable data, conflicting dates and renewal; inspect distinct warnings, source times and resolved follow-up.

#### UDP-001 — UDP request and response checks

*Tier:* Core

**Requirement.** Bounded UDP checks validate configured payload/response and timing on an authorized host/port with anti-abuse traffic limits and location consensus. No response is not treated as proof of an open port.

**Acceptance.**
1. Create a UDP monitor, return matching/mismatching payloads, drop packets and remove probe authority; inspect timeout versus assertion versus runner failures and bounded outbound traffic.

#### MAIL-001 — SMTP and mailbox protocol checks

*Tier:* Core

**Requirement.** SMTP/STARTTLS, POP3/POP3S and IMAP/IMAPS checks verify connection, TLS, banner, authentication and optional synthetic send/receive transaction with a dedicated test mailbox. Message IDs, timing and cleanup are retained without mailbox content or passwords; a successful SMTP accept is distinct from mailbox receipt.

**Acceptance.**
1. Configure each protocol via the owner door against authorized mail edges, break authentication/TLS and delay receipt; inspect per-step alerts, receiver confirmation and removal of synthetic messages.

#### NETWORK-002 — Explicit TLS trust exceptions for legacy targets

*Tier:* Core

**Requirement.** For self-signed, private-CA or legacy targets, a monitor can pin a buyer-supplied CA certificate or a leaf-certificate SHA-256 fingerprint (the preferred option). It can instead set an explicit per-monitor "ignore certificate errors" option, which an owner enables after a warning. Either exception is labeled on the monitor and in its evidence, and each slot records the TLS error it bypassed. An exception never applies after a redirect to another origin, and request credentials (API-002) are never sent to an unverified certificate unless that monitor's owner has granted it separately. TLS-001 still reports the certificate truthfully, and NETWORK-001's full verification remains the default. UptimeRobot's "ignore SSL errors" setting and its Pingdom equivalent import onto this option and are named in the preview.

**Acceptance.**
1. Against a controlled self-signed target, see the default check fail with a TLS error, then pass with a pinned fingerprint and with the ignore option.
2. Rotate the certificate and see the pinned monitor fail.
3. Follow a cross-origin redirect and see verification enforced.
4. Inspect the labels and the bypassed-error evidence, and import an UptimeRobot monitor with "ignore SSL errors" set and see the option in the preview.

### Job heartbeats

#### HEARTBEAT-002 — Cron and job heartbeat schedules

*Tier:* Core · *Register:* R-2

**Requirement.** A buyer monitors a scheduled job by choosing either an expected period (30 seconds to 31 days) or a five-field cron expression with an IANA time zone (US zones offered first, daylight-saving gaps and repeats handled explicitly), plus a grace period (0 seconds to 24 hours). A run is missed when no success ping arrives by its expected time plus grace: the scheduled evaluation due at that instant confirms Failing, never earlier, and a later success recovers it labeled as a late run. The job can report its own failure without waiting for the window: a `/fail` or `/fail/<exit code>` ping schedules an immediate evaluation, so the incident opens within SCHEDULE-002's alert bound with the exit code and a bounded redacted output excerpt (request body up to 10 KiB, owner masks and EVIDENCE-002 secret patterns applied); a later success recovers it. An optional `/start` ping measures run duration: a run exceeding the owner's maximum duration alerts as Running too long, a start with no finish is a missed run, and every completed run's duration appears in history and REPORT-001.

**Acceptance.**
1. Through the console and API configure `0 2 * * *` in America/New_York with 15-minute grace; skip one run and see the alert open at 02:15 local time and not before, including across a DST change.
2. Send `/fail/3` with output containing a planted token and see an immediate incident naming exit code 3 with the token masked, then recover with a success.
3. Send `/start`, then success after 40 minutes against a 30-minute maximum, and see Running too long plus the recorded duration.

#### HEARTBEAT-003 — Heartbeat receipt forms and scheduler snippets

*Tier:* Core · *From:* HEARTBEAT-002

**Requirement.** Receipts accept GET, HEAD and POST so curl, wget, PowerShell and HTTP-only schedulers work, either through a URL-capability form (rotatable, hashed at rest, rate-limited and labeled replay-unprotected, matching incumbent heartbeat URLs) or the sequence-protected header form; both keep HEARTBEAT-001's revision, ingress and import rules, and no ping by itself establishes Healthy. The console and API generate copy-paste snippets for crontab, curl/wget, systemd timers, Kubernetes CronJob, GitHub Actions and Windows Task Scheduler that wrap a command so start, success and failure with exit code are all reported.

**Acceptance.**
1. Receive GET, HEAD and POST pings.
2. Run each generated snippet unmodified against a real shell or scheduler edge.
3. Rotate the URL and prove the old URL, a replayed header sequence and an imported receipt cannot establish Healthy.

#### HEARTBEAT-004 — Heartbeat settings from incumbents

*Tier:* Core · *From:* HEARTBEAT-002 · *Register:* R-3

**Requirement.** Heartbeat migration uses documented source settings through the MIGRATE clauses, with newly issued Uptime URLs. [UptimeRobot](https://github.com/uptimerobot/ai/blob/main/skills/create-heartbeat-monitor/SKILL.md) `interval` and `gracePeriod` (seconds) map to Uptime period and grace; [Better Stack](https://betterstack.com/docs/uptime/api/create-a-hearbeat/) `period` and `grace` (seconds) map directly. Source alert contacts, delays/repeats and escalation settings are reviewed under the migration and routing clauses, never treated as grace. [Site24x7 heartbeats](https://www.site24x7.com/help/heartbeat/index.html) document no separate period/grace pair: their threshold profile sets late-ping Trouble and Down deadlines and an early-ping Trouble threshold. MIGRATE-004 requires the owner to choose an explicit local period and grace whose sum preserves the selected missed-ping deadline, and names any Trouble/early-ping behavior requiring a separate policy rather than silently converting it. [Pingdom’s documented check types](https://docs.pingdom.com/api/) contain no heartbeat, cron or push check: Pingdom has no heartbeat check; nothing to migrate. These source limits do not reduce Uptime’s cron, IANA/DST, receipt, period or grace capabilities.

**Acceptance.**
1. For UptimeRobot, preview `interval: 3600` and `gracePeriod: 300`; for Better Stack, preview `period: 3600` and `grace: 300`.
2. Each becomes a paused 60-minute period plus 5-minute grace, discards source URL authority, and after owner activation with a new URL fails only at the 65-minute deadline and recovers on a late success.
3. Reconcile each source’s alert settings separately.
4. For Site24x7, review a 10-minute Trouble and 30-minute Down threshold plus an early-ping threshold; an owner-selected 25-minute period and 5-minute grace preserves the Down deadline, and the preview names Trouble and early-ping differences for explicit policy review.
5. No Pingdom heartbeat entry or invented field is requested.

### Schedules, locations and maintenance

#### SCHEDULE-001 — Explicit cadence, retries and confirmation

*Tier:* Core

**Requirement.** Each revision records interval, timeout, retry budget, freshness, failure/recovery slot thresholds, fixed selected probes and assignments. Scheduled work cannot count retries as independent slots, invent missed checks or let manual runs alter cadence. Outages shorter than the sampling interval may be missed; SCHEDULE-002 sets the interval floor, on-time rate and alert latency.

**Acceptance.**
1. Save a cadence through the API/CLI, run retries, delay claims, edit the interval and make a manual pass; inspect due times, fixed coverage and incident thresholds through history.

#### SCHEDULE-002 — Interval floor, on-time execution and alert latency

*Tier:* Core · *Register:* R-1, R-2

**Requirement.** Every protocol monitor (HTTP/API, keyword, TCP, ping, DNS, UDP, mail and heartbeat) can run every 30 seconds from each selected managed location, with 60 seconds as the default; TLS and domain expiry checks run at least hourly and browser transactions as often as every minute. A plan or budget that imposes a slower floor shows it before activation under COST-001. Cadence holds at scale: with 500 monitors at 30 seconds from three locations in one workspace, at least 99% of slots per location are claimed within 5 seconds of their due time and 99.9% within 15 seconds over any hour. Each location's on-time rate and lag distribution is visible in the console and METRICS-001, and a late or missed slot is recorded as such and counts as Unknown rather than being skipped silently. From the commit of the observation that confirms an incident to the first delivery attempt for every routed destination takes at most 10 seconds at p99, excluding and showing any ROUTING-002 delay. The editor shows each monitor's worst-case detection time for its saved settings (confirmation slots × interval + timeout + retry budget + the alert bound). Capacity or quota shortfall is visible and halts or labels work under COST-001; it never quietly stretches an interval.

**Acceptance.**
1. Through the public API create 500 monitors at 30 seconds from three managed locations against controlled targets and run them for at least one hour; compute claim lag from stored slot records and compare it with the console and metrics figures.
2. Fail a target and measure from the confirming observation's commit time to each destination's first attempt start.
3. Remove one location's capacity and see late or missed slots reported and coverage turn Unknown; reach a quota and see named halted work rather than a longer interval; compare the editor's detection-time figure with the measured outage-to-alert time.

#### PROBE-001 — US and global independent locations

*Tier:* Core · *Register:* R-1

**Requirement.** Buyers select managed US East, Central and West plus Europe and Asia-Pacific locations, see operator/network/region identity and IPv4/IPv6 coverage, and configure duration/location consensus. A lone network blip never fires a confirmed outage; independent target observations or an independently passing canary corroborate it. Probe health and regional partial failure remain visible; no label pretends to be physical independence.

**Acceptance.**
1. Run an authorized public target from real US and global locations, break only one probe network and then the target, stop a region and recover.
2. Inspect independent network evidence, Degraded/Unknown coverage and confirmed trigger/recovery.

#### PROBE-002 — Published probe addresses and identification

*Tier:* Core · *Register:* R-1

**Requirement.** Every managed location sends checks from stable dedicated egress addresses. Uptime publishes each location's IPv4 and IPv6 list as plain-text and JSON files, as DNS A/AAAA records under a documented name per location plus one all-locations name, and through an unauthenticated machine-readable API that always returns the current list with a version and effective date; the console also shows the subset a buyer's own monitors use. Address additions and removals are announced at least 30 days ahead by email to owners, a changelog/RSS feed and a `pending` section of the API, and a new address carries checks only after that notice period; an emergency change is labeled as such with its reason. Every hosted request carries a documented User-Agent naming Uptime, its version, a probe documentation URL and an opaque monitor reference, plus an optional per-installation secret header buyers can match in Cloudflare, AWS WAF, Akamai or origin bot rules; the header follows NETWORK-001's credential rules and is stripped on cross-origin redirects. The current Cloudflare Worker vantage uses shared egress with no dedicated address: until it moves behind published egress the console labels it not allowlistable and offers a published location instead. Private runners (PRIVATE-001) report their own observed egress address.

**Acceptance.**
1. From each managed location run a real check against an authorized target that logs source address, User-Agent and header; every observed source appears in that location's published file, DNS answer and API list, and no unpublished address appears.
2. Allowlist only the published addresses at a controlled WAF and see every location pass.
3. Stage an address change and verify the notice, pending entry and 30-day hold before the new address carries checks; redirect cross-origin and prove the secret header is not forwarded; inspect the Worker vantage's not-allowlistable label.

#### PRIVATE-001 — Buyer-network private locations

*Tier:* Core

**Requirement.** Scoped buyer-owned runners monitor allowlisted intranet/VPC services with outbound-only control-plane access, revocable identity, capacity/upgrade/health visibility and secret locality. Explicit per-runner private hostname/CIDR/port grants are separate from public probes; metadata and management endpoints remain blocked. Datadog private-location users can deploy equivalent Uptime runners beside existing agents without forwarding Datadog credentials or misrepresenting its probes as ours.

**Acceptance.**
1. Enroll a runner in an authorized private network, grant one service, execute HTTP/TCP/browser checks, then revoke it.
2. Unauthorized neighbors, metadata, redirected private addresses and public-runner use of the grant refuse without connecting.

#### MAINT-001 — Planned and recurring maintenance

*Tier:* Core

**Requirement.** One-time and recurring windows target monitors/groups with US time zones, daylight-saving handling, preview and audit. Buyers choose notification suppression or execution pause explicitly; reports show maintenance separately and retain denominator and underlying observations. Expiry re-evaluates actual evidence and cannot emit orphan recovery.

**Acceptance.**
1. Schedule a New York recurring maintenance window across a DST transition and a one-time group window; fail a monitor during each, restart, end/cancel the window and inspect preserved results, suppression and reports.

### Reports, evidence and diagnosis

#### REPORT-001 — Latency, uptime and SLA reporting

*Tier:* Core

**Requirement.** Per-monitor/service/location charts show response-time percentiles, availability, outage duration, incident timelines and SLA/SLO attainment for buyer-chosen periods and US time zones. Export CSV/JSON/PDF and schedule email/Slack reports to authorized recipients; the same figures are available through READAPI-002's authenticated API, computed by the same code, for the same period, time zone and denominator. Incident lists and SLA reports can be filtered and grouped by INCIDENT-003 root-cause category, with incident count and downtime per category. Unknown, partial, paused and maintenance time and denominator policy are visible. Incumbent history imported under HISTORY-001 appears as a labeled source segment with its own denominator, next to Uptime's own slots and a blended cross-cutover figure naming both sources; it cannot improve current health. SLOW-001 slow time is reported apart from downtime.

**Acceptance.**
1. Cause known failures, gaps, slow responses, maintenance and revisions; compare custom-period charts and downloaded reports to immutable slots, schedule a report, fail delivery and inspect its durable outcome.
2. A report spanning a HISTORY-001 cutover shows the source and Uptime segments with their own denominators.
3. A report filtered by an INCIDENT-003 root-cause category lists exactly the incidents with that category.
4. Each downloaded report's figures equal READAPI-002's for the same period.

#### EVIDENCE-002 — Failure snapshot and incident report

*Tier:* Core

**Requirement.** Every failing attempt keeps an incident-report snapshot: the request actually sent (method, final URL, redirect chain and header names, with values redacted unless the owner marks them safe), response status, response headers and timing phases, and a bounded excerpt of the returned body (the first 16 KiB as text, shown only as escaped text or in a sandboxed no-script preview), so an operator sees the Cloudflare 52x page, maintenance page or stack trace the probe received. Before storage the excerpt passes owner masks plus built-in secret patterns (authorization values, cookies, API keys, card numbers, and email addresses unless allowed), and planted request secrets never appear. For HTTP and keyword checks the buyer can enable a screenshot of the failing page, taken by an isolated browser under FLOW-001's network rules. Incident detail combines these with a plain-language cause (for example, HTTP 503 from 2 of 3 locations whose body reads Service Unavailable), per-location results, DIAG-001 diagnostics and the activity log. Snapshots are stored apart from observations under owner-set retention (default 90 days), readable only by roles with evidence access, carried in archives, exported with their incident and erased with their monitor or on owner request with a receipt. They never alter a verdict, and alerts carry only a cause line and an authenticated link to them.

**Acceptance.**
1. Fail an HTTP monitor against a controlled endpoint returning a 503 HTML page containing a planted API key, cookie and email address; as owner open incident detail and see the request, status, headers, page excerpt and screenshot with planted values masked.
2. Open it as an unauthorized role and signed out and be refused; export the incident and round-trip an archive; erase the monitor and confirm the snapshot and its copies are gone with a receipt; inspect the alert for only the cause line and link.

#### DIAG-001 — Connection and network diagnostics

*Tier:* Core · *Register:* R-1

**Requirement.** A confirmed timeout, connection refusal or reset, DNS failure or TLS failure automatically collects bounded traceroute/MTR, DNS, TCP and TLS phase timings from authorized probe locations, retains hop loss/latency, compares healthy regions and attaches the result to the EVIDENCE-002 incident report. Redaction and traffic caps apply; blocked diagnostics are explicitly unavailable and never alter the monitor verdict.

**Acceptance.**
1. Trigger a controlled route/connect timeout and a refused connection, open diagnostics from incident detail and compare two locations with one ICMP-blocked path; inspect bounded artifacts, visible unavailable reason and unchanged incident.

#### PERF-001 — Page speed and real-user performance

*Tier:* Core · *Cites:* BASE-PUBLIC-001

**Requirement.** Synthetic page-speed checks retain DNS/connect/TLS/TTFB, resource waterfall and Core Web Vitals budgets. An optional consent-aware browser beacon measures real-user availability/performance by route, device and region with sampling, privacy exclusions and bot filtering; RUM and synthetic denominators remain distinct. Buyers can find a slow mobile checkout despite a healthy health endpoint.

**Acceptance.**
1. Configure a page-speed monitor and consented beacon on a controlled site, throttle mobile assets and produce a browser error; inspect waterfall, budget alert, privacy/sampling settings and separate RUM versus synthetic reports.

### Dependencies and discovery

#### DEPENDENCY-001 — External dependency checks

*Tier:* Core

**Requirement.** Read-only discovery proposes third-party status components or public status endpoints as separate monitors with source attribution and reviewed assertions. Statuspage-compatible sources retain the overall-status proposal and offer bounded component proposals keyed by component ID, unticked by default. Adopted monitors retain the provider name as `service`, a `dependency` tag and an `outcome` line identifying the status as the provider's own claim. That claim is contextual evidence, never proof that the buyer application is up or down. A failed provider component is an ordinary separate monitor with its own state and ordinary scheduled incident policy; it never changes any application monitor's state, revisions, evidence, routes or incident thresholds. DEPENDENCY-002 inherits these attribution and separation rules and may replace the ordinary incident default with dependency notices that open no Uptime incident; correlation belongs to FOLLOWUP-001. The owner reviews and changes the component before adoption by selecting another proposal, or after adoption by editing the monitor as an ordinary immutable revision. A component’s `group` retains its reviewed name; switching components updates the name, `group` and component-ID assertion together. A renamed or removed component, or a status source that stops answering, is missing/Unknown evidence, never Healthy.

**Acceptance.**
1. Discover a linked provider status page through the real runner, review/adopt its overall and one component proposal through the owner monitor door, then switch the component through an ordinary revision.
2. Fail the selected component with scheduled signed-runner evidence and inspect the separate provider monitor's failure and named source while the application monitor's state, revisions and evidence remain unchanged; remove the component and inspect Unknown/missing evidence.

#### DEPENDENCY-002 — Third-party service catalog

*Tier:* Core · *Cites:* BASE-DATA-004

**Requirement.** An owner can add a named third-party provider directly from a searchable catalog, without running discovery. The catalog covers at least the providers US small businesses commonly depend on: AWS, Google Cloud, Microsoft Azure and Microsoft 365, Cloudflare, Stripe, PayPal, Square, Shopify, GitHub, Vercel, Netlify, Twilio, SendGrid, Mailgun, Slack, Zoom, Atlassian, OpenAI, Anthropic, Okta, Auth0, DigitalOcean and Fastly. Each entry names the provider's official status source (a Statuspage-compatible JSON API, RSS/Atom feed or status page) and its components and regions. The owner can follow the whole provider or chosen components, such as Stripe API or AWS us-east-1 EC2. A followed service becomes a dependency monitor inheriting DEPENDENCY-001's attribution, contextual-evidence and separation rules; this clause replaces its ordinary separate-monitor incident default with dependency notices that open no Uptime incident. The provider's stated status is attributed contextual evidence, is never proof that the buyer's application is up or down, and never changes an application monitor's state. Provider incidents and recoveries notify through the owner's chosen ROUTING-001 route as dependency notices, not as Uptime incidents. They appear beside correlated application incidents under FOLLOWUP-001, and AGENT-002 can cite them. A dependency the owner links to a monitor, service or group (MONITOR-001) shows as linked and qualifies for grouped acknowledgment. An unlinked provider incident that overlaps in time shows only as contextual coincidence and never groups acknowledgment. Following an entry first checks its status source live; a failing source is marked needs review. An owner can add a provider not in the catalog by giving its status page URL, which goes through DEPENDENCY-001's reviewed proposal. Catalog entries are versioned and reviewed when a provider moves its status source. A source that stops answering makes that dependency Unknown, never operational. UptimeRobot, Better Stack and Site24x7 third-party service monitors map onto catalog entries during migration. An explicitly reviewed Auth0 follow sends only the named tenant domain to Auth0's fixed official status endpoint, and that egress is disclosed before the owner confirms the follow; an unusable or ambiguous provider source, such as a free-text feed with no status field, stays Unknown and no status is inferred from it (RL-101).

**Acceptance.**
1. Search the catalog for Stripe and add it with only the API component followed, then add AWS us-east-1.
2. At an authorized status-source edge, report a Stripe API incident: a dependency notice reaches the chosen route, no Uptime incident opens, and the application monitor's state is unchanged.
3. Fail the application at the same time and see the correlated dependency on its incident.
4. Make the status source unreachable and see the dependency turn Unknown.
5. Recover the provider and see the recovery notice.
6. Import an UptimeRobot account that follows Stripe and AWS and see both mapped onto catalog entries.
7. Overlap an unlinked provider incident and see it labelled coincident, outside the group.
8. Import a Better Stack and a Site24x7 account with third-party monitors and see them mapped, or the clause cites the public API showing no such field and the import refuses conversion.

#### DISCOVERY-001 — Reviewed automatic endpoint discovery

*Tier:* Core · *Cites:* BASE-DATA-004 · *Register:* R-7

**Requirement.** Read-only discovery combines DNS/authorized Route 53 or Cloudflare zones, robots/sitemaps, OpenAPI specifications and GitHub Actions, Vercel, Netlify and AWS CodeDeploy deployment events to propose HTTP/API/protocol/browser monitors. It shows source, intended outcome, duplicates, expected traffic/cost, locations and credential needs. Expected cost is COST-001's projected monitor-run, probe and browser-minute usage priced in USD; until COST-001 publishes prices it shows as Unknown. Rediscovery is owner-started and diffs against the previous run and current definitions; continuous upkeep is AGENT-001's. Buyers review targets, grants, budgets and activation in each proposal before they adopt it; an agent's adoption is a live call the company's policy decides. Discovery never sends mutating customer requests or silently enables traffic.

**Acceptance.**
1. Authorize a domain/spec/deploy source through the owner door, discover a new route and removed endpoint, review proposals and reject one; inspect provenance/deduplication and prove only explicitly adopted monitors run.

### Browser transactions

#### FLOW-002 — Reusable Playwright monitoring as code

*Tier:* Core

**Requirement.** Buyers import and version real Playwright scripts, test suites and fixtures for login, signup and checkout alongside API checks, with dependency locks, selected secrets, setup/teardown and safe effects grants. Each run is isolated outside ordinary Worker requests; scripts cannot bypass destination or resource controls. Editor and code revisions expose the same required outcomes.

**Acceptance.**
1. Import a real Playwright suite via CLI/GitHub Actions, preview and deploy it, then break a fixture, assertion and forbidden network call; scheduled runs preserve intended outcomes, isolation and reviewable revision history.

#### FLOW-003 — Useful and safe browser failure artifacts

*Tier:* Core

**Requirement.** Failed steps retain redacted screenshots, Playwright traces, video replay, console errors, network/timing waterfalls and step durations tied to the immutable run. Owner-defined masks, no secret-bearing headers/bodies and bounded retention/export/access prevent synthetic credentials or personal data leaking into artifacts. Artifact-generation failure is visible and cannot hide the check failure.

**Acceptance.**
1. Break sandbox checkout, inspect screenshot/video/trace/waterfall through authenticated incident detail, deny artifact storage and try an unauthorized download.
2. Planted secrets/masked fields never appear; retained artifact failures and erasure are visible.

#### FLOW-004 — Cross-browser and mobile transactions

*Tier:* Core

**Requirement.** A buyer selects Chromium, Firefox or WebKit and desktop/mobile viewport/device profiles per journey; reports and consensus preserve that browser/device dimension. Missing browser capacity stays Unknown. Native iOS/Android app testing is a separate device-testing integration; mobile web paths are Uptime checks.

**Acceptance.**
1. Deploy the same checkout to all three browsers and a 390-pixel mobile profile, introduce a mobile-only failure and remove one browser; inspect per-profile failures and Unknown capacity without averaging them into success.

### Alert routing and delivery

#### ROUTING-001 — Monitor, service and team alert routing

*Tier:* Core

**Requirement.** Route confirmed alerts by monitor/group, environment, severity, region, incident origin, team and US business/quiet hours; select multiple contacts with explicit inheritance, preview and test. Destination secrets stay installation-local and routing changes are auditable. A paused or disabled contact cannot silently count as covered. Per-contact delay and repeat are ROUTING-002's; retry and fallback contacts are DELIVERY-002's. The route's quiet-hour policy applies to every contact on the route, fallback contacts included. Team recipients, filters and quiet holds follow the rules in [Routing filters](docs/contract/safety-rules.md#routing-filters-routing-001).

**Acceptance.**
1. Configure two teams and production/staging routes through the UI/API; trigger each class inside/outside quiet hours, rotate a destination and inspect selected/excluded recipients and drill outcomes.

#### ROUTING-002 — Per-contact alert delay and repeat

*Tier:* Core

**Requirement.** Each monitor, group or route sets, per contact, notify after X minutes down (0 minutes to 24 hours), repeat every Y minutes while down (off, or 1 minute to 24 hours, with an optional maximum count) and whether that contact receives recovery notices. A delayed contact is notified only if the same incident is still open when its delay elapses; a recovery inside the delay sends that contact nothing, including no recovery notice. Repeats are FOLLOWUP-001 reminder events with the incident's stable identity, stop on recovery or under the selected acknowledgment policy and never replay an uncertain send. Delays and repeats count from confirmation time, survive restart, appear in the route preview (for example, Slack now, SMS at +10 minutes, repeat every 30 minutes) and map from UptimeRobot's per-contact threshold and recurrence and Pingdom's notify-after and repeat settings.

**Acceptance.**
1. Configure Slack at 0 minutes and SMS at +10 minutes with a 30-minute repeat; confirm an outage and see Slack at confirmation, SMS only at +10 minutes and a repeat at +40.
2. In a second outage recover at +5 minutes and see no SMS and no SMS recovery notice; restart the Worker between confirmation and +10 minutes and see exactly one SMS; import an UptimeRobot monitor with threshold and recurrence and see the same schedule in the preview.

#### DELIVERY-002 — Deduplicated retry and fallback contacts

*Tier:* Core · *Cites:* BASE-OPS-003

**Requirement.** Destinations that deduplicate on Uptime's stable key — PagerDuty Events API v2 `dedup_key`, Oncall and Lamp idempotency keys, Splunk On-Call incident keys and signed webhooks carrying a stable event ID — retry an uncertain or retryable send (HTTP 5xx, 429, connection loss or timeout) with bounded exponential backoff and jitter (by default up to 6 attempts over 10 minutes, honoring Retry-After; the installation owner can set both limits). Jitter is bounded to 20% and comes from an injectable source. A Retry-After longer than the remaining retry window ends the delivery as Failed with reason `retry window exhausted` and starts its fallback. Those retries continue reusing the same key so the receiver records one incident; a 4xx other than 429 stops immediately and is shown with its code. Destinations without receiver deduplication (email, Slack incoming webhooks, Teams, Discord, Telegram, Google Chat, Mattermost, SMS and voice) keep DELIVERY-001's single attempt. Each route can name a fallback contact chain: when a contact's send is Failed, or still Uncertain past an owner-set deadline (default 2 minutes), the next contact receives the alert with a line naming the failed or uncertain primary, and the console shows both outcomes. Test sends and drills keep one attempt and never start a fallback chain. A fallback contact's own saved delay holds its send from confirmation, through restart. A fallback contact is notified when the prior contact's send is Failed, or Uncertain past the owner-set deadline; it does not wait for the primary's ROUTING-002 notify-after delay. ROUTING-002 stop rules apply: if the incident has recovered or is acknowledged under the selected acknowledgment policy before the fallback fires, the fallback sends nothing, including no recovery notice, and restart resumes without a duplicate. ROUTING-002 repeats follow the contact that holds the alert; a fallback repeats only when the route sets repeat on that fallback contact. No unnamed contact is messaged. Clock-based quiet hours belong to ROUTING-001, whose quiet-hour policy applies to every contact on the route, fallbacks included. After the last contact the unresolved follow-up stays visible. A later acceptance of an Uncertain primary does not recall an already-sent fallback, and both outcomes remain visible. Every attempt is a durable audited record with delivery, destination, attempt number, retry/fallback phase, scheduled and started times, outcome category and code, Retry-After seconds and a key reference without the signing credential or body. Attempts travel in archives and are erased with their destination or monitor. Restart resumes stored retry and uncertainty-deadline times without an extra send; mid-claim restart preserves DELIVERY-001. The owner configures the chain and deadline through the route editor and MANAGE-001 API and reads both outcomes in the console. Completion is judged on email and signed-webhook escalation chains; the SMS fallback is inherited by PHONE-001 and PHONE-002, and the PagerDuty destination kind by ONCALL-001 (RL-3). Default Uptime delivery escalation is the configured DELIVERY-002 fallback contact chain. It does not assign incident ownership or establish human receipt, acknowledgment or response (RL-4).

**Acceptance.**
1. At an authorized PagerDuty-compatible edge return 500 then 202 and see one retried delivery reusing the same dedup_key and one remote incident; return 400 and see the stop with its code; return 429 with Retry-After and see the wait honored; restart mid-backoff and see no duplicate attempt.
2. Point a Slack destination at a dead webhook with email and signed-webhook fallbacks and see the fallback sent within the deadline with both outcomes visible.
3. Confirm an email destination is never automatically resent.

#### NOTICE-001 — Actionable trigger and recovery notice content

*Tier:* Core

**Requirement.** Every trigger notice, on every channel (email, Slack, webhook, chat, SMS, voice and push), carries the monitor name and URL, the down reason in plain words (for example "HTTP 503 from 2 of 3 locations", "keyword 'Checkout' missing" or "TLS certificate expired"), the failed locations, the start time in the owner's US time zone and the incident link. Every recovery notice carries the total downtime from confirmed start to confirmed recovery (human-readable and in seconds), the original down reason, the recovery time and the incident link. SMS keeps to one segment where it can and includes the link; voice reads the monitor name, reason and duration. The same values are WEBHOOK-001 variables. The chat, SMS, voice and push notices are inspected for this content once those channels exist under CHAT-001, PHONE-001 and MOBILE-001.

**Acceptance.**
1. Fail a monitor with HTTP 503 for a known duration and recover it.
2. Inspect the email, Slack and webhook trigger and recovery notices for the reason, failed locations and exact downtime.
3. An incident spanning a Worker restart reports the correct total.

#### WEBHOOK-001 — Custom webhook requests and payload templates

*Tier:* Core · *Cites:* BASE-SECRET-001

**Requirement.** A webhook destination sets its HTTP method (GET, POST, PUT or PATCH), its delivery mode (JSON body, form-encoded fields or query-string parameters) and up to 10 custom headers (4 KiB in total). Header values such as `Authorization` or `X-Api-Key` are installation-local secrets: they are encrypted at rest under NOTIFY-001's credential custody, masked after save and never logged, exported or placed in evidence. Its body or parameter template draws on a documented, versioned variable set. The variables cover monitor ID, name, URL, type and tags; alert type (down, up, test, expiry warning, slow) with UptimeRobot-compatible numeric codes and friendly names; alert details (the plain-language down reason); alert start time in UTC and the owner's US time zone; alert duration in seconds and human-readable form; incident key, stable event ID and console link; failed locations and each location's outcome; HTTP status code; response time; failed assertion; SSL certificate expiry date and days left; domain expiry date and days left; and heartbeat last-receipt time. UptimeRobot's notification variables (`*monitorID*`, `*monitorURL*`, `*monitorFriendlyName*`, `*alertType*`, `*alertTypeFriendlyName*`, `*alertDetails*`, `*alertDuration*`, `*alertDateTime*`, `*httpStatusCode*`, `*sslExpiryDate*`, `*sslExpiryDaysLeft*` and the rest of its published list) are accepted as aliases. A variable with no Uptime equivalent is named at save and in the MIGRATE-001 preview; it is never silently rendered empty. Every substituted value is escaped for where it lands. In JSON bodies that means JSON string escaping, with quotes, backslashes and control characters escaped and `<`, `>` and `&` written as Unicode escapes. Form and query values are percent-encoded. A header value containing CR or LF is refused. A JSON template that does not parse after substitution with sample values is refused at save. The console preview renders the exact request (method, URL, headers with secret values masked, and body) for sample trigger, recovery, expiry and slow events. A test send delivers it to the receiver and shows the status code and a bounded response excerpt without changing monitor state. Optional HMAC-SHA256 signing (timestamp and signature headers over the exact rendered bytes) applies on top of any template; NOTIFY-001's default signed JSON envelope remains one template choice. Requests follow NETWORK-001 destination rules, DELIVERY-001/DELIVERY-002 attempt semantics (the stable event ID is a variable and can be sent as an idempotency header) and ROUTING-001/ROUTING-002 route selection. Templates, method, mode and header names travel in archives; header values and signing keys do not.

**Acceptance.**
1. Import an UptimeRobot webhook contact whose custom JSON POST value uses `*monitorFriendlyName*`, `*alertType*` and `*alertDetails*` and which sends an `X-Api-Key` header, then fail and recover a monitor: the controlled receiver gets the same field names, header and content type it got from UptimeRobot, with values substituted.
2. A monitor named with quotes and `<script>` arrives correctly escaped, and the body parses as JSON.
3. Query-string and form modes arrive as parameters, and GET mode sends no body.
4. A header value containing CR/LF is refused at save.
5. An unmappable variable is named in the migration preview and at save.
6. The preview matches the received request byte for byte apart from masked secrets.
7. The signed variant verifies with its HMAC.
8. An archive export contains the template and header names but no header value.

#### CHAT-001 — Teams, Discord, Telegram and workplace chat

*Tier:* Core · *Register:* R-6

**Requirement.** Microsoft Teams is supported through Microsoft's current mechanisms, because Microsoft is retiring Office 365 connectors (incoming webhooks). The first is a Teams Workflows webhook URL (the "post to a channel when a webhook request is received" workflow), to which Uptime posts Adaptive Cards. The second is the Uptime Teams app, which posts to a chosen channel or chat through the Bot Framework after a Teams admin installs it. A legacy Office 365 connector URL is accepted only with a "retiring connector" label. The label is shown on the destination, in the MIGRATE-001 preview and in drill results, with steps to create a Workflows URL. A connector URL that starts refusing posts is shown as failed with Microsoft's response, never as delivered. Discord, Telegram (Bot API with the buyer's bot token and chat or group ID), Google Chat and Mattermost destinations carry monitor, location, failed assertion, severity, incident key and authenticated evidence link with tested trigger/recovery/drill formatting. Per-channel scopes, credential rotation, rate limits and delivery uncertainty follow the same custody rules as Slack.

**Acceptance.**
1. Configure each named connector, including a Telegram bot posting to a group chat, a Teams Workflows URL and the Uptime Teams app in a channel, through the owner console, drill it, fail and recover a monitor, return a provider error and rotate credentials; inspect channel readback, correlation and distinct acknowledgment/receipt states.
2. Import an UptimeRobot Teams contact with a legacy connector URL and see the retiring-connector label and replacement steps; make that URL refuse posts and see a failed outcome with the response.

#### PHONE-001 — US SMS and voice alerts

*Tier:* Core · *Register:* R-4

**Requirement.** SMS and voice calls sent from PHONE-002's Uptime-provided registered US sender (or, optionally, a buyer-connected Twilio account) to verified US E.164 numbers deliver incident context and secure acknowledgment with consent, quiet hours, opt-out, per-team USD budgets and visible provider/carrier outcomes. Repeats and call escalation follow the buyer policy and Oncall handoff; Uptime does not act as a carrier or guarantee receipt. Usage is metered and budgeted under COST-001. This clause inherits the SMS fallback acceptance from DELIVERY-002.

**Acceptance.**
1. In a new workspace with no provider account, verify a real US mobile number and trigger SMS/voice and acknowledgment on that handset (PHONE-002).
2. At the provider edge, simulate opt-out, spend cap, a failed carrier and an uncertain call result; inspect no unauthorized sends/charges and visible unresolved follow-up.

#### PHONE-002 — Uptime-provided compliant US sender

*Tier:* Core · *Register:* R-4

**Requirement.** SMS and voice alerts work on day one in a new workspace, with no buyer provider account and no buyer carrier registration. Uptime runs a managed telephony relay, operated with Twilio in the same way as the RER mail relay used for email. Its alert SMS go out from a US A2P 10DLC-registered brand and campaign or a verified toll-free number, and its calls use a voice caller ID with STIR/SHAKEN attestation. The console shows the sender number, its registration state and a contact card recipients can save. Each recipient number is verified by a one-time code before it receives any alert. Uptime records consent, verification time and the opt-in text shown. STOP, HELP and START are honored at the carrier and in Uptime: an opted-out number is shown as opted out and receives nothing until it opts back in. Every attempt records the carrier delivery receipt (delivered, undelivered with the carrier error code, or unknown) and the call result (answered, busy, no answer or failed). Uptime owns and monitors registration status, sender changes and provider throughput. A suspension or filtering spike is shown to every affected owner, and the incident goes to the route's other channels and its DELIVERY-002 fallback chain. Connecting the buyer's own Twilio account and registered messaging service remains optional. Those credentials stay under installation-local custody, outcome reporting is the same, and Uptime never sends from a buyer account the buyer has not connected. This clause inherits the SMS fallback acceptance from DELIVERY-002.

**Acceptance.**
1. In a new workspace with no provider account, verify a real US mobile number on each of AT&T, Verizon and T-Mobile by one-time code.
2. Confirm an outage: each handset receives the SMS and the voice call, with carrier delivery receipt and answered-call result recorded.
3. Reply STOP and see further SMS stop and the opt-out shown; HELP returns the sender identification; START resumes.
4. The console shows the registered sender and its state.
5. Each send is metered at COST-001's shown USD price.
6. Connect a buyer-owned Twilio account and see the alert sent from the buyer's number with the same outcomes.

#### MOBILE-001 — Mobile operator access and push

*Tier:* Core · *Cites:* BASE-ACCESS-004, BASE-OPS-005, BASE-ROLE-001 · *Register:* R-5

**Requirement.** Responsive operator flows and native iOS/Android clients support secure sign-in honoring ACCESS-003 second factors, monitor/incident evidence, pause/maintenance controls and push alerts via APNs/FCM; Pushover and Pushbullet are selectable provider destinations. Expired tokens, offline reads, revoked sessions and notification permissions have honest states.

**Acceptance.**
1. Install the iOS and Android apps from their public App Store and Google Play listings; on those devices and 390-pixel web, receive a test push and open its exact incident, acknowledge via the configured responder handoff, go offline, revoke a session and deny push permission; inspect stale data labels and failed delivery.
2. Drill Pushover and Pushbullet separately.

### Incidents and handoffs

#### FOLLOWUP-001 — Ongoing outage follow-up and correlation

*Tier:* Core

**Requirement.** Each confirmed incident has an owner, next-due follow-up, durable progress and stop/resolution state. The owner is a named workspace member (by default the monitor's or route's owner). Members with the ACCESS-001 responder role or above can take or reassign ownership, and each change is recorded. Next-due follow-up is the time and kind of the next scheduled reminder, escalation or handoff check, computed from the route's ROUTING-002 policy and shown on the incident and in READAPI-003. Durable progress is the incident's append-only timeline. Each entry has a time, an actor (a member, or a named feature such as scheduler, router or agent) and a kind: confirmation with its cause; each notification, reminder and handoff attempt with its outcome; acknowledgment, with who, when and through which channel; owner assignment and reassignment; INCIDENT-001 comments, edits and INCIDENT-003 root-cause changes; maintenance or pause applied during the incident; and recovery or manual resolution. Entries survive restart, travel in archives and are never rewritten; corrections are added as new entries. Stop/resolution state is open, acknowledged or resolved, and records what stopped reminders (recovery, acknowledgment policy or a member's stop). Configurable repeated reminders are new auditable events with stable incident identity; they never replay an uncertain send under DELIVERY-001. Correlate simultaneous dependency failures for grouped acknowledgment while preserving every monitor result; acknowledgment stops reminders only under the selected policy, and recovery closes the right incident. ROUTING-002 supplies contact notification and reminder scheduling, DELIVERY-002 fallback escalation scheduling and ONCALL-001 native handoff-check and responder-policy scheduling; FOLLOWUP-001 keeps named ownership, the next-due kind and time and every attempt and outcome in the incident timeline through the console, API/CLI and READAPI-003 doors, including restart and inactive archive behavior (RL-5).

**Acceptance.**
1. Trigger correlated outages, acknowledge one group, restart before a due reminder, lose a delivery response and recover one child; inspect one event per due reminder, retained uncertainty, unclosed children and final resolution without duplicate sends.
2. Reassign the incident owner, restart the Worker and read the incident timeline through the console and READAPI-003: confirmation, every attempt with its outcome, the acknowledgment with actor and channel, both owner changes, the reminders and the recovery appear in order with actor and time, and the next-due time matches the route policy.

#### INCIDENT-001 — Incident comments and edit history

*Tier:* Core · *Cites:* BASE-ACCESS-002, BASE-ROLE-001

**Requirement.** Every incident, open or resolved, has a comments section on its detail page and in the FOLLOWUP-001 timeline. Members with the ACCESS-001 responder role or above can add a comment of up to 5,000 characters. Each comment records its author and time, renders as escaped plain text with links, and can be edited by its author or an admin. Every edit keeps the earlier version in a visible edit history with editor and time. Deleting a comment requires its author or an admin and leaves a "comment deleted" timeline entry that names who deleted it and when; the text and its history are removed.

**Acceptance.**
1. Confirm an outage through scheduled evidence; as a responder, comment "restarted php-fpm" on the open incident.
2. A read-only member is refused when trying to comment, edit or delete through the console and the direct API, and nothing is written.
3. The owner edits the comment, and the edit history shows both versions with editor and time.

#### INCIDENT-002 — Comment mentions

*Tier:* Core · *From:* INCIDENT-001

**Requirement.** Typing @ offers workspace members only. A mention notifies that member by email through the Base mail adapter, and by push once MOBILE-001 ships. The notice carries the incident, a bounded excerpt of the comment and an authenticated link. Each mention's delivery outcome is shown on the comment and follows DELIVERY-001's single-attempt rule.

**Acceptance.**
1. In a comment on the open incident, @mention a colleague: the colleague receives the email with the excerpt and link, and the delivery outcome is shown on the comment.

#### INCIDENT-003 — Incident root cause

*Tier:* Core · *From:* INCIDENT-001

**Requirement.** Each incident also has a root-cause field: a category from a buyer-editable list plus free text of up to 2,000 characters. The default categories are hosting provider, deployment or code change, DNS, TLS certificate, third-party dependency, network, configuration, capacity, planned work, monitor or check issue, and unknown. The field can be set or changed during or after the incident, and each change is a timeline entry with editor and time. Incidents can be filtered, grouped and reported by root-cause category in the console, in REPORT-001 and in READAPI-003.

**Acceptance.**
1. After recovery, the owner sets the root cause "Hosting provider: disk full".
2. A REPORT-001 report and a READAPI-003 incident list filtered by that category list the incident.

#### INCIDENT-004 — Publish a comment to the status page

*Tier:* Core · *From:* INCIDENT-001 · *Register:* R-6

**Requirement.** Each comment has an explicit "Publish to status page" action and is never published otherwise. The action previews the exact text and the update status (investigating, identified, monitoring or resolved) for the LAMP-001-mapped Lamp or Atlassian Statuspage incident. It then sends that text as an incident update under LAMP-001's signed idempotent handoff and the buyer's selected approval path. The publication outcome, and the public update once Lamp or Statuspage accepts it, is shown on the comment. Editing a published comment never changes the public update silently; it offers a "publish correction" action instead.

**Acceptance.**
1. Publish one comment to a mapped Lamp component: it appears there as an incident update with the chosen status, and a replayed publish creates no second update.
2. A second, unpublished comment never reaches Lamp, Slack or any webhook receiver.

#### INCIDENT-005 — Comment and root-cause custody

*Tier:* Core · *From:* INCIDENT-001 · *Cites:* BASE-DATA-003 · *Register:* R-3

**Requirement.** Unpublished comments and root causes never leave Uptime, except for mention emails to the mentioned member and the owner's own exports. Comments, edit histories and root causes are included in incident exports, READAPI-003 incident detail and ARCHIVE-001/ARCHIVE-002 archives. They are erased with their monitor under ERASURE-001 and counted in its receipt. Erasing an operator keeps that member's comments, with the author shown as a former member, and removes mentions of them. Comment add, edit and delete actions and root-cause changes are audited under AUDIT-001 without their text. Comments and root causes never change a verdict, state, incident threshold, uptime or SLA figure. They are the team's account, kept apart from EVIDENCE-002's machine-derived cause. MIGRATE-001 imports UptimeRobot incident comments and root causes as HISTORY-001 labeled source history where the source API exposes them, and names them where it does not.

**Acceptance.**
1. An incident export and an archive round trip keep the comments, edit history and root cause.
2. Erasing the monitor removes them, and the receipt counts them.
3. Monitor state, incident thresholds, uptime and SLA figures are identical before and after every comment and root-cause change.
4. Import an UptimeRobot incident with a comment and root cause: it appears as labeled source history, or the preview names the field the source does not expose.

#### ONCALL-001 — Responder handoff and automatic resolution

*Tier:* Core · *Register:* R-6

**Requirement.** Native [Oncall](https://github.com/just-every/run-oncall), PagerDuty Events API v2 and Splunk On-Call connectors hand confirmed failures to the buyer-selected service with stable deduplication key, severity, service/team mapping, regional/step evidence and authenticated attachments. Handoff acknowledgment and responder status remain separate. Recovery resolves the same remote incident; elapsed-time/team-availability/origin escalation invokes the configured responder policy rather than implementing rotations here. This clause inherits the PagerDuty destination-kind acceptance from DELIVERY-002. It owns connector-native handoff checks and the configured responder-escalation policy, including handoff attempts and outcomes; its scheduling and outcomes feed FOLLOWUP-001's incident timeline and next-due projection and READAPI-003's incident reads (RL-6).

**Acceptance.**
1. Cause a confirmed failure and repeats through each named connector, interrupt the response, receive acknowledgment and recover; inspect one remote incident with evidence, correct policy and resolution, visible failed/uncertain handoffs and no imported-event replay.

#### LAMP-001 — Status communication through Lamp

*Tier:* Core · *Register:* R-6

**Requirement.** Map monitors/services to [Lamp](https://github.com/just-every/run-lamp) or Atlassian Statuspage components and send signed idempotent confirmed incident/maintenance/recovery updates with evidence, source timestamps and confidence. The buyer chooses automatic publication or approval in Lamp; branded pages, subscriptions, subscriber updates and public narrative remain there. A stale probe never publishes a false recovery. An INCIDENT-001 comment reaches Lamp or Statuspage only through its explicit per-comment "Publish to status page" action (INCIDENT-004). It is sent as an incident update with the member's chosen status and an idempotency key per comment version, on the same approval path, and its outcome is shown on the comment.

**Acceptance.**
1. Map components, trigger a confirmed outage, replay an event, interrupt delivery and recover; inspect one Lamp/Statuspage incident, the selected approval/publication path and subscriber update there, with failed handoffs visible in Uptime.
2. Publish an INCIDENT-001 comment and see one incident update in Lamp and in Statuspage, with the publication outcome on the comment.
3. Replay the publish and see no duplicate; leave another comment unpublished and see nothing sent.

#### AUTOMATION-001 — Zapier, Make and custom automation

*Tier:* Core · *Register:* R-6

**Requirement.** Versioned signed webhook events, WEBHOOK-001 custom-template webhook requests and supported Zapier/Make triggers/actions expose confirmed failure, recovery, expiring asset and due follow-up, with least-scope tokens, event IDs, replay controls and bounded outcomes. Owners can test, pause and revoke automations; downstream work cannot rewrite evidence or silently create duplicate customer messages.

**Acceptance.**
1. Connect a Zapier and Make workflow through the supported connector, run failure/recovery and an expiry warning, replay callbacks and revoke access; inspect one downstream action per event and durable failed/stopped execution.

### APIs, code and metrics

#### MANAGE-001 — Monitor and contact API

*Tier:* Core · *Cites:* BASE-INPUT-001

**Requirement.** Authenticated public product APIs create/read/update/pause monitors and manage alert destinations with the same validation, revisions, secret custody and authorization as the console. Bad input returns actionable errors without partial writes. Reading uptime, response-time and incident data, and the versioned, key-authenticated read API, are READAPI-001 to READAPI-003's.

**Acceptance.**
1. Use the owner API to create/edit/pause a monitor and rotate a contact, read back its revision and attempt signed-out/cross-origin mutations; inspect atomic refusal and no exposed endpoint secrets.

#### READAPI-001 — Versioned read API keys, limits and documentation

*Tier:* Core

**Requirement.** A documented, versioned REST API at `/api/v1` gives dashboards, customer portals, SLA scripts and third-party integrations the same monitoring figures as the console. It is described by an OpenAPI 3.1 document served at `/api/v1/openapi.json` and in the public `/docs`. Requests authenticate with bearer API keys created under ACCESS-001. A key belongs to one workspace and carries explicit scopes; `monitoring:read` is read-only. A key can be limited further to tags or monitors and given an expiry. It is shown once, stored hashed, revocable immediately, and its last use is recorded. Creating one requires ACCESS-003 step-up. Lists use cursor pagination with stable ordering and a documented maximum page size. Uptime and incident reads can also return CSV (`Accept: text/csv`). Rate limits are documented per key and reported in `RateLimit` headers. Exceeding one returns 429 with `Retry-After`, and the request has no effect. A `monitoring:read` key refuses every mutating method with 403 and writes nothing. A key for one workspace gets 404 for another workspace's monitors and incidents, and a tag- or monitor-limited key sees only its selection. A breaking change ships only as a new version. The old version keeps working for at least 12 months and carries `Deprecation` and `Sunset` headers in the meantime. The docs map each UptimeRobot v2 `getMonitors` read (uptime ratios, response times, logs) and v3 stats and incident read to its equivalent, so a migrating buyer can repoint a dashboard or script.

**Acceptance.**
1. A POST, PATCH or DELETE with the read-only key returns 403 and nothing changes.
2. Exceeding the documented limit returns 429 with Retry-After.
3. A key for one workspace cannot read another workspace's monitors, a tag-limited key sees only its tag, and a revoked key is refused at once.
4. Repoint a script that read UptimeRobot `getMonitors` uptime ratios to the documented equivalent and get the same periods.

#### READAPI-002 — Uptime and response-time reads

*Tier:* Core · *From:* READAPI-001 · *Register:* R-2

**Requirement.** The API offers these reads. Monitors: `GET /api/v1/monitors` and `GET /api/v1/monitors/{id}`, with current state, last check and coverage. Uptime: per-monitor `GET /api/v1/monitors/{id}/uptime` and bulk `GET /api/v1/uptime` for up to 500 monitors. Each takes a named period (24 hours, 7, 30 or 90 days, month, quarter or year to date, last month) or a custom `from`/`to`, and an IANA time zone that defaults to the owner's US zone and handles daylight saving. Each returns availability, observed, down, Unknown, paused and maintenance seconds, slow time (SLOW-001), incident count and the REPORT-001 denominator policy. An optional `source` parameter selects the HISTORY-001 source segment, Uptime's own segment and the labeled blended figure, never the blended figure alone. The OpenAPI document and public guide must list every accepted value exactly, including each supported HISTORY-001 source and the Uptime/blended selection. An unknown or currently unavailable value must be refused with a reason naming the unknown value or unavailable source, never silently ignored, replaced by Uptime-only data or returned as an empty successful result. Response times: `GET /api/v1/monitors/{id}/response-times`, by location or across locations. It returns min, mean, p50, p95, p99 and max per bucket at raw, 1-minute, 5-minute, 1-hour or 1-day resolution, over ranges up to 90 days. A request beyond 10,000 points per response is refused with a 400 naming the bound, and is never truncated. Every figure is computed by the same code as the console and REPORT-001, so the API, the console and a downloaded report agree exactly for the same monitor, period, time zone and source. METRICS-001's Prometheus and Grafana integration reads the same figures.

**Acceptance.**
1. Cause known outages, an Unknown gap, a maintenance window and slow responses on a monitor.
2. With a `monitoring:read` key, call the API for 24-hour, 7-day, 30-day and custom-period uptime in America/Chicago, the bulk uptime read and the response-time series by location at two resolutions.
3. Compare each result with the REPORT-001 console figure, the downloaded CSV and the immutable slots: they match exactly.
4. Ask for the HISTORY-001 segment on a migrated monitor and see source, Uptime and labeled blended figures.
5. Make one request per exact accepted `source` value in the OpenAPI schema, plus an unknown value and a currently unavailable source; accepted values select the documented figures, while each refused request names its reason and returns no substituted or empty success.
6. An over-bound response-time request is refused, not truncated.

#### READAPI-003 — Incident reads

*Tier:* Core · *From:* READAPI-001

**Requirement.** Incidents: `GET /api/v1/incidents` and `GET /api/v1/incidents/{id}`. They return start, end, duration in seconds, EVIDENCE-002's plain-language cause, failed locations, owner, acknowledgment, INCIDENT-003 root cause and INCIDENT-001 comments, the FOLLOWUP-001 timeline and source (Uptime or imported). The list is filterable by monitor, tag, date range, state and root-cause category. Incident reads carry FOLLOWUP-001's authoritative next-due kind and time and its timeline; DELIVERY-002 fallback escalation and ROUTING-002 notification and reminder behavior are part of what they read, and ONCALL-001 handoff scheduling is an open dependency, not an exemption (RL-7).

**Acceptance.**
1. With a `monitoring:read` key, read the incident list filtered by root cause, then page through it.

#### CODE-001 — CLI, TypeScript and CI deployment

*Tier:* Core

**Requirement.** Supported API/CLI and TypeScript definitions preview/diff, validate, test, apply and roll back monitors, alert routes and maintenance from reviewed source. GitHub Actions and other CI use scoped credentials and explicit environment selection; Checkly CLI/suite migration maps supported constructs and names unsupported ones. Apply uses reviewed revisions and never silently enables new traffic or imports secret values.

**Acceptance.**
1. From a fresh checkout run CLI preview/test/apply/export/undo and a GitHub Actions change using least-scope credentials; reject drift after preview, migrate a Checkly suite and prove the deployed assertions match reviewed intent.

#### CODE-002 — Terraform provider

*Tier:* Core

**Requirement.** A supported Terraform provider manages monitors, locations, contacts/routes and maintenance with import, plan, drift detection, sensitive secret references and safe apply/destroy. An operator sees the same revisions/audit as UI changes; destroy preserves erasure policy and never removes evidence without explicit destructive authority.

**Acceptance.**
1. Terraform import an existing monitor, plan/apply a route and recurring window, change the monitor in the console and detect drift; inspect no secret in plan/state exports and refusal of unauthorized destruction.

#### METRICS-001 — Grafana and Prometheus integration

*Tier:* Core · *Register:* R-6

**Requirement.** Authenticated, documented Prometheus metrics and Grafana dashboards expose availability, latency, regional coverage, probe health, incident and delivery outcomes with stable monitor identifiers, bounded cardinality and freshness. Datadog metric/webhook export preserves source location identity without claiming access to Datadog-managed probes. Its figures equal READAPI-002's for the same monitor and window.

**Acceptance.**
1. Configure Grafana/Prometheus and authorized Datadog export against real API/scrape doors, fail a monitor and probe, revoke credentials and inspect matching source denominators, stale states and no cross-workspace metrics.

### Migration and history

#### MIGRATE-001 — Complete UptimeRobot migration

*Tier:* Core · *Register:* R-3

**Requirement.** Import UptimeRobot v3 REST API pages and saved exports with paginated live extraction under read-only credentials. Preview each monitor, protocol, auth reference, interval, region, tags/groups, contact and maintenance mapping, unsupported field and expected quota/cost difference. Repoint heartbeats with new tokens, reauthorize contacts and run a side-by-side cutover. Incident and down/up logs (CSV export from the overall and per-monitor log tables, and v3 API incidents) and response-time samples, where the source exposes them, are imported as HISTORY-001 source history. That history appears in reports and never becomes current evidence. Each webhook contact's custom POST value, custom headers and send mode (query string, POST parameters or Send as JSON) become a WEBHOOK-001 template with the same field names, header names and content type. Header values the API does not return are re-entered as local secrets, and the preview names every variable that cannot be mapped. SSL-certificate and domain-expiry reminder settings on an HTTP monitor become TLS-001 and DOMAIN-001 monitors with the same reminder days. HTTP Digest credentials map to API-002, and "ignore SSL errors" maps to NETWORK-002's labeled exception. Every alert contact type the account holds (email, SMS, voice, mobile app push, Slack, Telegram, Discord, Microsoft Teams, Google Chat, Mattermost, Pushover, Pushbullet, webhook, Zapier, PagerDuty and Splunk On-Call) maps to its named Uptime destination, with per-monitor notify-after and repeat settings carried into ROUTING-002, and is reauthorized rather than silently dropped. Status pages — custom domain, password protection, branding, announcements, subscribers and monitor-to-component mapping — are handed to Lamp through its approved import door after buyer confirmation, and Uptime's migrated monitors feed those components under LAMP-001. A record the source API does not expose, such as a subscriber list, is named with export guidance. The custom-domain cutover keeps the old page serving until Lamp serves the domain with valid TLS, and imported subscribers receive no import or duplicate notice. Incident comments and root-cause details, which UptimeRobot Team plans add, are imported with their incidents as HISTORY-001 source history, where the source API exposes them; where it does not, the preview names them with export guidance. Login seats become ACCESS-001 invitations with their source role mapped (admin to admin, read-only to read-only), sent only after buyer confirmation. Notify-only seats become alert destinations, which need no Uptime account, and the read-back lists them as notify-only, never as dropped members. A Microsoft Teams contact using a legacy Office 365 connector incoming-webhook URL is flagged under CHAT-001 as a retiring connector, with steps to replace it with a Teams Workflows URL. The read-back also names each UptimeRobot API read the account's keys used and its READAPI-001 equivalent, so dashboards and scripts can be repointed before cutover. A read-back report lists every monitor, contact, notify-only seat, member, status page, subscriber count, maintenance window and integration as migrated, handed off or unsupported with its reason.

**Acceptance.**
1. Use an authorized UptimeRobot export/API account, preview paginated extraction, reconcile counts and every unsupported field, apply paused definitions, authorize secrets, compare both products and cut over without duplicate alerts; retain rollback.
2. An account with two status pages (one password-protected, with subscribers) and Telegram and SMS contacts previews both pages and every contact; after approval Lamp holds both pages with mapped components, the custom domain switches with valid TLS, the read-back accounts for every record and no subscriber receives a duplicate or import notice.
3. A webhook contact with a custom JSON POST value and an `X-Api-Key` header passes WEBHOOK-001's receiver journey.
4. An HTTP monitor with SSL and domain reminders gains matching TLS-001 and DOMAIN-001 monitors.
5. A 60-day log CSV passes HISTORY-001's report journey.
6. An incident with a comment and root cause imports as labeled source history, or the preview names the unexposed field.
7. An account with two login seats and three notify-only seats reads back two pending invitations with mapped roles and three notify-only destinations, with no member reported dropped.
8. A legacy Teams connector URL is flagged with replacement steps.

#### MIGRATE-002 — Pingdom migration

*Tier:* Core · *Register:* R-3

**Requirement.** Read-only Pingdom API/export import maps uptime, transaction/page-speed checks, locations, teams/contacts, tags, schedules and maintenance with per-field differences and script conversion proposals. Buyer reviews test accounts, imports its historical outages and summary/performance data as HISTORY-001 source history and chooses side-by-side cutover without replaying notifications. Contact notification settings (email, SMS, notify after N failures and repeat) carry into ROUTING-002, and webhook, Slack and responder integrations map to their named destinations. Public status pages and public reports, with their custom domains, branding and check-to-component mapping, are handed to Lamp through its approved import door after buyer confirmation, with the same TLS-verified domain cutover and no subscriber notice. A read-back report lists every check, contact, integration and public page as migrated, handed off or unsupported with its reason.

**Acceptance.**
1. Import an authorized representative Pingdom account/export, reconcile every check and team, inspect refused/converted transactions, test matched failures in both systems and switch routes with rollback.
2. An account with a public status page on a custom domain previews it with its checks; after approval Lamp serves it with mapped components and valid TLS, and the read-back accounts for every check, contact, integration and page.

#### MIGRATE-003 — Better Stack Uptime migration

*Tier:* Core · *Register:* R-3

**Requirement.** Import Better Stack Uptime monitors, heartbeats, regions, groups, maintenance and notification mappings from read-only API/export. Preserve sourced incident history as HISTORY-001 source history; map bundled responder ownership to Oncall and customer status components/subscribers to Lamp using their approved import doors and buyer confirmation. No bundled data is silently discarded or absorbed into Uptime.

**Acceptance.**
1. Preview an authorized Better Stack workspace with monitors, incidents, paging and status data, reconcile counts and destinations, execute approved sibling imports and run a side-by-side outage/recovery cutover without duplicate communication.

#### MIGRATE-004 — Site24x7 website monitoring migration

*Tier:* Core · *Register:* R-3

**Requirement.** Import Site24x7 website/API, DNS, TLS/domain, network/mail and browser transaction definitions, location/threshold groups, contacts and scheduled reports through API/export with explicit per-field parity and conversion steps. Preserve sourced history as HISTORY-001 source history and name infrastructure/APM records for export to [RunEditRun Porthole](https://github.com/just-every/run-porthole) or the buyer's other observability system; no unsupported record disappears.

**Acceptance.**
1. Import a representative authorized Site24x7 export/account, reconcile every monitoring record and report, test converted API/browser flows, compare regional failures and approve cutover with rollback and retained unmapped exports.

#### MIGRATE-005 — Challenger and advanced synthetic migration

*Tier:* Core · *Register:* R-3

**Requirement.** Checkly, OpenStatus, Hyperping and Datadog Synthetics imports accept documented API/export and code bundles, preserve source IDs, intended outcomes, regions, alerting, maintenance and sourced history (as HISTORY-001 source history), and explicitly enumerate conversion/refusal for every entry. Playwright fixtures and private-location credentials require reviewed reauthorization; source-provider agent identity never becomes Uptime authority.

**Acceptance.**
1. Preview an authorized representative bundle from each named product, reconcile counts/unsupported constructs, deploy paused converted checks, compare original outcomes from matching locations and cut over with reversible alert routing.

#### HISTORY-001 — Sourced incumbent uptime history

*Tier:* Core · *Register:* R-3

**Requirement.** Migration (MIGRATE-001 to MIGRATE-005) and the owner console import an incumbent's history. For UptimeRobot that means down/up incident logs from the log CSV export (overall and per-monitor) and v3 API incidents, plus response-time samples where the source API exposes them. For Pingdom it means outages and summary/performance data, and for Better Stack, Site24x7 and the challengers it means incidents and availability reports. Where the source exposes them, imported incidents keep their comments and root cause. They are attributed to the source author as text, never as a workspace member, and shown as source history beside INCIDENT-001's comments and INCIDENT-003's root cause. The migration preview maps each row by source monitor ID to its migrated Uptime monitor. It shows per-monitor row counts, date range, outage count and total downtime as the source states them, and counts and names rows for monitors that were not migrated or cannot be mapped. Imported history is stored as source history in its own tables, apart from slots and observations, with source name, export or extraction time, source row identity and file digest. Re-importing the same rows is idempotent. It never creates slots, observations, incidents, notifications or follow-up, and never feeds STATE-001, quorum, recovery or current health. REPORT-001 shows it in charts, incident lists and custom-period SLA reports as a visibly labeled segment (for example "source: UptimeRobot") with its own denominator. Source outage durations come exactly from the source timestamps, to the second, and Uptime's own slots appear beside them. A period spanning the cutover shows each segment's figure and a blended figure labeled with both sources, weighted by each segment's covered time; the blended figure never appears alone. Each migrated monitor has a cutover instant: by default its first scheduled Uptime slot, adjustable by the owner within the side-by-side overlap. Source history after that instant stays visible but outside the blended figure, so running both products never double counts. Source history travels in ARCHIVE-001/ARCHIVE-002 archives as sourced history. It is erased with its monitor under ERASURE-001, with per-table receipt counts, and the owner can remove one import batch.

**Acceptance.**
1. Import an authorized UptimeRobot account and its log CSV covering 60 days with three known outages, apply the migration and produce a 90-day SLA report spanning the cutover.
2. The three outages appear labeled UptimeRobot, with durations matching the source to the second, beside Uptime's own slots; each segment shows its own denominator and the blended figure names both.
3. Current state, incident quorum, notifications and follow-up are unchanged by the import.
4. Re-importing the same CSV adds no rows, and an unmapped monitor's rows are named in the preview.
5. An archive round trip keeps the labeled history, and erasing the monitor removes it with receipt counts.

### Access, cost and operations

#### ACCESS-001 — Teams, roles and accountable ownership

*Tier:* Core · *Cites:* BASE-ACCESS-004, BASE-OPS-005, BASE-ROLE-001, BASE-AUDIT-001

**Requirement.** Workspaces provide owner/admin, editor, responder and read-only roles with service/team scope, invitations, removal and least-scope API/CI credentials, including READAPI-001's read-only `monitoring:read` API keys. Responders and above can comment on incidents and set root causes (INCIDENT-001, INCIDENT-003); read-only members and keys cannot. Every background action has an owner, due condition, visible progress/failure and stop/resolution.

**Acceptance.**
1. Invite each role through the app, perform and refuse representative actions through direct routes/API as well as UI, revoke a member/token mid-job and inspect preserved authorized results and blocked later operations.

#### ACCESS-002 — Enterprise identity lifecycle

*Tier:* Later · *Cites:* BASE-SIGNIN-001 · *Register:* R-8

**Requirement.** Beyond BASE-SIGNIN-001, the Okta, Microsoft Entra ID and Google Workspace integrations map provider groups to Uptime roles and retain recovery-owner access (R-8). Native standalone sign-in, with ACCESS-003 second factors, remains usable without a linked provider; a configured but broken integration never silently authenticates a user.

**Acceptance.**
1. Connect each named provider at an authorized identity edge; inspect group-to-role mapping, recovery-owner access, callback origin/state checks and blocked foreign tenants.

#### ACCESS-003 — Multi-factor sign-in and step-up

*Tier:* Core · *Cites:* BASE-ACCESS-001, BASE-ACCESS-002, BASE-SIGNIN-002

**Requirement.** Beyond BASE-SIGNIN-002, Uptime issues ten single-use recovery codes, stored hashed and shown once. An owner policy can require MFA for all members: once it is enforced, an email-link session without a verified second factor reaches only factor enrollment, every private document and API refuses it server-side, and existing factorless sessions are revoked. Destructive or secret-bearing actions — erasure, archive export and import, destination credential creation and rotation, private-runner and synthetic grants, API/CI token creation, role changes and MFA policy changes — require a second-factor check within the previous 5 minutes. Enrollment, removal, recovery-code use and policy changes are rate-limited, audited without secrets and notified to the member by email; an owner can reset another member's factors, and the last owner recovers through recovery codes or local installation authority. With SSO under ACCESS-002 the owner can accept the identity provider's MFA assertion instead. API tokens, runner keys and heartbeat capabilities remain separate scoped credentials. Authentication stays in Base operator-auth; the requirement policy is product configuration.

**Acceptance.**
1. Enroll TOTP and a passkey through the console at an authorized authenticator edge, sign in by email link and complete each factor.
2. Enforce MFA and prove an email-link-only session is refused at private documents and APIs and existing factorless sessions are revoked; attempt an erasure and a destination rotation without fresh step-up and be refused, then succeed after it; use and then reuse a recovery code; inspect audit entries and member notices for absent secrets.

#### COST-001 — US buyer budgets and capacity transparency

*Tier:* Core

**Requirement.** A US site operator sees USD pricing and projected monitor-run, browser-minute, probe, retained-artifact and SMS/voice usage before activation, plus quotas, interval/detection tradeoffs, retention and upgrade paths. Budgets prevent unauthorized traffic/spend and report insufficient coverage as Unknown rather than silently slowing checks below SCHEDULE-002's saved cadence or dropping notifications. For SMS and voice, each plan states its included monthly SMS segments and voice calls and the USD price per additional SMS segment and per voice call minute. Prices are published on the pricing page and shown in the console before a phone destination is enabled. Every PHONE-002 send is metered at that price, and the console shows month-to-date usage, remaining included usage and USD spend. The owner sets a monthly phone budget. Every owner is notified by email and push at 80%, again when the remaining budget covers fewer than 10 further messages (owner-adjustable), and when the budget is reached. No SMS or voice alert is withheld for budget before that notice has been sent. A withheld send is recorded as withheld for budget, and the incident still goes to the route's free channels and fallback chain; it is never silently dropped. Raising the budget releases future sends, without replaying withheld ones.

**Acceptance.**
1. Preview a mixed-region/browser/phone configuration, inspect itemized USD estimate, reach a quota and change plan/budget; verify explicit halted work, due follow-up and unchanged historical denominator.
2. Set a phone budget, send SMS and voice alerts and compare each metered charge with the shown USD price.
3. Drive spend past 80% and to the budget: owner notices arrive before the first withheld send, the withheld record is visible, and the same incident reaches email and Slack.

#### OPS-001 — Recovery of monitoring itself

*Tier:* Core · *Cites:* BASE-OPS-004, BASE-BACKUP-001

**Requirement.** Runner-local unreachable/recovery notices, Worker stale-contact email, optional independent external heartbeat and weekly healthy digest expose control-plane coverage separately from target health. Every auxiliary execution requires durable attempt/outcome, lease-expiry reconciliation and restart-safe progress; backups restore inactive and require a reviewed restart of checks and routes. Restore is judged at ARCHIVE-001 bounds.

**Acceptance.**
1. Stop/restart Worker and runner independently, miss an external heartbeat and interrupt auth-mail/watch jobs; inspect retained attempts, stale/Unknown coverage, nonduplicated notices and archive recovery with no alert replay.

#### ARCHIVE-002 — Whole-workspace archives at monitoring scale

*Tier:* Core · *Cites:* BASE-DATA-001 · *Register:* R-2

**Requirement.** Whole-workspace export, OPS-001 backup and restore handle SCHEDULE-002's scale: 500 monitors on 30-second checks from 3 locations (about 4.3 million attempts a day) with at least 90 days of retained history. The archive streams in bounded chunks under a manifest with per-chunk digests rather than as one 2 MiB document. Restore keeps ARCHIVE-001's validation, inactive-restore and erasure-fencing semantics and resumes after interruption. Exports for a time range or a subset of monitors are available. Any remaining bound is shown in the console before export, and an export over that bound refuses with its counts; it never truncates.

**Acceptance.**
1. Populate 500 monitors with 90 days of 30-second, three-location history, export it, interrupt and resume the export, and verify the manifest digests.
2. Restore into an empty installation and compare every table's counts and ARCHIVE-001 transformations.
3. A 120-monitor account exports in full, and a range or subset export matches its selection.

### Agent surface (Base-delivered)

#### BASE-AGENT-001 — One MCP door per seed

*Tier:* Agent surface

**Requirement.** Every seed, hosted or self-hosted, serves one remote MCP endpoint at `/mcp` over Streamable HTTP. It speaks the current revision (2026-07-28) and accepts 2025-11-25 clients through the twelve-month deprecation window. It implements `server / discover`, tools, resources and prompts. Lists are deterministic and carry `ttlMs` and `cacheScope: "private"`. Roots, Sampling and Logging are not served.

**Acceptance.**
1. `server / discover` returns the supported versions, capabilities, `serverInfo` and instructions.
2. A 2026-07-28 request works with no handshake, and a 2025-11-25 client completes `initialize` and lists the same tools.
3. An unsupported version returns `UnsupportedProtocolVersion`.
4. Two `tools / list` calls return the same order, with cache fields.
5. A foreign Origin returns 403, and a header and body method mismatch returns `HeaderMismatch`.
6. An oversized body returns 413 with no effect.

#### BASE-AGENT-002 — The seed's jobs are tools, through the UI's own actions

*Tier:* Agent surface

**Requirement.** Each Core job a person does in the product is a tool. Where one is not, the Agent surface says why: it runs on a device, it is a person's interactive screen, it belongs to a connector or the import door, or it is an installation fact. Risk is never the reason: a risky job is a tool with its class (BASE-AGENT-006). Tools are named `<seed>.<area>.<verb>` and declare input and output schemas and truthful annotations. Each calls the same server action as the UI, so validation and authorization are written once, and the seed's embedded agents use the same registry. A business refusal returns `isError` with the seed's stable error code.

**Acceptance.**
1. The Core clause ids in each tool's `_meta`, with the not-a-tool reasons that `server / discover` serves, cover every Core clause in the contract, and no reason is risk; the harness and `rer check` fail on a gap.
2. Each tool's fixture result validates against its `outputSchema`.
3. Read tools declare `readOnlyHint`; tools that can carry destructive declare `destructiveHint`, and tools that can carry external declare `openWorldHint`.
4. A refusal returns the same error code the UI gets for the same action.
5. The UI action and its tool, on the same fixture, give the same record state and the same audit event type.
6. The seed's embedded agents appear in the audit as calls to the same tools.

#### BASE-AGENT-003 — Records are resources

*Tier:* Agent surface

**Requirement.** Each primary record type has a URI template, and tools return `resource_link`s to the records they touch. A read returns exactly the fields the caller's role sees in the UI. File bytes count against any byte budget on the grant. A record the caller cannot open reads as not found, identical to a missing id. Text from customers, imports or files carries an untrusted marker in `_meta`.

**Acceptance.**
1. `resources / templates / list` names every record type in the Agent surface.
2. Reads as two roles return exactly what the UI shows each.
3. An out-of-scope id and a missing id give identical responses.
4. A write's `resource_link` reads back the new state.
5. Bytes over budget return `budget_exhausted` and no partial content.
6. Customer-sourced text carries the untrusted marker.

#### BASE-AGENT-004 — Business identity and short-lived, audience-bound tokens

*Tier:* Agent surface

**Requirement.** The door is an OAuth 2.1 resource server. Its RFC 9728 metadata names the authorization servers this installation trusts. That is the paired Business when Business provisioned it, verified with the owner-claim trust the installation already holds for its import door; otherwise it is the seed's own sign-in. Access tokens are RFC 9068 JWTs with `aud` set to the seed's canonical MCP URI, `sub` the sponsoring person, `act` the agent (RFC 8693) with its specialist, scopes per tool family, and a lifetime of 15 minutes or less (5 by default). The policy scopes rules on the sponsor, agent and specialist the token names. The consent behind the tokens can last longer and is revocable. Tokens travel only in the Authorization header, and there is no passthrough.

**Acceptance.**
1. An unauthenticated call returns 401 with `resource_metadata`, and the metadata names the trusted servers and scopes.
2. A Business token for this seed works, and the same token sent to a sibling seed returns 401.
3. An expired token returns 401, and a token with a lifetime over 15 minutes is refused.
4. A read-only token calling a write tool returns 403 `insufficient_scope` with every needed scope in one challenge.
5. A token in a query string is refused and not logged.
6. Revoking consent in the seed or in Business refuses the next call within 60 seconds.
7. After unpairing, Business tokens are refused and the seed's own sign-in still works.

#### BASE-AGENT-005 — An agent acts as a person in a role, never more

*Tier:* Agent surface

**Requirement.** Every call is authorized as the sponsoring person's current role and access (BASE-ACCESS-004), intersected with the grant's resources, actions and budget. A grant only narrows. No call widens the calling agent's own authority. A call that would widen its own grant or its sponsor's role, or change the company policy or Pause, is refused with `self_escalation`, whatever the policy says; narrowing its own grant is allowed. Other access and security changes are ordinary actions in the access and security classes. An agent never acts after its sponsor is suspended. Anything an agent reads (records, files, emails, imports, other seeds' results) is data and cannot change its scope, its targets or a call's class.

**Acceptance.**
1. For each role fixture, every tool's allow or deny through MCP equals the UI's for the same action.
2. A one-folder, read-only grant holds, and widening through arguments is refused.
3. Downgrading the sponsor changes the next call's result, and suspending the sponsor returns 401.
4. Calls that widen the agent's own grant or its sponsor's role, or change the policy or Pause, return `self_escalation` and change nothing, even under a policy with every class autonomous; dropping a scope from its own grant runs.
5. An injection fixture yields no out-of-grant call and no change of class: record text asking for a wider action, or claiming that a recipient is internal.

#### BASE-AGENT-006 — Every action declares its risk class

*Tier:* Agent surface

**Requirement.** Classes come from the fleet list in RISK-POLICY.md: standard, external, money, commitment, accounts, gated, access, security, destructive, sensitive and live. In the registry, each tool declares the classes it can carry and a server-side classifier that decides them per call from the arguments, current records and, for gated, the provider's answer. The classifier also supplies each class's facts: the measure (items, recipients, amount and currency, people or records), the counterparty (internal, known, new or public), the direction for access, the provider and step for gated, and the data kind for sensitive. A classifier never reads a flag, label or claim supplied by the agent or by record text. A seed cannot add a class; it proposes one for the fleet list.

**Acceptance.**
1. Every tool in `tools / list` carries its possible classes in `_meta`, equal to the Agent surface table.
2. For each tool, fixture calls cover every class it can carry, and the computed classes and facts equal the fixture's expected values.
3. An argument or record text asserting a class or a confirmation (`internal: true`, `confirmExternal: true`) leaves the computed classes unchanged.
4. Money calls carry amount and currency, external calls their counterparty and recipient count, access calls their direction, and destructive calls their item count.
5. No tool in `tools / list` declares a class outside the fleet list, and `rer check` fails on one.
6. A refused call's audit row still records its computed classes.

#### BASE-AGENT-007 — The company's policy decides, at one chokepoint

*Tier:* Agent surface

**Requirement.** Every agent door calls one decision function: MCP, the integration API with agent tokens, and the seed's embedded agents. It evaluates the call's classes against the company's policy, as above. The seed ships no dispositions and fills no gap with one: agent access opens only under a complete policy that setup has asked for (RISK-POLICY.md), and before then every agent call returns `policy_unset` with the setup link and changes nothing. *Autonomous* runs the call. *Review* runs it and adds it to the review feed. *Approval* saves a pending action with server-computed facts and returns `input_required`, with a URL-mode elicitation to the seed's approval page and a pending handle. Each person the rule names approves the exact saved revision in a signed-in browser, and changed inputs need a new approval. The retried call returns the result and a receipt. A rejection returns `approval_rejected`, and a lapse past the wait the rule sets returns `approval_expired`. *Blocked* returns `policy_blocked`, naming the class, rule and revision.

**Acceptance.**
1. The Base harness runs each tool under each disposition for every class it can carry, and sees it run, run and enter the review feed, wait with no effect, or be refused.
2. Before setup is complete, the setup page lists every class the seed's tools carry with examples and no answer pre-selected, an agent call returns `policy_unset` with the setup link and changes nothing, and an incomplete revision cannot be confirmed; a `*` rule completes it, and a tool an upgrade adds with an unanswered class appears in `tools / list` once that class is answered, while the other tools keep running.
3. Under "money autonomous up to $500, approval up to $10,000, blocked above", calls of $400, $600 and $20,000 run, wait and are refused; a per-day cap sends the call that crosses it to the next rule.
4. A call carrying two classes takes the stricter disposition.
5. An approval shows server-computed facts and an expiry, returns the URL elicitation and a handle, and completes once after the named approver approves; a changed input needs a new approval, and a rejection or lapse leaves no effect.
6. The same call through MCP, the integration API and an embedded agent gets the same decision.
7. A policy change applies to the next call within 60 seconds, and the audit cites the new revision.
8. A policy document with a bad signature or another Business's id is rejected, and the door keeps the last valid revision.

#### BASE-AGENT-008 — Truthful attribution

*Tier:* Agent surface

**Requirement.** Every agent act is recorded and shown as `"<agent> for <person>"`, and mail and messages an agent sends outside name it that way as their sender. An approval, a review mark, a confirmation (a warning dialog, a typed-field confirmation, a delivery confirmation), a decision or a signature attributed to a person comes only from that person's signed-in session. When an agent does the equivalent act, the record names the agent, and the act carries its own class; a binding decision or a signature is commitment. Agent doors ignore arguments that stand for a person's confirmation. No tool solves a bot check, or enters a person's own password or 2FA code at an outside service. A provider step that demands a person goes to a person, whatever the policy says; the gated class marks such steps before they run.

**Acceptance.**
1. An agent call carrying a person-confirmation flag is classified and decided exactly as without it.
2. Approving, marking reviewed or answering a policy question with an agent or device token returns 403 and changes nothing.
3. A form-mode elicitation "accept" never completes an approval.
4. Where an agent's decision, signature or field confirmation runs without a person, it reads `"<agent> for <person>"` in the record, the activity view, exports and any certificate, never as the person's own act.
5. After a person approves an agent's prepared action, the record shows the person as approver and the agent as preparer.
6. Activity and exports at 1440 and 390 show `"<agent> for <person>"` for every agent act.
7. Mail an agent sends to an outside address names `"<agent> for <person>"` as its sender.

#### BASE-AGENT-009 — Every agent action is audited with its class and decision

*Tier:* Agent surface

**Requirement.** Extending BASE-OPS-005, each call that reads private data or changes anything records the agent client, name and specialist, and the run or task id (`traceparent` when sent); the sponsoring person, the grant, the tool and the targets; the classes and their facts, and the policy revision and rule; the decision (autonomous, review, approval, blocked, unset or self_escalation) and the outcome (done, refused, pending or failed); the approval or review id and person, and the idempotency key. For a period, the seed's Agents page shows actions by class and decision with the notable ones, the review feed (Mark reviewed, Flag, and Undo where reversible), pending approvals, steps waiting for a person and setup questions. Business shows the same across seeds.

**Acceptance.**
1. One write leaves a complete audit row.
2. Refused, pending, unset and self-escalation calls are audited.
3. The Agents page's counts by class and decision equal the audit rows on a fixture week.
4. The review feed lists exactly the calls decided as review; Mark reviewed records the person, and Undo restores a reversible one.
5. Filtering by agent or class lists only those rows, and export includes every field.
6. Removing the agent keeps its rows and its name.
7. The Agents page works at 1440 and 390 with no serious or critical axe findings.

#### BASE-AGENT-010 — Agents can follow changes

*Tier:* Agent surface

**Requirement.** The seed emits a typed event for every record change and for every approval, review and policy decision. Each event carries a stable id, a type, the record URI, the actor (a person, or an agent acting for a person) and a time. Events never carry secrets or more than the subscriber may read. Agents can read events three ways: `subscriptions / listen`, an `events.list` tool with a cursor, and signed webhooks from Base `integrations` using the same ids. Every channel delivers at least once and filters by access at delivery.

**Acceptance.**
1. A subscribed record changed in the UI produces a notification within 10 seconds.
2. `events.list` returns the same event id the webhook carries.
3. Replaying from a cursor returns the same ids in order.
4. After access is revoked, no channel delivers events about that record.
5. A failed webhook is visible and replays without duplicate effects.
6. `approval.pending`, `approval.decided`, `review.flagged` and `policy.adopted` carry the class and decision and nothing the subscriber may not read.

#### BASE-AGENT-011 — Limits are policy, and Pause stops everything

*Tier:* Agent surface

**Requirement.** Business limits are rules in the company's policy: per-call and per-day thresholds on any class's measure, such as money moved, outside recipients or items destroyed; spend caps on provider cost (models, SMS, email) per seed, specialist or agent, which setup asks with the classes; "no cap" is an answer. Tools with provider cost declare an estimate before they run, and an exhausted cap returns `budget_exhausted` before any partial effect. The seed's capacity limits (request rate, body and byte sizes) protect the installation: they bound rate and size, never daily business volume, are documented and are not policy. A grant carries budgets only when the person granting it sets them. A **Pause agents** control in the seed, and Pause all agents in Business when paired, refuses every agent token within 60 seconds until a person resumes; browser sessions and devices keep working.

**Acceptance.**
1. A rate overrun returns 429 with `Retry-After`.
2. A per-day cap of three outside recipients sends the fourth to the rule that applies past the cap.
3. An exhausted spend cap returns `budget_exhausted` with no partial effect and shows the spend.
4. Under the answer "no cap", a spending call runs and its spend shows in usage; a call that spends nothing is unaffected by any cap.
5. The usage view shows calls, decisions by class, money moved and provider spend per agent.
6. Pause and Pause all agents each stop the next call within 60 seconds, and resume restores access.
7. An agent token cannot resume.

#### BASE-AGENT-012 — Writes are idempotent and conflict-safe

*Tier:* Agent surface

**Requirement.** Every mutating tool requires an idempotency key and takes an optional expected revision. The same key with the same arguments returns the first outcome for at least 24 hours; the same key with different arguments returns `idempotency_conflict`; a stale revision returns `revision_conflict` with the current revision. Long work returns a job handle and a status tool, with no dependence on the Tasks extension.

**Acceptance.**
1. Two calls with one key give one effect and equal results.
2. A retry with a new JSON-RPC id and the same key, after a dropped stream, returns the recorded outcome.
3. The same key with different arguments returns a conflict and no effect.
4. A stale revision returns a conflict naming the current revision.
5. A job handle used by another person's token reads as not found.

#### BASE-AGENT-013 — Manifest, docs and the conformance journey

*Tier:* Agent surface

**Requirement.** `server / discover` instructions and an on-site `/docs/agents` page are generated from the action registry. The page lists tools by job, with each tool's classes, the test that adds each computed class, its scopes, resource templates, event types, capacity limits and error codes, and the specialist role. `prompts / list` carries the specialist's jobs. Base ships the conformance journey, a harness that `rer verify` runs against `rer dev` and seeds run in CI. It is an MCP client; a signed-in test person takes a person's steps (setup answers, approvals, review marks, resume) through the URLs the door returns, and the same browser leg runs the UI-parity actions and the page checks at 1440 and 390. It runs every acceptance point of BASE-AGENT-001 to 012 and of the seed's SURFACE clauses under two company policies: *all autonomous* (`*`), and *held* (standard review, every other class the seed declares approval, which the test person grants), plus the single-class variants a point names. A point that names no disposition passes under both.

**Acceptance.**
1. The docs list exactly the names in `tools / list` and `resources / templates / list`.
2. Each tool's classes, and the test behind each computed one, are documented.
3. The harness fails on any of: a tool without a schema; an effect under approval or blocked, or before setup is complete; a computed class that differs from its fixture; a flag that changes a class or completes a person's step; a role-parity mismatch; a wrong-audience token being accepted; a duplicate effect on retry.
4. Every acceptance point runs under both policies, every decision matches the policy in force, and under all autonomous no call waits for a person or is refused by policy.
5. A stranger agent given only the seed URL completes the specialist journey through MCP.

### Agent surface

**Specialist: Monitoring operator.** It keeps the business's monitoring coverage meaningful, works confirmed incidents through to verified recovery and keeps alert routes and handoffs accountable, acting for the person who sponsors it.

Inherits BASE-AGENT-001 to BASE-AGENT-013. The company's policy decides every call; this section presets none.

**How Uptime computes each class.**
- *standard*: reads of monitors, evidence, incidents, reports and the audit; paused monitor revisions and definition previews; comment additions and edits, mentions of workspace members and root causes; incident ownership; archive and report exports. Each can be withdrawn or corrected in the product. Facts are the item count. Manual checks also carry standard, adding their other classes as computed below.
- *external*: a test send or alert drill, a phone verification code, a scheduled report to a recipient outside the business, a route or an enabled destination that puts a recipient outside the business on the alert path (including code-applied routes and contacts, a monitor's slow-policy destinations and a bulk-created batch's shared alert route), a handoff mapping that exposes incident, maintenance or recovery updates, evidence and attachments to a status page or an outside responder service, a comment published to a status page, and following an Auth0 tenant feed that sends the tenant domain to Auth0. Facts are the recipient count and the counterparty: *known* for a recipient, destination or provider already on record, *new* otherwise, *public* for a status page.
- *money*: SMS and voice sends metered at COST-001's USD price, a phone budget or plan change, a live-effect grant's spend limit and a manual check using an active live-payment or refund grant. Facts are the USD amount and the payee.
- *access*: member invitations, role changes and removals, runner enrollment and revocation, read API, metrics and CI keys, and automation app grants. Facts are the people, credentials or app and whether the change widens or narrows.
- *security*: request credential references, TLS trust exceptions, heartbeat tokens and URLs, destination credentials (endpoint URLs, signing keys, header secrets and bot tokens), live-effect, synthetic and private-network grants, the MFA policy, a member's factor reset, snapshot masks, safe values and email release, discovery source credentials and archive restore. Facts are the setting.
- *destructive*: irreversibly closing a cleanup debt, with the debts closed as its facts; acknowledging, stopping reminders for or resolving an incident when the transition cannot be undone in the product, with the incidents irreversibly changed, including grouped acknowledgments; deleting a comment and its edit history, shortening retained snapshots' expiry, erasing a monitor, destination, import batch or operator, including code-managed destruction, a grant that allows destructive writes, or a manual check using an active destructive-write grant. Facts are the item count per table, or the step and item count for a destructive write or its grant.
- *live*: a manual check of a monitor with setup and cleanup fixtures when the cleanup debts it can open (one for each cleanup step on each probe and attempt) would bring the monitor's open-debt count to the limit, so its next scheduled run would refuse setup, with the monitor affected; resolving a cleanup debt when that takes a running monitor below the open-debt limit so its next run performs setup again, with the monitor affected; acknowledging, stopping reminders for or resolving an open incident of a running monitor when that ends scheduled reminders or a pending fallback, including incidents grouped by acknowledgment, with the monitors, incidents and routes affected; enabling or changing a running monitor, pausing or resuming, maintenance windows, routes and contact schedules, creating, enabling, disabling or removing a destination on a running monitor's route, pausing or revoking an automation on a running monitor's alert path, handoff mappings, code-managed destruction of running monitors, erasing a running monitor, or a destination or operator on a running monitor's alert path, adopting discovered monitors, following or unfollowing catalog dependencies when that starts or stops checks, revoking or relabeling a runner with assigned probes, binding, rotating or revoking a request credential reference used by a running monitor, granting or revoking a grant a running monitor's checks use, rotating or revoking a running heartbeat monitor's token or URL authority, and removing a member or changing their role or scope when that drops a team recipient on a running monitor's route. Facts are the monitors and routes affected.
- *gated*: a step the provider keeps for a person: a Teams admin installing the Uptime Teams app, a buyer connecting their own Twilio account in Twilio's console, a person authorizing Zapier or Make in their own account, and a recipient entering their own phone verification code. Facts are the provider and the step.

**Native door table (ct 2026-10-29T14:12Z).** CORE declares tools, policy, pause, audit and idempotency. Principal authorization and owner-bound tokens always apply. This table records current native tool names, classes and clause metadata; the retained obligations below are the unchanged target capabilities. CORE conformance is measured separately from these unjudged contract obligations.

| Tool | Native action | Core clause metadata | Registry classes | Today |
| --- | --- | --- | --- | --- |
| `uptime.access.update` | Change a native member product role and service/team scopes | ACCESS-001 | access | declared; unjudged |
| `uptime.checks.run` | Queue a real manual check without changing scheduled health | HTTP-001, INCIDENT-001 | external | declared; unjudged |
| `uptime.definitions.preview` | Recognize a native definition file without applying it | CODE-001 | standard | declared; unjudged |
| `uptime.definitions.read` | Read redacted native definitions | CODE-001 | standard | declared; unjudged |
| `uptime.destinations.drill` | Queue a native recipient-confirmed channel drill | DRILL-001 | external | declared; unjudged |
| `uptime.destinations.read` | Read destination metadata without endpoint secrets | DELIVERY-001 | standard | declared; unjudged |
| `uptime.destinations.test` | Queue an attributed native test send | NOTIFY-001 | external | declared; unjudged |
| `uptime.destinations.update` | Update a native notification destination | NOTIFY-001 | live, access | declared; unjudged |
| `uptime.discovery.read` | Read a native discovery outcome | DISCOVERY-001 | standard | declared; unjudged |
| `uptime.discovery.start` | Start bounded native read-only website discovery | DISCOVERY-001 | external | declared; unjudged |
| `uptime.evidence.read` | Read authorized private failure snapshots | EVIDENCE-001 | sensitive | declared; unjudged |
| `uptime.evidence.witness` | Read native monitoring change witness | MONITOR-001, FOLLOWUP-001 | standard | declared; unjudged |
| `uptime.grants.read` | Read native effect and evidence grants | API-004 | standard | declared; unjudged |
| `uptime.grants.update` | Change a native private-evidence viewer grant | EVIDENCE-001 | access, security | declared; unjudged |
| `uptime.incidents.acknowledge` | Acknowledge an incident without asserting recovery | FOLLOWUP-001 | standard | declared; unjudged |
| `uptime.incidents.assign` | Assign an eligible native responder | FOLLOWUP-001 | standard | declared; unjudged |
| `uptime.incidents.note` | Add an internal incident note | FOLLOWUP-001 | standard | declared; unjudged |
| `uptime.incidents.read` | Read incident coordination | FOLLOWUP-001 | standard | declared; unjudged |
| `uptime.maintenance.preview` | Preview an exact native maintenance selection | MAINT-001 | standard | declared; unjudged |
| `uptime.maintenance.read` | Read a monitor maintenance calendar | MAINT-001 | standard | declared; unjudged |
| `uptime.maintenance.update` | Apply the exact previewed maintenance calendar | MAINT-001 | live | declared; unjudged |
| `uptime.monitors.create` | Create a native monitor | MONITOR-001 | live, external, security | declared; unjudged |
| `uptime.monitors.history` | Read immutable check observations | READAPI-001 | standard | declared; unjudged |
| `uptime.monitors.list` | List visible monitors | READAPI-001 | standard | declared; unjudged |
| `uptime.monitors.pause` | Pause native monitor scheduling | MONITOR-001 | live | declared; unjudged |
| `uptime.monitors.read` | Read one monitor | READAPI-001 | standard | declared; unjudged |
| `uptime.monitors.resume` | Resume native monitor scheduling | MONITOR-001 | live | declared; unjudged |
| `uptime.monitors.revisions` | Read immutable monitor revisions | MONITOR-001 | standard | declared; unjudged |
| `uptime.monitors.update` | Update a native monitor definition | MONITOR-001 | live, external, security | declared; unjudged |
| `uptime.privacy.erase` | Erase a native monitor and dependent records | ERASURE-001 | destructive | declared; unjudged |
| `uptime.reports.read` | Read monitor availability report | READAPI-001 | standard | declared; unjudged |
| `uptime.routes.preview` | Preview a native alert route | ROUTING-001 | standard | declared; unjudged |
| `uptime.routes.read` | Read monitor alert routing | ROUTING-001 | standard | declared; unjudged |
| `uptime.routes.update` | Apply an exact native alert-route preview | ROUTING-001 | live, external, access | declared; unjudged |

**Worker admissions — outside the CORE door contract.** ct ruled at 2026-10-29T14:12Z that these are invoke-only and hidden from MCP. Published Base 0.2.93 carries writer `gr-base-0290-invokeonly-1`: `exposure: 'invoke'` is set on all three native definitions. They are absent from MCP discovery, calls and `agent-surface.json`; the 34 public native tools retain their existing classes and clause IDs. Native trusted operation identity and final-admission tests remain required. This closes the exposure dependency formerly recorded against `modules/agent-door/index.ts:32-33,55-62`, `transport.ts:38,45`, `pipeline.ts:33-34`, `registry.ts:10-38`; it does not declare the separate worker lifecycle family complete.

| Worker admission | Classes | Existing clause IDs |
| --- | --- | --- |
| `uptime.checks.dispatch` | external | NETWORK-001, PRIVATE-001 |
| `uptime.destinations.dispatch` | external | DELIVERY-001, NOTIFY-001 |
| `uptime.discovery.dispatch` | external | DISCOVERY-001 |

**Retained capability obligations (ct 2026-10-29T14:12Z).** Renaming changes names only. Each row below retains its complete outcome, existing clause IDs and required class conditions. A native mapping identifies the entry points available today; it does not assert that their narrower implementation completes the outcome. An unmapped operation remains required and pending. The class rules and acceptance points below still govern all of this work. No clause judgment changes in this round.

| Native entry points today | Required outcome, including unfinished work | Existing Core clauses | Required classes |
| --- | --- | --- | --- |
| `uptime.monitors.list`, `uptime.monitors.read`, `uptime.monitors.history`, `uptime.monitors.revisions`, `uptime.evidence.read` | Read monitors, current state, slots, evidence and history | HTTP-001, EVIDENCE-001, STATE-001, PRESENCE-001, PROBE-001, AGENT-002 | standard |
| `uptime.monitors.create`, `uptime.monitors.update` | Create or edit a monitor revision of any kind, with its schedule, locations, assertions and alert policy | HTTP-001, API-001, SLOW-001, API-003, TCP-001, PING-001, DNS-001, TLS-001, DOMAIN-001, UDP-001, MAIL-001, NETWORK-002, SCHEDULE-001, SCHEDULE-002, PERF-001, FLOW-001, FLOW-002, FLOW-004, MANAGE-001, AGENT-001, AGENT-003 | standard or live (+ security) (+ external) |
| `uptime.monitors.pause`, `uptime.monitors.resume` | Pause or resume monitors | MONITOR-001 | live |
| `uptime.monitors.list`, `uptime.monitors.create`, `uptime.monitors.update` | Preview, apply and undo a URL or CSV batch, and clone, tag, search and filter monitors | MONITOR-001 | standard or live (+ external) (+ security) |
| `uptime.checks.run` | Run a manual check now | STATE-001, SCHEDULE-001, AGENT-002, AGENT-005 | standard (+ money) (+ destructive) (+ live) |
| `uptime.definitions.read`, `uptime.definitions.preview` | Preview, apply, export and undo definition files and code bundles, and destroy code-managed resources | IMPORT-001, CODE-001, CODE-002 | standard or live (+ external) (+ security) (+ destructive) |
| `uptime.monitors.create`, `uptime.monitors.update` | Bind, rotate or revoke a monitor's request credential reference | API-002 | security (+ live) |
| `uptime.grants.read` | Grant or revoke a live-effect, synthetic or private-network grant | API-004, FLOW-001, PRIVATE-001 | security (+ money) (+ destructive) (+ live) |
| Pending native operation | Irreversibly close a cleanup debt with a note | API-004 | destructive (+ live) |
| Pending native operation | Issue or rotate a heartbeat token or URL and generate scheduler snippets | HEARTBEAT-001, HEARTBEAT-002, HEARTBEAT-003 | security (+ live) |
| Pending native operation | Enroll, label, upgrade or revoke a private runner | PRIVATE-001, PROBE-001 | access (+ security) (+ live) |
| `uptime.maintenance.read`, `uptime.maintenance.preview`, `uptime.maintenance.update` | Schedule, preview, apply or cancel a maintenance window | MAINT-001 | live |
| `uptime.routes.read`, `uptime.routes.preview`, `uptime.routes.update` | Routes, teams, contacts, delays, repeats, quiet hours and fallback chains | ROUTING-001, ROUTING-002, DELIVERY-002, AGENT-004 | live (+ external) |
| `uptime.destinations.read`, `uptime.destinations.update` | Create, rotate, disable or remove a notification destination, including webhook templates and chat, phone and push destinations | NOTIFY-001, WEBHOOK-001, CHAT-001, PHONE-001, PHONE-002, MANAGE-001 | standard (+ security) (+ destructive) (+ external) (+ gated) (+ live) |
| `uptime.destinations.test`, `uptime.destinations.drill` | Send a test or run an alert drill on one destination | NOTIFY-001, DELIVERY-001, DRILL-001, AGENT-004 | external (+ money) |
| Pending native operation | Send a one-time verification code to a recipient's phone number | PHONE-002 | external · money (+ gated) |
| `uptime.incidents.read`, `uptime.evidence.read` | Read incidents, timelines, next-due follow-up, snapshots, artifacts and diagnostics | FOLLOWUP-001, EVIDENCE-002, DIAG-001, FLOW-003, READAPI-003, AGENT-002 | standard |
| `uptime.incidents.assign`, `uptime.incidents.acknowledge` | Take or reassign ownership, acknowledge, stop reminders or resolve an incident | FOLLOWUP-001 | standard or destructive (+ live) |
| `uptime.incidents.note` | Add, edit or delete a comment, mention a member or set a root cause | INCIDENT-001, INCIDENT-002, INCIDENT-003, INCIDENT-005 | standard (+ destructive) |
| Pending native operation | Publish a comment or correction to the mapped Lamp or Statuspage incident | INCIDENT-004, LAMP-001, AGENT-005 | external |
| Pending native operation | Map Lamp or Statuspage components and Oncall, PagerDuty or Splunk On-Call services | LAMP-001, ONCALL-001, BOUNDARY-001, AGENT-005 | live (+ security) (+ external) |
| `uptime.reports.read` | Read and export uptime, SLA, response-time and slow-time figures and reports | REPORT-001, READAPI-002, METRICS-001 | standard |
| Pending native operation | Schedule a recurring report to recipients | REPORT-001 | standard (+ external) |
| Pending native operation | Follow or unfollow a catalog provider or component and link it to monitors | DEPENDENCY-002 | standard (+ live) (+ external) |
| `uptime.discovery.start`, `uptime.discovery.read` | Authorize a discovery source, run discovery and adopt or reject its proposals | DISCOVERY-001, DEPENDENCY-001, AGENT-001 | standard (+ live) (+ security) |
| Pending native operation | Export the installation, a time range or a subset of monitors | ARCHIVE-001, ARCHIVE-002, OPS-001 | standard |
| Pending native operation | Restore an archive into empty product data | ARCHIVE-001, ARCHIVE-002, OPS-001 | security |
| `uptime.privacy.erase` | Erase a monitor, destination, import batch or operator | ERASURE-001 | destructive (+ access) (+ live) |
| Pending native operation | Search and export the audit | AUDIT-001 | standard |
| `uptime.access.update` | Invite, change the role of, reset the factors of or remove a member | ACCESS-001, ACCESS-003 | access (+ security) (+ live) |
| Pending native operation | Create, limit or revoke read API, metrics and CI keys | READAPI-001, METRICS-001, CODE-001 | access · security |
| Pending native operation | Change the MFA policy | ACCESS-003 | security |
| Pending native operation | Notice time zone and preferences, snapshot retention and redaction settings, the external check URL, the phone budget and the plan | NOTICE-001, COST-001, RETENTION-001, EVIDENCE-002 | standard or live (+ money) (+ destructive) (+ security) |
| Pending native operation | Connect, test, pause or revoke a Zapier, Make or webhook automation | AUTOMATION-001 | security (+ external) (+ gated) (+ live) (+ access) |

**Native resource registry facts.** `uptime://monitors/{id}`, `uptime://monitors/{id}/history`, `uptime://monitors/{id}/revisions`, `uptime://monitors/{id}/uptime`, `uptime://monitors/{id}/response-times`, `uptime://monitors/{id}/failure-snapshots`, `uptime://incidents/{id}`, `uptime://discoveries/{id}`, `uptime://definition-batches/{id}`, `uptime://routes/{id}`, `uptime://destinations/{id}`. These are retained in the descriptor; CORE does not offer public resources, events, prompts or subscriptions, and refuses those undeclared capabilities. The following resource, event and prompt outcomes remain contract obligations, pending their own declared conformance.

**Resources.** `uptime://monitors/{id}`, `uptime://monitors/{id}/revisions/{revision}`, `uptime://slots/{id}`, `uptime://incidents/{id}`, `uptime://destinations/{id}`, `uptime://routes/{id}`, `uptime://maintenance/{id}`, `uptime://reports/{id}`, `uptime://runners/{id}`, `uptime://dependencies/{id}`. **Events.** `incident.confirmed`, `incident.recovered`, `incident.acknowledged`, `slow.opened`, `slow.recovered`, `dependency.notice`, `delivery.failed`, `delivery.uncertain`, `heartbeat.missed`, `certificate.expiring`, `domain.expiring`, `runner.unreachable`, `cleanup.debt_opened`. **Prompts.** keep coverage meaningful (AGENT-001), tell an outage from a network fault or a broken check (AGENT-002), repair browser drift without weakening intent (AGENT-003), keep alert routes accountable (AGENT-004), hand off evidence and verify recovery (AGENT-005).

**Not tools, and why.** The owner console and its accessibility are a person's screen (INTERFACE-001); native iOS and Android clients and their push permission run on a device (MOBILE-001); migration from an incumbent and its sourced history go through the import door (HEARTBEAT-004, MIGRATE-001, MIGRATE-002, MIGRATE-003, MIGRATE-004, MIGRATE-005, HISTORY-001). Scoped door authority (AUTHORITY-001), pinned transport (NETWORK-001), storage custody (RETENTION-001), send semantics and honest delivery claims (BOUNDARY-001), the app origin and its docs (PUBLIC-001), declared public paths (PUBLIC-002), configuration diagnostics (STARTUP-001) and published probe addresses (PROBE-002) are installation facts.

**Limits.** Request rate per public-path class and per key (PUBLIC-002, READAPI-001), body, archive and flow sizes and the number of monitors per installation protect the installation; business limits, thresholds and spend caps are the company's policy.

**Handoffs.** Listens for Oncall acknowledgment and responder status and for Lamp publication outcomes. Emits `incident.confirmed`, `incident.recovered` and `dependency.notice` for the Oncall and Lamp specialists.

#### SURFACE-001 — The registry equals this table and the Base harness passes

*Tier:* Agent surface · *From:* new · *Cites:* BASE-AGENT-001, BASE-AGENT-002, BASE-AGENT-003, BASE-AGENT-013

**Requirement.** Uptime's MCP door serves exactly the tools in the table above, with their declared classes, the Core clauses each covers and the not-a-tool reasons, and the Base conformance harness passes on Uptime's own fixtures.

**Acceptance.**
1. `tools/list` names exactly the tools in the table, each with its declared classes and Core clause ids in `_meta`.
2. The Core clause ids with the not-a-tool reasons cover every Core clause in this contract, and none of those reasons is risk.
3. `resources/templates/list` names exactly the resource templates above, and each write returns a link to the record it touched.
4. The Base conformance harness passes on Uptime's seeded fixtures under both company policies.

#### SURFACE-002 — Live and security are computed per call

*Tier:* Agent surface · *From:* new · *Cites:* BASE-AGENT-006

**Requirement.** Uptime's server computes the live and security classes and their facts from the arguments and current records for every call that can carry them.

**Acceptance.**
1. `uptime.monitors.create` or `uptime.monitors.update` is standard for a paused revision and live, with the monitors affected, for a change to a running monitor or one that enables checks; it adds security when it binds a credential reference or a TLS trust exception. `uptime.monitors.create` or `uptime.monitors.update` adds live, with the monitors affected, when it binds, rotates or revokes a request credential reference used by a running monitor; the same change for a paused monitor does not add live.
2. `uptime.monitors.list` or `uptime.monitors.create` or `uptime.monitors.update`, `uptime.definitions.read` or `uptime.definitions.preview` and the pending settings update operation are standard for paused creations and live when they enable checks or change running monitors. `uptime.monitors.list` or `uptime.monitors.create` or `uptime.monitors.update` adds security, with the setting, when a clone copies a TLS trust exception; a clone of a monitor without one does not add security. `uptime.definitions.read` or `uptime.definitions.preview` is also live when it changes routes, contacts or maintenance or destroys a running monitor, with the monitors and routes affected, and adds security when it binds or changes a request credential reference or destination endpoint credential, with the credential setting. the pending settings update operation adds security, with the setting changed, when it changes snapshot masks, safe values or email release.
3. `uptime.routes.read` or `uptime.routes.preview` or `uptime.routes.update`, `uptime.maintenance.read` or `uptime.maintenance.preview` or `uptime.maintenance.update`, `uptime.monitors.pause` or `uptime.monitors.resume` and the pending handoffs update operation are live with the monitors and routes they change, and the pending handoffs update operation adds security when it stores a connector credential. `uptime.privacy.erase` adds live when it erases a running monitor, or a destination or operator on a running monitor's alert path; the pending automations update operation adds live when it pauses or revokes an automation on that path. Both name the monitors and routes affected; erasure outside running monitors and their alert paths, or an automation pause or revocation outside those paths, does not add live.
4. `uptime.discovery.start` or `uptime.discovery.read` is standard for a run, adds live when it adopts a proposal that enables checks and adds security when it authorizes a provider source credential; the pending dependencies follow operation adds live when following starts checks or unfollowing stops them, with the dependency monitors affected.
5. `uptime.destinations.read` or `uptime.destinations.update` is standard for a name change and adds live when it creates, enables, disables or removes a destination on a running monitor's route, with the routes and monitors affected; outside running monitors' routes those changes do not add live. It adds external as SURFACE-003 specifies for an outside alert recipient, and adds security when it sets or rotates an endpoint URL, signing key, header secret or bot token.
6. Record text or arguments claiming a change is paused, internal or credential-free leave the computed classes unchanged.
7. the pending runners update operation adds live when it revokes or relabels a runner with assigned probes, with the monitors affected; revoking or relabeling a runner without assigned probes does not add live. It adds security when it issues a runner key. `uptime.grants.read` adds live when it grants or revokes a live-effect, synthetic or private-network grant a running monitor's checks use, and the pending heartbeats issue operation adds live when it rotates or revokes a running heartbeat monitor's token or URL authority. Each names the monitors affected; changes to grants or heartbeat authority used only by paused monitors do not add live.
8. `uptime.access.update` adds security when it resets a member's enrolled second factors, with the factor-reset setting; invitations, role changes and removals do not add security for a factor reset. It adds live when a removal or role or scope change drops a team recipient on a running monitor's route, with the monitors and routes affected; a change that drops no such recipient does not add live.

#### SURFACE-003 — External and money are computed per call

*Tier:* Agent surface · *From:* new · *Cites:* BASE-AGENT-006

**Requirement.** Uptime's server computes the external and money classes and their facts from the destination, the recipient and the price on record for every call that can carry them.

**Acceptance.**
1. `uptime.destinations.test` or `uptime.destinations.drill` carries external with its recipient count and counterparty, *known* for a destination already on record and *new* otherwise, and adds money with the USD price when the destination is SMS or voice.
2. the pending phones verify operation carries external and money with the number and the USD price of the code message.
3. the pending incidents publish operation carries external with counterparty *public*; the pending reports schedule operation adds external when a recipient is outside the business; the pending dependencies follow operation adds external with counterparty *known* when following Auth0 sends the tenant domain to Auth0; the pending automations update operation adds external when a test sends an event to the automation.
4. the pending settings update operation adds money with the amount when it changes the phone budget or plan, and `uptime.grants.read` adds money with the spend limit when a grant allows live payments or refunds.
5. Record text or arguments claiming a recipient is internal or a cost is zero leave the computed classes and facts unchanged.
6. `uptime.checks.run` adds money when the monitor holds an active live-payment or refund grant, with the USD amount and payee from the grant and current transaction; a manual check without such a grant does not add money.
7. `uptime.routes.read` or `uptime.routes.preview` or `uptime.routes.update`, `uptime.destinations.read` or `uptime.destinations.update` and `uptime.definitions.read` or `uptime.definitions.preview` add external when a route, an enabled destination or a code-applied contact puts a recipient outside the business on the alert path; `uptime.monitors.create` or `uptime.monitors.update` adds external when a slow policy's destinations include a recipient outside the business, and `uptime.monitors.list` or `uptime.monitors.create` or `uptime.monitors.update` adds external when the created monitors' shared alert route includes one. Each carries the recipient count and counterparty *known* for a recipient already on record and *new* otherwise; a change that exposes alerts only within the business does not add external.
8. the pending handoffs update operation adds external when a mapping exposes incident, maintenance or recovery updates, evidence and attachments to a status page or an outside responder service, with the recipient count and counterparty *public* for a status page, *known* for a PagerDuty, Splunk On-Call or other outside responder service already on record and *new* otherwise; a mapping confined to the business does not add external.

#### SURFACE-004 — Access, destructive and gated are computed per call

*Tier:* Agent surface · *From:* new · *Cites:* BASE-AGENT-006

**Requirement.** Uptime's server computes access, destructive and gated from the people, credentials, records and provider steps a call touches, and marks the steps a provider keeps for a person as gated before they run.

**Acceptance.**
1. `uptime.access.update`, the pending runners update operation and the pending keys update operation carry access with the people or credentials and whether the change widens or narrows; the pending automations update operation adds access when it grants, changes or revokes an automation app's authority, with the app and whether the change widens or narrows.
2. `uptime.privacy.erase` carries destructive with the item count per table and adds access when it erases an operator.
3. `uptime.destinations.read` or `uptime.destinations.update` adds gated when a Teams admin must install the Uptime Teams app or a buyer must connect their own Twilio account, the pending automations update operation adds gated when a person must authorize Zapier or Make, and the pending phones verify operation adds gated for the recipient's own code entry; each gated step names the provider and the step.
4. `uptime.incidents.note` adds destructive when it deletes a comment, with the number of comments whose text and edit history are irreversibly removed; an add or edit does not carry destructive.
5. `uptime.destinations.read` or `uptime.destinations.update` adds destructive when it removes a destination, with the item count per table erased; creating, rotating or disabling a destination does not add destructive.
6. the pending settings update operation adds destructive when it shortens snapshot retention, with the count of retained snapshots whose expiry is shortened; leaving retention unchanged or increasing it does not add destructive for retention and never restores an expiry already shortened.
7. `uptime.definitions.read` or `uptime.definitions.preview` adds destructive when code-managed destruction irreversibly erases a monitor, its evidence or another managed record, with the item count per table; a preview or a reversible definition change does not add destructive.
8. `uptime.checks.run` adds destructive when the monitor holds an active destructive-write grant, with the step and item count; a manual check without such a grant does not add destructive. `uptime.grants.read` adds destructive when it grants authority for destructive writes, with the step and item count; a grant that does not allow destructive writes does not add destructive.

#### SURFACE-005 — The monitoring-operator journey under two company policies

*Tier:* Agent surface · *From:* new · *Cites:* BASE-AGENT-007, BASE-AGENT-013

**Requirement.** A stranger agent given only the seed URL runs a seeded week of Uptime work through MCP under two company policies, one of them autonomous for every class.

**Acceptance.**
1. The seeded week: adopt two discovered monitors, pause one during a maintenance window, work a confirmed outage to recovery with an owner, a comment and a root cause, drill a destination and correct its route, and export the week's SLA report.
2. Under the policy that makes every class autonomous, the week completes with no approval, nothing refused by policy and an empty review feed; the gated steps go to the named people.
3. Under the held policy (standard reviewed, every other class Uptime declares waiting for approval, which the test person grants), each non-standard call waits with no effect and runs once approved, and the review feed lists the standard calls.
4. Under the held policy with live blocked, the adoptions, the pause, the maintenance window and the route change are refused and the rest of the week completes.
5. Before setup is answered, the first call returns `policy_unset` with the setup link, and setup asks every Uptime class with no answer pre-selected.

#### SURFACE-006 — One-way operational actions carry their effects

*Tier:* Agent surface · *From:* new · *Cites:* BASE-AGENT-006

**Requirement.** Uptime computes the irreversible and live effects of manual checks, cleanup-debt resolution and incident response actions from the affected debts, incidents, running monitors and alert routes.

**Acceptance.**
1. the pending cleanup resolve operation carries destructive with the debts irreversibly closed; it adds live, with the monitor affected, when resolving a debt takes a running monitor below the open-debt limit so its next scheduled run performs setup again. A resolution that leaves setup refused, or affects only a paused monitor, does not add live.
2. `uptime.incidents.assign` or `uptime.incidents.acknowledge` is standard for taking or reassigning ownership. Acknowledge, stop and resolve carry destructive with the incidents irreversibly changed, including incidents grouped by acknowledgment; assignment does not carry destructive.
3. `uptime.incidents.assign` or `uptime.incidents.acknowledge` adds live when acknowledge, stop or resolve ends scheduled reminders or a pending fallback on an open incident of a running monitor, including other incidents grouped by acknowledgment. Facts name every monitor, incident and route affected, applying each contact’s acknowledgment policy. Assignment, and a response action that ends no such scheduled reminder or pending fallback, do not add live.
4. `uptime.checks.run` adds live, with the monitor affected, when the monitor runs setup and cleanup fixtures and the cleanup debts this check can open (one for each cleanup step on each probe and attempt) would bring its open-debt count to the limit, so its next scheduled run would refuse setup. A check of a monitor without fixtures, or one whose possible debts cannot reach the limit, does not add live.

## Push further

### Push further with agents

#### AGENT-001 — Continuously maintain meaningful coverage

*Tier:* Core

**Requirement.** An agent compares authorized DNS/sitemaps/OpenAPI, deploy diffs, current definitions and consented route analytics, identifies unmonitored high-value customer paths, stale checks and changed contracts, and drafts a minimal monitor/revision plan with intent, assertions, coverage and cost. Each target, grant and semantic change it proposes carries its class (live when it starts or changes checks, security when it uses a grant), which the company's policy decides; the actions it takes are bounded, reversible and audited. Rejection stays respected, retirement never deletes history and lack of coverage stays visible.

**Acceptance.**
1. Deploy a new checkout route, remove an old route and change an API schema; inspect evidence-backed create/change/retire proposals, and under the held policy a person rejects one and approves another.
2. Under the held policy the rejected proposal starts no traffic, uses no secret and weakens no assertion, and history is retained after retirement.

#### AGENT-002 — Distinguish outage, network and broken check

*Tier:* Core

**Requirement.** The diagnostic agent reads immutable multi-region attempts, DNS/TLS/route evidence, canaries, browser artifacts, recent deploys and dependency incidents; it offers competing hypotheses, citations, counterevidence and confidence, then proposes bounded independent verification. Missing evidence remains Unknown. Its narrative never discards a bad region, weakens an assertion, suppresses a real outage or changes Healthy/Failing, because state comes only from scheduled evidence. Extra traffic outside prior grants is a live call, security when it needs a new grant, and every remediation carries its own class; the company's policy decides each.

**Acceptance.**
1. Cause a target outage, a single probe-network break and a selector drift with healthy API evidence; inspect different hypotheses, contradictory/missing evidence and independent test proposals.
2. Under the held policy a person declines the extra authority, and no verdict changes and no incident is suppressed.

#### AGENT-003 — Repair browser drift without weakening intent

*Tier:* Core

**Requirement.** An agent compares the last passing and failing DOM/trace/screenshots, revision intent and exact required outcomes, drafts a selector/fixture repair and runs old and candidate versions against healthy and intentionally broken paths. A repair candidate keeps every required outcome: it removes no assertion, adds no destination or credential, shortens no path and dismisses no failure to get green; a change that does any of these is an ordinary monitor revision with its own class, which the company's policy decides. Activating the new immutable revision is a live call, which the company's policy decides; under the held policy a person reviews the semantic diff and evidence before it activates. Rejection and rollback are retained.

**Acceptance.**
1. Rename a checkout button while preserving purchase confirmation, request a repair and inject a missing-order-confirmation defect; inspect candidate passing healthy/failing broken paths and unchanged required outcomes.
2. Under the held policy the candidate does not activate until a person approves it, and the approval and rollback are recorded.

#### AGENT-004 — Keep alert routes accountable

*Tier:* Core

**Requirement.** With the company's consent an agent schedules channel drills inside the drill windows and USD phone budgets the company sets, checks credential expiry, separates provider acknowledgment from recipient confirmation and chases the internal route owner through the reminder policy the company sets. It proposes corrected routes and Oncall escalation for unresolved gaps. Messaging a new recipient, rotating a secret or calling a number carries its class (external, security, or external and money), which the company's policy decides within the agent's grant.

**Acceptance.**
1. Consent to scheduled drills, expire a destination and miss confirmation; inspect one bounded drill, due owner reminder, failed-channel evidence and proposed route change.
2. A person declines the change: no new recipient is messaged and no extra phone charge is made.

#### AGENT-005 — Coordinate evidence handoff and verified recovery

*Tier:* Core

**Requirement.** The agent packages confirmed failures and uncertainty for Oncall and Lamp with source-linked regional/API/browser evidence and suggested impact wording. Under an exact repair-workflow grant a person gives it, it follows a repair/deployment in the owner development/CI system, then reruns the original API assertions and safe customer transaction from independent probes and compares before/after. Editing production itself is outside that grant unless the grant names it, and it never claims recovery from a health endpoint alone or weakens the original outcome. Scheduled state alone resolves the incident; downstream handoff failures stay owned and visible.

**Acceptance.**
1. Confirm failed checkout; after a person grants the repair-workflow handoff, deploy a fix that only repairs /health and inspect the unchanged open incident, evidence in Oncall/Lamp and failed original checkout.
2. Deploy the real fix, independently rerun original outcomes and inspect correctly correlated recovery, published under the buyer's own publication choice in Lamp.

## Field proof register

| ID | Proof | Clauses | State | Date | Receipt |
| --- | --- | --- | --- | --- | --- |
| R-1 | Managed geographic locations: real US East, Central and West, Europe and Asia-Pacific vantages on independent networks behind dedicated published egress addresses, and independently placed real-browser vantages | FLOW-001, SCHEDULE-002, PROBE-001, PROBE-002, DIAG-001 | not run | | |
| R-2 | Hosted operation at scale: a hosted Cloudflare installation running 500 monitors at 30 seconds from three managed locations for at least an hour with measured on-time claims and alert latency, its storage capacity and archive size at that scale, measured public-path load capacity and hosted readiness latency | STARTUP-001, PUBLIC-002, MONITOR-001, HEARTBEAT-002, SCHEDULE-002, READAPI-002, ARCHIVE-002 | not run | | |
| R-3 | Authentic incumbent accounts: migrations from real authorized UptimeRobot, Pingdom, Better Stack, Site24x7, Checkly, OpenStatus, Hyperping and Datadog Synthetics accounts with live extraction, count reconciliation and side-by-side cutover | IMPORT-001, HEARTBEAT-004, INCIDENT-005, MIGRATE-001, MIGRATE-002, MIGRATE-003, MIGRATE-004, MIGRATE-005, HISTORY-001 | not run | | |
| R-4 | US carriers and handsets: an approved A2P 10DLC brand and campaign or a verified toll-free sender with a STIR/SHAKEN-attested caller ID, and SMS and voice alerts received and acknowledged on physical AT&T, Verizon and T-Mobile handsets | PHONE-001, PHONE-002 | not run | | |
| R-5 | Store listings and devices: iOS App Store and Google Play listings, and APNs and FCM push delivered to physical devices | MOBILE-001 | not run | | |
| R-6 | Third-party tenants: readback from real authorized Slack, Microsoft Teams (with the Uptime Teams app installed by a Teams admin), Discord, Telegram, Google Chat, Mattermost, PagerDuty, Splunk On-Call, Atlassian Statuspage, Zapier, Make and Datadog accounts, and a hosted Lamp and Oncall | NOTIFY-001, CHAT-001, INCIDENT-004, ONCALL-001, LAMP-001, AUTOMATION-001, METRICS-001 | not run | | |
| R-7 | Live discovery provider accounts: authorized Route 53, Cloudflare, GitHub, Vercel, Netlify and CodeDeploy accounts read through their documented read-only APIs | DISCOVERY-001 | not run | | |
| R-8 | Real identity tenants: SSO and SCIM against authorized Okta, Microsoft Entra ID and Google Workspace tenants | ACCESS-002 | not run | | |
| R-9 | A person confirming receipt: a hosted alert drill delivered to a real inbox and channel and confirmed by its recipient | DRILL-001 | not run | | |
| R-10 | A human screen-reader pass over the owner console journeys | INTERFACE-001 | not run | | |
| R-11 | A VPAT for the owner console | INTERFACE-001 | not run | | |

## Boundaries

- Uptime sells monitoring, diagnosis, follow-up and evidence. Full paging rotations, responder schedules and incident command are provided through Oncall, PagerDuty or Splunk On-Call; SMS/voice go out from Uptime's registered US sender through its Twilio-operated telephony relay (PHONE-002), with a buyer-owned Twilio account optional, and push uses the named platforms. Uptime retains transport and handoff outcomes. It does not guarantee carrier delivery or human action.
- Branded public status pages, subscriber management and public incident narrative live in Lamp or Atlassian Statuspage. Uptime feeds their component/incident APIs and lets the buyer control publication there. It does not rebuild Lamp.
- Website/API synthetic monitoring, page speed and scoped RUM are included. Full infrastructure/APM/log warehousing belongs with [RunEditRun Porthole](https://github.com/just-every/run-porthole), Datadog, Grafana/Prometheus or the buyer's other observability service, linked/exported under METRICS-001. Site24x7 migrations preserve and name records outside this category.
- Browser/API transactions use dedicated synthetic accounts, approved fixtures and sandbox payment modes. Live purchases, production repair, destructive writes and private-network access require exact grants; isolated runners, provider applications and native mobile distribution are engineering obligations, not cuts in scope. Uptime mobile clients operate monitoring; native-app device testing connects to a separate device-testing provider.
- The US is the first market, with USD budgets and US support/phone defaults; global checks are still required. No health-data agreement, regulated compliance certification, fixed storage capacity or hosted SLA is claimed without its own buyer agreement and measured evidence. Raw monitoring evidence and honest Unknown coverage remain accessible without an AI verdict.
- For **BASE-INPUT-002**, Uptime replaces arbitrary-HTML sanitization with no owner-supplied HTML field and derived-only parsing of fetched public target content. For **BASE-INPUT-003**, Uptime has no R2 binding or product attachment-upload route; bounded definitions and archives are structured data, not attachments. For **BASE-PUBLIC-002**, Uptime has no public embeddable surface; only the separately configured private management editor origin is used.
- For **BASE-DATA-005**, the replacement is a standalone native product with no operational dependency on the marketplace or author, plus an optional owner-configured private management editor. That opted-in editor may contact the author when the configured management origin belongs to the author; an absolute author-zero-egress claim therefore does not apply to that configuration. The native product must remain usable without it. No telemetry, license check or kill switch is authorized by this exception. These are explicit scope replacements, not untested baseline passes.
- The optional `IDENTITY_PROVIDER` setup declaration is not a working sign-in feature, and Uptime provides no public embeddable widget.

## Homepage claims

| # | Claim | Clauses |
| --- | --- | --- |
| 1 | Uptime checks your sites and APIs on schedule | HTTP-001, SCHEDULE-001 |
| 2 | It tells you only when a failure is confirmed | STATE-001, SCHEDULE-001 |
| 3 | It never calls a missing check healthy: a result that never arrives or expires is marked Unknown, so a quiet runner can't pass for a healthy site | STATE-001, PRESENCE-001 |
| 4 | Every green dot is a check that actually ran and passed | EVIDENCE-001, STATE-001 |
| 5 | You choose how many failed checks in a row open an incident and how many passes close it | SCHEDULE-001, STATE-001 |
| 6 | Each incident keeps the evidence that justified it: the status, timing and the rule that failed on every check | EVIDENCE-001, HTTP-001 |
| 7 | HTTP and HTTPS checks can assert on status, body text, headers, JSON values and response time | HTTP-001, API-001 |
| 8 | Keyword checks look for the words a page should contain | HTTP-001, API-001 |
| 9 | Heartbeats notice when a cron job or backup stops reporting in | HEARTBEAT-001, HEARTBEAT-002 |
| 10 | Send incidents and recoveries by email, to a Slack incoming webhook, or to a signed JSON webhook, and every enabled destination covers every monitor in your installation | NOTIFY-001, DELIVERY-001 |
| 11 | Run Uptime on your own computer: open-source monitoring you run yourself | PUBLIC-001, STARTUP-001 |
| 12 | A small private runner checks your targets from a machine you choose | PRIVATE-001, AUTHORITY-001 |
| 13 | Export monitors, evidence and delivery history whenever you like | ARCHIVE-001 |
| 14 | Maintenance windows pause alerting while you work on a service | MAINT-001 |
| 15 | Manual checks run now without opening or closing an incident | STATE-001, SCHEDULE-001 |
| 16 | Each heartbeat uses its own token and increasing sequence numbers | HEARTBEAT-001 |
| 17 | Every DNS answer and redirect is validated, then the connection is pinned | NETWORK-001 |
| 18 | The Worker accepts only results signed by your runner | AUTHORITY-001, EVIDENCE-001 |
| 19 | Restored monitors start paused and imported alerts never send | ARCHIVE-001 |
| 20 | 100% free, open source (MIT licensed) alternative to Pingdom, UptimeRobot and Better Stack | PUBLIC-001, MIGRATE-001, MIGRATE-002, MIGRATE-003 |
| 21 | What it doesn't do (yet): no ping or browser checks, no SMS or on-call paging, and one runner is one network vantage | BOUNDARY-001 |

## Status

Judged from the code and tests at commit `886ad3662fec5bdd5c1cd4c7692a9d22d897529f` (29 October 2026). ERASURE-001 public owner erasure, retained stale edit and complete refusal preservation; other clause judgments retained. PRESENCE-001 native contact lifecycle proof replayed at `8862426`; all newer main judgments retained.

| Clauses | Done | Partial | Missing | Total |
| --- | ---: | ---: | ---: | ---: |
| Published | 5 | 16 | 0 | 21 |
| Target and push further | 12 | 62 | 20 | 94 |
| All | 17 | 78 | 20 | 115 |


| Clause | Title | Kind | Status | Evidence | Gap |
| --- | --- | --- | --- | --- | --- |
| `HTTP-001` | Signed HTTP monitoring | published | partial | `src/domain/worker-http.server.ts`; `runners/src/probes.mjs`; `tests/tls-auth.mjs`; `tests/probe-native-evidence.mjs`; `docs/evidence/contracts/release-0.4.0/` | Retained assertions cover saved HTTP criteria, signed HTTP status/text failures, recovery and immutable assertion history. Gap: keyword-type monitor creation, scheduled hosted HTTPS work, signed runner HTTPS work and retained transport evidence by category lack assertions in the cited files; the HTTPS assertions called by tests/tls-auth.mjs are only in uncited helper files. |
| `EVIDENCE-001` | Immutable scheduled evidence | published | partial | `src/domain/evidence.server.ts`; `src/domain/history.server.ts`; `tests/probe-native-evidence.mjs`; `docs/evidence/contracts/release-0.4.0/`; `tests/evidence-integrity-support.mjs` proveEvidenceIntegrity — late fresh-signature completion refusal and contradictory first-copy preservation assertions (qualification pending) | Failure and retry observations and identifiable history remain asserted. Gap: late and duplicate first-copy-wins behavior, history after Worker restart, a retained attempt's revision, full durable-state preservation after refusal and observation/state/outbox atomicity after acceptance lack assertions in the cited files. |
| `STATE-001` | Fixed coverage and incident hysteresis | published | partial | `src/domain/policy.mjs`; `tests/control-runtime.mjs`; `tests/control-runtime.mjs`; `docs/evidence/contracts/release-0.4.0/` | Two configured runner networks still prove confirmed Failing and the scheduled confirmation/recovery thresholds. Gap: exactly one failing vantage reading Degraded; Unknown for partial, missing and stale evidence; the intermediate Recovering state; and no fabricated recovery from a manual pass during an outage, an absent selected probe or maintenance expiry lack assertions in the cited files. Maintenance expiry is asserted only in tests/maintenance-windows.mjs, which this clause does not cite. |
| `AUTHORITY-001` | Server-side scoped authority | published | partial | `src/domain/control.server.ts`; `tests/operator-security.mjs`; `tests/access-matrix.mjs`; `tests/signed-runner.mjs`; `docs/evidence/contracts/release-0.4.0/` | Carried-done audit: refusal of an expired runner signature or acceptance window is asserted only in `tests/control-runtime.mjs`, which this clause does not cite. Signed-out, expired and revoked sessions, cross-origin requests and a foreign runner signature are refused with no product writes, and the authorized session and scoped runner then succeed. |
| `NETWORK-001` | Pinned bounded destination execution | published | partial | `runners/src/public-http.mjs`; `src/domain/worker-http.server.ts`; `tests/tls-auth.mjs`; `tests/api-auth-journey.mjs` | Cross-origin authentication, client-certificate and body stripping are asserted. Gap: mixed DNS answers, rebinding before connection, TLS hostname mismatch, re-resolution of every redirect, HTTPS downgrade and forbidden redirect refusal, exact-origin credential binding, timeout/body/encoding bounds and zero connections to rejected destinations lack assertions in the cited files. tests/tls-auth.mjs calls assertions in helper files this clause does not cite. |
| `HEARTBEAT-001` | Revision-scoped receipt evaluation | published | partial | `src/domain/heartbeat.server.ts`; `runners/src/probes.mjs`; `tests/signed-runner.mjs`; `docs/evidence/contracts/release-0.4.0/` | Carried-done audit: no cited test sends a receipt bound to another revision of the monitor, so the foreign-revision case is unasserted. Token issue and rotation, increasing receipts, a missed run, signed scheduled snapshots and the refusal of replayed, old-token and imported receipts are asserted. |
| `ARCHIVE-001` | Inactive validated restore | published | partial | `src/domain/archive.server.ts`; `src/domain/archive-monitor-validation.ts`; `tests/archive-roundtrip.mjs`; `tests/command-journey.mjs`; `docs/evidence/contracts/archives/`; `docs/evidence/contracts/release-0.4.0/` | Carried-done audit: no cited test restores an archive together with a later erasure journal, so enforcement of later erasure journals is unasserted here. Export of TCP, DNS, TLS and domain monitors, a separate receiving owner, import into empty product data, re-export, repeated restore, exact settings, revisions and slots, paused definitions, interrupted leases, quarantined delivery, absent secrets and authority, retained history and refusal of corrupt and nonempty imports are asserted. |
| `IMPORT-001` | Reviewed definition files and inactive imports | published | partial | `src/domain/definitions/importers/uptimerobot.ts`; `src/domain/business-import/mapping.server.ts`; `tests/definitions-import.mjs` | Synthetic saved-page/JSON tests only; real export and hosted import remain unmeasured. Apply resumes in atomic batches, not one whole-plan transaction; the intended whole-plan atomicity guarantee remains unresolved. |
| `RETENTION-001` | Explicit storage custody | published | done | `src/domain/maintenance.server.ts`; `tests/erasure-audit.mjs`; `tests/retention-cleanup-proof.mjs`; `tests/alert-drill.mjs` |  |
| `ERASURE-001` | Operator-directed entity erasure | published | done | `tests/erasure-audit.mjs` — public owner erasure and later-journal restore: monitor, destination and second-operator erasure, populated per-table receipts, atomic audit and portability fences, held runner and notification refusal, anonymized actors and old-archive refusal; `tests/erasure-race-support.mjs` — erasureRaceProof, mounted once by the erasure journey: an actual owner PATCH based on revision 3 stays open across monitor erasure, resumes with refusal and cannot restore any durable row; unsigned, wrong-name and last-owner erasure refusals preserve all 197 durable tables, including populated transfer custody, receipts, audit and fences; `tests/alert-routes.mjs` — owned routes preview inheritance, deliver matched triggers and recoveries and retain auditable changes, calling `tests/catalog-routes-support.mjs` proveCatalogRoutes: original-owner erasure with an enrolled successor, anonymized retained ownership and surviving fresh sign-in and factor authority. | |
| `AUDIT-001` | Durable anonymized audit | published | done | `src/domain/audit.server.ts`; `tests/erasure-audit.mjs`; `tests/archive-roundtrip.mjs` |  |
| `PRESENCE-001` | Contact separate from health | published | done | `tests/signed-runner.mjs` calls `tests/signed-runner-contact.mjs` proveRunnerContact: Never seen, accepted idle claims and real signed results record distinct server receipt times; fresh at 119999 and 120000 ms, stale at 120001 ms; foreign identities, revoked authority, invalid signatures, owner reads and health reads preserve stored contact and target evidence; persistent Worker restart retains exact contact; unavailable overview returns 503 without invented contact or Healthy targets; fresh contact coexists with genuine Failing and Unknown targets at the fixed denominator; native export omits contact and receiving restore keeps history inactive, contact Never seen and source runner authority refused. `tests/signed-runner-result-proof.mjs` proveFreshResultSignature: rejected and duplicate actual signed results preserve every non-admission table. | |
| `INTERFACE-001` | Honest durable operator feedback | published | partial | `src/routes/_console.tsx`; `public/monitor-page.js`; `public/dom-patch.js`; `tests/operator-browser.mjs`; `tests/operator-browser.mjs`; `tests/recovery-browser.mjs`; `tests/notify-delivery.mjs`; `docs/evidence/contracts/release-0.4.0/`  `tests/hosted-auth-browser.mjs` (native complete-owner sign-in forwarding, MFA-owed refusal and typed setup name in setup, Settings and member/incident-assignment data at 1440/390); | The cited console journeys assert textual health/freshness/reasons, assertion editing and refusal, read/action errors, polling, keyboard focus, overflow, accessibility-tree semantics and axe at 1440. Gap: those same journeys at the required 390 width are unasserted after removal of their 390 runs. |
| `NOTIFY-001` | Authorized installation-wide destinations | published | partial | `src/domain/notification-destinations.server.ts`; `src/domain/notification-protocols.ts`; `tests/notify-delivery.mjs`; `tests/hosted-alerts.mjs`; `docs/evidence/contracts/release-0.4.0/` | Carried-done audit: rotating and disabling a destination are asserted only in `tests/notify-delivery.mjs` and `tests/notify-delivery.mjs`, which this clause does not cite. Creating email, Slack and signed webhook destinations, scheduled failure and recovery and test sends through the runner and Worker doors, one job per destination, credential custody, exact signing, escaping and unchanged health for tests are asserted. |
| `DELIVERY-001` | Bounded notification acknowledgment | published | partial | `src/domain/notification-claims.server.ts`; `tests/notify-delivery.mjs`; `tests/notify-delivery.mjs`; `docs/evidence/contracts/release-0.4.0/` | Carried-done audit: the proven-unaccepted RER relay 429 and its automatic requeue are asserted only in `tests/hosted-alerts.mjs`, which this clause does not cite, and no cited line shows acceptance kept apart from receipt. Accepted, HTTP 500, timeout and connection-loss outcomes, restart during claims, no requeue of an endpoint 429 and no replay of uncertain sends are asserted. |
| `PUBLIC-001` | Public landing and documentation | published | partial | `src/server.ts`; `src/routes/docs.index.tsx`; `tests/public-paths.mjs`; `tests/public-paths.mjs`; `docs/evidence/contracts/release-0.4.0/`; `tests/public-surfaces-support.mjs`; `tests/access-matrix.mjs` asserts signed-in console aliases and rendered documents. | Carried-done audit: signed-in `/app` and `/app/monitor` are asserted only in `tests/installer-support.mjs` (called from `tests/public-paths.mjs`), which this clause does not cite, and no cited test reads `/setup` signed out, reads the separate marketing site and its `/run` page or compares the two surfaces. The signed-out Lobby and docs and the refusal of unsigned private documents are asserted. |
| `BOUNDARY-001` | Monitoring ownership and honest delivery claims | published | partial | `tests/notify-delivery.mjs`, existing DELIVERY-002 deduplicated retry journey extended by `tests/notify-oncall-fixture.mjs` (proveOncallHandoff: configured native handoff; distinct facts and one acknowledgment; lost provider and bounded retry; lost probes without recovery; distinct network labels); `docs/oncall-handoff.md` | Native Oncall handoff ships through signed-webhook configuration and private delivery and incident reads. Received remains unknown: Oncall exposes no scoped native alert receipt read door. Responded remains unknown: no scoped native door attributes human response to the source, key and generation. Handoff-specific console rendering remains with uip; other named connectors remain under their own clauses. |
| `DRILL-001` | Recipient-reported alert drills | published | done | `src/domain/alert-drills.server.ts`; `tests/alert-drill.mjs` |  |
| `STARTUP-001` | Required configuration diagnostics | published | partial | `src/domain/startup-config.mjs`; `tests/public-paths.mjs` | Missing SESSION_SECRET returns Worker health 503 with a named, value-free diagnostic, and restored configuration returns 200. Gap: other missing/malformed and conditional bindings, scheduled/local-app/preview/setup/deployment/private-runner entry points, missing ASSETS, a D1 readiness fault and the three-second fault-response budget lack assertions in the cited files. |
| `PUBLIC-002` | Declared sessionless paths and rate limits | published | partial | `src/domain/public-rate-limits.server.ts`; `tests/public-paths.mjs` | Carried-done audit: the Retry-After header on a 429 is read only by the `limited` helper in `tests/public-paths-support.mjs`, which this clause does not cite. Enumeration of declared paths against emitted routes, the 429 past a class limit, fail-closed admission without counter storage and each route's own authentication are asserted. |
| `FLOW-001` | Supported isolated browser transactions | published | partial | `src/domain/flow.mjs`; `runners/src/flow/run-flow.mjs`; `src/domain/flow-changes.server.ts`; `tests/flow-journey.mjs`; `tests/flow-journey.mjs`; `tests/flow-profiles.mjs`; `docs/browser-flows.md` | Login, synthetic signup and sandbox order submission now run through the real Worker and two isolated signed runner processes, with retained missing-control, HTTP-error, missing-outcome, navigation-timeout, private-redirect, metadata and extra-origin failures, unchanged-definition scheduled recovery and unavailable-browser Unknown. Navigation timeouts no longer claim a clicked control was missing; numeric forbidden destinations are refused before browser dispatch as well as at the proxy. Local 1440/390 evidence and guide journeys are proven; independently placed browser-vantage and hosted customer-path qualification remain open. |
| `MONITOR-001` | Owned monitor catalog and lifecycle | target | partial | `src/domain/catalog/`; `src/domain/alert-routes.server.ts`; `public/assets/alert-route.js`; `tests/catalog.mjs`; `tests/alert-routes.mjs`; `docs/evidence/contracts/routing/`; `src/domain/catalog/routes.server.ts`; `migrations/0072_named_alert_routes.sql`; `scripts/routing.mjs`; `tests/catalog-routes-support.mjs` (called by the existing `tests/alert-routes.mjs` registration) | Catalog metadata, retained URL search/filter/selection and reviewed undoable lifecycle/URL/CSV batches ship. Existing monitor/service/group/installation recipient selection and matched recovery remain supported. Immutable named copies of reviewed explicit monitor routes now have owner-only fresh-MFA API/CLI selection preview (counts, per-monitor before/after, refusals and no-confirmed-recipient warning), atomic assignment and undo. The existing routing registration proves zero-write preview; admin/email-only and stale/race refusal; an actual confirmed incident reaching the route's separately confirmed fake-mail recipient while an unassigned monitor sends nothing; undo restoring inheritance/overrides after checks run without touching definitions, evidence or consent; later-route conflict refusal; local-only archive authority; monitor erasure and anonymized batch ownership. Issuer erasure removes session-bound MFA rows before invitation-derived Base sessions and preserves the surviving owner's factor and fresh sign-in. The existing catalog registration proves undo retains a clone's real signed HTTP observation, its scheduled slot and every history record. The list journey in `tests/operator-browser.mjs` proves planned, recurring, quick and inactive maintenance at 1440 and 390 with zero axe violations, no overflow or console errors. Gaps: held console batch-route control; naming is limited to reviewed explicit monitor policies and saved names have no edit/remove door; route defaults during URL/CSV bulk creation; removal of a never-probed clone; USD pricing; the 500-monitor target; hosted capacity/timing acceptance. Current installation cap: 100 monitors. History-bearing clones remain paused and retained by undo. |
| `API-001` | Complete HTTP and API assertions | target | partial | `src/domain/http-assertions.mjs`; `src/domain/http-assertions/`; `src/domain/evidence.server.ts`; `tests/tls-auth.mjs`; `tests/probe-native-evidence.mjs`; `docs/evidence/contracts/http-assertions/`; `tests/probe-json-evidence-support.mjs` | Saved criteria and independent present/absent keyword, status set/range, response-header, root JSON-member, regex and latency failures remain asserted. Gap: independently breaking JSON arrays and nested JSONPath expressions lacks an assertion in the surviving cited files; the root-member scenario does not prove those cases. |
| `SLOW-001` | Slow-response alerts distinct from outages | target | done | `src/domain/slow-evaluation.mjs`; `src/domain/slow-notices.server.ts`; `src/domain/slow-import.ts`; `src/domain/reports/slow.server.ts`; `public/slow-policy.js`; `tests/slow-responses.mjs`; `tests/definitions-import.mjs`; `docs/evidence/contracts/slow-responses/` |  |
| `API-002` | Authenticated monitoring and secret lifecycle | target | partial | `runners/src/auth/`; `runners/src/credentials.mjs`; `src/domain/credential-binding.mjs`; `tests/api-auth-journey.mjs`; `tests/tls-auth.mjs`; `tests/api-auth-journey.mjs`; `docs/evidence/contracts/trust-auth/` | Digest, OAuth acquisition/refresh, JWT, mTLS, expiry, rotation/revocation, cross-origin stripping, failure/recovery and archive secret exclusion remain asserted. Gap: Basic authentication, standalone bearer credentials scoped to their own monitor, foreign-reference refusal and planted-secret absence from storage, logs and browser artifacts lack assertions in the cited files. |
| `API-003` | Multi-step API transactions | target | done | `src/domain/api-transaction.mjs`; `runners/src/api-transaction.mjs`; `tests/api-transaction-journey.mjs`; `tests/api-transaction-journey.mjs` |  |
| `API-004` | Safe setup and teardown | target | done | `runners/src/api-steps.mjs`; `runners/src/flow/run-flow.mjs`; `src/domain/api-effects.mjs`; `src/domain/cleanup-debt.mjs`; `src/domain/cleanup-debt.server.ts`; `src/domain/effect-grants.server.ts`; `src/domain/cleanup-debt-archive.ts`; `migrations/0058_cleanup_debt_and_effect_grants.sql`; `public/cleanup-debt.js`; `tests/api-transaction-journey.mjs`; `tests/api-transaction-journey.mjs`; `docs/evidence/contracts/cleanup-debt/` |  |
| `TCP-001` | TCP service checks | target | partial | `src/domain/protocol/settings.mjs`; `src/domain/protocol/evaluate.mjs`; `runners/src/protocol-probes.mjs`; `src/domain/worker-protocols.server.ts`; `tests/protocol-monitors.mjs` | Carried-done audit: every cited TCP check runs from one location, so running from two locations is unasserted. Owner-API creation, open, refused and blackholed ports, the pinned address and banner evidence and trigger and recovery events are asserted. |
| `PING-001` | ICMP reachability and packet quality | target | partial | `runners/src/icmp-probe.mjs`; `src/domain/protocol/`; `tests/ping-monitors.mjs`; `tests/ping-monitors.mjs`; `docs/evidence/contracts/ping/` | Configured ICMP loss and latency, threshold failures, disabled or unavailable ICMP, and initial Unknown probe coverage are asserted. Unknown coverage after stopping a previously running probe is not asserted; the cited stopped-probe case only creates an unchecked monitor. |
| `DNS-001` | DNS records and change detection | target | partial | `src/domain/protocol/dns.mjs`; `src/domain/protocol/dns-wire.mjs`; `src/domain/protocol/evaluate.mjs`; `tests/protocol-monitors.mjs` | Carried-done audit: no cited DNS check runs inside a maintenance window. Saving through the owner door, changed and removed records, resolver disagreement and failure, raw bounded record evidence, confirmed alerts and recovery, and refusing to treat a missing answer as success are asserted. |
| `TLS-001` | SSL certificate and chain monitoring | target | partial | `src/domain/protocol/x509.mjs`; `src/domain/protocol/tls12-certificates.mjs`; `src/domain/expiry-notices.server.ts`; `tests/protocol-monitors.mjs` | Carried-done audit: the cited test presents one certificate at one stage and repeats the check without moving the clock, so warnings advancing through the configured stages without repeating are unasserted. The named warning with its stage and accountable owner, no repeat within a stage, wrong-name and untrusted-chain failures as location evidence and renewal resolution are asserted. |
| `DOMAIN-001` | Domain registration expiry | target | partial | `src/domain/protocol/rdap.mjs`; `src/domain/expiry-notices.server.ts`; `tests/protocol-monitors.mjs` | Carried-done audit: the cited test adds the domain through the owner API, not the console. Approaching-expiry warnings, Unknown for conflicting, redacted and unavailable data, registry and registrar source times and renewal follow-through are asserted. |
| `UDP-001` | UDP request and response checks | target | done | `runners/src/udp-probe.mjs`; `src/domain/protocol/settings.mjs`; `src/domain/protocol/facts.mjs`; `tests/udp-monitors.mjs`; `tests/udp-monitors.mjs`; `docs/evidence/contracts/udp/` |  |
| `MAIL-001` | SMTP and mailbox protocol checks | target | done | `runners/src/mail/`; `src/domain/mail-probe/`; `tests/mail-journey.mjs`; `tests/mail-journey.mjs` |  |
| `NETWORK-002` | Explicit TLS trust exceptions for legacy targets | target | done | `src/domain/tls-trust.mjs`; `runners/src/tls-connection.mjs`; `src/editor/monitor/tls-fields.mjs`; `tests/tls-auth.mjs`; `tests/tls-trust-journey.mjs`; `docs/evidence/contracts/trust-auth/` |  |
| `HEARTBEAT-002` | Cron and job heartbeat schedules | target | partial | `src/domain/heartbeat-cron.mjs`; `src/domain/heartbeat.server.ts`; `src/domain/heartbeat-snippets.mjs`; `tests/signed-runner.mjs`; `tests/signed-runner.mjs`; `tests/signed-runner.mjs`; `docs/evidence/contracts/job-schedules/` | Cron/IANA schedules with explicit DST skip/first-repeat rules, deadline previews and masked exit/duration history ship, and Worker and signed-runner failure/recovery and desktop/phone save/error/reload/focus/axe/reflow are proven. Remaining: hosted SCHEDULE-002 timing. |
| `HEARTBEAT-003` | Heartbeat receipt forms and scheduler snippets | target | partial | `src/domain/heartbeat-cron.mjs`; `src/domain/heartbeat.server.ts`; `src/domain/heartbeat-snippets.mjs`; `tests/signed-runner.mjs`; `tests/signed-runner.mjs`; `tests/signed-runner.mjs`; `docs/evidence/contracts/job-schedules/` | GET/HEAD/POST receipts, hashed rotatable replay-unprotected URL capabilities, protected header sequences and nine generated scheduler examples ship. Executed curl/wget/Bash wrappers, parsed GitHub Actions workflow steps and Kubernetes command/args and parsed systemd service/timer units with executed ExecStart are proven, all six formats preserving start/completion receipts, measured duration and success/failure exit codes; YAML uses a real parser and systemd calendars use systemd-analyze, and no cluster, user manager or hosted Actions run is claimed. Remaining: native PowerShell/Windows and actual systemd user-manager/Kubernetes cluster/GitHub scheduler execution; arbitrary cron conversion for the labeled daily scheduler examples. |
| `HEARTBEAT-004` | Heartbeat settings from incumbents | target | partial | `src/domain/heartbeat-cron.mjs`; `src/domain/heartbeat.server.ts`; `src/domain/heartbeat-snippets.mjs`; `tests/signed-runner.mjs`: signed job failure, duration and recovery; `tests/definitions-import.mjs`: reviewed saved heartbeat pairs and paused apply; `tests/signed-runner-heartbeat-import.mjs` proveImportedHeartbeatJobs (invoked by `tests/signed-runner.mjs`): both exact source documents through owner activation, new local URL, no early failure, signed 65-minute deadline incident, retained labeled late recovery, inert source authority and revoked local URL; `docs/evidence/contracts/job-schedules/` | Saved UptimeRobot and Better Stack 60-minute period plus five-minute grace previews and paused apply, explicit owner activation with a newly issued local URL, signed local evaluation with no early failure and a 65-minute deadline incident, retained labeled late-success recovery, no ingress health changes or source-alert replay are proven. Remaining: remaining documented UptimeRobot and Better Stack source mappings and separate alert-setting reconciliation; Site24x7 threshold review and explicit owner-selected local period/grace conversion; live source-account cutover. Pingdom has no heartbeat check; nothing to migrate. |
| `SCHEDULE-001` | Explicit cadence, retries and confirmation | target | done | `tests/control-runtime.mjs` — CONTROL-001 and RESTART-001: owner-saved cadence, retained retries within their original slots, scheduled confirmation and recovery thresholds, delayed claims and manual evidence; `tests/control-cadence-support.mjs` — proveCadenceRevision, called by that runtime journey: owner interval edit and revision and next-due readback, claims before and after due time with real signed runners, new-interval spacing, manual-pass isolation, delayed claims without catch-up checks, immutable old and new slot selections and assignments, and fixed coverage with a missing probe Unknown; `tests/signed-runner.mjs` — signed owner-to-runner lifecycle: authenticated signed completion, retained revision history and manual execution isolated from scheduled health. | |
| `SCHEDULE-002` | Interval floor, on-time execution and alert latency | target | partial | `src/domain/policy.mjs`; `src/domain/schedule.ts`; `tests/signed-runner.mjs` | Intervals from 5 seconds (60-second default, 5-minute browser floor) are accepted and due times are enforced; hosted Cron runs each minute, and on-time rate at scale, alert latency and the detection-time display are unmeasured or absent. |
| `PROBE-001` | US and global independent locations | target | partial | `src/domain/runner-registration.server.ts`; `src/domain/policy.mjs`; `tests/control-runtime.mjs` | Multiple signed runners, labels and agreement exist; managed geographic placement and independent hosted coverage are not provided or proven. |
| `PROBE-002` | Published probe addresses and identification | target | partial | `src/domain/worker-http.server.ts`; `runners/src/public-http.mjs`; `tests/tls-auth.mjs` | Hosted and runner requests send a release-identifying User-Agent; dedicated egress, published address files/DNS/API, change notice and the WAF header do not exist. |
| `PRIVATE-001` | Buyer-network private locations | target | done | `src/domain/private-target.mjs`; `runners/src/private-network.mjs`; `src/domain/runner-registration.server.ts`; `tests/private-network.mjs`; `tests/private-network.mjs`; `docs/evidence/contracts/private-locations/` |  |
| `MAINT-001` | Planned and recurring maintenance | target | partial | `src/domain/planned-maintenance/`; `src/domain/planned-maintenance.server.ts`; `public/planned-maintenance.js`; `tests/maintenance-windows.mjs`; `tests/archive-roundtrip.mjs`; `docs/evidence/contracts/maintenance/` | DST previews, one-time group pause and suppression with failing monitors, restart, cancellation, expiry, preserved observations and separate maintenance report denominators are asserted. A New York recurring window scheduled across a DST transition and a monitor failing during a recurring window are not asserted. |
| `REPORT-001` | Latency, uptime and SLA reporting | target | partial | `src/domain/reports/`; `scripts/reports.mjs`; `tests/reporting.mjs` (proveScheduledReports in `tests/report-schedules-support.mjs`); `tests/reporting.mjs` (scheduled report outcome at 1440/390); `docs/scheduled-reports.md`; `public/assets/report-schedule-controls.js`; `tests/reporting.mjs`; `migrations/0075_recurring_reports.sql`; `src/domain/reports/recurring.server.ts`; `tests/report-recurrences-support.mjs` (proveRecurringReports); `tests/reporting.mjs` (proveRecurringReportConsole) | Per-monitor custom/24h/7d/30d/90d snapshots share immutable coverage, location latency, root causes, Unknown/paused/maintenance denominators, SLA and separate Slow time across console/CSV/JSON/API/PDF. Heartbeat runs retain paged zone-aware receipt records; snapshots and paging focus survive polling. One-time per-monitor schedules freeze the same period-engine figures for an existing enabled email or Slack destination, retain initiating owner and due time, and use existing single-attempt delivery custody. API/CLI proof covers future-send refusal, restart before due, durable email uncertainty/Slack failure, matching period/zone/denominator figures and no duplicate on resume. The Notifications console shows scheduled delivery outcomes and one-time creation/cancellation controls at 1440/390. Queued cancellation is atomic, idempotent and retained with the report_cancelled reason across restart through API/CLI; a delivery that has started cannot be recalled. Daily/weekly/monthly schedules now retain an IANA zone, immutable anchor and owner admission; due occurrence snapshot, unique delivery and next occurrence commit together. The public calendar preview and CLI prove DST gaps/repeats and month-end clamping; missed occurrences skip to the next anchored time without a catch-up burst. Per-monitor and named service-member figures use the same period engine and summed observed denominators; READAPI-002 JSON/CSV and frozen console downloads agree. tests/report-recurrences-support.mjs (proveRecurringReports within tests/reporting.mjs and tests/reporting.mjs) proves real due/restart, single-attempt email/Slack outcomes, owner/destination revocation, cancellation, scoped service reads, inactive snapshot restore without recurrence authority, corrupt service-denominator refusal before restore writes, and aggregate-member erasure. tests/reporting.mjs (proveRecurringReportConsole) proves creation for each cadence, previews, service selection, frozen outcome/download and stop reasons at 1440/390 with axe/reflow. Gap: HISTORY-001 other-incumbent history, source-segment charts and source incident lists in the held monitor report view, and service charts. UptimeRobot source segments, denominators and labeled blending now ship through report JSON/CSV/PDF and explicit read-API source selection. Recurrence authority stays installation-local; frozen scheduled report history restores inactive. No combined service percentile is claimed; each member retains its own latency figures. The held public/monitor-report.js is unchanged. No live provider receipt is claimed. |
| `EVIDENCE-002` | Failure snapshot and incident report | target | partial | `src/domain/failure-snapshot.mjs`; `src/domain/failure-snapshot-text.mjs`; `src/domain/failure-page-custody.server.ts`; `runners/src/failure-page-screenshot.mjs`; `src/domain/failure-evidence-access.server.ts`; Acceptance 1: `tests/failure-page-journey.mjs` owners capture safe failure pages, share only monitor evidence, export every artifact and revoke access, with `tests/failure-page-custody-support.mjs` assertStoredFailureHeaders, proves stored request and response header sets retain explicitly safe values and mask planted secrets; `tests/failure-page-browser.mjs` failurePageBrowser proves owner incident screenshot and report reads. Acceptance 2: the same journey and `tests/failure-page-custody-support.mjs` proveFailureSnapshotErasure prove access refusal, archive round-trip, public monitor erasure with durable per-table receipt, removal of snapshot and encrypted artifact copies from all durable tables and transfer storage, refused public reads, clean later native and transfer exports, and refusal of a snapshot-bearing old archive with the source's later journal before any product or audit rows change. `tests/failure-page-browser.mjs` failurePageBrowser proves granted and revoked member access; `tests/notify-delivery.mjs` proves cause and authenticated incident links on actual alert transports; the failure-page journey retains alert excerpt and secret exclusions. | Masked failure-page capture, owner incident screenshot/report reads, access refusal, archive round-trip, an erasure receipt and alert excerpt/secret exclusion remain asserted. Gap: reading both stored request/response header sets through the owner incident door, confirming every erased snapshot copy is gone and refusing an old snapshot archive using a later erasure journal lack assertions in the surviving cited files. |
| `DIAG-001` | Connection and network diagnostics | target | partial | `runners/src/network-diagnostics.mjs`; `runners/src/network-phase-capture.mjs`; `runners/src/protocol-diagnostics.mjs`; `runners/src/dns-diagnostics.mjs`; `src/domain/network-diagnostics.mjs`; `src/domain/network-diagnostic-peers.server.ts`; `src/domain/worker-protocol-diagnostics.server.ts`; `public/assets/failure-snapshot-view.js`; `tests/protocol-monitors.mjs` (owner-to-runner TCP/DNS/TLS lifecycle and proveNetworkDiagnostics in `tests/network-diagnostics-support.mjs` with `tests/connection-diagnostics-protocols.mjs`); `tests/udp-monitors.mjs`; `tests/ping-monitors.mjs`; `tests/mail-journey.mjs`; `tests/hosted-alerts.mjs`; `tests/failure-page-browser.mjs` (diagnosticBrowser, protocolDiagnosticBrowser, within the protocol journey) | HTTP/keyword and TCP, TLS, DNS, UDP, ping and mail connection failures retain bounded diagnostics in the existing failure-snapshot custody. Original pinned transports supply measured phases; numeric traceroute stays at five hops, one packet per hop, a three-second deadline and 16 KiB native-output cap, without another resolution or connection. Controlled TCP/TLS timeouts and refusals, DNS/certificate failures, UDP timeout, ICMP loss and mail connection/TLS failures (including a distinct receiving-mailbox pin) pass signed intake, incident detail/report, healthy-peer comparison, blocked-path reasons, unchanged verdicts, forged/oversized refusal, inactive restore and erasure. Incident diagnostics have 1440px reflow/axe assertions and 1440/390 browser proof; hosted socket phases/tracing and private-network tracing are explicitly unavailable. Gap: real independent-location route/TLS/DNS qualification remains unproved. |
| `PERF-001` | Page speed and real-user performance | target | partial | `tests/flow-journey.mjs` with `tests/pagespeed-support.mjs` provePageSpeed: mobile CLS above the 0.1 budget with retained failing budget:cls, desktop within budget, measured phone-profile RUM CLS, US and Canadian checkout rows each retaining one view, an actual consenting phone-profile HTTP 500 page measured unavailable by the shipped beacon, and the existing waterfall, LCP, TBT and error budgets, incident and email, healthy health endpoint, consent, sampling, exclusions, privacy, bot filtering and separate denominators; console CLS budget and real-user rows at 1440 and 390 with axe and reflow. `tests/pagespeed-timing-support.mjs` with `tests/pagespeed-network-fixture.mjs` and `tests/pagespeed-network-trust.mjs`: controlled wire DNS and generated-certificate TLS, each delayed phase moving its retained timing, independently delayed connect and first byte with cross-phase separation, signed scheduled history and report retention, TLS absent on HTTP. `tests/pagespeed-support.mjs` proveRumUpgrade: populated additive 0066 upgrade and preserved old sums across 0077; Candidate rider evidence: `tests/pagespeed-support.mjs` provePageSpeed asserts RUM error counts against actual shipped browser beacons, measured LCP, CLS and INP percentile values, weighted multi-value ranks and missing-metric denominators, bot exclusion, edge-provided US subdivision grouping and invokes proveRumErasure for owner erasure of the registration and all aggregate tables with a second site preserved, then provePopulatedRumRestore for populated owner-API archive and restore: registration and sampling remain local, restored collection is off and every RUM audit arrives. The receiving owner door also refuses unknown audit actions and mismatched subjects. proveRumUpgrade asserts additive `migrations/0077_rum_percentile_erasure.sql` preserves old sums and invents no old percentiles. `docs/monitors.md` discloses non-browser Origin spoofing, local settings and restored collection off.; `tests/public-paths.mjs`: beacon admission and rate limit. | Synthetic budgets, waterfall and timing, consented sampled RUM and separate denominators are asserted. RUM error-count accuracy, percentile ranks and missing-metric denominators, US subdivision grouping, bot exclusion, erasure and populated restore/upgrade remain unqualified (RL-8). |
| `DEPENDENCY-001` | External dependency checks | target | done | `runners/src/discovery/stages/status-page.mjs`; `runners/src/discovery/stages/status-components.mjs`; `src/domain/dependency-status.mjs`; `src/domain/evidence.server.ts`; `tests/discovery-jobs.mjs` — "DEPENDENCY-001 a linked provider status page is discovered, its component adopted and changed, and its evidence stays separate from the application monitor" |  |
| `DEPENDENCY-002` | Third-party service catalog | target | partial | `src/domain/service-catalog/` (one streaming status-source reader in `src/domain/service-catalog/reader/`, part facts in `src/domain/service-catalog/parts.mjs`, scheduled reads in `src/domain/service-catalog/followed.mjs`, 1 MiB bound); `src/domain/service-catalog.server.ts`; `src/domain/dependency-notices.ts`; `src/domain/incident-work/dependencies.server.ts`; `src/domain/definitions/importers/third-party.ts`; `migrations/0064_service_catalog.sql`; `tests/discovery-jobs.mjs` — "DEPENDENCY-002 catalog providers are followed after a live source check, notify every contact and fallback on their route without opening an incident, show linked and coincident notices on application incidents, go Unknown when a source fails, and a provider outside the catalog goes through the reviewed proposal" (search, live check and follow, needs review, every-contact and fallback notices under quiet hours, no incident, unchanged application, linked and coincident overlap with grouped acknowledgment, Unknown on unreachable, moved and reshaped sources, one recovery notice, a provider added by address, 1440/390 axe and reflow), with `tests/service-catalog-sources.mjs` in the same journey (Cloudflare Workers, Google Compute Engine in us-central1, PayPal REST APIs in production and Okta followed through the console control with the location and environment choice from synthetic full-size documents over 64 KiB; a stated incident and recovery on each sends one dependency and one recovery notice on the route with no Uptime incident and the application monitor unchanged; a 32 MiB document and a changed shape turn Unknown with the review marker; the runner's peak RSS delta and the edge's unsent bytes on the oversize read; 1440/390 axe and reflow of the location choice and the Unknown review); `tests/notify-delivery.mjs` — "DEPENDENCY-002 fallbacks honor the saved delay across restart, cancel on primary acceptance or recovery, and retain zero-delay and quiet-hour behavior"; `tests/service-catalog-portability.mjs` (archive, inactive restore, erasure, populated upgrade); `tests/definitions-import.mjs` (UptimeRobot, Better Stack and Site24x7 mappings) | Gap: Auth0 and Fastly cannot be followed from the catalog. Following Auth0 needs the disclosed tenant-domain egress RL-101 permits, which is not built: Auth0 publishes its regional status feeds only by tenant domain (`status.auth0.com/rss?domain={tenant}`; a build-host GET with a tenant that does not exist answered 400 “check your domain parameter”). Fastly's official feed (`https://www.fastlystatus.com/rss`, 85,172 bytes, confirmed by a build-host GET on 22 October 2026) is a history of free-text postings with no status, component or region field, so it stays Unknown and no stated status is read from it (RL-101). |
| `DISCOVERY-001` | Reviewed automatic endpoint discovery | target | partial | `src/domain/discovery-sources.server.ts`; `src/domain/discovery-sources.mjs`; `src/domain/discovery-proposals.ts`; `runners/src/discovery/sources/`; `src/editor/monitor/sources.mjs`; `migrations/0065_discovery_sources.sql`; `tests/discovery-jobs.mjs` — "Discover a site, review and adopt monitoring, follow its dependency, and retain source custody" (proveDiscoverySources); `tests/discovery-public-dns-support.mjs` — provePublicDnsDiscovery, invoked by that same journey: owner authorization of run-uptime.com, real signed runner completion through the unchanged system resolver and public transport, retained apex and www DNS proposals checked against independently resolved current answers, reviewed rejection across reload, bounded traffic, Unknown USD cost and no unadopted monitors or slots, including completion replay refusal; `tests/discovery-sources-portability.mjs`; `tests/access-matrix.mjs` (members refused) | USD cost projection (blocked on COST-001) remains absent. Gap: Route 53, Cloudflare, GitHub Actions, Vercel, Netlify and CodeDeploy are proven at an authorized provider edge only; live provider-account authorization is Not proved. Continuous upkeep: see AGENT-001. Held-key round (26 October 2026), SD receipt report only: domain discovery for run-uptime.com recorded apex and www A and AAAA answers using the runner's default system resolver without a controlled listener or resolver override, seven proposals from three GETs and one rejection; GitHub Actions discovery for the run-uptime repository owned by just-every and its owner-started rediscovery recorded 12 and 2 allowlisted GETs, all HTTP 200, zero proposals and no rejection, using the production owner's broader classic PAT rather than the specified fine-grained read-only credential; Cloudflare receipts recorded zone metadata at HTTP 200 and DNS records at HTTP 403 with the original token, followed by six GETs, including zone metadata and a three-record DNS response both at HTTP 200, ten proposals and one rejection with a separately supplied credential described as restricted to run-uptime.com with Zone Read and DNS Read. The receipts recorded three incorrect DNS expectations of 100:: for proxied Cloudflare names and zero adopted monitors or created provider objects. The existing tagged discovery journey asserts that proxied names do not propose hidden origin DNS expectations, including mixed proxy flags, while DNS-only records retain their published-answer proposal. These historical receipt-reported provider observations are not retained assertions or proof here of live provider-account authorization or a live GitHub rejection. Public domain qualification is independently retained by the named public DNS journey; it supplies no provider-account authority. Route 53, Vercel, Netlify and CodeDeploy remain at the authorized provider edge only, USD cost projection remains blocked on COST-001, continuous upkeep remains AGENT-001's, and DISCOVERY-001 remains partial. |
| `FLOW-002` | Reusable Playwright monitoring as code | target | partial | `scripts/definitions.mjs`; `scripts/definitions-http.mjs`; `scripts/playwright-import/`; `src/domain/flow-source.mjs`; `tests/flow-journey.mjs` with `tests/playwright-import-support.mjs`, `tests/playwright-workflow-support.mjs` and `tests/playwright-custody-support.mjs` (runner-flows) | The supported real Playwright subset (RL-13) imports JSON fixtures and an npm v3 dependency lock without executing buyer code; unsupported constructs refuse by file and line. The checked-in workflow shell runs CLI import, Worker preview and apply with the fixture owner session, names immutable flow digests and reapplies the same source without changing revisions. Imported login/signup/checkout and a separate API check use ordinary deployment and scheduled runners. Broken setup, assertion and forbidden metadata calls retain distinct manual and scheduled outcomes and revision digests; ambiguous locators fail, and selected secrets stay runner-local. Definition export and inactive archive restore retain exact source/fixture/lock bytes and flow digests; erasure removes them and dependent custody. Gap: arbitrary Playwright execution requires an OS-level runner sandbox; console import-source and revision views are held UI. Hosted GitHub execution and least-scope CI credentials are not claimed (CODE-001). |
| `FLOW-003` | Useful and safe browser failure artifacts | target | partial | `runners/src/flow/artifacts.mjs`; `src/domain/flow-artifacts.mjs`; `src/domain/failure-page-custody.server.ts`; `public/assets/failure-snapshot-view.js`; `tests/flow-journey.mjs`; `tests/flow-artifact-journey.mjs` | Screenshot, video, trace and waterfall reads through the owner's monitor snapshot API, denied artifact storage, unauthorized download, masking and erasure are asserted. The authenticated incident-detail door is asserted only in `tests/flow-artifact-browser.mjs`, which this clause does not cite. |
| `FLOW-004` | Cross-browser and mobile transactions | target | done | `tests/flow-profiles.mjs` FLOW-004, loaded by `tests/flow-journey.mjs`: the same checkout runs in Chromium, Firefox and WebKit; an owned target measures its actual 390 × 844 CSS viewport in the real mobile runner, with the passing viewport expectation retained in signed history and matching report dimensions (`tests/flow-viewport-support.mjs` assertFlowViewport). The mobile-only failure stays Failing beside Healthy desktop profiles; removal of WebKit capacity stays Unknown with no substituted trace. The journey also refuses contradictory signed profile evidence without changes, preserves revision dimensions, and retains failing mobile evidence on inactive restore. `tests/flow-profiles-browser.mjs` flowProfilesBrowser and flowMissingBrowser inspect the saved profile, failed trace, reports and missing capacity through the owner console. | |
| `ROUTING-001` | Monitor, service and team alert routing | target | partial | `src/domain/alert-routes.server.ts`; `src/domain/alert-route-delivery.server.ts`; `public/assets/alert-route.js`; `tests/alert-routes.mjs`; `docs/evidence/contracts/routing/`; `src/domain/contact-quiet.ts`; `src/domain/contact-scheduler.server.ts`; `migrations/0061_contact_quiet.sql`; `public/assets/contact-quiet.js`; `tests/notify-quiet-fixture.mjs` (email/webhook quiet holds, DST, overnight and transport-boundary restart); `tests/notify-delivery.mjs` (quiet hold and editor/preview/save/reopen at 1440/390); `src/domain/alert-teams.server.ts`; `src/domain/alert-team-policy.ts`; `src/domain/alert-route-filters.ts`; `scripts/routing.mjs`; `migrations/0069_alert_teams_filters.sql`; `tests/alert-routing-teams-support.mjs`; `tests/alert-routing-filters-support.mjs` (extended existing route journey; local routing/access/security checks passed, exact-head branch Verify remains required) | Monitor → service → group → installation inheritance, explicit empty selection, credential/disabled/missing exclusions, recipient and affected-monitor previews, stale-plan guards, labeled tests, durable audit and original accepted-trigger recipient/credential recovery now ship. ROUTING-002 now supplies per-contact delay/repeat/cap, recovery preference and acknowledgment-stop policies, plus reviewed saved UptimeRobot/Pingdom schedule previews. DELIVERY-002 supplies transport retry and fallback chains. Contact quiet holds (optional daily IANA-zone windows, overnight and DST boundaries, persisted hold rechecked at handoff, restart) are built toward this clause's quiet hours and apply to fallback contacts. Explicit team membership and a live scope-eligible member's opt-in to their verified email destination now govern API/CLI selection. Paused, disabled, stale-role and rotated-credential recipients do not count. Environment filters use monitor metadata; region selectors are exact configured non-pass probe IDs; severity is derived critical/warning/info for outage/Slow/dependency; origin is monitor/slow/dependency, never the console URL. Omitted dimensions allow all, empty lists match none and missing values cannot satisfy nonempty filters. Route quiet combines with contact quiet and is snapshotted onto fallback contacts. Gap: The original two-team production and staging journey is not fully qualified through both UI and API. Console controls for teams, route filters, route quiet and weekly business selection remain required, and a console edit must preserve all saved extended fields. Basic geographic-region routing remains unqualified; exact non-pass probe-ID matching alone is not geographic qualification. Route-aware sending drills and weekly business-hour selection are unshipped, expiry and renewal notices still bypass effective routes (RL-11), and the two-team all-class inside-and-outside-quiet qualification is incomplete. Present-time quiet holds and fallback restart are proven, but real-alert DST dispatch remains unqualified. Per-contact delay and repeat remain ROUTING-002 duties; transport retry and fallback-chain behavior remain DELIVERY-002 duties. Richer optional provenance, geographic hierarchy, portable detailed route history and configurable severity are separate work candidates, without removing the original routing duties. |
| `ROUTING-002` | Per-contact alert delay and repeat | target | partial | `src/domain/contact-scheduler.server.ts`; `src/domain/contact-schedule-import.ts`; `public/assets/alert-route.js`; `tests/contact-schedules.mjs`; `tests/contact-schedules.mjs`; `docs/evidence/contracts/contact-schedules/` | Carried-done audit: the cited tests configure zero-delay contacts but no line reads their sends at confirmation. The delayed contact sending nothing at confirmation and once at its delay, the repeat with the incident's stable identity, early-recovery suppression, exactly one delayed notice across a Worker restart and the UptimeRobot threshold/recurrence preview are asserted. |
| `DELIVERY-002` | Deduplicated retry and fallback contacts | target | done | `src/domain/notification-retry.ts`; `src/domain/notification-fallback.server.ts`; `src/domain/notification-rpc.server.ts`; `src/domain/notification-mail.server.ts`; `src/domain/archive-notification-validation.ts`; `migrations/0059_notification_retry.sql`; `migrations/0060_notification_fallback.sql`; `public/delivery-chain.js`; `public/assets/alert-route-fallback.js`; `tests/notify-delivery.mjs` (DELIVERY-002 deduplicated retry honors Retry-After and stops on 4xx, and fallback contacts fire once with both outcomes visible across restart); `tests/notify-retry-fixture.mjs`; `tests/notify-fallback-fixture.mjs`; `tests/hosted-alerts.mjs` (proven-unaccepted relay attempts remain portable); `tests/notify-delivery.mjs` (chain outcomes and route chain editor at 1440/390) |  |
| `NOTICE-001` | Actionable trigger and recovery notice content | target | done | `src/domain/notification-context.ts`; `src/domain/notification-preferences.server.ts`; `public/notification-preferences.js`; `tests/notify-delivery.mjs`; `tests/notify-delivery.mjs`; `tests/webhook-custom.mjs` |  |
| `WEBHOOK-001` | Custom webhook requests and payload templates | target | partial | `src/domain/webhook-template.mjs`; `src/domain/notification-webhook.ts`; `src/domain/webhook-contact-import.mjs`; `runners/src/notification-transport.mjs`; `public/webhook-editor.js`; `public/notifications.js`; `tests/webhook-custom.mjs`; `tests/webhook-custom.mjs`; `tests/hosted-alerts.mjs`; `docs/webhooks.md` | Carried-done audit: no cited line compares the preview with the received request byte for byte. The imported UptimeRobot contact, substituted field names, header and content type on trigger and recovery, escaping and valid JSON, query, form and GET modes, CR/LF refusal, the named unmappable variable, HMAC signing and archives without header values are asserted. |
| `CHAT-001` | Teams, Discord, Telegram and workplace chat | target | missing |  | No implementation; acceptance journey above is required. |
| `PHONE-001` | US SMS and voice alerts | target | missing |  | No implementation; acceptance journey above is required. |
| `PHONE-002` | Uptime-provided compliant US sender | target | missing |  | No implementation; no telephony relay or registered sender exists. Acceptance journey above is required. |
| `MOBILE-001` | Mobile operator access and push | target | partial | `src/routes/_console.tsx`; `tests/operator-browser.mjs` | Responsive web exists; native clients, APNs/FCM, Pushover and Pushbullet do not. |
| `FOLLOWUP-001` | Ongoing outage follow-up and correlation | target | partial | `src/domain/incident-work/`; `tests/incident-work.mjs` (proveOwnIncidentCorrelation in `tests/incident-correlation-support.mjs`); `tests/contact-schedules.mjs` (proveOwnIncidentCorrelationConsole in `tests/read-api.mjs`); `tests/contact-schedules.mjs` (contact schedules survive restart, stop on recovery/ack, and never replay uncertain attempts); `public/incident-work.js`; `tests/incident-combined-support.mjs` (proveCombinedIncident); `tests/incident-members-support.mjs` (proveIncidentMembers); `tests/read-api.mjs` (proveCombinedIncidentConsole, proveOwnIncidentCorrelationConsole) | Owner assignment, acknowledgment, stop/manual response resolution and actor/time timeline retain machine confirmation/recovery and delivery outcomes across restart and inactive restore. Own monitor incidents sharing an owner-configured dependency, service or group within the larger confirmation window now group acknowledgment, with scoped member selection; every monitor observation and child recovery remains separate. The incident journey proves shared-service, shared-dependency and shared-group grouping, unrelated/late isolation, grouped actor acknowledgment and one-child recovery through API and console at 1440/390. ROUTING-002 supplies notification/reminder next-due kind and exact time through incident reads and the existing console. tests/incident-combined-support.mjs (proveCombinedIncident, within tests/incident-work.mjs and tests/contact-schedules.mjs) proves the combined dependency/group acknowledgment, restart before fallback deadline and due reminder, retained lost-response uncertainty with one send, one event per due reminder, one-child recovery, final resolution and inactive escalation restore. tests/read-api.mjs (proveCombinedIncidentConsole) proves escalation/reminder kinds and exact READAPI-003 times, escalation outcomes and the open sibling at 1440/390. Gap: ONCALL-001 handoff-check scheduling and handoff attempts/outcomes remain missing dependencies of FOLLOWUP-001, not exclusions from its acceptance. Every current notification, reminder, fallback escalation, ownership and timeline door remains required. Full narrowed-responder sign-in/MFA entry, shell/navigation and follow-up use remain unproved. Exact rendered next-due time parity and passing console requalification at 1440 and 390 remain required. Verify 40211563379 failed at the member-removal and post-restart signed-in console doors; reported local passes do not close those gaps. Maintenance and pause applications now append revision, actor, time and outcome in the same transaction as the revision; tests/incident-work.mjs proves retained kinds through restart and inactive restore. tests/incident-members-support.mjs proves live scoped responder take/reassignment through API/CLI, ordered actors/times through READAPI-003 after restart, and zero-write read-only/member-scope/monitoring:read refusal. tests/read-api.mjs proves existing-console live responder assignment and maintenance/pause kinds at 1440/390 with axe/reflow. Full sign-in/navigation for narrowed responders is not proven by that already-open-console journey. Response resolution never changes monitor health. ROUTING-002 supplies current contact notification and reminder scheduling, DELIVERY-002 supplies current fallback escalation scheduling, and ONCALL-001 will supply native handoff-check and responder-policy scheduling. FOLLOWUP-001 retains named ownership, next-due kind/time and every attempt/outcome in the incident timeline through the existing console, API/CLI and READAPI-003 doors, including restart and inactive archive behavior. |
| `INCIDENT-001` | Incident comments and edit history | target | partial | `src/domain/incident-work/`; `public/incident-work.js`; `tests/incident-work.mjs`; `docs/evidence/contracts/incidents/`; `src/domain/incident-work/mention-delivery.server.ts`; `src/domain/incident-work/mention-members.server.ts`; `migrations/0070_incident_mentions.sql`; `scripts/incidents.mjs`; `tests/incident-members-support.mjs`; `tests/signed-runner.mjs` | The bounded API/CLI slice adds live scoped responder/editor/admin/owner comments and author/admin edits and deletion; existing incident JSON and edit history remain. Gap: the held console comment, edit and delete role workflows. |
| `INCIDENT-002` | Comment mentions | target | partial | `src/domain/incident-work/`; `public/incident-work.js`; `tests/incident-work.mjs`; `docs/evidence/contracts/incidents/`; `src/domain/incident-work/mention-delivery.server.ts`; `src/domain/incident-work/mention-members.server.ts`; `migrations/0070_incident_mentions.sql`; `scripts/incidents.mjs`; `tests/incident-members-support.mjs`; `tests/signed-runner.mjs` | ID/display-name-only eligible member suggestions and Base email mentions with durable single-attempt outcomes ship through the API/CLI. Gap: the held console mention and outcome workflows, MOBILE-001 push, and recovery of interrupted unreserved mentions, which have no background recovery. |
| `INCIDENT-003` | Incident root cause | target | partial | `src/domain/incident-work/`; `public/incident-work.js`; `tests/incident-work.mjs`; `docs/evidence/contracts/incidents/`; `src/domain/incident-work/mention-delivery.server.ts`; `src/domain/incident-work/mention-members.server.ts`; `migrations/0070_incident_mentions.sql`; `scripts/incidents.mjs`; `tests/incident-members-support.mjs`; `tests/signed-runner.mjs` | Root causes, categories and report filters ship through the API/CLI. Gap: the held console root-cause workflow; category administration remains owner-only. |
| `INCIDENT-004` | Publish a comment to the status page | target | missing | `src/domain/incident-work/`; `public/incident-work.js`; `tests/incident-work.mjs`; `docs/evidence/contracts/incidents/`; `src/domain/incident-work/mention-delivery.server.ts`; `src/domain/incident-work/mention-members.server.ts`; `migrations/0070_incident_mentions.sql`; `scripts/incidents.mjs`; `tests/incident-members-support.mjs`; `tests/signed-runner.mjs` | No implementation: LAMP-001 publication does not exist, so there is no Publish to status page action, preview, idempotent handoff, publication outcome or correction. |
| `INCIDENT-005` | Comment and root-cause custody | target | partial | `src/domain/incident-work/`; `public/incident-work.js`; `tests/incident-work.mjs`; `docs/evidence/contracts/incidents/`; `src/domain/incident-work/mention-delivery.server.ts`; `src/domain/incident-work/mention-members.server.ts`; `migrations/0070_incident_mentions.sql`; `scripts/incidents.mjs`; `tests/incident-members-support.mjs`; `tests/signed-runner.mjs` | Safe archive history and operator/monitor erasure ship. Gap: sourced incumbent incident imports. |
| `ONCALL-001` | Responder handoff and automatic resolution | target | missing |  | No implementation; acceptance journey above is required. Missing: every named connector’s confirmed-failure/repeat, interrupted or uncertain handoff, deduplication, acknowledgment, responder-policy and same-incident recovery journey, including handoff-check kind/time and attempt/outcome projection into FOLLOWUP-001 and READAPI-003. Existing Uptime delivery and incident acceptance is not deferred by this missing implementation. ONCALL-001 receives connector-native handoff-check and configured responder-escalation policy, including handoff attempts/outcomes and the existing PagerDuty destination-kind inheritance. Its scheduling and outcomes must feed FOLLOWUP-001’s incident timeline and next-due projection and READAPI-003’s incident reads. Handoff acknowledgment remains separate from responder status, and recovery resolves the same remote incident. |
| `LAMP-001` | Status communication through Lamp | target | missing |  | No implementation; acceptance journey above is required. |
| `AUTOMATION-001` | Zapier, Make and custom automation | target | missing |  | No implementation; acceptance journey above is required. |
| `MANAGE-001` | Monitor and contact API | target | partial | `src/domain/control.server.ts`; `src/domain/notification-destinations.server.ts`; `tests/definitions-import.mjs`; `tests/notify-delivery.mjs`; `tests/management-support.mjs`; `tests/alert-drill.mjs`: contact rotation invalidates prior credential proof | Carried-done audit: no cited test rotates a contact, reads a saved revision back, sends a cross-origin mutation or compares durable state around a refused mutation. Creating, editing and pausing a monitor through the owner API, the signed-out refusal and the absence of exposed endpoint secrets are asserted. |
| `READAPI-001` | Versioned read API keys, limits and documentation | target | partial | `src/domain/credentials/`; `migrations/0071_edition_credentials.sql`; `scripts/api-keys.mjs`; `tests/read-keys-support.mjs`; `src/server.ts`; `src/domain/incident-list.server.ts`; `src/domain/incident-work/`; `src/domain/reports/`; `src/domain/read-api-openapi.ts`; `src/domain/read-api/`; `tests/incident-work.mjs`; `tests/reporting.mjs`; `tests/read-api.mjs`; `tests/metrics.mjs`; `docs/read-api.md`; `docs/evidence/contracts/read-api/`; `tests/security-controls-browser-support.mjs` (proveSecurityControls); `src/domain/reports/service.server.ts`; `tests/report-recurrences-support.mjs` (proveRecurringReports) | The bounded API/CLI key slice adds Base-generated hash-only monitoring:read tokens, immutable installation/workspace resources, intersecting monitor/tag restrictions, explicit expiry/revocation/last use, per-key limits and owner-only fresh ACCESS-003 issuance; every v1 monitoring GET/HEAD, including metrics and CSV/PDF reports, uses resource fences before pagination/aggregation, and bearer writes cannot fall back to session authority. Public OpenAPI and Owner Settings key creation/list/revocation with shown-once custody are proven at 1440/390, including stale-proof step-up, selected monitors/tags/expiry, usage, immediate real-read 401 and nonowner refusal (RL-14). CODE-001 CI uses the same credential store with separate environment/tag authority. Gap: delegated issuance. |
| `READAPI-002` | Uptime and response-time reads | target | partial | `src/domain/credentials/`; `migrations/0071_edition_credentials.sql`; `scripts/api-keys.mjs`; `tests/read-keys-support.mjs`; `src/server.ts`; `src/domain/incident-list.server.ts`; `src/domain/incident-work/`; `src/domain/reports/`; `src/domain/read-api-openapi.ts`; `src/domain/read-api/`; `tests/incident-work.mjs`; `tests/reporting.mjs`; `tests/read-api.mjs`; `tests/metrics.mjs`; `docs/read-api.md`; `docs/evidence/contracts/read-api/`; `tests/security-controls-browser-support.mjs` (proveSecurityControls); `src/domain/reports/service.server.ts`; `tests/report-recurrences-support.mjs` (proveRecurringReports) | Owner-session monitor list/detail expose current state, last check and fixed coverage with stable ID cursors and tag filters. Bulk uptime shares exact console/report availability, SLA, incident and Slow figures with explicit seconds and CSV. Month/quarter/year-to-date and last-month periods honor IANA/DST boundaries and the owner-selected default zone; response-time ranges over 90 days refuse. Uptime/UptimeRobot/blended source selection now ships for uptime and reports, with Uptime/UptimeRobot selection for response times, exact documented selections and named unknown/unavailable-source refusals. Gap: HISTORY-001 other-incumbent history, held console source-segment views and 500-monitor hosted capacity. |
| `READAPI-003` | Incident reads | target | partial | `src/domain/credentials/`; `migrations/0071_edition_credentials.sql`; `scripts/api-keys.mjs`; `tests/read-keys-support.mjs`; `src/server.ts`; `src/domain/incident-list.server.ts`; `src/domain/incident-work/`; `src/domain/reports/`; `src/domain/read-api-openapi.ts`; `src/domain/read-api/`; `tests/incident-work.mjs`; `tests/reporting.mjs`; `tests/read-api.mjs`; `tests/metrics.mjs`; `docs/read-api.md`; `docs/evidence/contracts/read-api/`; `tests/security-controls-browser-support.mjs` (proveSecurityControls); `src/domain/reports/service.server.ts`; `tests/report-recurrences-support.mjs` (proveRecurringReports) | Incident CSV preserves filters and cursor pages, and FOLLOWUP-001 exposes the durable DELIVERY-002 escalation deadline and ROUTING-002 reminder time in incident reads and the incident console at 1440/390. Paginated UptimeRobot source incidents now read separately with source comments and root cause. Gap: ONCALL-001 handoff next-due policy (RL-7). |
| `CODE-001` | CLI, TypeScript and CI deployment | target | partial | `scripts/definitions.mjs`; `scripts/definitions-http.mjs`; `scripts/definitions-typescript.mjs`; `src/domain/definitions/types.ts`; `src/domain/ci/`; `src/domain/credentials/`; `tests/definitions-import.mjs`; `tests/definitions-ci-support.mjs`; `tests/definitions-typescript-support.mjs`; `tests/security-controls-browser-support.mjs` (proveSecurityControls); `tests/definitions-ci-support.mjs` (proveDefinitionCI, revoked-job API/CLI/restart) | JSON and trusted local TypeScript monitor definitions use the same native schema, preview digest and bounded apply. TypeScript executes only on the buyer machine; the Worker receives evaluated JSON. Shared shown-once hashed credentials narrow preview/apply to one explicit environment and selected tags; current and proposed definitions must remain in scope, and each resumed operation repeats live issuer, expiry and revocation fences. CI cannot read secrets, export, change roles or undo applied work; preview-only keys cannot apply. A checked-in fixture workflow exercises actual CLI preview, definition-validation test and apply against the controlled Worker; owner export and undo round-trip evaluated definitions and changed live revisions refuse reviewed apply (RL-15). Gap: runtime probe execution from CLI test, TypeScript route/maintenance deployment, mail-check/private/synthetic and cross-monitor dependency grants, Checkly suite migration (MIGRATE-005) and live GitHub execution. |
| `CODE-002` | Terraform provider | target | missing |  | No implementation; acceptance journey above is required. |
| `METRICS-001` | Grafana and Prometheus integration | target | partial | `src/domain/metrics/`; `scripts/metrics-export.mjs`; `docs/grafana/uptime-dashboard.json`; `tests/metrics.mjs`; `tests/metrics.mjs`; `docs/evidence/contracts/metrics/`; `tests/metrics.mjs`: authenticated Worker scrape, report-equal figures, bounded scoped keys, installation isolation, Datadog source-location series, signed export and revocation; `tests/metrics-grafana-support.mjs` proveGrafanaPrometheus: owner-created monitors and keys, real signed scheduled failure, stopped assigned probe, checksum-verified upstream Prometheus and Grafana, imported dashboard queries through Grafana, fixed-window availability and location latency equality, fixed coverage, Unknown and excluded seconds, foreign key and monitor refusal, failed revoked scrape and aging snapshot. | Carried-done audit: no cited line loads the supplied Grafana dashboard or queries through Grafana. The Prometheus scrape door, the Datadog export with source location identity, failed monitor and probe states, revocation, report-equal denominators, stale states and workspace isolation are asserted. Candidate integration proof replayed; main's partial judgment is retained for review. |
| `MIGRATE-001` | Complete UptimeRobot migration | target | partial | `src/domain/definitions/importers/uptimerobot.ts`; `src/domain/webhook-contact-import.mjs`; `tests/definitions-import.mjs`; `tests/tls-trust-journey.mjs`; `tests/webhook-custom.mjs` (saved contact/seat reconciliation: every kind, per-kind counts, Teams replacement, seat refusals and no writes/sends); `docs/migrating-uptimerobot-contacts.md`; `docs/evidence/contracts/trust-auth/`; `docs/evidence/contracts/webhooks/` | Reviewed saved monitor pages and documented webhook create payloads retain their existing mappings and secret withholding. Owner-only read-only API previews now reconcile saved contact lists and login/notify-only seat rows, propose email/webhook kinds for local review, refuse other kinds with named handoffs, and flag legacy Teams connectors with replacement steps. Source status never becomes consent; no contact, confirmation, invitation or send is created. Contact/seat console file routing and apply remain absent. Incident comments and root cause are absent from these lists; the current source API exposes them separately, but labelled source-history import remains a HISTORY-001/INCIDENT-005 gap. Live extraction, complete contacts/history, sibling handoffs and authorized account cutover remain absent. |
| `MIGRATE-002` | Pingdom migration | target | partial | `src/domain/definitions/importers/pingdom.ts`; `tests/definitions-import.mjs` (MIGRATE-002 saved check details: tags, named probe filters, TMS reconciliation, paused apply, unchanged re-import and undo); `tests/tls-trust-journey.mjs`; `tests/definitions-import.mjs`; `docs/migrating-pingdom.md`; `docs/evidence/contracts/trust-auth/` | Saved HTTP check details retain cadence, literal criteria, local credential references and explicit certificate behavior, now with tag labels. Every requested probe filter is refused by name when no installed geographic choice matches; saved script/recording TMS and other unsupported types name the owning clause and reconcile counts. Page-speed export shape was not established in the published API 3.1 schema and is not invented. Account extraction, transaction/page-speed conversion, geographic placement, complete teams/contacts and schedule extraction, source history, Lamp handoff and representative cutover remain absent. ROUTING-002 retains its separate contact delay/repeat/recovery preview. |
| `MIGRATE-003` | Better Stack Uptime migration | target | partial | `src/domain/definitions/importers/betterstack-heartbeats.ts`; `tests/signed-runner.mjs`; `tests/signed-runner.mjs`; `src/domain/definitions/importers/betterstack-monitors.ts`; `tests/definitions-import.mjs` (MIGRATE-003 saved monitor pages: supported types, group/region labels, reconciled counts, paused apply, unchanged re-import, undo and withheld credentials); `docs/migrating-betterstack.md` | Saved heartbeat pages retain the existing period/grace mapping and need a new local URL. Saved monitor-only pages now convert HTTP/status, expected status, keyword/absence, ping and single-port TCP settings; group identifiers and regions become labels, with every unavailable geographic location named. Provider status addresses retain DEPENDENCY-002 catalog mapping; mixed heartbeat/status-page resources still use the existing reader and should be saved separately. Live extraction, geographic placement, source time-based confirmation/recovery, contacts, maintenance, history, Oncall/Lamp handoffs and side-by-side cutover remain absent. |
| `MIGRATE-004` | Site24x7 website monitoring migration | target | partial | `src/domain/definitions/importers/site24x7.ts`; `tests/definitions-import.mjs` (MIGRATE-004 saved monitor settings: five converted types, reconciled refusals, paused apply, unchanged re-import and undo); `docs/migrating-site24x7.md` | Saved documented monitor lists now convert complete Website, REST API, plain Port, Ping and expressible DNS settings to paused definitions with per-field differences and reconciled counts. Unsupported browser, expiry, heartbeat and resolver settings name their owning clauses. Existing DEPENDENCY-002 catalog mappings remain unchanged. Accounts/live extraction, regional placement, threshold and notification groups/profiles, reports, history and representative cutover remain absent; DNS transport and local timeout/confirmation/ping-policy differences require review. |
| `MIGRATE-005` | Challenger and advanced synthetic migration | target | missing |  | No implementation; acceptance journey above is required. |
| `HISTORY-001` | Sourced incumbent uptime history | target | partial | `src/domain/source-history/`; `migrations/0078_source_history.sql`; `scripts/definitions-history.mjs`; `tests/source-history-support.mjs` through `tests/definitions-import.mjs`, `tests/reporting.mjs`, `tests/read-api.mjs`, `tests/archive-roundtrip.mjs` and `tests/erasure-audit.mjs`; `docs/definitions.md`; `docs/read-api.md` |  Owner API/CLI saved UptimeRobot overall/per-monitor log CSV and v3 incidents preview source-ID mapping, named unmapped rows, date/count/downtime figures and a reviewed digest. Apply stores idempotent source rows separately with provenance, source comments/root cause and response-time samples; populated upgrades, unchanged native monitoring, re-import and batch removal are asserted. Reports retain separate source/Uptime denominators, labeled weighted blending and overlap cutover adjustment; owner/scoped-key reads select the documented sources and refuse unknown/unavailable ones. Source labels, batch IDs and digests round-trip inactive, and erasure receipts account for all source tables. Gap: Pingdom, Better Stack, Site24x7 and challenger history; held owner-console move-in history preview and report-view source segments; real export, authorized account and hosted import unmeasured. IMPORT-001 remains partial. |
| `ACCESS-001` | Teams, roles and accountable ownership | target | partial | `src/domain/access.server.ts`; `src/domain/access-members.server.ts`; `src/domain/access-database.server.ts`; `migrations/0067_edition_access.sql`; `scripts/access.mjs`; existing `tests/access-matrix.mjs` with access support modules, `tests/operator-security.mjs`, `tests/read-api.mjs`, `tests/definitions-import.mjs`, `tests/archive-roundtrip.mjs`; `tests/discovery-jobs.mjs` (exact actor receipts and zero-write missing/refused discovery requests); `tests/erasure-audit.mjs` (portable audit snapshot and later export receipt); `tests/signed-runner.mjs` (byte-boundary refusal with exact export receipts); `tests/access-matrix.mjs` / `tests/access-discovery-job-support.mjs` (member discovery cancellation/revocation); `tests/definitions-import.mjs` / `tests/definitions-ci-support.mjs` (CI revocation after first authorized 20-record batch); `tests/security-controls-browser-support.mjs` (proveSecurityControls, live owner/member Settings and revoked CI job); `tests/definitions-ci-support.mjs` (proveDefinitionCI); `tests/report-recurrences-support.mjs` (proveRecurringReports) | Edition roles bind to live Base IDs and ceilings: owner/admin plus explicit editor/responder/read-only member narrowings. Service/team (existing group label) scopes intersect and never expand authority; no scopes means the role's workspace. Public API/CLI invitations, role/scope assignment and removal use Base's lifecycle; unchanged assignments are no-ops. One request policy gates ordinary documents/APIs/imports; later mutation batches repeat session/version/role/scope authority and commit opaque actor audit. Scoped workspace overview/list/runners/destinations/discovery/routes/export/archive/import doors refuse rather than leak unfiltered data. Populated upgrade, archive exclusion/inactive authority, erasure, allowed/refused role actions and stale/forged claims are proven through the existing public-door registrations. Bounded INCIDENT-001 responder collaboration, READAPI-001 monitoring credentials and CODE-001 environment/tag-scoped CI credentials now use the shared permission model. Settings invitations for admin/editor/responder/read-only, service/team scopes, no-op saves, removal and readable self-assignment refusal use Base's live lifecycle at 1440/390 (`public/assets/access-member-controls.js`; `tests/access-member-controls-browser-support.mjs` within the existing access matrix). Owner key management, live member issuance refusal, and the initiating-owner/authorized-batch/refused-next-operation/revoked-stop console now have 1440/390 proof (tests/security-controls-browser-support.mjs within tests/operator-security.mjs). tests/definitions-ci-support.mjs proves the same durable job projection through API/CLI and restart, while the native engine checkpoint remains retained. Gap: broader UI refusal coverage, initial narrowed-role console navigation and delegated key issuance; owner-only operator imports, erasure, metrics-key/identity/private-management and optional RUM administration remain conservative limits. Explicit site-discovery jobs record their initiating owner and stop with visible failure/cancellation metadata at live member authority boundaries; completed authorized outcomes survive revocation. CI-definition proof preserves an attributed authorized 20-record batch and refuses the next batch after token revocation. Background gaps: setup/catalog/source discovery jobs still lack the explicit site-job initiating-authority metadata; cleanup debt lacks assignee/due metadata; recurring report cancellation and initiating-member revocation now have API/CLI and 1440/390 console proof (tests/report-recurrences-support.mjs, tests/reporting.mjs); retry/fallback chains lack responsible owners and individual resolution; auth-mail and monitoring watches lack console outcomes and stop/resolution; synchronous exports record authorization but lack durable completion/download receipts and general jobs lack reloadable progress. Base authentication is unchanged; MFA is ACCESS-003 scope. Already-open-document member actions do not establish narrowed-role sign-in, initial MFA challenge, console shell entry or navigation. Those journeys remain required at 1440 and 390. The failed exact-pin console verification remains open. |
| `ACCESS-002` | Enterprise identity lifecycle | target | missing |  | No implementation; acceptance journey above is required. |
| `ACCESS-003` | Multi-factor sign-in and step-up | target | partial | `src/domain/mfa/`; `src/domain/access.server.ts`; `migrations/0068_mfa.sql`; `scripts/mfa.mjs`; `scripts/local/transfer.mjs`; existing `tests/operator-security.mjs` with `tests/mfa-policy-support.mjs` and `tests/mfa-webauthn-support.mjs`; shared real-auth fixtures; `tests/command-journey.mjs`; `public/assets/security-controls.js`; `tests/security-controls-browser-support.mjs` (proveSecurityControls, within `tests/operator-security.mjs`) | TOTP and WebAuthn second factors bind live Base session IDs/versions; ten hashed single-use recovery codes, sealed edition-local factor/challenge custody, require-all policy, session revocation, fresh five-minute sensitive-action guards, member reset, opaque audit and separate member notices are implemented (RL-16). Local archive commands require the same live cookie and recheck authority at each progress boundary. Settings enrollment and fresh step-up cover owner/member factors, recovery codes, stale policy/key refusal, factor removal and require-all policy at 1440/390. Member proof uses live native sessions in an already-open Settings document. Gap: initial console sign-in challenge and narrowed-role shell entry need held app.js/console-document work; provider MFA assertions depend on ACCESS-002 SSO, and recovery from total loss of all owner factors/codes or the sealing key needs local installation authority. API/CI key creation remains bounded by the credential features that actually ship. Already-open-document member actions do not establish narrowed-role sign-in, initial MFA challenge, console shell entry or navigation. Those journeys remain required at 1440 and 390. |
| `COST-001` | US buyer budgets and capacity transparency | target | missing |  | No implementation; acceptance journey above is required. |
| `OPS-001` | Recovery of monitoring itself | target | partial | `src/domain/auxiliary-execution.server.ts`; `src/domain/monitoring-watch.server.ts`; `src/domain/operator-mail.server.ts`; `runners/src/watch-store.mjs`; `tests/resilience/watches.mjs`; `tests/archive-roundtrip.mjs` | Independent Worker/runner interruption, retry/recovery notices, retained uncertain executions, no duplicate uncertain sends and inactive archive recovery remain asserted. Gap: a missed external heartbeat causing an independent service alarm, and lost contact reading stale with Unknown coverage lack assertions in the surviving cited files. |
| `ARCHIVE-002` | Whole-workspace archives at monitoring scale | target | partial | `src/domain/archive.server.ts`; `tests/archive-roundtrip.mjs` | Validated inactive archives ship and refuse exports beyond 10,000 rows per table, 100 monitors or 2 MiB; streamed, resumable, range/subset archives at SCHEDULE-002 scale do not exist. Storage capacity and archive size at this monitoring scale remain unmeasured; current view/archive bounds are not storage-capacity measurements. |
| `SURFACE-001` | The registry equals this table and the Base harness passes | target | missing | `agent-surface.json`; `src/agent-door/registry.server.ts`; `tests/agent-door.mjs` — native signed identity, current authority and replay journey; `tests/agent-conformance/journey.mjs` — nativeJourney and step hooks; `src/base/modules/agent-door/conformance/index.mjs` — runAgentDoorConformance invoked by rer verify: CORE registry, schema and both-policy harness checks.; `tests/agent-surface-discovery.mjs` | No implementation: Uptime has no MCP door, tool registry, resource templates or Base conformance harness run. |
| `SURFACE-002` | Live and security are computed per call | target | missing | `agent-surface.json`; `src/agent-door/registry.server.ts`; `tests/agent-door.mjs` — native signed identity, current authority and replay journey; `tests/agent-conformance/journey.mjs` — nativeJourney and step hooks; `src/base/modules/agent-door/conformance/index.mjs` — runAgentDoorConformance invoked by rer verify: native live and security class fixtures under both policies. | No implementation: no tool declares or computes live or security classes. |
| `SURFACE-003` | External and money are computed per call | target | missing | `agent-surface.json`; `src/agent-door/registry.server.ts`; `tests/agent-door.mjs` — native signed identity, current authority and replay journey; `tests/agent-conformance/journey.mjs` — nativeJourney and step hooks; `src/base/modules/agent-door/conformance/index.mjs` — runAgentDoorConformance invoked by rer verify: native external class fixtures under both policies. | No implementation: no tool declares or computes external or money classes. |
| `SURFACE-004` | Access, destructive and gated are computed per call | target | missing | `agent-surface.json`; `src/agent-door/registry.server.ts`; `tests/agent-door.mjs` — native signed identity, current authority and replay journey; `tests/agent-conformance/journey.mjs` — nativeJourney and step hooks; `src/base/modules/agent-door/conformance/index.mjs` — runAgentDoorConformance invoked by rer verify: native access and destructive class fixtures under both policies.; `tests/agent-access-facts-support.mjs`; public member authority derives exact access measure 1 and direction, operator audit target, direction-selective held widening, named native approval, autonomous narrowing, fresh native proof and current-version refusals. | No implementation: no tool declares or computes access, destructive or gated classes, and no incident record attributes an agent act. |
| `SURFACE-005` | The monitoring-operator journey under two company policies | target | missing | `agent-surface.json`; `src/agent-door/registry.server.ts`; `tests/agent-door.mjs` — native signed identity, current authority and replay journey; `tests/agent-conformance/journey.mjs` — nativeJourney and step hooks; `src/base/modules/agent-door/conformance/index.mjs` — runAgentDoorConformance invoked by rer verify: nativeJourney, beforeStep and afterStep under both company policies. Additional focused proof: `tests/agent-door.mjs` invokes `tests/agent-policy-entry-support.mjs` provePolicyEntry before every other MCP call: native owner creates a paused HTTP monitor, first MCP rename with a unique idempotency key returns policy_unset and the exact installation setup_url, no success or pending execution, no provider traffic, and all durable rows unchanged except the identified agent admission and refusal audit; proveAllowed completes the identical rename after explicit autonomous policy adoption. Existing unset-policy read and later unset-policy mutation assertions remain. `tests/agent-conformance/journey.mjs` — nativeJourney and step hooks remain registered under both company policies; no complete-week proof is claimed. | No implementation: no MCP door exists for a stranger agent to run the monitoring-operator week under either company policy. Acceptance 5 first-call refusal is proved locally; its complete policy-question setup and absence of preselected answers remain unproved and console work stays uip-owned. Acceptances 1–4 remain owed: complete discovered-monitor adoption, maintenance, confirmed outage through scheduled recovery, owner, comment and root cause, destination drill, route correction and SLA export; autonomous and held-policy review and approval feeds, live-blocked continuation and named-person gated steps. Existing account, sibling, Platform, continuation and guarded-release prerequisites remain; no undeclared capability, unscoped lifecycle or AGENT-001 through AGENT-005 hold is released. Main’s missing judgment is retained; this focused assertion does not establish complete-clause acceptance. |
| `SURFACE-006` | One-way operational actions carry their effects | target | missing |  | No implementation: no tool computes irreversible cleanup-debt or incident transitions, setup resumption or reminder and fallback suppression across affected monitors, incidents and routes. |
| `AGENT-001` | Continuously maintain meaningful coverage | push-further | partial | `src/domain/discovery.server.ts`; `tests/discovery-jobs.mjs` | Reviewed one-shot discovery exists; continuous agent planning, analytics/deploy comparison and maintenance are absent. |
| `AGENT-002` | Distinguish outage, network and broken check | push-further | partial | `src/domain/policy.mjs`; `src/domain/evidence.server.ts`; `tests/control-runtime.mjs` | Canary/network evidence exists; AI explanation and competing release/dependency investigation do not. |
| `AGENT-003` | Repair browser drift without weakening intent | push-further | missing |  | No implementation; acceptance journey above is required. |
| `AGENT-004` | Keep alert routes accountable | push-further | partial | `src/domain/alert-drills.server.ts`; `tests/alert-drill.mjs` | Owner-started consented one-shot drills ship; agent schedules, credential diagnosis and chasing do not. |
| `AGENT-005` | Coordinate evidence handoff and verified recovery | push-further | partial | `src/domain/flow-changes.server.ts`; `src/domain/policy.mjs`; `tests/flow-journey.mjs` | Original-assertion recovery/changed-definition labeling exists; agent repair coordination, supported browser verification and sibling handoff do not. |
| `BASE-AGENT-001` | One MCP door per seed | target | partial | `agent-surface.json`; `src/agent-door/registry.server.ts`; `tests/agent-door.mjs` — native signed identity, current authority and replay journey; `tests/agent-conformance/journey.mjs` — nativeJourney and step hooks; `src/base/modules/agent-door/conformance/index.mjs` — runAgentDoorConformance invoked by rer verify: transport, discovery and capability refusals. | Native MCP transport, both protocol eras and the declared CORE discovery pass the published 0.2.94 harness. Resources, prompts, events and subscriptions remain undeclared and refused; their complete capability acceptance is unproved. |
| `BASE-AGENT-002` | The seed's jobs are tools, through the UI's own actions | target | partial | `agent-surface.json`; `src/agent-door/registry.server.ts`; `tests/agent-door.mjs` — native signed identity, current authority and replay journey; `tests/agent-conformance/journey.mjs` — nativeJourney and step hooks; `src/base/modules/agent-door/conformance/index.mjs` — runAgentDoorConformance invoked by rer verify: tool schemas, annotations and native server actions. | The 34 declared native tools share the existing server services and pass schema, annotation, stable-refusal and both-policy journey checks. Retained unfinished Core jobs and UI parity for every target action remain unproved. |
| `BASE-AGENT-003` | Records are resources | target | missing | `agent-surface.json`; `src/agent-door/registry.server.ts`; `tests/agent-door.mjs`; `tests/agent-conformance/journey.mjs` | Resources remain undeclared in CORE: native templates are retained as registry facts and public reads are refused. Base resource consent/operation-context support has shipped, but no resource-family conformance or complete-clause judgment is claimed. |
| `BASE-AGENT-004` | Business identity and short-lived, audience-bound tokens | target | partial | `agent-surface.json`; `src/agent-door/registry.server.ts`; `tests/agent-door.mjs` — native signed identity, current authority and replay journey; `tests/agent-conformance/journey.mjs` — nativeJourney and step hooks; `src/base/modules/agent-door/conformance/index.mjs` — runAgentDoorConformance invoked by rer verify: native sponsorship, token audience and renewal refusals. | Owner-bound sponsorship, changed-email refusal, token audience and renewal negatives pass CORE measurement on published 0.2.94. Inactive and excluded sponsor fixtures remain undeclared; the complete sponsor lifecycle and multiple-sponsor family are unproved. |
| `BASE-AGENT-005` | An agent acts as a person in a role, never more | target | partial | `agent-surface.json`; `src/agent-door/registry.server.ts`; `tests/agent-door.mjs` — native signed identity, current authority and replay journey; `tests/agent-conformance/journey.mjs` — nativeJourney and step hooks; `src/base/modules/agent-door/conformance/index.mjs` — runAgentDoorConformance invoked by rer verify: sponsor authority, self-escalation and BASE-AGENT-005.5.autonomous injection probes. | Native sponsor authority, self-escalation refusal and ordinary record operations pass. All autonomous additional-argument probes now pass on published 0.2.94: mutations retain their admitted arguments and exact idempotency key, while native stale-version and missing-target guards remain enforced. Complete role parity across retained unfinished jobs is unproved. |
| `BASE-AGENT-006` | Every action declares its risk class | target | partial | `agent-surface.json`; `src/agent-door/registry.server.ts`; `tests/agent-door.mjs` — native signed identity, current authority and replay journey; `tests/agent-conformance/journey.mjs` — nativeJourney and step hooks; `src/base/modules/agent-door/conformance/index.mjs` — runAgentDoorConformance invoked by rer verify: computed native classes and both-policy decisions. | Declared native class checks pass under autonomous and held policies. Approved erasure replay retains trusted completed effect facts only after current workspace-owner admission. The wider retained class conditions, provider costs and gated steps remain unproved. |
| `BASE-AGENT-007` | The company's policy decides, at one chokepoint | target | partial | `agent-surface.json`; `src/agent-door/registry.server.ts`; `tests/agent-door.mjs` — native signed identity, current authority and replay journey; `tests/agent-conformance/journey.mjs` — nativeJourney and step hooks; `src/base/modules/agent-door/conformance/index.mjs` — runAgentDoorConformance invoked by rer verify: unset, renewal, blocked, review and approval policy phases. | Unanswered-policy refusal, policy renewal negatives, declared blocked variants, held approvals and approved erasure replay pass CORE measurement on published 0.2.94. Standard-only named approval and the retained complete policy lifecycle remain unproved. |
| `BASE-AGENT-008` | Truthful attribution | target | partial | `agent-surface.json`; `src/agent-door/registry.server.ts`; `tests/agent-door.mjs` — native signed identity, current authority and replay journey; `tests/agent-conformance/journey.mjs` — nativeJourney and step hooks; `src/base/modules/agent-door/conformance/index.mjs` — runAgentDoorConformance invoked by rer verify: agent, sponsor, preparer and independent reviewer attribution. | Native agent and preparer identity, sponsor and independent reviewer attribution pass through the shared door. Complete attribution for the retained unscoped lifecycle families remains unproved. |
| `BASE-AGENT-009` | Every agent action is audited with its class and decision | target | partial | `agent-surface.json`; `src/agent-door/registry.server.ts`; `tests/agent-door.mjs` — native signed identity, current authority and replay journey; `tests/agent-conformance/journey.mjs` — nativeJourney and step hooks; `src/base/modules/agent-door/conformance/index.mjs` — runAgentDoorConformance invoked by rer verify: review, execution, replay and native-target audit phases. | Review, execution, exact-key replay and native-continuation audit checks pass the declared CORE measurement on published 0.2.94. Complete audit acceptance for retained unscoped lifecycle families remains unproved. |
| `BASE-AGENT-010` | Agents can follow changes | target | missing | `agent-surface.json`; `src/agent-door/registry.server.ts`; `tests/agent-door.mjs`; `tests/agent-conformance/journey.mjs` | Events and subscriptions remain undeclared and are refused in CORE. Multi-sponsor, mail edges and resource refresh remain unscoped obligations; no family conformance or complete-clause acceptance is claimed. |
| `BASE-AGENT-011` | Limits are policy, and Pause stops everything | target | partial | `agent-surface.json`; `src/agent-door/registry.server.ts`; `tests/agent-door.mjs` — native signed identity, current authority and replay journey; `tests/agent-conformance/journey.mjs` — nativeJourney and step hooks; `src/base/modules/agent-door/conformance/index.mjs` — runAgentDoorConformance invoked by rer verify: Pause, pending-execution refusal and declared limits. | Native Pause, refusal of pending execution and declared policy limits pass CORE measurement. The full retained spend, recipient-cap, Business Pause and usage lifecycle remains unproved. |
| `BASE-AGENT-012` | Writes are idempotent and conflict-safe | target | partial | `agent-surface.json`; `src/agent-door/registry.server.ts`; `tests/agent-door.mjs` — native signed identity, current authority and replay journey; `tests/agent-conformance/journey.mjs` — nativeJourney and step hooks; `src/base/modules/agent-door/conformance/index.mjs` — runAgentDoorConformance invoked by rer verify: one-effect replay, current admission, revision conflicts and native continuation identity. | Current admission, exact-key one-effect replay, argument conflict, stale revision, current native reads and trusted continuation identity pass. Deleted-target erasure replay rechecks current workspace-owner authority and native proof; Pause and fresh-key missing-target refusals remain asserted. Published 0.2.94 injection probes preserve the admitted mutation key and arguments. Retained long-work and full 24-hour lifecycle acceptance remains unproved. |
| `BASE-AGENT-013` | Manifest, docs and the conformance journey | target | partial | `agent-surface.json`; `src/agent-door/registry.server.ts`; `tests/agent-door.mjs` — native signed identity, current authority and replay journey; `tests/agent-conformance/journey.mjs` — nativeJourney and step hooks; `src/base/modules/agent-door/conformance/index.mjs` — runAgentDoorConformance invoked by rer verify: published CORE conformance and nativeJourney under both policies. | All declared CORE conformance points pass on published 0.2.94, including the formerly failing autonomous post-mutation injection probes. Worker admissions remain invoke-only. Resources, prompts, events and subscriptions are undeclared; timed, queued, dual-host and owner-native journeys remain outside CORE under ct 2026-10-29T14:12Z ruling 2. Complete-clause acceptance is unproved. |

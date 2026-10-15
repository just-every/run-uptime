# Acceptance requirements

Local verification must exercise the actual product runtime with isolated migrated D1 and authorized test endpoints. Preserve existing assertions and fixtures; a failing check is evidence to repair the implementation, not permission to weaken the expected behavior.

The source release candidate additionally requires signed self-runner enrolment, real certificate-verified HTTPS up/down/recovery and restart against the emitted production Worker, owner-deploy test-provider provision/repeat/interruption/resume/collision, and headless accessibility acceptance at 1440 and 390 pixels across the Lobby, public docs, sign-in, setup and private operator app. It requires zero axe violations, keyboard-operable flows with focus returning to the invoking control after dialogs close, responsive reflow without horizontal overflow, and computed accessibility-tree inspection. Spoken-announcement testing is out of scope, and no WCAG certification is claimed. The published `@runeditrun/rer` 0.2.18 package supplies the CLI and deploy-kit integration; the Uptime seed adapter must retain explicit target validation and authorization guards. `rer verify` runs full verification and the separately hosted browser suites in an isolated checkout. The official current Base CLI release producer prepares the local annotated artifact; it is independent of the product's `@runeditrun/rer` 0.2.18 pin. It frozen-installs the candidate, runs `pnpm run verify` and `pnpm run verify:release`, scans the source and emits a local dry-run artifact. A dry run does not publish or move a remote tag. The emitted public source must preserve the exact reviewed candidate tree and produce zero scan findings without exclusions or reviewed findings. Exact-candidate run receipts, the scan report and independent review accompany release acceptance as external evidence. Hosted installation and public publication require separate owner authorization and acceptance.

Prove one-off fixes with before/after evidence outside the permanent suite. Release acceptance requires inspected exact-candidate verification, external runtime and accessibility receipts, the complete publication/export proof and independent review. The external receipts accompany review of the exact candidate.

- Install, repeat additive setup, restart and preserve prior definitions, observations, migration history and authorized sessions.
- Configure/edit/pause/resume monitors with immutable revisions and complete assertion preservation; reject invalid or contradictory inputs before execution.
- Run real scheduled HTTP probes and authenticated heartbeats through signed runner claims/results; retain retries, categories, durations and exact assertion bundles.
- Verify fixed selected-probe denominator, missing/future/expired coverage, Unknown/Degraded/Failing distinctions, confirmation/recovery hysteresis, maintenance and manual isolation.
- Reject duplicate/foreign/expired leases, wrong signatures, stale submissions, scalar/assertion contradictions and revision-mismatched heartbeat snapshots without durable side effects.
- Exercise address normalization, mixed DNS answers, numeric socket pinning, every redirect, TLS hostname mismatch, downgrade, credential stripping, body/timeout bounds and synthetic grant custody.
- Protect private documents and direct native/framework transports with server-side authority, configured-origin checks, fail-closed input handling and revocation.
- Export/restore bounded archives with integrity/version/semantic validation, prior format compatibility, preserved history, new paused revisions, portable destination definitions and notification history, installation-local authority and credentials, and no alert replay.
- IMPORT-001: preview definition files and saved UptimeRobot pages without writes; refuse oversized, malformed, non-UTF-8, wrong-type, hostile-URL, secret-bearing, duplicate, stale-digest, cross-origin and sessionless requests with every table byte-identical; apply exactly the preview as paused monitors and kept-state revisions without touching destinations, notifications or heartbeat authority; round-trip export; undo with history intact and edited monitors reported; carry batches through archives as restored history; count a log export without storing it. A real UptimeRobot export and a hosted run remain unmeasured.
- DRILL-001: drill each destination kind end to end through the actual Worker, the real runner and authorized fake SendGrid, signed webhook and Slack receivers; prove by table scan that monitor evidence, state and incidents are unchanged; show GET/HEAD never confirms, a same-origin POST confirms once, and replay, foreign, wrong-destination, expired and cross-origin requests are refused with no state change; an HTTP 500 drill stays Uncertain and is not resent; one confirmation proves only its destination; rotation or a new address resets proof; raw D1, archives, console reads and logs hold no plaintext capability or credential; restore starts Never proven. A recipient-confirmed drill is supporting evidence only and does not meet the hosted recipient gate below.
- FLOW-001: through the actual Worker and the production runner (two vantages, each with a real browser) and a local sign-in app behind the synthetic grant, a healthy flow passes with a trace that keeps no query string, fragment or credential, and each of these fails with a distinct reason and the failing step in the trace and opens an incident that sends through a destination: wrong password, a missing required element, a 500 on the confirmation page, a response slower than the wall limit, a redirect to a private address, a subresource to 169.254.169.254, a page that opens a second origin, and a flow whose required outcome was edited out (its weaker revision's pass recovers the incident labelled as a changed definition, and the revision history shows the reduction). A runner without a browser leaves coverage Unknown with that reason. A planted credential value is absent from D1, the export, the archive, the trace and every log; the profile folder is 0700 during a run and gone after it. Each configured browser-flow execution limit fails a run naming itself. Browser flows remain outside the supported public feature set; these are implementation acceptance requirements. Axe reports no serious or critical violation and no horizontal overflow at 1440 and 390 on a passing and a failing flow's page. The hosted half (a real runner and a real sign-in) is prepared in the evidence's OWNER-STEPS and stays open.
- Verify contact Never seen/Fresh/Stale/unavailable states and portability without treating contact as target health.
- Verify durable action feedback, read failure/recovery, editor criterion round-trip, keyboard/focus, responsive layout and actual rendered state.
- Exercise notification destination create/edit/disable/delete/rotation through the actual Worker and migrated D1. Use authorized fake SendGrid and webhook endpoints with the real private runner to verify scheduled trigger/recovery fan-out, one job per event and enabled installation-wide destination, duplicate suppression, test isolation, secret visibility/custody, exact signatures and payloads, timeout/connection/HTTP 500 uncertainty without automatic resend, escaped email/Slack content, restart recovery, upgrade preservation, and rendered operator controls.

Build, types and local runtime suites are separate from hosted proof. A hosted installation requires account/resource-bound setup, deployment readback, actual health verification, additive migration evidence, signed runner operation and recovery in an independently configured installation. Notification acceptance additionally requires an authorized hosted destination, send/readback evidence for a specific event and endpoint, and recipient-side confirmation; local fakes and provider acknowledgments do not establish inbox receipt or that a person was notified. An alert drill (DRILL-001) records a recipient's report for one destination at one time; that record supports this gate but does not meet it. The gate stays open until the owner drills a hosted installation's destinations to a real inbox and channel and records, for each, what was sent, what the provider said and what the recipient saw. Provider uncertainty must stay uncertain; neither local checks nor a command exit code substitutes for provider acceptance. CI claims require an inspected result for the exact candidate.

A useful operator release also requires an authorized endpoint, real runner placement and isolation, an inspected operator workflow. Single-vantage checks do not establish regional independence. Accessibility acceptance does not assess spoken announcements or certify WCAG conformance. Retention economics, operator demand and larger-scale reliability remain unmeasured; they are outside this source release's acceptance.

Notification delivery is bounded to configured email, signed JSON, and Slack incoming-webhook destinations. A stored outbox row, local receiver, or provider acknowledgment cannot establish inbox delivery or human notification. Each event/destination pair gets one automatic send attempt; an uncertain result is not retried automatically. Uptime implements one bounded browser-flow monitor type; arbitrary scripts and DNS/ping/TCP/domain-expiry checks are outside the implemented monitor types. Public status communication is outside product scope; no public status page exists.

This document states requirements, not a passing release verdict. Executed candidate evidence must identify the exact source and preserve failures alongside successes.

Notification custody verification must inspect raw populated D1 across the
0008-to-0009 key-bearing Worker upgrade and restart, including active and
obsolete credential versions. Require no plaintext, isolated unavailable
credentials for missing/wrong keys and modified/swapped ciphertext, preserved
monitor/outbox/history identities, complete obsolete credential-material
scrubbing after retirement (`endpoint`, `signing_secret`, and `ciphertext` are
null and `retired_at` is set), and no upgrade sends or replay. Destination
erasure removes every credential version and its dependent local history.
Unchanged keys preserve authorized sessions; rotating
SESSION_SECRET invalidates old authentication while allowing sign-in and
credential re-entry/deletion. Monitoring and probe claims/results remain
available with a damaged destination. Exercise the actual runner RPC bridge with an ahead clock, a clock
inside the claim boundary, a behind clock and preparation that outlives its
claim. Retain exact external request-byte/signature assertions.

Notification browser verification must audit every add and edit destination kind and the New monitor editor at 1440, 390 and 320 pixels. Require zero axe violations, no overflow or page errors, keyboard focus return after dialogs close, named delete/rotation confirmation with no network mutation on cancellation, actual API changes on acceptance, owner email review/update, credential re-entry, and native clipboard equality without recording secret values. Secret dismissal must clear detached nodes and retained dialog handlers. Capture credentials only behind screenshot masks. Verify mail setup warnings and unsent wording, mobile help placement, runner contact beside queued rows, recent check pass/failure marks, healthy badge color and mobile detail heading focus. Human timing units must round-trip exact millisecond policy values; failure thresholds and retry semantics remain unchanged.

## Local command journey

Run the literal README clone and `rer dev` onboarding, plus explicit-owner setup separately. Check health, Vite/HMR assets, ordinary one-use outbox sign-in, native form POST before hydration, first-run `/setup` at 1440 and 390, unfinished-owner app redirects, signed-out sign-in return, durable native-form completion, signed-in documents and unsigned private-access refusal. Confirm the app-origin `/` serves the Lobby, `/setup` serves first-run setup, `/docs` serves public documentation and `/app` is private; check separately that the marketing site serves `https://run-uptime.com/` and `https://run-uptime.com/run`. Local sign-in makes no mail-provider request. Setup must stop all temporary processes, preserve exact settings and owner/data on repeat, and reject a conflicting owner.

Stop dev and verify descendant teardown and released ports. Reset must refuse active state and unconfirmed execution, preserve source/exports/deployment receipts, and enable fresh empty setup. The populated export/reset/setup/import/export journey must retain complete portable records/history with explicit inactive transformations and excluded installation authority. Setup must establish the receiving owner and settings before import; product data must remain empty. Import requires integrity and confirmation; no imported event dispatches.

## Candidate release state and unmet obligations

The product exposes the rer command contract, owner-account deployment, local
export/import and versioned archive history. The latest published version is
v0.1.2 at tag commit `bdcd147542e0fab55be2663f05165a0724b4e49e`; no GitHub
Release entry exists. This branch is preparing v0.1.3, which remains
unpublished and has no release tag. The candidate pins `@runeditrun/rer` to
0.2.18. Scoped local recovery evidence covers a repeated setup with exact settings,
a populated v0.1.2 upgrade that preserved existing private values while adding
only optional `IDENTITY_PROVIDER`, and current CLI import/export, dev, native
sign-in and readback using a genuine rer 0.2.1-bound archive and current-ledger
archives. Product rows were compared through live data and retained
`archive_history`, accounting for inactive restore transformations. Unbound
v0.1.2 archives are refused with exit 4, and uncertain migration history is
refused. Exact-head CI, runtime/accessibility receipts and release-pack
reports accompany candidate review as external evidence. At the app
origin, `/` is the Lobby,
`/setup` is setup, `/docs` is public documentation and `/app` is the private
operator console. The separate marketing site serves `https://run-uptime.com/`
and `https://run-uptime.com/run`.
No fresh Cloudflare account, deployed `/health`, hosted runner, target, or
recipient acceptance is recorded here. A local `pnpm run health`, an operations
descriptor check, or a successful deployment command cannot substitute for
that evidence.

The owner accepted the BASE-DATA-001 archive policy on 2026-10-13: portable
archives exclude installation authority and webhook/Slack endpoint credentials
while available email addresses remain portable destination definitions.
`ARCHIVE-001` preserves product definitions and notification histories and now
includes the permanent anonymised audit and source erasure journal, while
excluding installation-local authority and webhook/Slack endpoint credentials.
An earlier inspected `tests/archive-roundtrip.mjs` run passed the unchanged
10,000-revision boundary. Separately, the real rer
export/erase/reset/setup/import/export flow was inspected. Decoded archives had
stable audit history, one restore audit entry and the preserved source erasure
journal. This is evidence for the accepted replacement archive behavior, not
BASE-DATA-001 equivalence.

The static external-sink inventory is mapped to `seed.json → externals` in
`CONTRACT.md`, but is not runtime egress proof. Earlier scoped native-independence
evidence is summarized below; it is not acceptance evidence for the current
v0.1.3 candidate. Before claiming complete BASE-DATA-004 coverage across optional integrations and deployment, inspect an application and runner network
trace, including DNS, public target and canary redirects, discovery hosts,
browser redirects/subresources/WebSockets, exact-origin credential use, owner-app
readiness checks, runner
control-plane requests, email and notification destinations, heartbeat/watch
endpoints, optional management-editor traffic, setup-time identity-provider
attempts and owner-directed Cloudflare deployment. Assert each destination and
request field against its declaration, rejected destinations produce no
connection, redirects do not forward authority, discovery raw HTML never
reaches the Worker or console, and an absent optional editor produces no
management request. The completed local OIDC probe separately establishes public check, omitted-provider setup, native sign-in/handoff/revocation and exact repeat preservation. Selected-provider dependency metadata returned 200 from the local issuer edge, then actual setup failed at application dependency approval (404) before owner creation or linking; a separate native bootstrap cannot reach the unmounted dependency/OIDC routes. No linked callback, repeat or revocation lifecycle is accepted. The default is a separate scoped adoption round, with no provider-readiness claim. The exact-candidate trace must also investigate marketplace/author,
telemetry, licence and kill-switch traffic. Static source reading alone cannot
establish their absence; those broad claims remain unverified outside the measured native flows.

BASE-INPUT-002 is explicitly superseded by no owner-supplied HTML and
derived-only parsing of bounded fetched target content. BASE-INPUT-003 is
superseded by no R2 or product attachment-upload route; bounded definitions and
archives remain structured data. BASE-PUBLIC-002 is superseded by no public
embeddable surface, with only the optional exact-origin private management
editor documented in `CONTRACT.md`. BASE-DATA-005 is replaced by native standalone operation without a marketplace/author dependency, while permitting an optional owner-configured private management editor that may contact the author at that configured origin. Native operation with the editor absent passed; an opted-in author-hosted editor cannot support an absolute author-zero-egress claim. This exception permits no telemetry, licence check or kill switch. These named replacements do not expand product scope and are not general baseline passes.

The retained original corrected local health log records 15 total cases (healthy 200 plus 14 faults), all faults 503 within 906 ms and recovery after each. Twenty sequential healthy samples have p95 6 ms and maximum 7 ms. The applicable dependencies are D1 and emitted `ASSETS`; there is no R2 or queue binding. The 900 ms response deadline cannot cancel underlying D1 work. This is scoped BASE-OPS-001 local evidence, not hosted latency or load capacity. The retention scan covers 76 migrated tables, 36 populated before maintenance, with aged rows deleted only from the four transient session/rate/auth-attempt tables and other preexisting identities surviving measured cleanup and restart. BASE-DATA-002 remains partial because not every cleanup edge was exercised. BASE-OPS-004 remains partial for auxiliary watch latest-only/in-memory state, absent watch lease reconciliation and authentication-mail attempt-only audit without durable provider outcomes or crash reconciliation. Earlier inspected local evidence records the emitted native-independence probe, hostile-text/upload behavior and editor renewals described above. An earlier `tests/flow-journey.mjs` run records browser failure, changed-definition recovery, hard-stop cleanup and custody refusal; exact-candidate browser-flow recovery proof is pending for v0.1.3. A prior public-privacy receipt records 84 fresh-context marketing/app-Lobby/docs cases at 1440/390 before visitor interaction, including unclaimed and claimed installations, idle/repeat and tab isolation. It observed no cookies, Set-Cookie, visitor queries/bodies, telemetry or third-party requests; only validated tab-local scroll-restoration state was retained and its keys were not transmitted. These prior local results used emitted static and Worker artifacts at local HTTP edges; live CDN/header behavior remains unmeasured. Hosted/provider acceptance remains open.

Earlier inspected local and emitted results record `BASE-ACCESS-002`,
`BASE-ACCESS-003`, `BASE-SECRET-002`, `BASE-DATA-003` and `BASE-OPS-005` as
covered in `BASELINE.md`. It includes startup matrices, declared-path and asset
boundaries, populated erasure and audit flows, and race-safety checks. The final
candidate head and prior inspected run results are mapped in the external evidence
record. The erasure/audit flow includes audited local authentication-mail
captures, six separate network-edge monitor/test sends, surviving anonymised
audit and refusal of erased-operator actor references on later-journal restore.
These are scoped source results only; they do not establish hosted installation,
recipient acceptance or acceptance of the current v0.1.3 candidate. The latest
published version is the v0.1.2 tag at `bdcd147542e0fab55be2663f05165a0724b4e49e`,
with no GitHub Release entry; v0.1.3 remains unpublished. Other baseline clauses
remain requirements; scoped migration and ledger recovery evidence is recorded
externally. Exact-head CI, runtime/accessibility receipts and release-pack
reports accompany candidate review as external evidence. The current
2026-10-14 root and copied-mail dependency
audit snapshots report zero vulnerabilities across 262 and 57 dependency
records respectively; the current GitHub Dependabot snapshot has no open alerts.
These snapshots do not substitute for exact-head CI or release-pack verification.

Public status communication remains outside scope and no public status page
exists.

The [BASELINE.md](BASELINE.md) status list names each clause, the inspected
candidate evidence and any remaining gap. A test filename or clause label
without an inspected result is a lead for verification, not a release verdict.


## Verification coverage

`tests/readme-journey.mjs` executes the current README shell blocks in a fresh Git clone and signs in through the actual outbox. `tests/command-journey.mjs` covers owner failures, exact-settings reruns, Vite/HMR, native forms, active reset refusal, complete populated portability and retained deployment receipts. Base shared tests remain in Base; the seed ships required runtime source. Results must be inspected on the exact candidate; these tests claim no hosted acceptance.

## Assisted delivery and owner editor

See `scripts/delivery/README.md` for the pinned producer, immutable managed
workflow, exact setup-manifest digest, trusted signed-claim bindings and native
owner editor policy. `pnpm run test:admission` checks these public flows against
the emitted application; its management peer is only a test network edge.
Stage installation, live Cloudflare and the public release remain owner work.

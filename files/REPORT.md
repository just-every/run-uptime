Build five independent slices; 78 open clauses / 14 HELD-EXTERNAL / 56 HARD / 8 CHEAP; published judgments remain 37 done, 58 partial, 20 missing.

Read-only plan for just-every/run-uptime main `6fd9399cf9ce9acf4e009999581cc20f32c9e129` (0.5.16), inspected 17 November 2026. Counts classify each non-DONE clause once, by its next substantial remaining obligation. CHEAP includes qualification work whose implementation already exists; it does not mean eight new product features are needed. HARD includes migrations and cross-subsystem work, and work reserved to existing rounds. Field proof is separate: the contract explicitly says real-account/device/placement evidence never blocks done. A HELD-EXTERNAL classification here identifies a dependency or remaining field-only obligation, not a new acceptance gate.

CONTRACT.md, ACCEPTANCE.md and docs/CLAIMS.md agree. `node src/base/contract-docs.mjs check` passed: zero prose errors/warnings; generated documents current. Claims: 11 done, 10 partial. This was source/test inspection, not a fresh Verify run. No installation, app launch, provider exercise, product edit, product commit, product push, PR or CI dispatch occurred. Only the report-only evidence branch is authorized for publication. The feeder alone edits the lane plan.

The packet includes CLAUSE-AUDIT.md with the verbatim acceptance, declared evidence and gap for every one of the 78 open clauses; SOURCE-REVIEW.json records the tracked source/test files inspected; BRANCH-REVIEW.json records the complete branch census and relevant candidate diffs; PLANNING-RECEIPT.json records actual commands/results and product custody. These are public-repository material and planner receipts, not builder or gate acceptance.

Current gaps require correction in interpretation before assigning builders:

- STATE-001's blanket gap is stale in part. `tests/control-runtime.mjs:78` mounts `proveStateHysteresis`; `tests/control-state-support.mjs:113`, `:164`, `:169` assert mixed-vantage Degraded, absent-probe Unknown and Recovering, with manual isolation and one recovery. Maintenance has its own test. Expired-passing coverage has an unmerged f162 round. Do not rebuild the state engine or promote Status.
- NETWORK-001 already has mixed-answer refusal (`tests/network-mixed-dns.mjs`), hostname, redirect-cycle and rebinding helpers mounted by `tests/tls-auth.mjs:11`. `runners/src/public-http.mjs` retains pinning and redirect controls. Wider redirect/origin/timeout/body/encoding combinations still need qualification; several are reserved below. A helper's presence is not a new passing run.
- TCP-001 still uses one default assignment in `tests/protocol-monitors.mjs:52`; two-vantage qualification is already on sd f23. WEBHOOK-001 previews and receiver sends exist in `tests/webhook-custom.mjs:9-19`; exact preview/sample-send equality is sd f44's work. API-002's OAuth use of Basic/Bearer does not qualify standalone Basic/Bearer; `runners/src/auth/schema.mjs` supports both, while broad browser/log exclusion remains unproved and f48 already covers native isolation.
- INTERFACE-001 is not cured by a phone screenshot: `tests/operator-browser.mjs:237` runs the full loop at 1440 only, followed by one 390 smoke at `:294`; `tests/security-controls-browser-support.mjs:16` likewise has a 1440 main loop. The full required 390 action/refusal/polling/focus journeys remain owed. Existing responsive assets and old screenshots do not establish them.
- MONITOR-001's universal 100-monitor statement is stale: `src/domain/definitions/format.ts:12` allows 500 definition entries and `tests/archive-transfer-support.mjs:23` creates 119 additional native monitors. This does not prove 500 active monitors, first-slot cadence or hosted capacity. Named route selection exists in `tests/catalog-routes-support.mjs`; default-route bulk work is already sd f2's reservation.
- ARCHIVE-002's “no stream/resume/subset/range” assertion is stale. `src/domain/archive.server.ts:15`, `archive-chunks.ts`, `archive-transfer-policy.ts` and `archive-selection.server.ts` implement these bounded facilities. `tests/archive-roundtrip.mjs:1-4` mounts transfer and selection proofs; `tests/archive-transfer-support.mjs:159` explicitly reports fullMonitoringScaleQualified=false after 120-monitor/10,001 synthetic-revision-row qualification. The graph is still materialized before chunk emission; no 500-monitor, 90-day, roughly 388.8-million-attempt proof exists. Do not reimplement transfers already covered by f169.
- HEARTBEAT-004's UptimeRobot/Better Stack 3600+300 mapping and deadline journey already exist in their importers and `tests/heartbeat-import-fixture.mjs`. Site24x7 HEARTBEAT still hands off in `src/domain/definitions/importers/site24x7.ts:23`; build only that conversion slice, not the existing 65-minute proof.
- HISTORY-001 and INCIDENT-005 already retain UptimeRobot incident comments/root cause: `tests/source-history-support.mjs:102-105`. History sources remain hard-coded to UptimeRobot in `src/domain/source-history/model.ts:3`, `preview.server.ts`, `read-selection.ts:4-5` and provenance mapping. Other-incumbent history is real migration work, not a Status edit.
- DEPENDENCY-002's generic “tenant egress not built” wording is stale. `service-catalog/authorization.mjs`, `authorization.server.ts` and `tests/service-catalog-auth0-support.mjs` implement reviewed tenant-bound checks. `source-check.mjs:21-28` intentionally returns Unknown and `:46-49` rejects success. Auth0 follow/status semantics remain unbuilt; Fastly prose still supplies no trustworthy status field. Do not infer Operational from an empty feed.
- SURFACE-001–006's blanket “no MCP/tool implementation” gaps are stale. `agent-surface.json`, `src/agent-door/registry.server.ts`, `tests/agent-door.mjs` and `tests/agent-conformance/journey.mjs` implement a native CORE surface, class facts, policy/approval and replay. `tests/agent-door.mjs` explicitly refuses resources/prompts/events/subscriptions and retains unscoped lifecycle families. Complete target acceptance is still unproved; none of those clauses should be assigned a new MCP implementation from scratch.
- CODE-001's runtime-test gap is real: `scripts/definitions-http.mjs:47` and `scripts/definitions.mjs:150` explicitly return runtimeProbesExecuted=false. CHAT-001's adapters are absent from `notification-protocols.ts`; generic webhooks and a legacy-Teams import warning are not native chat destinations. These are useful new build slices.

Open-clause inventory follows. “A1” means the numbered acceptance point in CONTRACT.md for that exact ID. Each row lists the remaining portion, not already-shipped acceptance. All unchanged raw acceptance text and source references are retained in CLAUSE-AUDIT.md.

| Clause | Class | Exact remaining acceptance or qualification; disposition |
| --- | --- | --- |
| STATE-001 | CHEAP | A1 stale/missing coverage and A2 maintenance/manual/absent-probe qualification; substantial assertions already built. Reserved f42/f43/f132/f159/f162; no new builder. |
| NETWORK-001 | HARD | A1 remaining per-hop re-resolution, downgrade/forbidden redirects, exact-origin credentials, TLS and timeout/body/encoding boundary matrix with zero rejected-destination connections. Several cells already built; reserved f137/f143/f150/f153/f157/f160/f164. |
| IMPORT-001 | HARD | A1–2 authentic export/hosted proof and intended whole-plan atomic apply versus resumable 20-record authorized batches; revocation must preserve prior authorized results. Transaction/authority design crosses import engine and D1; f130/f135 cover reconciliation only. |
| INTERFACE-001 | CHEAP | A1 full console journeys at 390: textual health/freshness/reasons, edit/refusal, read/action errors, polling, keyboard focus, semantics, axe/reflow. Existing uip/main console rounds reserved. |
| BOUNDARY-001 | HELD-EXTERNAL | A1 distinguish native handoff acceptance, actual receipt and human response. Need Oncall's scoped source/key/generation receipt-and-response read contract; current webhook acknowledgment cannot supply it. |
| STARTUP-001 | HARD | A1–2 complete missing/malformed/conditional configuration matrix across Worker, scheduled, local app, preview, setup, deployment and runner; ASSETS/D1 faults and ≤3-second readiness fault response. Existing origin/runner/mail cells built/reserved f40/f146/f147/f158/f165. |
| FLOW-001 | HELD-EXTERNAL | A1 independently placed browser vantages and hosted customer-path field proof; local login/signup/checkout, refusal/recovery and 1440/390 proof already exist. Need independently hosted browser runners. |
| MONITOR-001 | HARD | A1 route-name edit/remove and never-probed clone removal; A2–5 bulk creation's shared routes, 47 first-slot executions, undo and CSV parity at target capacity plus USD projection. Named-route console held; f2/catalog and existing console rounds excluded. |
| API-002 | CHEAP | A1 standalone Basic/Bearer lifecycle and foreign-monitor-reference negatives; planted-secret exclusion across storage, logs, artifacts and archives. Native support exists; f48 reserved. |
| TCP-001 | CHEAP | A1 open/refused/blackhole and trigger/recovery from two assigned locations; one-location proof exists. f23 reserved. |
| DOMAIN-001 | CHEAP | A1 create through the actual console, then expiry/unavailable/conflicting/renewal evidence and follow-up; existing registry-edge API proof is insufficient. Existing protocol-form/uip scope reserved. |
| HEARTBEAT-002 | HELD-EXTERNAL | A1–3 remaining hosted alert/due timing under SCHEDULE-002; cron/DST, fail masking, max duration and local desktop/phone journeys already built. Need the R-2 hosted timing installation. |
| HEARTBEAT-003 | HARD | A2 native PowerShell/Task Scheduler, actual systemd user manager, Kubernetes and GitHub scheduler execution; arbitrary cron conversion for daily-labelled examples. A1/A3 receipt/rotation rules already built. OS/scheduler matrix plus cron conversion; sd c14-b reserved for its existing shell slice. |
| HEARTBEAT-004 | CHEAP | A3 separate source alert-setting reconciliation; A4 explicit Site24x7 10-minute Trouble/30-minute Down/early-ping review and owner-selected 25+5 conversion; A1–2 already built, A5 no invented Pingdom heartbeat. Queue bounded A4. |
| SCHEDULE-002 | HARD | A1 500×30s×3 for ≥1 hour: 99% claim lag ≤5s and 99.9% ≤15s, console/metrics parity; A2 first destination attempt p99 ≤10s after confirming commit; A3 lost capacity/quotas/Unknown and detection-time display. Scheduler, storage, metrics and UI cross-cut. |
| PROBE-001 | HELD-EXTERNAL | A1–2 real US East/Central/West, Europe/APAC independent-network evidence, one-network versus target failure, stopped region and recovery. Need managed independent locations, not renamed local runners. |
| PROBE-002 | HARD | A1–3 dedicated IPv4/IPv6 egress, files/DNS/API/version/effective date, WAF validation, 30-day notices/pending hold, optional secret header, cross-origin stripping, shared-Worker label and runner egress. UA/opaque identity already built; queue only secret-header transport slice. |
| REPORT-001 | HARD | A1 service charts; A2 held source-segment charts/incident lists and other-incumbent history; A4 maintain JSON/CSV/PDF/read parity. Recurrences, frozen delivery and cancellation already built. Depends on history and held UI. |
| DIAG-001 | HELD-EXTERNAL | A1 real independent-location route/TLS/DNS comparison with ICMP-blocked path. Bounded native protocol diagnostics already built; need actual independent network locations. |
| PERF-001 | HARD | A1 RUM error counts, percentile ranks/missing denominators, US subdivisions, bot exclusion, erasure and populated restore/upgrade (RL-8). Analytics/retention/archive cross-cut; sd c21/c28 and uip page-speed work reserved. |
| DEPENDENCY-002 | HARD | Required catalog coverage: Auth0 successful status interpretation/follow after reviewed tenant egress; Fastly usable stated status without prose inference. A1–8 existing provider notice/correlation/import behavior must remain intact. Reviewed Auth0 source-check already built, not a follow. |
| DISCOVERY-001 | HARD | A1 itemized USD projection once COST-001 rates exist; real least-scope Route53/Cloudflare/GitHub/Vercel/Netlify/CodeDeploy authorization is separate R-7 field proof. Existing provider-edge and public-DNS tests are not missing implementations. |
| FLOW-002 | HARD | A1 arbitrary Playwright isolation requires OS sandbox; held source/revision UI and least-scope hosted CI proof remain. Translate/refuse subset is adopted RL-13; do not weaken it. |
| ROUTING-001 | HARD | A1 UI+API two-team production/staging all-class inside/outside quiet journey; preserve extended fields; team/filter/quiet/business controls, actual geographic routing, route drills, expiry/renewal routing and real-alert DST dispatch. Reserved sd-rs1/c28 and strategy-trial-12/uip work. |
| WEBHOOK-001 | CHEAP | A6 remaining byte-for-byte redacted preview versus authorized sample-send request comparison; modes, headers, HMAC and template refusals already built. f44 reserved. |
| CHAT-001 | HARD | A1 native Teams Workflows Adaptive Cards and Teams app, Discord, Telegram group, Google Chat, Mattermost create/drill/trigger/recovery/error/rotation and receipt distinction through console; A2 legacy label, replacement and failure readback. Credential, transport and UI cross-cut. Queue API/CLI transport slice only. |
| PHONE-001 | HARD | A1 verified handset SMS/voice/acknowledgment via managed or connected provider; A2 opt-out, spend-cap, carrier failure, uncertain result, fallback and unresolved follow-up. No implementation; phone, budget, consent and delivery subsystems coupled. |
| PHONE-002 | HELD-EXTERNAL | A1–6 new-workspace managed sender, three carriers' OTP/alerts/call receipts, STOP/HELP/START, registration display, metered price and optional buyer Twilio. Need an operator-authorized registered US relay sender; local relay/consent/metering code is also unbuilt and must not be disguised as field-only work. |
| MOBILE-001 | HARD | A1 public iOS/Android clients, second-factor sign-in, exact-incident APNs/FCM push, responder acknowledgment, offline/revoked/denied-permission states plus 390 web; A2 Pushover/Pushbullet drills. Native apps, identity and push custody cross-cut. |
| FOLLOWUP-001 | HARD | A1–2 native Oncall handoff-check/responder-policy due times and attempts/outcomes; narrowed responder initial console entry/navigation still needs ruling. Existing owner timeline/restart/scoped API proof already built; strategy-trial-7/main-readonly work reserved. |
| INCIDENT-001 | HARD | A1–3 console add/edit/delete and edit history under author/admin and scoped responder roles; API/CLI already built. Held console and initial role navigation prevent an isolated proof-only change. |
| INCIDENT-002 | HARD | A1 plus the requirement’s later push path: console eligible mention/outcome workflow and MOBILE push, retaining scope, consent and no duplicate mention delivery. API/CLI email mention custody already built; f12/f14/f152/f154 reserved. |
| INCIDENT-003 | HARD | A1–2 held console root-cause selection/editing and category-filter report journey; API/CLI and owner-only category administration already built. |
| INCIDENT-004 | HELD-EXTERNAL | A1–2 per-comment publish preview/approval/version-keyed handoff/outcome and correction; unpublished comments send nothing. Need approved Lamp publication/import API; local action is unbuilt too. |
| INCIDENT-005 | CHEAP | No new unbuilt own A1–4 implementation identified: UptimeRobot comments/root cause, archive/erasure and unchanged native figures already have source assertions. Declared gap is broader sourced-incumbent custody, now HISTORY-001 work, plus R-3 authentic-account proof. f12/f16 reserved; no judgment-only builder. |
| ONCALL-001 | HELD-EXTERNAL | A1 each native Oncall/PagerDuty/Splunk connector's confirmed failure/repeats, interrupted/uncertain send, stable-key dedup, acknowledgment distinct from response, same-incident recovery and due/timeline projection. Need scoped native Oncall handoff/check/response API contract; PagerDuty/Splunk local adapters also remain unbuilt. |
| LAMP-001 | HELD-EXTERNAL | A1–3 mapped confirmed incident/maintenance/recovery, approval/publication, replay/interruption, subscriber update, explicit comment publish and unpublished silence. Need approved Lamp component/publication API; Statuspage connector and local mapping also unbuilt. |
| AUTOMATION-001 | HARD | A1 Zapier/Make failure/recovery/expiry workflows, replay controls, revoke/pause and failed/stopped durable execution. Generic signed webhooks are partial infrastructure, not supported connectors; connector auth and event lifecycle cross-cut. |
| READAPI-001 | HARD | Remaining delegated issuance with live role/scope ceilings; all existing hash-only keys, limits, OpenAPI, owner UI and migration example remain. RL-14 adopted owner-only issuance, so delegation needs an explicit revised authorization scope; not queued. |
| READAPI-002 | HARD | Other-incumbent source selections, held console source segments, and 500-monitor hosted read capacity. UptimeRobot/blended selection already built; shares HISTORY/REPORT/scale work. |
| READAPI-003 | HELD-EXTERNAL | A1 plus the requirement’s remaining native Oncall handoff next-due policy and outcome projection (RL-7). Existing reminders/escalation deadlines, CSV/source incidents and owner console already built. Need native Oncall scheduling API. |
| CODE-001 | HARD | A1 actual CLI runtime probes, TypeScript route/maintenance apply, mail/private/synthetic/dependency grants, Checkly migration and least-scope live Actions run. Current test only validates schema/plan; queue runtime-probe slice without granting CI new authority. |
| CODE-002 | HARD | A1 Terraform monitor import, route+recurring-window plan/apply, UI drift, secret-free state and unauthorized-destroy refusal; also location/contact management requirement. New provider plus native API/revision/erasure integration. |
| MIGRATE-001 | HARD | A1–2 paginated authentic extraction/cutover/rollback and complete contact/status/subscriber handoffs; A4 reminder expansion; A5–6 full history; A7 reviewed seat/contact apply; A8 legacy warning already built. Local saved mappings/history/webhook preview are not whole-account migration. |
| MIGRATE-002 | HARD | A1–2 account extraction, teams/contacts/schedules, transaction/page-speed conversion or named source limits, geographic placement, source history, Lamp handoff, representative cutover/rollback. Saved HTTP/protocol/tag and explicit unsupported TMS previews already built. |
| MIGRATE-003 | HARD | A1 time-based confirmation/recovery parity, contacts/maintenance/history, real extraction, geographic coverage, Oncall/Lamp import and side-by-side cutover. Saved HTTP/keyword/ping/TCP and heartbeat mapping already built. |
| MIGRATE-004 | HARD | A1 threshold/notification groups, expiry/mail/browser conversions, scheduled reports/history, live extraction/regions/cutover and retained unsupported exports. Saved Website/REST/Port/Ping/expressible DNS mapping already built. |
| MIGRATE-005 | HARD | A1 Checkly/OpenStatus/Hyperping/Datadog bundles: source IDs/counts, explicit conversion/refusal, paused deploy, outcome comparison, matching locations and reversible routes. Code parser, grants and source-history integration; no importer exists. |
| HISTORY-001 | HARD | Requirement's Pingdom/Better Stack/Site24x7/challenger sourced history; A1–5 exact source seconds, separate denominator/blend/cutover, unchanged native state, replay/unmapped rows, inactive archive and erasure for those sources; held owner-console preview/segments. Queue Pingdom saved-history slice. |
| ACCESS-001 | HARD | A1 initial narrowed-role sign-in/MFA/shell/navigation at 1440/390; broader UI refusal/delegated-key coverage; initiating authority for setup/catalog/source discovery; debt assignee/due; retry-chain owner/resolution; mail/watch outcomes; export/download receipts and reloadable job progress. Existing batch revocation proof is built. Held UI/main-readonly and sd discovery rounds reserved. |
| ACCESS-002 | HARD | A1 Okta/Entra/Google provider group→role mapping, recovery owner, callback state/origin and foreign-tenant refusal; Base SSO/SCIM and product role lifecycle integration. Real tenant qualification is separate R-8. Later tier; not ranked ahead of day-one gaps. |
| ACCESS-003 | HARD | A1 member initial factor step and narrowed-role shell; A2 complete initial-session enforcement journey, SSO MFA assertion acceptance and total-loss local recovery. Owner factor/step-up and already-open member Settings are built; main-MFA/uip branches reserved. |
| COST-001 | HARD | A1 mixed run/probe/browser/phone USD estimate, quotas/plan/budget halts and honest denominators; A2 metered SMS/voice at displayed prices; A3 80%/remaining-message/reached notices before withholding, visible records and free-channel fallback. Pricing policy, reservations, delivery and UI cross-cut; owner-approved USD rates needed. |
| OPS-001 | HARD | A1 external independent heartbeat alarm and remaining Worker/runner/watch/auth-mail/notification interruption, weekly digest, backup/archive and console requalification. Healthy-digest custody already built in `tests/ops-healthy-digest-support.mjs`; external heartbeat f38/f39 and other held work excluded. |
| ARCHIVE-002 | HARD | A1–2 actual 500-monitor/90-day three-location history, bounded working memory/storage, interrupted export+restore and exact counts/digests at that scale. A3’s 120-monitor/subset/range case and chunk/resume are already built; f61/f62/f169 reserved. |
| SURFACE-001 | HARD | A1–4 complete table/Core-job coverage, usable resource templates/write links and full two-policy conformance. Native tools/CORE harness already built; shared capability and product-job gaps remain. |
| SURFACE-002 | HARD | A1–8 remaining per-tool live/security matrix for credential/TLS binding, clones, definition routes/maintenance/destroy, settings/handoffs and erasure; native paused-create/state/name slices already built/reserved. |
| SURFACE-003 | HARD | A1–8 remaining external/money facts for all destination/route/definition/slow/handoff/phone/automation calls; provider cost and all counterparty/count variants. Existing email/Slack/webhook facts already built; f88/f91/f138/f141 reserved. |
| SURFACE-004 | HARD | A1–8 full invite/remove/runner/key/automation access, erasure/destination/retention/code/manual-grant destruction, provider-gated steps and incident attribution. Scoped access facts and mention-free comment edit/delete already built/reserved; pending jobs depend on unfinished Core. |
| SURFACE-005 | HARD | A1–5 complete stranger seeded week under autonomous/held/live-blocked/unset policies, including recovery, route drill and SLA export. Native first-policy refusal is built, not the complete week; f86/f89/f139 reserved. |
| SURFACE-006 | HARD | A1–4 cleanup resolution and incident response's full destructive/live effect set, grouped incidents/reminder/fallback suppression, browser/API fixtures across probes/retries. One-probe two-cleanup boundary already built; f96/f140/f167/f172 reserved. |
| AGENT-001 | HELD-EXTERNAL | A1–2 continuous deploy/schema/analytics create/change/retire proposals with evidence/cost, policy approval, rejected proposal's zero traffic/secrets and retained history. Need ct release of the AI-data-flow hold; one-shot discovery is already built. |
| AGENT-002 | HELD-EXTERNAL | A1–2 competing outage/network/selector-drift hypotheses, citations/counterevidence/confidence, declined verification authority and unchanged verdict. Need ct release of the AI-data-flow hold. |
| AGENT-003 | HELD-EXTERNAL | A1–2 old/candidate healthy-versus-broken browser verification, unchanged required outcomes, semantic approval/activation and rollback. Need ct release of the AI-data-flow hold. |
| AGENT-005 | HELD-EXTERNAL | A1–2 granted repair-workflow handoff, failed original checkout after health-only fix, Oncall/Lamp evidence and independent original-outcome recovery/publication choice. Need ct release of the AI-data-flow hold; sibling APIs also remain dependencies. |
| BASE-AGENT-001 | HARD | Complete resource/prompt capability exposure plus already-built A1–6 transport qualification at current pin; no new MCP endpoint. Shared capability-family scope remains undeclared. |
| BASE-AGENT-002 | HARD | A1 full Core coverage/not-tool reasons; A2–6 output/schema/annotation/refusal/UI-state-and-audit parity for all unfinished jobs and embedded-agent registry use. Existing 34-tool measurement is bounded. |
| BASE-AGENT-003 | HARD | A1–6 live resource templates, exact role fields/missing-scope parity, write links, byte budget no-partial-content and untrusted text markers. Registry templates exist, public resource reads intentionally refused; needs Base resource-family release/conformance. |
| BASE-AGENT-004 | HARD | Remaining A2/A6/A7 complete multi-sponsor identity, revocation/unpair lifecycle and excluded/inactive sponsors. Owner-bound audience/expiry/query negatives already built; shared lifecycle scope not released. |
| BASE-AGENT-005 | HARD | A1–5 full role/UI parity, grant-resource/argument narrowing, sponsor downgrade/suspension, every self-escalation route and allowed own-scope dropping, record-text injection families. Existing synchronous self-grant/current arguments are bounded proof. |
| BASE-AGENT-006 | HARD | A2–4 all per-tool class conditions/facts and argument/record-text invariance; A6 wider refusal audit; money/provider/gated/destructive breadth. Synchronous pause and native classification slices already built; no invented classes. |
| BASE-AGENT-007 | HARD | A1–8 full disposition/policy lifecycle, standard-only named approval breadth, expiry, money/cap boundaries, mixed classes, every door, ≤60s revisions and bad-signature/foreign-Business retention. Bounded native approvals/rejections already built/reserved. |
| BASE-AGENT-008 | HARD | A1–7 complete lifecycle attribution, exports/activity at 1440/390, actual outside-mail sender identity and person-only confirmations; native preparer/reviewer/form-accept checks already built/reserved. |
| BASE-AGENT-009 | HARD | A1–7 complete retained lifecycle audit, Agents counts/filter/export/review/undo and 1440/390 UI. Revocation preserving audit rows/name already built; UI and lifecycle families held. |
| BASE-AGENT-010 | HARD | A1–6 subscriptions/events.list/signed webhook same IDs, ≤10s change delivery, ordered cursor replay, live access filters and approval/review/policy event fields. All are intentionally undeclared/refused; shared event capability first. |
| BASE-AGENT-011 | HARD | A2–7 recipient caps, provider-spend exhaustion/no-cap usage, Business Pause/usage lifecycle and 1440/390 UI. A1 rate refusal and native Pause already built; f94/f99 cover existing cap slice. |
| BASE-AGENT-012 | HARD | Requirement's ≥24h replay plus A5 cross-person long-job-handle not-found lifecycle; broader long work, drop/retry and revision coverage. Current-key replay/current-revision/native continuation already built/reserved. |
| BASE-AGENT-013 | HARD | A1–5 complete docs/resources/prompts/events, every point of 001–012 and SURFACE under both policies, person browser parity at 1440/390 and stranger journey. Declared CORE passing is not full target conformance; shared unscoped families remain held. |

Branch exclusions are conservative reservations, not assertions that old branches are actively executing. A remote branch is not a live-worker lease. All advertised cloud refs were read; unmerged candidates were compared to main by ancestry and relevant changed files. Rebased/cherry-picked branches can remain unmerged after their substance landed, so main source takes precedence. Recent main already landed mail switch/off, heartbeat/local diagnostic/restore repairs, source/dependency updates, balanced CI shards and the shared Cloudflare public egress change (`1156542`, followed by release `6fd9399`). None is requeued. BRANCH-REVIEW.json retains exact refs and SHAs.

Exclude state f42/f43/f132/f151/f159/f162; network f58/f59/f137/f143/f150/f153/f157/f160/f164; startup f40/f146/f147/f158/f165; native auth f48; TCP f23; webhook f44; catalog route defaults f2; heartbeat existing UR/Better Stack f3 and c14-b scheduler work; history existing UptimeRobot f63; archive f61/f62/f169; OPS f38/f39; RUM c21/c28; routing sd-rs1/strategy-trial-12; follow-up strategy-trial-7; native agent qualification f83–f172 where its exact slice is already built/reserved. Existing main/uip branches own the factor/shell/protocol-form/read-only-console, report views, incident controls and responsive qualification. No entry below edits those held UI files or shared Base capabilities. No builder edits CONTRACT.md Status/Gap/Evidence, ACCEPTANCE.md or docs/CLAIMS.md, or performs a judgment-only reconciliation.

Owner asks are batched below. These authorize no action in this planner run:

- BOUNDARY-001 / ONCALL-001 / FOLLOWUP-001 / READAPI-003: supply one approved scoped Oncall contract for handoff keys, check schedules, receipt and attributed response; no acknowledgment-to-human-response inference.
- LAMP-001 / INCIDENT-004 / migration status-page handoffs: supply the approved Lamp component/import/publication API and its approval semantics.
- FLOW-001 / PROBE-001 / DIAG-001 / PROBE-002: provision independently operated US East/Central/West, Europe and APAC runner networks with dedicated IPv4/IPv6 egress and browser capability (R-1).
- HEARTBEAT-002 / SCHEDULE-002 and the other R-2 clauses: authorize the hosted 500×30s×3 timing/capacity installation; local evidence cannot stand in for it.
- HEARTBEAT-003: provide a Windows/PowerShell Task Scheduler host; actual Linux user-manager, Kubernetes and GitHub scheduler execution also needs an authorized scheduler environment, not just parsed files.
- PHONE-002 / PHONE-001: provide the Uptime relay operator's registered A2P 10DLC campaign or verified toll-free sender and attested voice caller ID; handset field proof then needs consenting AT&T/Verizon/T-Mobile recipients (R-4).
- MOBILE-001: provide authorized Apple/Google distribution and APNs/FCM device environments (R-5); Pushover/Pushbullet recipient accounts are separate connector proof.
- CHAT-001 / ONCALL-001 / AUTOMATION-001: provide consenting tenant owners for channel readback after local adapters exist, including Teams admin installation of the app, Telegram group bot, PagerDuty/Splunk and Zapier/Make (R-6).
- IMPORT-001 / HEARTBEAT-004 / INCIDENT-005 / MIGRATE-001–005 / HISTORY-001: provide sanitized authentic exports or owner-operated read-only extraction and cutover windows for the eight named incumbent products (R-3); no credentials in this packet.
- DEPENDENCY-002: provide one consented real Auth0 tenant feed for status-semantic qualification; Fastly still needs documented machine-readable status semantics, not an owner login or guessed healthy default.
- DISCOVERY-001: provide least-scope read-only owner accounts for Route53, Cloudflare, GitHub, Vercel, Netlify and CodeDeploy (R-7); prior broader PAT receipts do not qualify them.
- ACCESS-002: provide authorized Okta, Entra ID and Google Workspace test tenants for SSO/SCIM field proof (R-8), after local implementation.
- COST-001: approve the USD rate/included-usage schedule and notification-budget policy; builders must not invent commercial prices.
- ACCESS-001 / ACCESS-003 / FOLLOWUP-001 and held UI: release the narrowed-member initial sign-in/MFA/shell/navigation scope and its conservative console policy; this is a product-scope decision, not permission to alter Base authentication.
- AGENT-001 / AGENT-002 / AGENT-003 / AGENT-005: ct must release the recorded AI-data-flow hold and approved model/egress policy. No paid model API or usage credits are available in this assignment.
- BASE-AGENT-001–013 / SURFACE-001–006: release exact shared capability/lifecycle families with Platform/Base ownership before expanding resources/prompts/events, multi-sponsor, timed/queued/dual-host/owner-native families.
- INTERFACE-001: arrange the independent human screen-reader pass and VPAT (R-10/R-11); neither replaces automated 1440/390 journeys.

Five entries are ranked by buyer value, with day-one destination/migration gaps first and cheaper work preferred within comparable value. They are independent slices against this main, not promises to finish their whole clauses. Each uses its own tests and implementation files; only intentional generated source-lock updates may overlap. Each builder must recheck remote main and candidate reservations before starting. A new overlapping reservation means skip that entry rather than duplicate it. No held console ownership, shared Base family, real account use, new prices or field deployment is implied. UI proof is explicitly deferred for API/CLI-only entries; no screenshot substitutes for an unbuilt console workflow.

```queue-entries
- role: BUILDER
  repository: just-every/run-uptime
  title: Native workplace-chat transports without changing the held console
  clauses: [CHAT-001]
  class: HARD
  acceptance: >-
    Build A1's owner API/CLI configuration, drill, confirmed trigger/recovery,
    provider-error and credential-rotation paths for Teams Workflows Adaptive
    Cards, Discord, Telegram group Bot API, Google Chat and Mattermost.
    Build A2's durable retiring-connector label/replacement steps and refused-post
    outcome. Preserve explicit accepted/uncertain/failed versus unproved receipt.
    Teams Bot Framework app, console configuration and live tenants remain open.
  files: >-
    New src/domain/notification-chat.ts; notification-protocols.ts,
    notification-destinations.server.ts, notification-credentials.server.ts,
    notifications.server.ts and notifications CLI command registration;
    additive destination-kind/archive validation only where required.
  tests: >-
    New tests/chat-notifications.mjs and provider-edge fixture. Existing
    notify-delivery, notification-fallback and webhook-custom regressions.
  proof: >-
    Native owner doors and signed dispatcher; exact observed method/payload and
    masked readback per provider; one send for 429/5xx/timeout/uncertain cases;
    rotation/revocation fences, restart and inactive archive, no planted secrets
    or authority in evidence. No real tenant messages. API/CLI slice has no UI;
    full clause later requires complete 1440 and 390 console flows, axe/reflow.
  must_not_touch: >-
    Held console/assets; Base mail/integrations; retry semantics for Slack/email;
    phone budgets; routing policies; Teams app registration; contract judgments
    or generated acceptance/claims; provider accounts or deployment.
  Gate: required
  gate_reason: Destination authentication, secret custody and portable data.

- role: BUILDER
  repository: just-every/run-uptime
  title: Import saved Pingdom outage history with honest source segments
  clauses: [HISTORY-001]
  class: HARD
  acceptance: >-
    Extend A1–5's existing source-history journey to documented saved Pingdom
    outages and exposed summary/performance data. Map already-migrated source
    IDs, reconcile every row, preserve exact seconds and provenance, report each
    source denominator and named cutover blend, and keep current health,
    quorum, incidents, notifications and follow-up unchanged. Re-import is
    idempotent; inactive archives, batch removal and erasure retain exact custody.
    Do not invent incident comments or fields the source does not expose.
  files: >-
    New src/domain/source-history/pingdom.ts; source-history model,
    preview/apply, read-selection, segments and archive validation; narrow
    business-import history routing/provenance registration. No definition
    importer or heartbeat changes.
  tests: >-
    New tests/pingdom-history.mjs and documented synthetic saved-source fixtures;
    source-history-support, reporting, read-api and archive-roundtrip regressions.
  proof: >-
    Native preview/apply/read/export/erase doors: 60 source days with three known
    outages plus native slots in a 90-day cross-cutover report; seconds-exact
    durations, overlap exclusion, explicit source selection, duplicate/conflict
    and unmapped rows, corrupt/stale-digest zero writes, restart and inactive
    restore. Verify unchanged native tables and all per-table erasure counts.
    No UI changes; held move-in/report views still owe 1440 and 390 screenshots,
    source labels, accessible charts and keyboard/refusal journeys.
  must_not_touch: >-
    Held public/monitor-report.js or import console; native slot/state policy;
    UptimeRobot source semantics; other incumbent adapters; account extraction,
    live cutover, product pricing, Base portability or contract judgments.
  Gate: required
  gate_reason: Historical data migration, archive validation and erasure fences.

- role: BUILDER
  repository: just-every/run-uptime
  title: Review Site24x7 heartbeat thresholds before paused conversion
  clauses: [HEARTBEAT-004]
  class: CHEAP
  acceptance: >-
    Build A4 from documented saved Site24x7 threshold/profile shapes, without
    inventing provider fields: review 10-minute Trouble, 30-minute Down and early-ping thresholds;
    require an explicit owner-selected 25-minute period plus 5-minute grace;
    preserve the selected Down deadline and name unsupported Trouble/early-ping
    behavior. Apply paused without source URL authority. Preserve A5: Pingdom
    has no heartbeat. Existing UptimeRobot/Better Stack A1–2 are not rebuilt.
  files: >-
    New Site24x7 heartbeat review/conversion helper under definitions/importers;
    narrow site24x7.ts registration and explicit reviewed conversion input.
    No changes to source-history or other provider importers.
  tests: >-
    New tests/site24x7-heartbeat-review.mjs; existing definitions-import and
    heartbeat-import deadline/rotation regressions.
  proof: >-
    Real owner preview/review/apply doors; no-choice and inconsistent-sum
    refusals, exact 25+5 readback, preserved source threshold differences,
    paused apply, newly issued local URL on explicit activation, no failure
    before 30 minutes, confirmed missed deadline and labeled late recovery.
    Source receipt authority never works and no source alert replays. API/CLI
    only; future console conversion requires 1440/390 proof, not this receipt.
  must_not_touch: >-
    Existing f3 UR/Better Stack slice; automatic source paging/contacts/consent;
    scheduler thresholds, arbitrary cron conversion, held import UI,
    field-account cutover or contract judgments.
  Gate: required
  gate_reason: Reviewed migration and installation-local heartbeat authority.

- role: BUILDER
  repository: just-every/run-uptime
  title: Add a scoped WAF identification header to HTTP probes
  clauses: [PROBE-002]
  class: HARD
  acceptance: >-
    Build the optional per-installation secret-header portion of the requirement
    and A1/A3's observed header/cross-origin non-forwarding. Reuse installation
    credential custody; identify HTTP/keyword probes without changing their
    verdicts or public User-Agent. Dedicated egress, published lists/DNS/API,
    30-day notices, shared-Worker console label and private egress remain open.
  files: >-
    New dedicated probe-identification credential/owner-settings module;
    src/domain/probe-identification.ts, worker-http.server.ts and narrowly scoped
    runners/src/public-http.mjs header injection/redirect handling. Reuse
    existing native credential authority; never put the value in definitions.
  tests: >-
    New tests/probe-waf-header.mjs; hosted-probe-identification and tls-auth
    cross-origin credential regressions.
  proof: >-
    Authorized owner configure/rotate/revoke; independent controlled target
    records the header for scheduled Worker and signed-runner requests;
    same-origin redirect retains it, cross-origin removes it, forbidden target
    receives zero connections. Mask owner readback; exclude value from logs,
    snapshots, browser artifacts and archives; restored installation cannot
    inherit it. No public address claims. API-only configuration; no new UI;
    any later console control must prove 1440/390 focus, masking and errors.
  must_not_touch: >-
    Existing UA/opaque-reference semantics, network pinning/TLS verification,
    f143/f150/f153/f157/f160/f164 proofs, Base secret modules, held console,
    DNS/egress infrastructure, migrations unrelated to credential custody,
    contract judgments or real WAF/provider accounts.
  Gate: required
  gate_reason: Authentication material and cross-origin credential disclosure.

- role: BUILDER
  repository: just-every/run-uptime
  title: Execute an explicitly requested CLI HTTP assertion test
  clauses: [CODE-001]
  class: HARD
  acceptance: >-
    Build A1's missing runtime-probe portion for an explicitly selected saved
    HTTP/keyword definition using the production runner transport and exact
    immutable assertions. Return bounded per-assertion outcomes and nonzero
    failure/refusal. Existing validation-only test remains truthfully labeled.
    TypeScript routes/maintenance, Checkly import and hosted Actions remain open.
  files: >-
    New scripts/definitions-runtime-test.mjs; narrow scripts/definitions.mjs and
    definitions-http.mjs opt-in dispatch/output. Use existing runners/src
    exports without changing HTTP transport, definition importers or history.
  tests: >-
    New tests/definitions-runtime-test.mjs and controlled HTTPS fixture;
    command-journey and definitions-ci-support authority regressions.
  proof: >-
    Fresh CLI invocation, real controlled socket request, passing and individually
    failed status/keyword/JSON assertions, DNS/redirect refusal and exact reviewed
    intent; explicitly authorized credential-local execution only. No scheduled
    slot, incident, notification, import/apply or definition write. A remote CI
    preview-only token cannot acquire execution authority; refusal is visible.
    Default test still reports runtimeProbesExecuted=false. No browser UI.
  must_not_touch: >-
    CI scope ceilings, Base auth/grants, production runner transports, live
    setup/cleanup or payments, paused-import defaults, stored evidence/state,
    GitHub workflows/accounts, held UI or contract judgments.
  Gate: required
  gate_reason: Execution authority and protection of customer data/credentials.
```

Old reference: `593a0e21d514f48aa568596462f14a1b964271ed` (main, 28 October 2026). Clauses done there: HTTP-001, EVIDENCE-001, STATE-001, AUTHORITY-001, NETWORK-001, HEARTBEAT-001, ARCHIVE-001, RETENTION-001, ERASURE-001, AUDIT-001, PRESENCE-001, INTERFACE-001, NOTIFY-001, DELIVERY-001, PUBLIC-001, DRILL-001, STARTUP-001, PUBLIC-002, API-001, SLOW-001, API-002, API-003, API-004, TCP-001, PING-001, DNS-001, TLS-001, DOMAIN-001, UDP-001, MAIL-001, NETWORK-002, SCHEDULE-001, PRIVATE-001, MAINT-001, EVIDENCE-002, DEPENDENCY-001, FLOW-003, FLOW-004, ROUTING-002, DELIVERY-002, NOTICE-001, WEBHOOK-001, MANAGE-001, METRICS-001, OPS-001.

# Carried-done audit

One row per outcome of every acceptance point of every clause that was done at the old reference. **Asserting test** is the line of the assertion (or of the call whose expected result a helper in the same file asserts) in a file the clause's Evidence cell lists. **Result** is `asserted`, `none` or `moved`. A `none` row demotes its clause to partial, and that clause's Gap names the outcome. A `moved` row is a pointer or proof boundary that left the point for the Requirement; the point keeps every outcome it named.

Still done (19): NETWORK-001, RETENTION-001, AUDIT-001, INTERFACE-001, DRILL-001, API-001, SLOW-001, API-003, API-004, UDP-001, MAIL-001, NETWORK-002, PRIVATE-001, EVIDENCE-002, DEPENDENCY-001, FLOW-004, DELIVERY-002, NOTICE-001, OPS-001.

Demoted to partial (26): HTTP-001, EVIDENCE-001, STATE-001, AUTHORITY-001, HEARTBEAT-001, ARCHIVE-001, ERASURE-001, PRESENCE-001, NOTIFY-001, DELIVERY-001, PUBLIC-001, STARTUP-001, PUBLIC-002, API-002, TCP-001, DNS-001, TLS-001, DOMAIN-001, SCHEDULE-001, ROUTING-002, WEBHOOK-001, MANAGE-001, METRICS-001, PING-001, MAINT-001, FLOW-003.

| Clause | Point | Outcome | Asserting test | Result |
| --- | --- | --- | --- | --- |
| HTTP-001 | 1 | An HTTP(S) monitor is created through the owner API | `tests/probe-native-evidence.mjs:38` (helper asserting 201, called by the HTTP journey at :179) | asserted |
| HTTP-001 | 1 | A keyword monitor is created through the owner API | `tests/probe-native-evidence.mjs:38` (helper asserting 201, called with type keyword at :104) | asserted |
| HTTP-001 | 1 | Scheduled hosted Worker work runs against a controlled HTTPS service | none in a cited file: the scheduled public Worker check is asserted in `tests/hosted-scheduled.mjs`, which HTTP-001 does not cite | none |
| HTTP-001 | 1 | Signed runner work runs against a controlled HTTPS service | `tests/public-probes.mjs:68` (runner HTTPS probe passes) with `tests/probe-native-evidence.mjs:181` (signed completion accepted, Healthy) | asserted |
| HTTP-001 | 1 | A status failure is retained and turns the monitor Failing | `tests/probe-native-evidence.mjs:187` | asserted |
| HTTP-001 | 1 | A text (keyword) failure is retained on a real response | `tests/public-probes.mjs:90` | asserted |
| HTTP-001 | 1 | After failing, the monitor returns to Healthy on passing scheduled evidence | `tests/probe-native-evidence.mjs:137` | asserted |
| HTTP-001 | 1 | The immutable assertion results are read back in history | `tests/probe-native-evidence.mjs:55` (history equals the signed attempts) with `:182` | asserted |
| HTTP-001 | 1 | The transport evidence is read back by category | `tests/probe-native-evidence.mjs:134` | asserted |
| EVIDENCE-001 | 1 | A failure attempt is submitted through the signed result route and kept | `tests/probe-native-evidence.mjs:101` | asserted |
| EVIDENCE-001 | 1 | A retry is kept beside the earlier failure it follows | `tests/probe-native-evidence.mjs:114` (history equality at :55) | asserted |
| EVIDENCE-001 | 1 | A late attempt is kept and identifiable | none in a cited file: late retries are asserted in `tests/resilience/attempts.mjs`, which EVIDENCE-001 does not cite | none |
| EVIDENCE-001 | 1 | A duplicate attempt cannot overwrite the first accepted copy | none in a cited file: asserted at `tests/resilience/attempts.mjs:147`, which EVIDENCE-001 does not cite | none |
| EVIDENCE-001 | 1 | History survives a restart | none: no cited test restarts the installation and rereads its history (`tests/probe-native-evidence.mjs:195` restores into a second installation instead) | none |
| EVIDENCE-001 | 1 | History is read and each attempt stays identifiable | `tests/probe-native-evidence.mjs:55` | asserted |
| EVIDENCE-001 | 1 | Each attempt's revision stays identifiable | none: no cited line reads an attempt's revision back | none |
| EVIDENCE-001 | 1 | A rejected attempt commits no observation, state, outbox or slot change | `tests/probe-native-evidence.mjs:50` | asserted |
| EVIDENCE-001 | 1 | An accepted attempt commits its observation, state and outbox together | none: accepted submissions assert state and history (`tests/probe-native-evidence.mjs:54`) but no cited line reads the outbox row committed with them | none |
| STATE-001 | 1 | One failing vantage of two reads Degraded | `tests/resilience/attempts.mjs:10` | asserted |
| STATE-001 | 1 | Two failing vantages read Failing | `tests/resilience/attempts.mjs:10` | asserted |
| STATE-001 | 1 | A partial slot (a selected check missing) reads Unknown | `tests/availability.mjs:105` | asserted |
| STATE-001 | 1 | Missing evidence reads Unknown | `tests/resilience/attempts.mjs:294` | asserted |
| STATE-001 | 1 | Stale evidence past its freshness reads Unknown | `tests/availability.mjs:132` | asserted |
| STATE-001 | 1 | A recovering slot reads Recovering before Healthy | `tests/resilience/attempts.mjs:305` | asserted |
| STATE-001 | 1 | The recovery threshold is applied | `tests/resilience/attempts.mjs:308` | asserted |
| STATE-001 | 2 | A manual pass cannot fabricate recovery | none: the cited files assert only that a manual pass does not replace the scheduled last check or uptime figure (`tests/availability.mjs:129`); no cited line reads the monitor's state after a manual pass during an outage | none |
| STATE-001 | 2 | An absent probe cannot fabricate recovery | none: the cited files assert that a missing check leaves report time Unknown (`tests/availability.mjs:105`), but no cited line reads the monitor's recovery state with one selected probe absent | none |
| STATE-001 | 2 | Maintenance expiry cannot fabricate recovery | none in a cited file: asserted in `tests/maintenance-windows.mjs`, which STATE-001 does not cite | none |
| AUTHORITY-001 | 1 | Signed-out, expired and revoked sessions are refused at private documents | `tests/access-matrix.mjs:63` | asserted |
| AUTHORITY-001 | 1 | Signed-out, expired and revoked sessions are refused at private reads and mutations | `tests/access-matrix.mjs:64` (reads) and `:65` (writes) | asserted |
| AUTHORITY-001 | 1 | Cross-origin owner requests are refused | `tests/access-matrix.mjs:80` (create) and `:81` (read) | asserted |
| AUTHORITY-001 | 1 | A foreign runner signature is refused without durable changes | `tests/signed-runner.mjs:106` | asserted |
| AUTHORITY-001 | 1 | An expired runner signature or acceptance window is refused | none in a cited file: acceptance-window expiry is asserted in `tests/resilience/attempts.mjs`, which AUTHORITY-001 does not cite | none |
| AUTHORITY-001 | 1 | Refused requests make no product writes | `tests/access-matrix.mjs:67` | asserted |
| AUTHORITY-001 | 1 | The authorized session then succeeds | `tests/access-matrix.mjs:70` | asserted |
| AUTHORITY-001 | 1 | The scoped runner then succeeds | `tests/signed-runner.mjs:104` | asserted |
| NETWORK-001 | 1 | A mixed public/private DNS answer is refused | `tests/public-probes.mjs:57` | asserted |
| NETWORK-001 | 1 | A rebinding answer on re-resolution is refused before connecting | `tests/public-probes.mjs:128` | asserted |
| NETWORK-001 | 1 | A TLS hostname mismatch fails as a TLS target failure | `tests/public-probes.mjs:70` | asserted |
| NETWORK-001 | 1 | Every redirect hop is re-resolved | `tests/public-probes.mjs:121` | asserted |
| NETWORK-001 | 1 | An HTTPS downgrade redirect is refused | `tests/public-probes.mjs:125` | asserted |
| NETWORK-001 | 1 | Forbidden (private, mapped, metadata, credentialed) redirect addresses are refused | `tests/public-probes.mjs:125` | asserted |
| NETWORK-001 | 1 | A credential is bound to its exact origin | `tests/public-probes.mjs:112` | asserted |
| NETWORK-001 | 1 | Execution bounds (timeouts, body limit, encoding) fail visibly | `tests/public-probes.mjs:131` (timeouts) and `:133` (body limit) | asserted |
| NETWORK-001 | 1 | A rejected destination receives no connection | `tests/public-probes.mjs:125` (only the first request is made) | asserted |
| NETWORK-001 | 1 | A cross-origin hop receives no request authority | `tests/public-probes.mjs:122` | asserted |
| HEARTBEAT-001 | 1 | A heartbeat token is issued through the owner door | `tests/signed-runner.mjs:115` | asserted |
| HEARTBEAT-001 | 1 | The token is rotated through the owner door | `tests/signed-runner.mjs:181` | asserted |
| HEARTBEAT-001 | 1 | Increasing receipts are accepted | `tests/signed-runner.mjs:116` (sequence 1), `:127` (2) and `:133` (3) | asserted |
| HEARTBEAT-001 | 1 | A missed run is confirmed by scheduled evaluation | `tests/signed-runner.mjs:160` | asserted |
| HEARTBEAT-001 | 1 | Scheduled signed snapshots decide health, and an altered signed snapshot writes nothing | `tests/signed-runner.mjs:135` and `:148` | asserted |
| HEARTBEAT-001 | 1 | A replayed receipt cannot change current health | `tests/signed-runner.mjs:125` | asserted |
| HEARTBEAT-001 | 1 | An old token cannot change current health after rotation | `tests/signed-runner.mjs:182` | asserted |
| HEARTBEAT-001 | 1 | An imported receipt cannot change current health | `tests/signed-runner.mjs:178` | asserted |
| HEARTBEAT-001 | 1 | A foreign-revision receipt cannot change current health | none: no cited test sends a receipt bound to another revision of the monitor | none |
| ARCHIVE-001 | 1 | A populated installation with TCP, DNS, TLS and domain monitors is exported | `tests/archive-roundtrip.mjs:83` (each protocol's monitor is in the export and restores exactly) and `tests/command-journey.mjs:168` (CLI export) | asserted |
| ARCHIVE-001 | 1 | A different receiving owner is established before the import | `tests/command-journey.mjs:174` (setup for receiving@example.test; the run asserts its exit) | asserted |
| ARCHIVE-001 | 1 | The archive imports into empty product data | `tests/archive-roundtrip.mjs:74` and `tests/command-journey.mjs:180` | asserted |
| ARCHIVE-001 | 1 | The restored installation exports again and its history reads back | `tests/archive-roundtrip.mjs:79` | asserted |
| ARCHIVE-001 | 1 | The restore repeats without growing original histories | `tests/archive-roundtrip.mjs:99` | asserted |
| ARCHIVE-001 | 2 | Each protocol's settings survive | `tests/archive-roundtrip.mjs:83` | asserted |
| ARCHIVE-001 | 2 | Immutable revisions and slots survive | `tests/archive-roundtrip.mjs:85` (revisions) and `:86` (slot definition) | asserted |
| ARCHIVE-001 | 2 | Definitions are paused | `tests/archive-roundtrip.mjs:83` | asserted |
| ARCHIVE-001 | 2 | Leases are interrupted | `tests/archive-roundtrip.mjs:86` | asserted |
| ARCHIVE-001 | 2 | Delivery is quarantined | `tests/archive-roundtrip.mjs:88` (jobs and outbox imported-inactive) and `:97` (the runner is offered no job) | asserted |
| ARCHIVE-001 | 2 | Secrets and authority are absent | `tests/archive-roundtrip.mjs:70` (archive text) and `:96` (no heartbeat authority, claims or contact) | asserted |
| ARCHIVE-001 | 2 | History is retained | `tests/archive-roundtrip.mjs:90` (no omitted records; originals preserved at :91) | asserted |
| ARCHIVE-001 | 2 | Later erasure journals are enforced on restore | none: no cited test restores an archive together with a later erasure journal | none |
| ARCHIVE-001 | 2 | A corrupt import writes nothing | `tests/archive-roundtrip.mjs:100` | asserted |
| ARCHIVE-001 | 2 | An import into nonempty product data writes nothing | `tests/archive-roundtrip.mjs:98` | asserted |
| RETENTION-001 | 1 | Product records keep their identities through expiry, maintenance and restart | `tests/retention-cleanup-proof.mjs:80` (every nontransient row identity) and `:82` (product rows unchanged) | asserted |
| RETENTION-001 | 1 | Authentication records: expired sessions go and expired authority is refused while its identity remains | `tests/retention-cleanup-proof.mjs:84`, `:89`, `:90` and `:91` | asserted |
| RETENTION-001 | 1 | Rate-limit records are populated and cleaned up | `tests/retention-cleanup-proof.mjs:83` (aged rows exist) and `:84` (removed) | asserted |
| RETENTION-001 | 1 | Drill records keep their history while capability material goes | `tests/retention-cleanup-proof.mjs:86` | asserted |
| RETENTION-001 | 1 | Credential records: an in-flight credential survives rotation and is scrubbed after its send | `tests/retention-cleanup-proof.mjs:51` and `:63` | asserted |
| RETENTION-001 | 1 | Attempt records: a proven-unsent reservation is removed while its delivery history remains | `tests/retention-cleanup-proof.mjs:57` and `:59` | asserted |
| RETENTION-001 | 1 | Expiry, Cron maintenance and a Worker restart run through runtime doors before surviving identities are compared | `tests/retention-cleanup-proof.mjs:71` (Cron entry), `:73` (restart) and `:80` (comparison) | asserted |
| RETENTION-001 | 2 | Only declared transient data and secret material disappear | `tests/retention-cleanup-proof.mjs:80` (only the transient set at :76 may lose rows) | asserted |
| RETENTION-001 | 2 | No cleanup improves uptime | `tests/retention-cleanup-proof.mjs:92` | asserted |
| RETENTION-001 | 2 | No cleanup removes retained product history | `tests/retention-cleanup-proof.mjs:82` and `:110` | asserted |
| RETENTION-001 | old 1 | Custody and every declared cleanup class are judged at current supported bounds | moved to the Requirement (a proof boundary, not an outcome) | moved |
| ERASURE-001 | 1 | A monitor is erased through the owner API | `tests/erasure-audit.mjs:106` | asserted |
| ERASURE-001 | 1 | A destination is erased through the owner API | `tests/erasure-audit.mjs:108` | asserted |
| ERASURE-001 | 1 | An operator is erased through the owner API | `tests/erasure-audit.mjs:107` | asserted |
| ERASURE-001 | 1 | A stale concurrent monitor edit cannot recreate erased rows | `tests/erasure-races.mjs:19` | asserted |
| ERASURE-001 | 1 | A stale prepared destination envelope cannot recreate erased rows | `tests/erasure-races.mjs:31` | asserted |
| ERASURE-001 | 1 | The original owner is erased once a successor owner exists | none: the cited tests erase a second operator (`tests/erasure-audit.mjs:107`) and refuse the last owner, but none erases the original owner after a successor exists | none |
| ERASURE-001 | 2 | The per-table receipt is persisted with the erasure | `tests/erasure-audit.mjs:109` | asserted |
| ERASURE-001 | 2 | The erasure is audited | `tests/erasure-audit.mjs:110` | asserted |
| ERASURE-001 | 2 | The erasure journal reads back as a later export | `tests/erasure-audit.mjs:134` with `:138` | asserted |
| ERASURE-001 | 2 | A refused erasure rolls back every deletion, journal and audit (atomic) | `tests/erasure-races.mjs:41` | asserted |
| ERASURE-001 | 2 | The last owner is protected | `tests/erasure-audit.mjs:128` and `tests/erasure-races.mjs:40` | asserted |
| ERASURE-001 | 2 | An old archive with the later journal cannot resurrect erased records | `tests/erasure-audit.mjs:145` and `:146` | asserted |
| AUDIT-001 | 1 | Destructive actions are audited through public doors | `tests/erasure-audit.mjs:110` | asserted |
| AUDIT-001 | 1 | Notification attempts are audited, one per actual attempt | `tests/erasure-audit.mjs:73` | asserted |
| AUDIT-001 | 1 | Authentication-mail attempts are audited, one per capture | `tests/erasure-audit.mjs:95` | asserted |
| AUDIT-001 | 1 | Erasing an actor anonymizes its audit references | `tests/erasure-audit.mjs:125` | asserted |
| AUDIT-001 | 1 | The audit round-trips an archive unchanged | `tests/erasure-audit.mjs:137` (export) and `:159` (import) | asserted |
| AUDIT-001 | 1 | Audit subjects are durable opaque references | `tests/erasure-audit.mjs:110` (the subject is the receipt id) and `:141` | asserted |
| AUDIT-001 | 1 | No planted name, address, URL or secret appears in the audit | `tests/erasure-audit.mjs:122` (every physical table, the audit included, is scanned for the planted canaries) | asserted |
| PRESENCE-001 | 1 | Contact reads Never seen at first | `tests/runner-contact.mjs:35` | asserted |
| PRESENCE-001 | 1 | An accepted idle claim records fresh contact | `tests/runner-contact.mjs:38` | asserted |
| PRESENCE-001 | 1 | An accepted result records fresh contact | `tests/runner-contact.mjs:52` | asserted |
| PRESENCE-001 | 1 | Aged contact reads Stale | `tests/runner-contact.mjs:41` | asserted |
| PRESENCE-001 | 1 | Foreign or rejected requests record no contact | `tests/runner-contact.mjs:35` (rejected key) and `:52` (bad signature, empty evidence) | asserted |
| PRESENCE-001 | 1 | A restart retains contact | `tests/runner-contact.mjs:57` | asserted |
| PRESENCE-001 | 2 | Owner reads and health checks do not refresh contact | `tests/runner-contact.mjs:35` | asserted |
| PRESENCE-001 | 2 | An unavailable read cannot imply runner or target health | none: no cited test fails an overview read and reads the contact label it leaves | none |
| PRESENCE-001 | 2 | Restore cannot imply runner or target health | `tests/runner-contact.mjs:62` | asserted |
| INTERFACE-001 | 1 | A healthy monitor shows its textual state at each width | `tests/operator-browser.mjs:94` (the audit at :29 asserts the Healthy text) | asserted |
| INTERFACE-001 | 1 | A stale monitor reads Unknown with its reason and keeps its last real check time | `tests/operator-browser.mjs:123` and `:124` | asserted |
| INTERFACE-001 | 1 | A failing monitor reads Failing at 1440 and 390 | `tests/recovery-browser.mjs:72` and `:75` | asserted |
| INTERFACE-001 | 1 | A failed read shows Unknown with its reason | `tests/operator-browser.mjs:61` and `:65` | asserted |
| INTERFACE-001 | 1 | Editing preserves the configured assertions, and a refused rule makes no revision | `tests/operator-browser.mjs:101` and `:108` | asserted |
| INTERFACE-001 | 1 | An action error survives polling | `tests/operator-browser.mjs:92` | asserted |
| INTERFACE-001 | 1 | Polling keeps focus and open evidence | `tests/operator-browser.mjs:202` and `:203` | asserted |
| INTERFACE-001 | 1 | Keyboard navigation reaches each control and returns focus after a dialog | `tests/operator-browser.mjs:38` (a control the keyboard cannot reach fails) and `:50` | asserted |
| INTERFACE-001 | 1 | Text state is exposed in the accessibility tree | `tests/operator-browser.mjs:29` | asserted |
| INTERFACE-001 | 1 | The document has no horizontal overflow | `tests/operator-browser.mjs:33` | asserted |
| INTERFACE-001 | 1 | The accessibility tree exposes a main landmark and named headings | `tests/operator-browser.mjs:27` and `:28` | asserted |
| INTERFACE-001 | 1 | axe reports no violations | `tests/operator-browser.mjs:32` | asserted |
| NOTIFY-001 | 1 | Email, Slack and signed webhook destinations are created | `tests/notify-delivery.mjs:57` (with `:66`, three saved) | asserted |
| NOTIFY-001 | 1 | A destination credential is rotated | none in a cited file: rotation is asserted in `tests/notify-custody-runtime.mjs`, which NOTIFY-001 does not cite | none |
| NOTIFY-001 | 1 | A destination is disabled | none in a cited file: disabling is asserted in `tests/notify-custody-runtime.mjs` and `tests/notify-secret-browser.mjs`, which NOTIFY-001 does not cite | none |
| NOTIFY-001 | 1 | A scheduled failure is delivered through the actual runner and Worker doors | `tests/notify-delivery.mjs:83` (runner dispatch, one record per receiver) and `tests/hosted-alerts.mjs:49` (Worker Slack) | asserted |
| NOTIFY-001 | 1 | A scheduled recovery is delivered to each destination | `tests/notify-delivery.mjs:127` | asserted |
| NOTIFY-001 | 1 | A test send is delivered once per destination | `tests/notify-delivery.mjs:74` and `:75` | asserted |
| NOTIFY-001 | 1 | One job is made per enabled destination | `tests/notify-delivery.mjs:83` | asserted |
| NOTIFY-001 | 1 | Credentials stay out of reads, console, archives, delivery rows and logs | `tests/notify-delivery.mjs:170` to `:172` (the custody check calls `assertNoSecrets`, whose assertions are at :44) | asserted |
| NOTIFY-001 | 1 | Webhook signing is exact | `tests/hosted-alerts.mjs:52` and `:67` | asserted |
| NOTIFY-001 | 1 | Content is escaped for each channel | `tests/notify-delivery.mjs:84`, `:85` and `:86` | asserted |
| NOTIFY-001 | 1 | A test send leaves health and incidents unchanged | `tests/notify-delivery.mjs:76` | asserted |
| DELIVERY-001 | 1 | An accepted provider response is recorded as accepted | `tests/notify-delivery.mjs:74` (settle waits for accepted and fails otherwise) | asserted |
| DELIVERY-001 | 1 | A proven-unaccepted RER relay 429 with Retry-After is recorded | none in a cited file: proven-unaccepted relay attempts are asserted in `tests/hosted-rer-mail.mjs`, which DELIVERY-001 does not cite | none |
| DELIVERY-001 | 1 | An HTTP 500 is recorded as uncertain | `tests/notify-delivery.mjs:135` | asserted |
| DELIVERY-001 | 1 | A timeout is recorded as uncertain | `tests/notify-delivery.mjs:156` and `:159` | asserted |
| DELIVERY-001 | 1 | A connection loss is recorded as uncertain | `tests/notify-delivery.mjs:142` | asserted |
| DELIVERY-001 | 1 | A restart during claims sends nothing twice | `tests/notify-delivery.mjs:130` and `:144` | asserted |
| DELIVERY-001 | 2 | The proven-unaccepted relay case requeues automatically after its delay | none in a cited file: asserted in `tests/hosted-rer-mail.mjs`, which DELIVERY-001 does not cite | none |
| DELIVERY-001 | 2 | No other outcome requeues: an endpoint 429 is not requeued | `tests/notify-delivery.mjs:137` | asserted |
| DELIVERY-001 | 2 | Uncertain started sends never replay, across restart | `tests/notify-delivery.mjs:144` and `:165` | asserted |
| DELIVERY-001 | 2 | Acceptance stays distinct from receipt | none: no cited line reads an accepted delivery back as anything other than accepted, or shows receipt as a separate fact | none |
| PUBLIC-001 | 1 | The app-origin Lobby is served signed out | `tests/public-paths.mjs:97` | asserted |
| PUBLIC-001 | 1 | The public docs are served signed out | `tests/public-paths.mjs:59` (every docs page in docs/site.json is probed) | asserted |
| PUBLIC-001 | 1 | First-run setup is served signed out | none: no cited line reads `/setup` signed out | none |
| PUBLIC-001 | 1 | After sign-in, `/app` and `/app/monitor` are served | none in a cited file: `tests/readme-journey.mjs:71` calls `smokeDocuments`, whose assertions are in `tests/installer-support.mjs`, which PUBLIC-001 does not cite | none |
| PUBLIC-001 | 1 | The separate marketing site and its `/run` page are read | none: no cited test reads the marketing site | none |
| PUBLIC-001 | 2 | The app routes and the marketing site stay distinct | none: no cited test compares the two surfaces | none |
| PUBLIC-001 | 2 | Private documents reject unsigned access | `tests/public-paths.mjs:78` and `:79` | asserted |
| DRILL-001 | 1 | Email, Slack and signed webhook drills go out through the actual delivery runtime | `tests/alert-drill.mjs:91` (webhook drill event), `:92` (email link) and `:93` (each destination's drill submitted) | asserted |
| DRILL-001 | 1 | GET and HEAD never confirm | `tests/alert-drill.mjs:102` and `:103` | asserted |
| DRILL-001 | 1 | A same-origin POST confirms once | `tests/alert-drill.mjs:111` and `:112` | asserted |
| DRILL-001 | 1 | Expired, replayed and foreign links refuse | `tests/alert-drill.mjs:121` (replay and foreign token) and `:124` (expired) | asserted |
| DRILL-001 | 1 | An HTTP 500 leaves the drill uncertain and unsent again | `tests/alert-drill.mjs:130` and `:132` | asserted |
| DRILL-001 | 1 | Rotation resets proof | `tests/alert-drill.mjs:141` and `:143` | asserted |
| DRILL-001 | 1 | Archives carry no capability or drill row | `tests/alert-drill.mjs:98` (with raw D1 at :96) | asserted |
| DRILL-001 | 1 | Logs and reads carry no capability or endpoint secret | `tests/alert-drill.mjs:146` and `:147` | asserted |
| STARTUP-001 | 1 | The Worker refuses to serve, with 503, when a required binding is missing | `tests/startup-config.mjs:44` (`/health` among the paths) | asserted |
| STARTUP-001 | 1 | The scheduled entry point refuses when a required binding is missing | `tests/startup-config.mjs:48` | asserted |
| STARTUP-001 | 1 | A malformed required binding is refused | `tests/startup-config.mjs:50` | asserted |
| STARTUP-001 | 1 | A malformed conditional binding (the start URL) is refused | `tests/startup-config.mjs:57` | asserted |
| STARTUP-001 | 1 | The local app, preview, setup, deployment and private runner entry points refuse missing or malformed bindings | none: the cited test starts only the Worker's fetch and scheduled entry points | none |
| STARTUP-001 | 1 | Diagnostics name the binding without printing its value | `tests/startup-config.mjs:45`, `:50` and `:62` | asserted |
| STARTUP-001 | 2 | Restored settings recover | `tests/startup-config.mjs:54` | asserted |
| STARTUP-001 | 2 | A missing ASSETS dependency returns 503 | `tests/startup-config.mjs:40` | asserted |
| STARTUP-001 | 2 | A D1 fault returns 503 | none: no cited test faults D1 | none |
| STARTUP-001 | 2 | Faults are answered inside the three-second readiness budget | none: only the healthy response time is measured (`tests/startup-config.mjs:39`) | none |
| PUBLIC-002 | 1 | Declared sessionless paths are enumerated against emitted routes | `tests/public-paths.mjs:41` and `:50` | asserted |
| PUBLIC-002 | 1 | Exceeding a configured class limit returns 429 | `tests/public-paths.mjs:95` | asserted |
| PUBLIC-002 | 1 | The 429 carries Retry-After | none in a cited file: the `limited` helper that reads Retry-After is in `tests/public-paths-support.mjs`, which PUBLIC-002 does not cite | none |
| PUBLIC-002 | 1 | Removing counter storage fails admission closed with 503 | `tests/public-paths.mjs:132` | asserted |
| PUBLIC-002 | 1 | Each route keeps its own authentication checks behind admission | `tests/public-paths.mjs:78` | asserted |
| API-001 | 1 | Checks are saved through the owner API against a controlled endpoint | `tests/probe-native-evidence.mjs:38` (create, with the full assertion bundle at :104 and :179) | asserted |
| API-001 | 1 | Breaking a present keyword fails only that check | `tests/public-probes.mjs:90` (case `body`, :82) | asserted |
| API-001 | 1 | Breaking an absent keyword fails only that check | `tests/public-probes.mjs:90` (case `body-absent`, :83) | asserted |
| API-001 | 1 | Breaking the status range fails only that check | `tests/public-probes.mjs:90` (case `status`, :81) and `:95` | asserted |
| API-001 | 1 | Breaking a response header fails only that check | `tests/public-probes.mjs:90` (case `header`, :85) | asserted |
| API-001 | 1 | Breaking a JSON array or nested path fails only that check | `tests/public-probes.mjs:90` (case `json`, :86) and `:100` | asserted |
| API-001 | 1 | Breaking the regex fails only that check | `tests/public-probes.mjs:90` (case `body-regex`, :84) | asserted |
| API-001 | 1 | Breaking latency fails only that check | `tests/public-probes.mjs:90` (case `latency`, :87) | asserted |
| API-001 | 1 | The saved criteria are unchanged | `tests/public-probes.mjs:91` | asserted |
| SLOW-001 | 1 | A 2,000 ms threshold over 3 slots fires only once the endpoint is slow for 3 slots | `tests/slow-responses.mjs:28` and `:29` (no Slow before the third slow slot), with the trigger at `:31` | asserted |
| SLOW-001 | 2 | The Slow notice reaches its route | `tests/slow-responses.mjs:31` | asserted |
| SLOW-001 | 2 | No incident opens | `tests/slow-responses.mjs:32` | asserted |
| SLOW-001 | 2 | Uptime is unchanged and the report shows slow time | `tests/slow-responses.mjs:33` | asserted |
| SLOW-001 | 3 | Recovery sends the slow-recovered notice | `tests/slow-responses.mjs:53` | asserted |
| SLOW-001 | 4 | A latency assertion on another monitor still fails it as down | `tests/slow-responses.mjs:63` | asserted |
| API-002 | 1 | Basic authentication works against an authorized endpoint | none: no cited test configures Basic authentication | none |
| API-002 | 1 | HTTP Digest works, and a rejected credential fails as authentication | `tests/api-auth-journey.mjs:54` and `:55` | asserted |
| API-002 | 1 | A bearer credential is sent only for its own monitor | `tests/monitor-credentials.mjs:39` | asserted |
| API-002 | 1 | OAuth 2.0 client-credentials and refresh-token acquisition work | `tests/api-auth-journey.mjs:60` and `:61` | asserted |
| API-002 | 1 | JWT signing works for HS256, RS256 and ES256 | `tests/api-auth-journey.mjs:43` and `:70` | asserted |
| API-002 | 1 | mTLS client certificates work | `tests/api-auth-journey.mjs:73` | asserted |
| API-002 | 1 | An expired credential fails closed, and an expired token is acquired again | `tests/api-auth-journey.mjs:56` and `:62` | asserted |
| API-002 | 1 | A rotated credential takes effect | `tests/monitor-credentials.mjs:45` | asserted |
| API-002 | 1 | A revoked (removed) credential fails closed | `tests/monitor-credentials.mjs:46` and `tests/api-auth-journey.mjs:56` | asserted |
| API-002 | 1 | A cross-origin redirect strips authentication | `tests/api-auth-journey.mjs:52` | asserted |
| API-002 | 1 | The expected failure and recovery are shown | `tests/api-auth-journey.mjs:70` (failure, then pass) | asserted |
| API-002 | 1 | A foreign reference is refused | `tests/monitor-credentials.mjs:40` | asserted |
| API-002 | 1 | No planted secret appears in storage, archives or traces (browser artifacts) | `tests/monitor-credentials.mjs:74` and `tests/api-auth-journey.mjs:74` | asserted |
| API-002 | 1 | No planted secret appears in logs | `tests/monitor-credentials.mjs:37` | asserted |
| API-003 | 1 | A login/create/read/delete journey is created through the configuration door and runs | `tests/api-transaction-browser.mjs:35` and `:36` (saved through the owner editor and run), with `tests/api-transaction-journey.mjs:50` | asserted |
| API-003 | 1 | A failed middle assertion stays failed after later steps pass | `tests/api-transaction-journey.mjs:57` | asserted |
| API-003 | 1 | Expired shared authentication fails its step and skips the rest | `tests/api-transaction-journey.mjs:79` | asserted |
| API-003 | 1 | Step history keeps each step's outcome, attempts and timing | `tests/api-transaction-journey.mjs:50`, `:51` and `:54` | asserted |
| API-003 | 1 | Cleanup runs and is visible after a failure | `tests/api-transaction-journey.mjs:49` and `:58` | asserted |
| API-003 | 1 | No extracted secret leaks into evidence | `tests/api-transaction-journey.mjs:16` | asserted |
| API-004 | 1 | A sandbox checkout runs with setup and teardown | `tests/api-transaction-journey.mjs:201` and `:202` (real browser checkout, synthetic account and Stripe test-mode order) | asserted |
| API-004 | 1 | A mid-flow cancellation is recorded and cleanup still runs | `tests/api-transaction-journey.mjs:71` and `:206` (API and browser cancellation) | asserted |
| API-004 | 1 | Cleanup denied at the network edge makes exactly its bounded attempts | `tests/api-transaction-journey.mjs:75` and `:211` (API and browser cleanup) | asserted |
| API-004 | 1 | The cleanup failure is retained as debt | `tests/api-transaction-journey.mjs:77` and `:213` | asserted |
| API-004 | 1 | Explicit operator resolution closes debt and is audited | `tests/api-transaction-journey.mjs:93` and `:95` | asserted |
| API-004 | 1 | No live charge is made without a grant | `tests/api-transaction-journey.mjs:104`, `:110` and `:121` | asserted |
| TCP-001 | 1 | A TCP monitor is created through the owner API | `tests/protocol-monitors.mjs:58` | asserted |
| TCP-001 | 1 | An open port passes with its pinned address and banner | `tests/protocol-monitors.mjs:59` | asserted |
| TCP-001 | 1 | A closed port fails as refused and confirms a trigger | `tests/protocol-monitors.mjs:60` | asserted |
| TCP-001 | 1 | A blackholed port fails as a timeout | `tests/protocol-monitors.mjs:61` | asserted |
| TCP-001 | 1 | The checks run from two locations | none: every cited TCP check runs from one location | none |
| TCP-001 | 1 | A recovery event follows the trigger | `tests/protocol-monitors.mjs:63` | asserted |
| PING-001 | 1 | A configured ping target keeps loss and round-trip latency | `tests/ping-monitors.mjs:57` | asserted |
| PING-001 | 1 | Raised loss fails the packet-loss threshold | `tests/ping-monitors.mjs:61` | asserted |
| PING-001 | 1 | Raised latency fails the round-trip threshold | `tests/ping-monitors.mjs:62` | asserted |
| PING-001 | 1 | Disabled or unavailable ICMP reads Unknown, not success | `tests/ping-monitors.mjs:72` | asserted |
| PING-001 | 1 | Stop a previously running probe and inspect Unknown probe coverage | none: `tests/ping-monitors.mjs:79` only creates an unchecked monitor, and neither cited test reads coverage after stopping a previously running probe | none |
| PING-001 | 1 | A newly created unchecked monitor has initial Unknown probe coverage | `tests/ping-monitors.mjs:79` | asserted |
| DNS-001 | 1 | DNS monitors are saved through the owner door and read their records | `tests/protocol-monitors.mjs:71` | asserted |
| DNS-001 | 1 | A changed expected record fails | `tests/protocol-monitors.mjs:72` | asserted |
| DNS-001 | 1 | A removed record (NXDOMAIN) fails and is never treated as success | `tests/protocol-monitors.mjs:78` | asserted |
| DNS-001 | 1 | Resolver disagreement is reported | `tests/protocol-monitors.mjs:77` | asserted |
| DNS-001 | 1 | Resolver failure (SERVFAIL) and monitor infrastructure faults stay distinct | `tests/protocol-monitors.mjs:79` and `:80` | asserted |
| DNS-001 | 1 | Raw bounded record evidence is kept per resolver | `tests/protocol-monitors.mjs:71` | asserted |
| DNS-001 | 1 | Confirmed alerts and recovery follow | `tests/protocol-monitors.mjs:74` | asserted |
| DNS-001 | 1 | Maintenance applies to a DNS monitor | none: no cited DNS check runs inside a maintenance window | none |
| TLS-001 | 1 | An expiring certificate warns once, naming the certificate, its stage and accountable owner | `tests/protocol-monitors.mjs:88` | asserted |
| TLS-001 | 1 | The same stage never warns twice | `tests/protocol-monitors.mjs:89` | asserted |
| TLS-001 | 1 | A wrong name fails | `tests/protocol-monitors.mjs:90` | asserted |
| TLS-001 | 1 | A broken (untrusted) chain fails | `tests/protocol-monitors.mjs:91` | asserted |
| TLS-001 | 1 | Each failure is kept as the location's evidence | `tests/protocol-monitors.mjs:90` and `:91` | asserted |
| TLS-001 | 1 | A renewed certificate resolves the warning | `tests/protocol-monitors.mjs:93` and `:94` | asserted |
| TLS-001 | 1 | As the clock advances, warnings move through the configured stages without repeating | none: the cited test presents one certificate at one stage (the 14-day warning of 30, 14 and 7) and repeats the check without moving the clock (`tests/protocol-monitors.mjs:89`) | none |
| DOMAIN-001 | 1 | A domain is added in the console | none: the cited test adds the domain through the owner API (`tests/protocol-monitors.mjs:100`), not the console | none |
| DOMAIN-001 | 1 | Approaching expiry warns, naming the stage and accountable owner | `tests/protocol-monitors.mjs:102` | asserted |
| DOMAIN-001 | 1 | Conflicting dates read Unknown | `tests/protocol-monitors.mjs:103` | asserted |
| DOMAIN-001 | 1 | Unavailable or redacted data reads Unknown | `tests/protocol-monitors.mjs:104` and `:105` | asserted |
| DOMAIN-001 | 1 | Source times are kept for the registry and registrar | `tests/protocol-monitors.mjs:101` | asserted |
| DOMAIN-001 | 1 | Renewal resolves the follow-up, and Unknown data opens no incident | `tests/protocol-monitors.mjs:107` | asserted |
| UDP-001 | 1 | A UDP monitor is created through the owner door | `tests/udp-monitors.mjs:45` | asserted |
| UDP-001 | 1 | A matching payload passes | `tests/udp-monitors.mjs:55` | asserted |
| UDP-001 | 1 | A mismatching payload fails as an assertion | `tests/udp-monitors.mjs:51` and `:57` | asserted |
| UDP-001 | 1 | Dropped packets fail as a timeout | `tests/udp-monitors.mjs:57` and `:60` | asserted |
| UDP-001 | 1 | Removed or refused probe authority is a runner failure that sends nothing | `tests/udp-monitors.mjs:50` (refused destination) and `:65` (revoked runner: claim refused, no packet sent) | asserted |
| UDP-001 | 1 | Outbound traffic is bounded | `tests/udp-monitors.mjs:60` (capacity cap) and `:61` | asserted |
| MAIL-001 | 1 | Each protocol monitor is configured through the owner door | `tests/mail-journey.mjs:39` | asserted |
| MAIL-001 | 1 | Broken authentication fails its step and alerts | `tests/mail-journey.mjs:56` | asserted |
| MAIL-001 | 1 | Broken TLS fails its step | `tests/mail-journey.mjs:61` | asserted |
| MAIL-001 | 1 | Per-step alerts trigger and recover | `tests/mail-journey.mjs:56` and `:57` | asserted |
| MAIL-001 | 1 | Delayed receipt is measured, and absent receipt fails the receipt step after SMTP acceptance | `tests/mail-journey.mjs:72` and `:73` | asserted |
| MAIL-001 | 1 | The receiver confirms the exact message | `tests/mail-journey.mjs:72` | asserted |
| MAIL-001 | 1 | Synthetic messages are removed and unrelated mail is kept | `tests/mail-journey.mjs:72` and `:75` | asserted |
| NETWORK-002 | 1 | The default check of a self-signed target fails with a TLS error | `tests/tls-trust-journey.mjs:18` | asserted |
| NETWORK-002 | 1 | The check passes with a pinned fingerprint and with the ignore option | `tests/tls-trust-journey.mjs:21`, `:22` and `:29` (each trust mode) | asserted |
| NETWORK-002 | 2 | A rotated certificate fails the pinned monitor | `tests/tls-trust-journey.mjs:26` | asserted |
| NETWORK-002 | 3 | A cross-origin redirect is verified by default | `tests/tls-trust-journey.mjs:41` | asserted |
| NETWORK-002 | 4 | The exception's label and the bypassed error are kept in the evidence | `tests/tls-trust-journey.mjs:21` and `:29` | asserted |
| NETWORK-002 | 4 | An imported UptimeRobot monitor with "ignore SSL errors" previews the option | `tests/tls-trust-journey.mjs:46` | asserted |
| SCHEDULE-001 | 1 | A saved cadence makes the monitor due through the API | `tests/resilience/attempts.mjs:25` | asserted |
| SCHEDULE-001 | 1 | Retries stay inside their slot and never count as independent slots | `tests/resilience/attempts.mjs:138`, `:139` and `:154` | asserted |
| SCHEDULE-001 | 1 | Delayed claims keep each vantage's checks at least one interval apart | `tests/resilience/attempts.mjs:320` | asserted |
| SCHEDULE-001 | 1 | Due times follow the rule after an interval edit | none: no cited test edits the interval and reads the next due times | none |
| SCHEDULE-001 | 1 | A manual pass leaves scheduled state unchanged | `tests/signed-runner.mjs:107` | asserted |
| SCHEDULE-001 | 1 | Fixed selected-probe coverage is read through history | none: no cited line reads a slot's fixed probe selection back | none |
| SCHEDULE-001 | 1 | Incident thresholds apply through history | `tests/resilience/attempts.mjs:308` | asserted |
| PRIVATE-001 | 1 | A runner enrolls with private-network capability | `tests/private-network.mjs:32` | asserted |
| PRIVATE-001 | 1 | With one service granted, an HTTP check passes | `tests/private-network.mjs:41` | asserted |
| PRIVATE-001 | 1 | A TCP check passes under the grant | `tests/private-network.mjs:51` | asserted |
| PRIVATE-001 | 1 | A browser check passes under the grant | `tests/private-network.mjs:53` | asserted |
| PRIVATE-001 | 1 | Revoking the grant or the runner refuses further checks | `tests/private-network.mjs:49` (grant retired mid-request) and `:57` (runner revoked) | asserted |
| PRIVATE-001 | 2 | An unauthorized neighbor refuses without connecting | `tests/private-network.mjs:44` | asserted |
| PRIVATE-001 | 2 | A metadata address refuses | `tests/private-network.mjs:39` | asserted |
| PRIVATE-001 | 2 | A redirected private address refuses without connecting | `tests/private-network.mjs:48` | asserted |
| PRIVATE-001 | 2 | A public runner cannot use the grant | `tests/private-network.mjs:50` | asserted |
| MAINT-001 | 1 | Schedule a New York recurring maintenance window across a DST transition | none: `tests/maintenance-windows.mjs:66` and `:69` preview but never apply the New York recurring window | none |
| MAINT-001 | 1 | New York DST previews distinguish the skipped spring time and the repeated fall time | `tests/maintenance-windows.mjs:67` and `:71` | asserted |
| MAINT-001 | 1 | Fail a monitor during the recurring window | none: the applied failing-monitor windows in `tests/maintenance-windows.mjs:80`, `:96`, `:106` and `:114` are one-time; the recurring report fixture has passing observations | none |
| MAINT-001 | 1 | A one-time group window pauses execution for the whole group | `tests/maintenance-windows.mjs:84` | asserted |
| MAINT-001 | 1 | A failure during a suppress window is kept but opens no trigger or recovery | `tests/maintenance-windows.mjs:82` and `:98` | asserted |
| MAINT-001 | 1 | A restart during a window keeps observations and the window | `tests/maintenance-windows.mjs:111` | asserted |
| MAINT-001 | 1 | Cancelling a window resumes checks with no orphan recovery | `tests/maintenance-windows.mjs:113` | asserted |
| MAINT-001 | 1 | Ending (expiry) re-evaluates actual evidence | `tests/maintenance-windows.mjs:115` | asserted |
| MAINT-001 | 1 | Earlier results are preserved | `tests/maintenance-windows.mjs:116` | asserted |
| MAINT-001 | 1 | Reports show maintenance separately with their denominators | `tests/maintenance-windows.mjs:136` and `:138` | asserted |
| EVIDENCE-002 | 1 | An HTTP failure against a controlled 503 page keeps a snapshot with planted credentials masked | `tests/failure-snapshots.mjs:22` and `:25` (authorization and set-cookie redacted), with `tests/failure-page-journey.mjs:23` | asserted |
| EVIDENCE-002 | 1 | The owner reads the request and response headers in the snapshot | `tests/failure-page-journey.mjs:22` and `tests/failure-snapshots.mjs:25` | asserted |
| EVIDENCE-002 | 1 | The page excerpt is kept and masked | `tests/failure-page-journey.mjs:23` | asserted |
| EVIDENCE-002 | 1 | The screenshot is kept and read back by the owner | `tests/failure-page-journey.mjs:22` and `:26` | asserted |
| EVIDENCE-002 | 1 | As owner open incident detail and inspect the failure snapshot, including its screenshot | `tests/failure-page-browser.mjs:15` (incident snapshot control, visible screenshot and downloaded incident report assertion) | asserted |
| EVIDENCE-002 | 2 | An unauthorized role is refused | `tests/failure-page-journey.mjs:33` (member without evidence access: 403) | asserted |
| EVIDENCE-002 | 2 | A signed-out request is refused | `tests/failure-page-journey.mjs:33` and `tests/failure-snapshots.mjs:27` | asserted |
| EVIDENCE-002 | 2 | The incident report carries the snapshot | `tests/failure-page-journey.mjs:26` | asserted |
| EVIDENCE-002 | 2 | An archive round trip keeps the snapshot without planted values | `tests/failure-snapshots.mjs:30` and `tests/failure-page-journey.mjs:36` | asserted |
| EVIDENCE-002 | 2 | Erasing the monitor removes the snapshot with a receipt, and its archived copy cannot come back | `tests/failure-snapshots.mjs:37` and `tests/failure-page-journey.mjs:36` (receipts), with `tests/failure-snapshots.mjs:36` (the later journal refuses the archived copy) | asserted |
| EVIDENCE-002 | 2 | The alert carries only the cause line and link, no excerpt | `tests/failure-snapshots.mjs:31` | asserted |
| DEPENDENCY-001 | 1 | A linked provider status page is discovered through the real runner | `tests/discovery-jobs.mjs:128` and `:130` | asserted |
| DEPENDENCY-001 | 1 | Its overall and one component proposal are reviewed and adopted through the owner monitor door | `tests/discovery-jobs.mjs:155` and `:156` | asserted |
| DEPENDENCY-001 | 1 | The component is switched through an ordinary revision | `tests/discovery-jobs.mjs:173` and `:175` | asserted |
| DEPENDENCY-001 | 2 | The selected component fails with scheduled signed-runner evidence | `tests/discovery-jobs.mjs:162`, `:178` and `:179` | asserted |
| DEPENDENCY-001 | 2 | The separate provider monitor shows its failure, naming where its status comes from | `tests/discovery-jobs.mjs:180` and `:181` | asserted |
| DEPENDENCY-001 | 2 | The application monitor's state, revisions and evidence stay unchanged | `tests/discovery-jobs.mjs:182` | asserted |
| DEPENDENCY-001 | 2 | A removed component reads Unknown/missing evidence | `tests/discovery-jobs.mjs:184` | asserted |
| FLOW-003 | 1 | A broken sandbox checkout keeps a screenshot, video, trace and waterfall read through the authenticated owner monitor snapshot API | `tests/flow-artifact-journey.mjs:44` | asserted |
| FLOW-003 | 1 | Inspect screenshot, video, trace and waterfall through authenticated incident detail | none: asserted only in `tests/flow-artifact-browser.mjs:14`, which this clause does not cite; `tests/flow-artifact-journey.mjs:44` reads the monitor snapshot API | none |
| FLOW-003 | 1 | Denied artifact storage leaves a visible capture failure | `tests/flow-artifact-journey.mjs:56` and `:57` | asserted |
| FLOW-003 | 1 | An unauthorized download is refused | `tests/flow-artifact-journey.mjs:51` | asserted |
| FLOW-003 | 2 | Planted secrets never appear | `tests/flow-artifact-journey.mjs:46` | asserted |
| FLOW-003 | 2 | Masked fields never appear | `tests/flow-artifact-journey.mjs:44` (console entries carry no masked text) | asserted |
| FLOW-003 | 2 | Retained artifact failures are visible | `tests/flow-artifact-journey.mjs:57` | asserted |
| FLOW-003 | 2 | Erasure is visible with its receipt | `tests/flow-artifact-journey.mjs:59` | asserted |
| FLOW-004 | 1 | The same checkout runs in Chromium, Firefox and WebKit | `tests/flow-profiles.mjs:44` and `:45` (each browser's real checkout and profile) | asserted |
| FLOW-004 | 1 | A 390-pixel mobile profile runs the checkout | `tests/flow-profiles.mjs:49` | asserted |
| FLOW-004 | 1 | A mobile-only failure is reported per profile and is not averaged into success | `tests/flow-profiles.mjs:48` and `:50` | asserted |
| FLOW-004 | 1 | A removed browser leaves Unknown capacity, never a substituted pass | `tests/flow-profiles.mjs:89` and `:91` | asserted |
| ROUTING-002 | 1 | The zero-delay contact (Slack) is notified at confirmation | none: the cited tests configure zero-delay contacts (`tests/contact-schedules.mjs:16`) but no line reads their sends at confirmation | none |
| ROUTING-002 | 1 | The delayed contact (SMS; a delayed webhook contact in the test) gets nothing at confirmation | `tests/contact-schedules.mjs:33` | asserted |
| ROUTING-002 | 1 | The delayed contact is notified when its delay elapses | `tests/contact-schedules.mjs:36` (next due at the delay) and `:48` | asserted |
| ROUTING-002 | 1 | A repeat follows at the repeat interval with the incident's stable identity | `tests/contact-schedules.mjs:53` | asserted |
| ROUTING-002 | 2 | A recovery inside the delay sends the delayed contact no trigger and no recovery notice | `tests/contact-schedules.mjs:56` | asserted |
| ROUTING-002 | 2 | A Worker restart inside the delay still sends exactly one delayed notice | `tests/contact-schedules.mjs:45` (restart) and `:48` | asserted |
| ROUTING-002 | 2 | An imported UptimeRobot threshold and recurrence previews the same schedule | `tests/contact-schedules.mjs:27` | asserted |
| DELIVERY-002 | 1 | An uncertain 500 is retried and the receiver records one incident | `tests/notify-retry-fixture.mjs:56` and `:64` | asserted |
| DELIVERY-002 | 1 | Every retry reuses the same stable key | `tests/notify-retry-fixture.mjs:70` | asserted |
| DELIVERY-002 | 1 | A 4xx (400) stops at once and shows its code | `tests/notify-retry-fixture.mjs:81` | asserted |
| DELIVERY-002 | 1 | A 429 with Retry-After is honored | `tests/notify-retry-fixture.mjs:65` and `:71` | asserted |
| DELIVERY-002 | 1 | A restart mid-backoff makes no duplicate attempt | `tests/notify-retry-fixture.mjs:61` | asserted |
| DELIVERY-002 | 2 | A dead Slack webhook fails with its code | `tests/notify-fallback-fixture.mjs:23` | asserted |
| DELIVERY-002 | 2 | The email fallback is sent within the deadline, naming the failed primary | `tests/notify-fallback-fixture.mjs:27`, `:29` and `:30` | asserted |
| DELIVERY-002 | 2 | The signed-webhook fallback receives the alert after the uncertain email, with the preceding outcome visible | `tests/notify-fallback-fixture.mjs:38`, `:39` and `:44` | asserted |
| DELIVERY-002 | 2 | Both outcomes stay visible | `tests/notify-fallback-fixture.mjs:31` and `tests/notify-retry-fixture.mjs:72` | asserted |
| DELIVERY-002 | 3 | An email destination is never automatically resent | `tests/notify-fallback-fixture.mjs:28` | asserted |
| DELIVERY-002 | old 2 | The SMS fallback is inherited by PHONE-001 and PHONE-002 | moved to the Requirement (a pointer to other clauses, RL-3) | moved |
| NOTICE-001 | 1 | A monitor fails with HTTP 503 and recovers after a known duration | `tests/notify-delivery.mjs:95` (trigger reason) and `:105` (every recovery delivery accepted) | asserted |
| NOTICE-001 | 2 | Email, Slack and webhook notices carry the plain-language reason | `tests/notify-delivery.mjs:95` and `:121` | asserted |
| NOTICE-001 | 2 | They carry the failed locations | `tests/notify-delivery.mjs:94` and `:117` | asserted |
| NOTICE-001 | 2 | Recovery notices carry the exact downtime | `tests/notify-delivery.mjs:109` and `:113` | asserted |
| NOTICE-001 | 2 | The signed JSON carries the same incident context and the email links to the incident | `tests/notify-delivery.mjs:118` and `:122` | asserted |
| NOTICE-001 | 3 | An incident spanning a Worker restart reports the correct total | `tests/notify-delivery.mjs:102` (restart before recovery) and `:113` | asserted |
| NOTICE-001 | old 2 | The chat, SMS, voice and push notices are inspected once those channels exist | moved to the Requirement (a proof boundary owned by CHAT-001, PHONE-001 and MOBILE-001) | moved |
| WEBHOOK-001 | 1 | An imported UptimeRobot webhook contact keeps its header name and drops the source secret | `tests/webhook-custom.mjs:7` | asserted |
| WEBHOOK-001 | 1 | On failure and recovery the receiver gets the same field names, header and content type, with values substituted | `tests/webhook-custom.mjs:13` (trigger) and `:15` (recovery) | asserted |
| WEBHOOK-001 | 2 | A name with quotes and `<script>` arrives escaped and the body parses as JSON | `tests/webhook-custom.mjs:13` and `:9` | asserted |
| WEBHOOK-001 | 3 | Query-string and form modes arrive as parameters, and GET sends no body | `tests/webhook-custom.mjs:19` | asserted |
| WEBHOOK-001 | 4 | A header value with CR/LF is refused at save | `tests/webhook-custom.mjs:11` | asserted |
| WEBHOOK-001 | 5 | An unmappable variable is named in the preview and refused at save | `tests/webhook-custom.mjs:21` (warning; rendered Unavailable) and `:11` (unknown variable refused) | asserted |
| WEBHOOK-001 | 6 | The preview matches the received request byte for byte apart from masked secrets | none: the cited tests check the preview's masking (`tests/webhook-custom.mjs:9`) and the received request (`:13`) separately, but no line compares them | none |
| WEBHOOK-001 | 7 | The signed variant verifies with its HMAC | `tests/webhook-custom.mjs:13` and `:19` | asserted |
| WEBHOOK-001 | 8 | An archive export carries the template and header names but no header value | `tests/webhook-custom.mjs:22` | asserted |
| MANAGE-001 | 1 | A monitor is created through the owner API | `tests/definitions-import.mjs:208` (heartbeat creation returns 201) | asserted |
| MANAGE-001 | 1 | A monitor is edited through the owner API | `tests/definitions-import.mjs:189` and `:191` | asserted |
| MANAGE-001 | 1 | A monitor is paused through the owner API | `tests/definitions-import.mjs:165` (saved with enabled false) | asserted |
| MANAGE-001 | 1 | A contact credential is rotated through the owner API | none: no cited test rotates a contact | none |
| MANAGE-001 | 1 | The monitor's revision is read back | none: no cited line reads the saved revision back | none |
| MANAGE-001 | 1 | A signed-out mutation is refused | `tests/definitions-import.mjs:106` | asserted |
| MANAGE-001 | 1 | A cross-origin mutation is refused | none: no cited test sends a cross-origin mutation to the monitor or contact API | none |
| MANAGE-001 | 1 | A refused mutation writes nothing (atomic refusal) | none: no cited line compares durable state before and after a refused monitor or contact mutation | none |
| MANAGE-001 | 1 | No endpoint secret is exposed | `tests/notify-delivery.mjs:170` to `:172` | asserted |
| METRICS-001 | 1 | The Prometheus scrape door serves metrics to an authorized key | `tests/metrics.mjs:25` | asserted |
| METRICS-001 | 1 | Grafana is configured with the supplied dashboard against the real door | none: no cited line loads the supplied Grafana dashboard or queries through Grafana | none |
| METRICS-001 | 1 | An authorized Datadog export is accepted with source location identity | `tests/metrics.mjs:39` | asserted |
| METRICS-001 | 1 | A failed monitor and probe show in the metrics | `tests/metrics.mjs:24` | asserted |
| METRICS-001 | 1 | Revoked credentials are refused at once | `tests/metrics.mjs:42` and `tests/metrics-browser.mjs:69` | asserted |
| METRICS-001 | 1 | Source denominators match the report | `tests/metrics.mjs:21` and `:27` | asserted |
| METRICS-001 | 1 | Stale states are shown | `tests/metrics.mjs:22` and `:24` | asserted |
| METRICS-001 | 1 | No cross-workspace metrics are served | `tests/metrics.mjs:28` and `:35` | asserted |
| OPS-001 | 1 | Stopping and restarting the Worker independently keeps notices and attempts correct | `tests/resilience/watches.mjs:71` and `:182` | asserted |
| OPS-001 | 1 | Crashing and restarting the runner independently reconciles its attempts | `tests/resilience/watches.mjs:148` and `:154` | asserted |
| OPS-001 | 1 | A missed external heartbeat lets the independent service alarm | `tests/resilience/watches.mjs:107` | asserted |
| OPS-001 | 1 | Interrupted auth-mail and watch jobs stay uncertain across restart | `tests/resilience/watches.mjs:182` and `:183` | asserted |
| OPS-001 | 1 | Attempts are retained | `tests/resilience/watches.mjs:154` and `:177` | asserted |
| OPS-001 | 1 | Lost contact reads stale and Unknown coverage | `tests/resilience/watches.mjs:81` | asserted |
| OPS-001 | 1 | Notices are not duplicated | `tests/resilience/watches.mjs:71` and `:148` | asserted |
| OPS-001 | 1 | Archive recovery restores the history inactive with no alert replay | `tests/resilience/watches.mjs:195` and `:196` | asserted |
| OPS-001 | old 1 | Restore is judged at ARCHIVE-001 bounds | moved to the Requirement (a proof boundary, not an outcome) | moved |

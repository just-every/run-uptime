# sd-uptime-c-f165 result

Product repository: https://github.com/just-every/run-uptime
Product branch: cloud/sd-uptime-c-f165
Product head: 42a73be3d12eb6bb7a5c47354b8de27356c154ff
Parent main: 88c586f6fabdaed6768ddc8072af2340310a7ace
PR: none required; Verify has a branch push entry point.

STARTUP-001 remains PARTIAL. This round completes only the planner-selected mandatory Worker MAIL_FROM refusal cases within acceptance 1 and their correction and restart within acceptance 2. The title's broader DONE goal is limited by the explicit POINTS, which require retaining PARTIAL and leaving production and shared helpers unchanged. Counts remain 37 DONE, 58 PARTIAL and 20 MISSING across 115 clauses. The actual current verification plan contains 47 journey commands before and after this change; the extract's older 45-command count is historical. There is no added registration: the new support journey is called once by the existing public-path script.

## Plan and changes

PLAN.md contains the complete execution plan. All eight steps were performed; exact CI and evidence custody are recorded below and in the separate receipts. Only four product files changed: the new support journey, its import and single invocation in the public-path script, bounded STARTUP-001 evidence prose, and the generated source lock. No Status, Gap or Evidence cell changed. Acceptance wording and all pre-existing assertions are intact. Production, shared helpers, protected attempts and deployment-spec files, workflows, UI, Base pin and provider integration code are unchanged.

The support journey runs the actual emitted Worker inside Miniflare with actual persistent D1. It applies every SQL migration independently of its parent journey. Native bootstrap creates the owner and real session custody; signed enrollment establishes a self-runner, and an authenticated idle control establishes durable contact. A released historical notification-custody row remains inert. URL and Host are explicitly constructed independently of MAIL_FROM. A separate outbound service observer refuses and records any external fetch; no application or D1 operation is replaced. Snapshots query every readable durable table and its SQL schema, including SQLite sequences. D1's platform-owned _cf_METADATA is the only omitted table because D1 prohibits reading it. The passing installation has 225 readable tables.

The two bad settings are independently missing MAIL_FROM and a malformed display sender with an opaque synthetic sentinel and no address. For each setting, health and a valid scoped runner claim return 503 naming MAIL_FROM with no-store. Response bodies, response headers and captured runtime diagnostics exclude supplied values, the sentinel and ordinary encoded forms. Every readable durable table remains identical after each request, including sequence state, native owner admission, sessions, request counters, runner authority and retained notification custody. There are zero outbound requests.

Each bad setting is then corrected and the Worker restarts on the exact same persistence. Health returns 200. A wrong key returns 401; the valid enrolled runner returns 200 with task null. Recovery checks every table again: only one admission count for the named health or runner class may advance per request, with existing windows and identities preserved; the successful claim may update only the enrolled runner's last_contact_at and the singleton installation contact timestamp. Runner scope, keys, identities, all other rows and every sequence remain unchanged. No monitor, slot or notification job is created, and no mail or target work is attempted. mail-sender-receipt.json retains complete per-table inventories and digests before and after refusals, recovery inventories, and actual value-free captured diagnostics.

## Acceptance and inherited-duty evidence

All line references name the committed support journey unless stated otherwise. Runtime result: PASS locally on the exact product head. CI is recorded separately below; no unobserved CI or hosted outcome is claimed.

| Item | Evidence and outcome | Scope retained |
| --- | --- | --- |
| Acceptance 1: missing mandatory sender | Lines 136–149 exercise health and authenticated claim with MAIL_FROM absent; both 503, binding named, no value disclosure, all 225 readable tables identical, no outbound. | Only the Worker MAIL_FROM cell is qualified. |
| Acceptance 1: malformed mandatory sender | Same loop supplies the planted malformed sender; both doors return the same bounded refusal without changes or outbound. Lines 59–65 check value encodings. | Other missing, malformed and conditional settings remain omitted. |
| Acceptance 2: restore settings and recover | Lines 150–157 restart the same persistent D1 after each correction; health 200, wrong key 401, authenticated idle claim 200. Lines 73–112 restrict all allowed admission and contact effects precisely. | ASSETS faults, D1 readiness and stalled-operation faults, and the owner-approved three-second budget are unproved. |
| BASE-SECRET-002 inheritance | Existing STARTUP-001 meta declaration cites this duty. Lines 59–65, 143–149 and 159 withhold values from responses and captured diagnostics in this sender scope. | Full shared-duty qualification is not claimed. |
| BASE-OPS-001 inheritance | Existing meta declaration cites this duty; corrected health succeeds against real D1 and real emitted assets, lines 127 and 151. | The explicit three-second readiness fault budget remains owed. |

Mounted by tests/public-paths.mjs lines 11 and 14. package.json test:console already includes node tests/public-paths.mjs, and the existing verification plan selects that command for push Verify. No workflow changes or new dispatch were needed.

## Checks and public-door probes

- Setup completed through cloud_run with the fleet owner and non-interactive mode. Setup output was retained privately rather than published because it contains installation-specific settings and owner details.
- Exact-candidate npx -y @runeditrun/rer build: exit 0.
- Exact-candidate pnpm run typecheck under pinned Node 22.20.0: exit 0.
- Registered node tests/public-paths.mjs passed before commit. Its final exact-candidate rerun and the fresh sender receipt are recorded in validation-receipt.json and public-paths.txt.
- npx -y @runeditrun/rer check --profile first-party: exit 0.
- Contract generator write and check: exit 0; prose has 0 errors and 0 warnings. Generated views were then restored from origin/main, as required. views-after-restore.txt records the expected freshness result on the branch tree; generated views are not committed.
- Source lock regenerated with node scripts/edition-authoring/cli.mjs lock after the final product edits, then checked successfully before commit and again at the exact head. The pre-push rebase was a no-op because main had not moved. No migration was edited, so no migration-ledger check applies.
- The entire Status section matches origin/main byte for byte. The only contract addition is the bounded sender evidence paragraph. The new fixture and added prose contain no email-shaped literal. Existing assertions were neither removed nor narrowed. Commit identity and trailer checks cover every candidate commit, including side parents; the sole candidate has fleet author and committer and no trailers. Product push succeeded on its first guarded attempt.

PROBE STARTUP-001 acceptance-1: missing MAIL_FROM and malformed planted sender into emitted Worker health and scoped runner claim -> four 503 responses naming MAIL_FROM; value-free responses and captured diagnostics, zero outbound requests, all 225 readable durable tables unchanged after each request.
PROBE STARTUP-001 acceptance-2: correct sender and restart the same persistence after each bad setting -> health 200, wrong runner key 401, authenticated idle claim 200, only enumerated admission and contact effects, no mail or target work.
MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock then check exit=0; views=node src/base/contract-docs.mjs write then check exit=0 then restore origin/main views; ledger=none exit=0.

Two exploratory standalone eval invocations did not progress and were explicitly terminated by their own recorded PIDs. A diagnostic file invocation passed; the canonical registered file invocation then passed. No product assertion failed or was weakened, no production repair was made and no CI repair round was attempted. All exploratory workers were stopped. The exact-candidate receipt comes from the registered script, not the diagnostic copy.

## DONE riders and pre-ready checks

This is a bounded PARTIAL claim, not a DONE claim. Each rider is still explicitly assessed to avoid promoting the retained remainder.

| Rider | Result at this head | Evidence or boundary |
| --- | --- | --- |
| 1 | PASS for selected sender outcomes; UNMET for full clause | Acceptance rows above; other runtimes and readiness matrix remain owed. |
| 2 | PASS for selected scope | Populated admission and custody, missing and malformed unsafe cases, both corrected allowed cases, complete state comparisons and independent outbound observation. |
| 3 | REGISTERED; exact run recorded below | Existing push Verify selects the public-path script without a flag. No unobserved shard pass is inferred. |
| 4 | PASS locally on exact source | Exact-candidate emitted build and registered journey, with matching committed source hashes in product-receipt.json. |
| 5 | INSPECTED | Existing STARTUP-001 meta cites BASE-SECRET-002 and BASE-OPS-001; no inheritance was added or moved. |
| 6 | PASS for write and check; landing view refresh pending | Generation succeeds, then the required main-view restore is preserved. Status cells are untouched. |
| 7 | PASS | Acceptance points, rulings and coverage mapping unchanged. |
| 8 | PASS for touched authentication boundary | Valid scoped idle claim succeeds, wrong key is denied, only explicitly permitted request admission occurs on denial, authority and custody remain exact. Broader operator permissions are untouched. |
| 9 | PASS for honest boundary | Synthetic network observation establishes local refusal and recovery only. No provider account, delivery, hosted readiness or legal qualification is claimed. |
| 10 | NOT APPLICABLE | No policy default or authority change was adopted. |
| 11 | LANDER PENDING | No main push or landing was performed. Main equality, publication scan and candidate Run site remain guarded-lander duties. |

Pre-ready: the selected outcomes have passing native-door assertions that fail if refusal, correction, no-work, custody or value-free behavior breaks; no existing assertion was weakened. The wrong-key case checks the touched authority boundary. Erasure and replay implementations remain untouched and are not newly qualified. No screen changed, so viewport, tooltip and UI proof do not apply. The source lock is fresh. Exact-SHA publication scan was not run in this cloud: commit=42a73be3d12eb6bb7a5c47354b8de27356c154ff complete=unestablished historyScanned=unestablished findings=unestablished. The guarded lander must establish COMPLETE and 0 findings before landing. No scan result is invented.

## CI, custody and remaining scope

Main at initial inspection: 88c586f6fabdaed6768ddc8072af2340310a7ace. Exact-main push Verify 43271045004 and Run site 43271045029 were completed success. Prior exact-main Verify 43267819913 was also success. No main-red repair was needed.

Candidate push Verify: 43274367413, push event, exact head 42a73be3d12eb6bb7a5c47354b8de27356c154ff. Initial discovery was in_progress; the completed run is failure solely because build job 131378852554 failed node src/base/contract-docs.mjs check with “ACCEPTANCE.md: generated content differs; run contract-docs write.” Prepare job 131378852639 succeeded. Runtime shards skipped because the shared build stopped; aggregate job 131379222427 failed its dependency requirement. Failed logs were read once for each failed job, successfully, and relevant actual excerpts are in ci-failure-receipt.txt. This is the brief’s permitted generated-view exception for readiness, not an ordinary green run or a CI runtime pass. Total GitHub budget use: six calls, counting each failed-job archive invocation once. There was no dispatch or rerun. API observations obey the five-minute interval, one watcher and ten-call budget. Any generated-view-only failure is recorded as the explicit permitted exception, not a runtime pass.

GAP STARTUP-001: Remaining required and conditional binding matrices, optional runner and watch configuration, scheduled and local app and preview and setup and deployment and private-runner diagnostics, missing ASSETS, D1 readiness and stalled-operation faults, the owner-approved three-second readiness budget, console, hosted and provider qualification remain owed. Existing SESSION_SECRET, private-runner, Worker UPTIME_ORIGIN, MAIL_API_KEY and MAIL_RELAY_URL qualifications retain their exact limits. Protected production helpers, retained heartbeat and TLS protections, all queue entries, continuation holds and account and device and sibling and Platform duties are unchanged.

Plan row changed in this report only: STARTUP-001 gains bounded MAIL_FROM missing, malformed and correction proof; status remains PARTIAL to PARTIAL with no count effect. The supplied extract names no next unblocked clause touching these files. Publication scan, generated-view commits, independent gate, guarded landing and candidate Run site remain fleet duties. There is no blocker to the selected proof or product branch publication.

Evidence publication is separate from product readiness. Explicit non-secret packet selections are published only to refs/heads/evidence/sd-uptime-c-f165 using cloud_evidence.py. No report or receipt is in the product branch. The exact evidence ref and head appear in the terminal handoff.

CLAIM STARTUP-001 PARTIAL points=1,2 tests=tests/startup-mail-sender-support.mjs#proveMailSenderStartup

Final local validation: all selected checks passed on 42a73be3d12eb6bb7a5c47354b8de27356c154ff, including the registered public-path script. Readiness uses only the explicit generated-view exception. Main still differs from this candidate; no landing, scan completion or candidate Run site success is asserted.

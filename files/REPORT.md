# sd-uptime-c-f161 report

Product repository: just-every/run-uptime
Product branch: cloud/sd-uptime-c-f161
Candidate: 9455da9f9f03b90d15d09814886a256b8faff207
Starting main: ed5429192d18503c4c8caa8d797d82ffdcc78f54
PR: none; push Verify is the existing pre-main entry point.

STARTUP-001 remains PARTIAL to PARTIAL. Only the two leased MAIL_API_KEY cases and their corrected restart outcomes are qualified. No clause is promoted. Current-main counts are 37 DONE, 58 PARTIAL, 20 MISSING across 115 clauses before and after; the supplied historical extract's 35, 60, 20 counts are not substituted for current main. All 47 current journey commands remain, with one additional helper invocation inside the existing public-path command and no extra journey registration.

## Plan and results

The full execution plan is in PLAN.md. Steps 1 through 8 completed: launcher, identity, hook and toolchain setup; inspection; isolated proof implementation; actual emitted Worker build; registered journey, typecheck and structural checks; documented generator proof with generated files restored; source lock regeneration and exact-head check; branch publication and exact-head CI discovery. Step 9 records and publishes this separate evidence packet. The product push succeeded on its first attempt and its advertised remote head matches this candidate. No force push, main write or PR was made. The product checkout was clean after the commit.

The sole plan row changed by this run is STARTUP-001's bounded MAIL_API_KEY qualification. No Mac plan, queue, Status, Gap or Evidence cell was edited. The clause Requirement now states the semantics already implemented by the conditional configuration validator and Worker guard. Acceptance points are byte-for-byte unchanged. Product changes are exactly CONTRACT.md, tests/public-paths.mjs, tests/startup-rer-mail-key-support.mjs and generated sources.lock.json. Production source, protected files, shared runtime and authentication helpers, workflows, pins and all existing assertions remain unchanged. Removing the new import and its single await from public-paths reproduces the original file byte-for-byte.

The helper creates an independent temporary installation, applies all real SQL migrations through D1, and uses the unchanged runtime-directory, authentication and SQL-parser helpers. Its transport envelope invokes the actual emitted Worker. Request URL and Host are independent constants, not built from the binding under test. Every unrelated supplied binding is valid and synthetic. Native owner bootstrap populates permanent admission and session custody, native signed enrollment provides valid runner authority, and a completed inert notification-custody fixture supplies retained custody to preserve.

For each of independently missing MAIL_API_KEY and an internal-whitespace planted synthetic value, GET /health and an otherwise-valid authenticated POST /api/runner/claim return 503 naming MAIL_API_KEY. Each response is no-store and excludes raw and common encoded supplied values. Captured runtime diagnostics also exclude the values. Each refused request preserves every one of the 225 readable durable tables and its schema and rows, including public and authentication admission, session custody, notification custody, and SQLite sequence state. The only excluded table is D1's platform-owned _cf_METADATA, whose access is prohibited by D1; no application table is excluded. An independent Worker outbound observer records zero requests.

Each correction restores only the valid synthetic mail key and restarts with the same D1 persistence. The restart itself preserves every table. Health returns 200, the native authenticated claim returns 200 with task null and durable runner contact, and no mail, monitor, slot or notification work is created. Only the expected public admission and runner contact tables may change on the successful requests; all other durable tables stay exact. Runtime stdout records the two PROBE lines and an actual JSON receipt with each case, diagnostic, count and outcome.

## Acceptance and inherited-duty proof matrix

| Item | Result on this candidate | Public-door proof |
| --- | --- | --- |
| Acceptance 1: required and conditional configuration diagnostics at each entry point | SELECTED SCOPE PASS; complete sentence remains PARTIAL | tests/startup-rer-mail-key-support.mjs proveRerMailKeyStartup, lines 16–66 and 87–99: missing and malformed MAIL_API_KEY only, four real Worker refusals, value-free captured output, zero outbound requests and exact table preservation. Registered once in tests/public-paths.mjs, lines 9–11. |
| Acceptance 2: correction and recovery, D1 and ASSETS faults within three seconds | SELECTED RECOVERY PASS; fault and timing remainder unproved | Same helper, lines 100–110: same-persistence restart, health 200, authenticated idle claim and durable contact, unrelated state and zero outbound work preserved. No fault-response timing claim is made. |
| BASE-SECRET-002 receiving duty | INSPECTED receiving citation at CONTRACT.md line 93; selected runtime scope PASS | Existing required Worker guard is exercised for the conditional rer mail key. Broader entry-point matrix stays owed. |
| BASE-OPS-001 receiving duty and RL-2 replacement | INSPECTED receiving citation and three-second replacement unchanged; selected health recovery PASS | Health 503 then 200 is exercised; hosted latency, D1 and ASSETS fault budget is not claimed. |

The exact committed candidate ran node tests/public-paths.mjs under pinned Node 22.20.0 and exited 0. RUNTIME_RECEIPT.json binds the command, completion, output hash, cases and captured diagnostics to 9455da9f9f03b90d15d09814886a256b8faff207; PUBLIC_PATHS.log is the complete non-secret command output. The existing public-path assertions passed, including the original SESSION_SECRET refusal and repair. Push Verify run 43242327918 is recorded separately in CI_RECEIPT.json when its observed state is available; local success is not described as CI success.

## DONE-RIDERS review

1. PARTIAL: the selected outcomes pass, but other outcomes in both full acceptance sentences remain unproved. No DONE claim.
2. PASS for the leased scope: real populated admission and custody; unsafe requests refused unchanged and supported corrected claims succeed idle, helper lines 68–110.
3. RECORDED EXPECTED EXCEPTION: helper is mounted once in the existing push-selected public-path journey. Exact-SHA push Verify 43242327918 completed with failure only at the generated ACCEPTANCE.md freshness check, causing dependent shard skips and the aggregate failure. No green workflow or CI execution of the helper is claimed. Local exact-SHA registered proof passed. CI_RECEIPT.json contains the observed jobs and failure.
4. PASS local exact candidate: the registered command ran on 9455da9f9f03b90d15d09814886a256b8faff207, with its receipt. No production or test edits followed.
5. INSPECTED: STARTUP-001 cites BASE-SECRET-002 and BASE-OPS-001 in the existing receiving meta line at CONTRACT.md line 93; no inherited duty is silently promoted.
6. PASS local generation: documented write then check exit 0, zero prose errors or warnings. Generated views restored whole from main and not committed, so stale-view check is expected on the branch. Current Status, Gap and Evidence cells remain exactly main's; the guarded lander owns future judgments and views.
7. PASS INSPECTED: no acceptance change, rewrite, ID change, coverage reduction or new acceptance point.
8. PASS for this scope: real signed runner enrollment and authenticated corrected idle claims; configuration refusals preserve all authority and custody. Existing revocation, erasure and replay assertions remain unchanged; this round introduces no new authority operation.
9. PASS boundary: no provider-account, delivery, recipient, legal, hosted or capacity qualification claimed. Synthetic settings only, zero outgoing requests.
10. NOT APPLICABLE: no new policy default or ruling needed; current deny-before-work behavior is unchanged.
11. PENDING guarded landing: main equality, full-history publication scan and candidate Run site are not claimed. The guarded lander owns these gates.

## Pre-ready checks

Selected refusal and corrected outcomes are exercised through real routes and would fail when the outcome is wrong. No old assertion was removed, narrowed, skipped or hidden behind a condition. Authority, erasure and replay behavior is unchanged; every durable table is compared on refusal. There are no UI changes or touched screens, so the screen-specific browser rule does not apply. The source lock is fresh. Generated views are intentionally main's versions. Publication scanning is not available in this cloud route and remains a lander duty: commit=9455da9f9f03b90d15d09814886a256b8faff207, complete=not-run, historyScanned=not-run, findings=not-established. This is not a zero-findings claim. No email-shaped string was added to fixtures or clause prose. No provider-shaped key was introduced.

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock then check exit=0; views=node src/base/contract-docs.mjs write then check exit=0, followed by required restoration from main; ledger=none exit=0 (no migration edited).

PROBE STARTUP-001 acceptance-1: emitted Worker with MAIL_PROVIDER rer, MAIL_API_KEY omitted then internal-whitespace planted value; independent health and authenticated native runner claim -> four 503 responses naming MAIL_API_KEY, value-free responses and captured diagnostics, zero outbound requests, all 225 readable durable tables unchanged.
PROBE STARTUP-001 acceptance-2: valid synthetic MAIL_API_KEY restored and Worker restarted on identical persistence after each case -> health 200 and authenticated claim 200 with task null and durable contact, zero mail or target work.

CLAIM STARTUP-001 PARTIAL points=1,2 tests=tests/startup-rer-mail-key-support.mjs#proveRerMailKeyStartup; tests/public-paths.mjs#registered public-path journey
GAP STARTUP-001: only the leased MAIL_API_KEY refusal and corrected restart subcases are qualified; the rest of the required and conditional binding matrix, optional runner and watch configuration, scheduled, local-app, preview, setup, deployment and other private-runner diagnostics, missing ASSETS, D1 readiness and stalled-operation cases, three-second fault budget, console, hosted and provider qualification remain owed. Existing private-runner and Worker-origin campaign limits and all account, device, sibling and Platform holds remain. No next unblocked clause touching these files is named.

## Custody and publication

PUSH_RECEIPT.json records product branch custody. Main at inspection had successful push Verify 43226883415 and 43224554437 and Run site 43224554366, all at ed5429192d18503c4c8caa8d797d82ffdcc78f54; these are not candidate results. The candidate's separate run is 43242327918. A verified full-history product bundle is retained outside the checkout at the task work directory before clone removal. Bundle custody is recovery data, not readiness or landing evidence. The explicit packet selections are reports and actual non-secret receipts and logs; no key files, settings, environment dumps, symlinks, private gate material or generated product views are selected. Evidence publication goes only to evidence/sd-uptime-c-f161 and cannot signal product acceptance.

## Final CI and handoff

Exact-SHA push Verify 43242327918 completed with conclusion failure. Build job 131265922832 passed the source-lock check and failed only `node src/base/contract-docs.mjs check`: `ACCEPTANCE.md: generated content differs; run contract-docs write.` Prepare job 131265922758 passed; plan passed; shards were skipped. Aggregate job 131266296020 failed because build failed. The failed log archive was read once for each failed job with the mandated gh run view commands, both exit 0; only relevant non-secret assertion excerpts are included in this packet, with no CI environment listing. The same restored-view check reproduced locally with exit 1. Generator write then check had both exited 0 before the required restoration from main. No view file is committed, no workflow was edited and no rerun was requested.

This is exactly the generated-view-only exception the cloud brief permits for READY. The maintained lander must generate and commit the views from the merged contract, rerun exact-SHA Verify, complete publication scanning from full history and validate Run site. There is no product or account blocker for this selected scope. No complete STARTUP-001 DONE claim, CI-green claim, publication-scan pass, provider qualification or landing claim is made. GitHub budget used: 6 of 10 calls. Product READY custody is separate from evidence transport.

The initial evidence transfer was fetched by exact ref and head and all manifest entries, byte counts and hashes verified. EVIDENCE_RETURN_RECEIPT.json records that initial report snapshot; this complete packet also includes BUNDLE_RECEIPT.json for the separately retained product bundle. The terminal EVIDENCE line identifies the final packet snapshot.

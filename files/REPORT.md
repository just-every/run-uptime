# Readable check details and erasure receipts

Repository: just-every/run-uptime
Tag: main-uptime-readable-details-1-c1
Branch: cloud/main-uptime-readable-details-1-c1
Candidate: f4f3a25390b2a931737e286ce4e777ef68ed0b34
Base: 8529deda750510402236ece09a9ab91f934a3231
PR: none; fleet branch landing protocol applies.

## Plan and implementation
The full execution plan is PLAN.md. Inspected current contributor/contract guidance and the original branch's d0ff7f539fd16f8e032c4d5c0539ff27a7c1ec7d and 4487112e58139713fb0bf4fb482de68778588d3d. Carried their combined product/test changes onto current main as one commit. All nine changed product/test files applied cleanly with a three-way application. Current main's other tests and contract text were retained. Regenerated sources.lock.json with the documented tool; no generated acceptance/claim views were committed. The final candidate has no CI-skip marker.

Full check details now describes each monitor kind through the existing readable rule renderers. Heartbeats show their period/grace/deadline/run rules and current textual evidence, without an HTTP status assertion. The raw JSON disclosure is removed. Unavailable reads propagate Unknown into full details. API definitions and exports retain their raw content.

Expanded monitor-erasure receipts retain the human ER reference and completion time. Counts are grouped by what was erased, such as settings, check results, incidents, alerts, job reports and imported files. Each stored count contributes once. UUIDs and table/authority names are absent from the person-facing receipt. Downloaded receipts, stored rows and later backups remain unchanged.

## Local validation
Passed: pnpm typecheck; npx -y @runeditrun/rer build; node scripts/edition-authoring/cli.mjs check; node src/base/contract-docs.mjs check; git diff --check.
Passed touched journeys:
- node tests/signed-runner.mjs: real signed runner lifecycle and heartbeat console.
- node tests/browser-suites.mjs: existing operator and recovery browser journeys, including provePlainMonitorEvidence and proveReadableMaintenanceAndErasure.
- node tests/operator-security.mjs: retained confirmation through second-factor renewal, erasure counts, exact stored receipt and later backup.
Browser launch used /usr/bin/chromium with --no-sandbox, real HOME and fresh contexts. Owned browser/runtime processes were closed by their harnesses.

Counts: 47 public-door journey registrations before and after; zero new registrations. The existing helper assertions were extended. Contract summary remains 37 done / 58 partial / 20 missing / 115 total. No clause Status, Gap or Evidence cells changed.
Scope: stranger items 2 and 3 only. No API/storage/export changes or other stranger findings.

## Previous Verify
Verify 43562712656 lists failed shards (push-8), job 132349931190, at "Run this shard"; push-6 was cancelled. The aggregate verify job consequently failed. Both the requested whole-run log-failed command and the once-per-job log-failed command exited 0 with zero bytes. The actual empty files and jobs response are included. The available transport output cannot identify the failed assertion, so this report does not label it a known main flake. The touched local journeys all pass on the new candidate.

## Claims
CLAIM INTERFACE-001 PARTIAL points=1 tests=tests/readable-maintenance-erasure-support.mjs#proveReadableMaintenanceAndErasure; tests/heartbeat-console-support.mjs#proveHeartbeatConsole; tests/plain-monitor-text-support.mjs#provePlainMonitorEvidence
CLAIM ERASURE-001 PARTIAL points=2 tests=tests/readable-maintenance-erasure-support.mjs#proveReadableMaintenanceAndErasure; tests/monitor-stepup-support.mjs#proveImportEraseStepUp
GAP INTERFACE-001: This scoped round does not establish all monitor states, all access paths or a human screen-reader pass.
GAP ERASURE-001: This scoped round proves readable monitor receipts and retained storage/export content, not every supported entity or concurrency/restore obligation.
DEFAULT INTERFACE-001: Use the shipped polish essentials; no unprovided ruling was needed.

## Publication and custody
Only the named cloud product branch was pushed, using the fleet push guard. Fleet author/committer identity and all candidate trailers were checked; no co-author trailers remain. No main/default branch or published history was changed. Evidence is published separately, with explicit regular-file selection, under refs/heads/evidence/main-uptime-readable-details-1-c1.

The full Base publication scan is a Mac landing gate unavailable in this cloud task, as stated in its cloud adaptation. This report makes no landing, hosted acceptance or release claim. Exact-SHA branch CI status and browser proof receipts accompany this report.

## Browser proof
The public-door probe loaded current main versions of only the two changed browser modules to reproduce both findings, then loaded the exact candidate assets in a fresh context. Before: raw heartbeat JSON with status 200, stored receipt UUID and internal labels were visible. After: all three were absent. Assertions ran at 1440 with zero axe violations; the changed screens were captured and visually inspected at 1440 and 390. The 42 stored inventory entries were represented by two nonzero categories (4 records total) for this synthetic erasure. The original downloaded receipt equals the server response, and its clipboard reference matches the display. See public-door-before-after.json, readable-receipts.json and the four selected screenshots.

## Exact-SHA CI
Verify 43596225498 completed/success on the exact candidate f4f3a25390b2a931737e286ce4e777ef68ed0b34: https://github.com/just-every/run-uptime/actions/runs/43596225498 . See ci-status.json and ci-watcher-receipt.json. Nine of ten allowed GitHub invocations were used, including prior-run diagnostics and one empty discovery for a mistyped SHA; only the correctly queried full candidate SHA was used as verification evidence. No workflow was dispatched or rerun. No current blocker remains. The independent Mac publication/landing gates remain in force.

READY branch=cloud/main-uptime-readable-details-1-c1 head=f4f3a25390b2a931737e286ce4e777ef68ed0b34

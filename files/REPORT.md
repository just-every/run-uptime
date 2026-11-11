# Uptime plain monitor text carry — main-uptime-plain-monitor-text-1-c1

Repository: just-every/run-uptime
Branch: cloud/main-uptime-plain-monitor-text-1-c1
Candidate head: 1b74086c760398d8ec3a7fffa13985210c0191fc
Published plain-text base: 15581293dc4be4e079132f70a2d1bdad3aa44274
Merged main: 3caf61f087a59a0cc009f1eb1c87077be0eb985b (Uptime 0.5.5)
First candidate: 608dbd06c73a9f4464b39117c52e7ff2b7934d3d
First Verify: 43012005901 — failed in push-5 at the post-restart security credential row; build, prepare and seven shards passed.
Final exact-SHA Verify: 43015884796 — completed/success on 1b74086c760398d8ec3a7fffa13985210c0191fc; https://github.com/just-every/run-uptime/actions/runs/43015884796.
PR: none; the repository accepts the named branch candidate for fleet landing.

## Result and plan

The full plan is in PLAN.md. Created the requested branch at the published plain-text head, merged current main without rebasing published work, and preserved the original readable location names, measured-versus-expected statuses, labeled details and closed Raw data disclosures across monitor, import preview, incident, report and snapshot screens. Main's newer second-factor and heartbeat console work remains intact.

The first merge conflicted only in sources.lock.json. Exact-SHA Verify then reproduced the security timeout the brief identified. The security-controls product markup and test were identical to main, so no product card was changed. Added a four-line test stabilization: after restarting its Worker, the cold security browser starts in a fresh asset minute. This follows the existing operator-browser convention and prevents the restart test from competing with its own preceding cold loads against the persisted public asset bucket. The original session, credential, exact stopped job, 20-of-21 count, stopped text, revocation refusal, MFA/member authority and accessibility assertions are unchanged. No limits or stored counters are changed. DIAGNOSIS.md separates direct observations from the asset-budget hypothesis; the failed attempt did not capture HTTP response statuses, so a 429 is not claimed as directly observed.

Before the next push, fetched and merged main's 0.5.5 release. Retained both main's full release notes and this round's existing Unreleased entry. Resolved the generated source lock by regeneration. CONTRACT.md had no conflict or changes. Ran contract write/check, restored ACCEPTANCE.md and docs/CLAIMS.md whole from main, regenerated the lock last, and passed its check. The second merge contains only the release integration and the necessary security-test wait. No new feature, contract judgment, generated-view commit, test registration, screenshot or proof file was added to the product branch.

Both commits were published through cloud-push.py, each on the first attempt, after checking all candidate author/committer identities and trailers, including side parents. Every candidate identity is the fleet identity; all trailers are absent. The final head has no skip marker. origin/main was fetched and merged again immediately before the final push and was unchanged. REMOTE.txt verifies the remote branch's full SHA. No main/default ref or published history was rewritten.

## Local checks and browser proof

- Fleet toolchain setup and rer setup passed with the fleet owner. Both candidate builds passed, using the repository-selected Node 22 runtime; direct checks used supported Node 24 and pinned pnpm 10.12.4.
- Both application/runner typechecks passed. Contract generator write/check and source lock/check passed for both merges; generated views were restored from main.
- The complete tests/operator-security.mjs passed on the final candidate without instrumentation, including the restarted credential/job check. Initial local failure and two diagnostic passes on the first candidate are retained. An extra standalone minute-aligned probe did not finish Worker initialization and was stopped using only its recorded PIDs; it produced no assertion result. It is not treated as a passing test.
- tests/browser-suites.mjs passed on the first candidate, and the final candidate's capture run also passed. These include the operator journey's 13 accessibility/reflow checks, CSV paste/upload preview-and-apply equivalence, immutable incident expectations after a rule edit, labeled details with closed/reachable support JSON, named report locations, the one phone smoke and the recovery suite.
- tests/signed-runner.mjs passed on the first merged candidate, including main's heartbeat console creation/copy/check-in/signed-evaluation and revision-isolation proof. The later source change is confined to the security test and release metadata.
- The first tests/failure-page-journey.mjs attempt could not launch its isolated screenshot child because the pinned Playwright executable was absent. A VM-only path adapter invokes /usr/bin/chromium --no-sandbox for that child. The full journey then passed twice on the first candidate; the final capture run's receipt is retained separately. No product browser logic was changed. Its real owner doors still assert masked stored headers/pixels, scoped member reads, complete downloads, archive/erasure, revocation and tightened redaction.

Capture used a task-local Node loader, without editing the product tree or changing behavioral assertions. Assertions run at 1440; changed monitor, preview, saved-check evidence, details, report, incident and failure-snapshot sections are captured at 1440 and 390. Capture receipts identify the final head and selected file hashes. Internal-text measurements report zero matches and no overflow in all ten measured screen/width combinations per complete monitor capture. Raw support data remains both initially closed and reachable. The retained snapshot image is redacted. Security-enrollment diagnostic screenshots, local settings, session material, archives and environment files are unselected.

## Counts and claims

The original round reported visible internal-text leaks 3 -> 0. This carry did not replay that historical baseline; its measured current result is still 0. Contract status-table counts remain done 37 -> 37, partial 58 -> 58 and missing 20 -> 20. No clause Status, Gap or Evidence changes were made. The push-plan inventory remains 47 public-door entrypoints with 12 explicit node:test registrations across ten scripts (49 entry-level counted tests when those scripts are expanded). This is an entrypoint inventory, not a total of inherited Base assertions. No registrations or skips were added or removed; the carry does not increase the 200-test cap.

CLAIM INTERFACE-001 PARTIAL points=1 tests=tests/plain-monitor-text-support.mjs#provePlainMonitorEvidence; tests/operator-browser.mjs#bulkAddDoor
CLAIM EVIDENCE-002 PARTIAL points=1 tests=tests/failure-page-journey.mjs#owners capture safe failure pages, share only monitor evidence, export every artifact and revoke access
CLAIM MONITOR-001 PARTIAL points=none tests=tests/import-paste-browser-support.mjs#provePasteImport

DEFAULT INTERFACE-001: Carry the original partial claim and retain main's newer judgments; make no DONE claim.
GAP INTERFACE-001: This round proves the requested plain-text screens, not every interface acceptance point.
DEFAULT EVIDENCE-002: Carry point 1 as PARTIAL evidence while leaving main's existing done judgment unchanged for the lander.
GAP MONITOR-001: Paste/import proof does not establish the whole catalog clause; retain points=none.

## CI and custody

The first run was polled with one REST watcher, at least 300 seconds between observations. Read its failed-shard archive exactly once after completion. Seven GitHub calls were used through that diagnosis. To preserve the remaining three-call budget, the next exact-SHA run is discovered after allowing its longer shards to finish. No workflow was dispatched or rerun. Eight total GitHub calls were used. Final CI identity and completed/success conclusion are recorded in CI.json; older failure provenance remains in CI-first-candidate.json, CI-jobs.json and CI-push-5-failed.log.

Evidence publication is separate from product READY. Explicitly selected reports, actual receipts, logs and redacted paired captures go only to evidence/main-uptime-plain-monitor-text-1-c1. The fleet Mac owns its publication scan, main landing and any required main workflows; the cloud cannot run or waive those gates. Terminal product and evidence SHAs are independent. The clone is deleted only after successful product custody, evidence return and provenance preservation.

Terminal result: READY on 1b74086c760398d8ec3a7fffa13985210c0191fc after exact-SHA Verify 43015884796 passed. No remaining product or CI blockers. The prior security restart failure is cleared by the passing final run. Product branch and evidence ref remain separate; main landing and the Mac publication scan remain fleet-owned.

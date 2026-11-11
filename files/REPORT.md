# Uptime period report carry-forward

Repository: just-every/run-uptime
Task: main-uptime-period-report-1-c1
Product branch: cloud/main-uptime-period-report-1-c1
Starting published head: 29325cbd849cc16324e302f6bac83425192f813e
Initial main: 65953b2 (full identity recorded in receipt)

## Plan

1. Initialize fleet identity, decrypted-bundle Git helper, publication hooks and the task evidence transport outside the product tree.
2. Clone the declared repository with full commit history and filtered blobs. Read its contributor guidance and the relevant contract and acceptance text.
3. Confirm main contains a browser installation fix newer than 11 November 2026 14:00 UTC. Start the named branch at the original published report head and merge current main, preserving main's newer tests and contract judgments. Never modify the original branch, rebase published work, or force push.
4. Regenerate the source lock last and check it. Keep generated acceptance views equal to main. Add no tests or product features.
5. Commit the merge with fleet author and committer and active cleanup hooks. Set up the pinned toolchain and run the changed browser journeys plus typecheck; capture the report screen once at 1440 and 390. Retain actual non-secret logs and proof outside the product checkout.
6. Fetch/merge main before publication if it has moved, recheck affected work, and inspect every candidate commit including side parents for identity and trailers. Push only the named branch through cloud-push.py.
7. Discover exact-SHA Verify with GitHub REST and poll no more than once per 300 seconds per run. Keep the ten-call API budget. If a shard fails, read its failed-job archive once and rerun failed jobs once; fix only a repeated failure within this round's scope.
8. Record product provenance, test and clause counts, browser measurements, CI identity/conclusion and limitations in the packet. Publish the complete explicitly selected packet only to evidence/main-uptime-period-report-1-c1. Delete a fully pushed clone after preserving provenance, retaining any unpushed recovery data.

## Initial findings

Main contains the requested browser-library install fix. Commits 541d7093f5471d9c208c05d7423e1093263e7059 (2026-11-11 16:37:16 UTC) and 88fc3dec2d874764aace8d21467aa4847373b2ac (2026-11-11 16:49:27 UTC) modify scripts/install-chromium-deps.py. The existing `Install browsers and probe bundled engines` workflow step calls .github/scripts/install-browsers.sh, which invokes that installer when the Chromium launch probe fails. Main probes signed Ubuntu mirrors and includes independent kernel.org and Leaseweb fallbacks; package signature verification remains enabled.

The original head changes only the monitor/report UI, the existing plain-monitor support journey and source lock: generated reports open in a dedicated wide view, back navigation restores monitor controls, downloads retain their snapshot, and durations show one readable form.

The merge completed automatically, including sources.lock.json. No CONTRACT.md conflict or clause edit was needed. Main's security browser restart changes and newer release files were retained.

## Claim

CLAIM REPORT-001 PARTIAL points=none tests=tests/plain-monitor-text-support.mjs#provePeriodReport

No clause status, Gap or Evidence judgment is changed. The inherited partial REPORT-001 judgment remains. Existing wider gaps (other-incumbent history and service charts, among others) are outside this merge-only round.

## Publication boundary

The cloud cannot run the fleet Mac's Base publication scan. This is the brief's explicit cloud adaptation; the fleet must run its publication gate before landing. This task performs local diff/identity hygiene and exact-SHA Verify. Evidence publication is report transport only and never product READY, acceptance or landing.

## Local preparation and counts

The merge commit is 7f07c2c0584c32be2d3c0a848bc23e827832825d, with parents 29325cbd849cc16324e302f6bac83425192f813e and 65953b2f1288fb5010f17391761abeee16923793. The generated views and CONTRACT.md exactly equal main; source-lock regeneration produced the expected combined lock and its integrity check passed.

The checkout setup completed successfully through cloud_run with the requested fleet owner email. It installed dependencies, built the application and initialized isolated local settings/data. Its raw output remains private and is not selected for evidence. Node 22.20.0 (the runtime rer installed) was explicitly selected for the touched checks.

Typecheck passed: `pnpm run typecheck` under cloud_run, both console and runner TypeScript projects.

Contract judgment counts before/after, relative to merged main: 115 clauses, 37 done → 37 done, 58 partial → 58 partial, 20 missing → 20 missing. REPORT-001 is partial → partial. The standard verification plan has 47 existing journey entrypoints before and after; no registrations were added or removed. That entrypoint total is not an assertion-level recount.

Browser proof enables only the existing UPTIME_SCREENSHOTS option in the operator child using a small launcher-side environment-forwarding shim outside the repository. It does not alter application code, routes, fixtures, assertions or timeouts. The real journey asserts at its existing 1440 width and captures the changed report once at 1440 and 390.

## Product publication

The final pre-push `git fetch origin main` found no movement: main remained 65953b2f1288fb5010f17391761abeee16923793, already merged. Both candidate commits (including side parents) passed the fleet identity/trailer inspection. The branch was pushed successfully on the guard's first attempt; no force push or history rewrite was used. No PR was required by this repository's documented rules and none was created.

Exact-SHA Verify run: 43104662381, https://github.com/just-every/run-uptime/actions/runs/43104662381. Discovery confirmed head_sha 7f07c2c0584c32be2d3c0a848bc23e827832825d. Its final result is recorded in ci-receipt.json when complete. A single watcher uses the REST endpoints and at least 300 seconds between observations.

The operator journey passed, including provePeriodReport's real scheduled incident, measured samples, selected period, wide dedicated view, one numerical duration form, polling-stable snapshot, exact JSON snapshot download, CSV duration consistency, PDF download, accessibility, and return to monitor controls. The surrounding existing operator flow also passed its desktop audits and single 390 phone smoke. The security journey passed its API/CLI, Chromium CTAP2 and destination step-up flow with main's asset-window restart fix.

The report's content width is 1070 px at viewport 1440 and 320 px at viewport 390. documentWidth equals viewport at both sizes. The report is outside the monitor side column at both sizes and neither capture contains doubled durations. Both captures were visually reviewed and show the dedicated report, single readable duration units and fitting phone layout.

The complete existing browser-suites wrapper also passed, including the recovery journey. Its actual JSON receipts are retained as browser-suites-receipt.json, operator-browser-receipt.json and recovery-browser-receipt.json. The wrapper stopped its owned runtime groups and removed temporary grant/state. No full local verify was run, as required; branch CI supplies the full verification wall.

No new feature, contract judgment, generated acceptance view, test registration, evidence file or screenshot was committed on the product branch. The original report branch was not changed.

## Final CI and result

Verify run 43104662381 completed successfully on exact head 7f07c2c0584c32be2d3c0a848bc23e827832825d: https://github.com/just-every/run-uptime/actions/runs/43104662381. No failed-job rerun, fixup commit, force push, workflow dispatch, PR, or main/default-branch push was needed. The single CI watcher made 4 REST reads, with at least 300 seconds between reads for this run. Actual discovery, observations, final receipt and watcher log are included in this packet.

Product custody: branch cloud/main-uptime-period-report-1-c1 was pushed at 7f07c2c0584c32be2d3c0a848bc23e827832825d; the tree remained clean after all local checks. Its original report commit is an ancestor, and merged main includes the hosted-runner browser-library fix. There were no new product edits beyond that merge and no clause status changes. The original branch cloud/main-uptime-period-report-1 was not changed.

CLAIM REPORT-001 PARTIAL points=none tests=tests/plain-monitor-text-support.mjs#provePeriodReport

Blockers: none for this cloud candidate. The fleet's independent publication scan and landing gates remain required on its own machine; this cloud does not waive them or push main. No hosted provider receipt or new acceptance/DONE judgment is claimed.

Return protocol: publish this explicitly selected complete non-secret packet through cloud_evidence.py to refs/heads/evidence/main-uptime-period-report-1-c1 only. Evidence is report transport and is separate from product readiness. The terminal message supplies the exact evidence ref/head. After successful evidence publication, delete the fully pushed clone; retain this packet and all report/receipt files outside it.

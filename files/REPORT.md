# Uptime rer 0.2.113 adoption

Repository: just-every/run-uptime
Tag and branch: main-uptime-rer-0213-1; cloud/main-uptime-rer-0213-1
Final head: 83b2f2692149c9171a12cba0d7397734a1e8096b
Current recorded main: 04016399e1e879e7be3b8e891baf02d975bb3901
PR: none; this seed requires branch Verify and fleet landing, with no PR requirement.

## Plan and completed implementation
1. Refresh the fleet launcher and install its decrypted-bundle Git helper, cloud push guard and commit-message hooks. Clone only the declared product repository.
2. Pin @runeditrun/rer exactly from 0.2.108 to 0.2.113 with pnpm; update the lockfile resolution and integrity.
3. Run rer refresh-base --ref c2efb501cbc148c2aee4d5e1107ebdba81469006 --from-api. Preserve acknowledged seed adaptations and refresh only required shared Base modules, guides and records.
4. Align with origin/main without rewriting published history; regenerate sources.lock.json last and check it.
5. Run Base integrity, first-party structure, typecheck and affected public-door tests, and confirm that fresh rer dev reaches a real healthy listener.
6. Inspect all candidate commit authors, committers and messages and push only the named cloud branch with the fleet guard.
7. Read exact-SHA Verify through one REST watcher at intervals of at least 300 seconds; fix the refresh's obsolete copy assertion by testing executable guidance and the retained second-factor gate. Rerun the full affected command journey, commit the compatibility fix, and push the new exact candidate.
8. Return complete non-secret reports and actual receipts through the separate evidence ref, then remove successful checkouts. Fleet landing and full publication scan remain fleet-owned.

## Final scope
The rer pin and Base refresh are adopted. Required refresh files include shared agent-door, business-settings, D1 transport, authentication and run-site code plus shared guides, base-copies.json and sources.lock.json.
The only seed test change replaces an obsolete assertion requiring literal RER_OPEN wording in the refreshed sign-in gate. It now executes the displayed CLI command, follows its installation-local handoff, proves the enrolled second factor is still required, completes that factor through public endpoints and checks the resulting native owner identity. Its existing unsigned refusal, pending invitation, non-delivery and account-picker assertions remain.
No application-specific product code, custom copy, CONTRACT.md Status/Gap/Evidence cells or generated acceptance views changed. No seed test registration was added, removed or skipped; no user-flow assertion was weakened.

Preserved seed adaptation: .github/workflows/verify.yml, byte-identical.
Preserved seed adaptation: src/base/lobby.ts, byte-identical despite upstream changes, as instructed.
No DIVERGENCE.md exists; base-copies.json declares those adaptations.

Counts before -> after: Core 37 done / 47 partial / 11 missing -> unchanged (95); Agent surface 0 / 11 / 8 -> unchanged (19); Later 0 / 0 / 1 -> unchanged (1); full target 37 done / 58 partial / 20 missing -> unchanged (115).
No DONE or PARTIAL clause completion claim is made. No release or deployment was performed.

## Local validation
- node scripts/edition-authoring/cli.mjs verify-base --offline: PASS. The successful refresh independently acquired immutable API provenance and checked blob identities; the offline check checks local SHA-256 and modes against the refreshed record.
- pnpm exec rer check --profile first-party: PASS.
- pnpm run typecheck: PASS, application and runner.
- node scripts/edition-authoring/cli.mjs lock then check: PASS; source lock regenerated after intentional edits and main alignment.
- cloud_run node tests/roster-erasure.mjs, Node 22.20.0: PASS, 10.11 s.
- cloud_run node tests/operator-security.mjs, Node 22.20.0: PASS, 115.35 s. Chromium was /usr/bin/chromium with --no-sandbox and the real HOME.
- Full affected cloud_run node tests/command-journey.mjs: PASS, including the executable handoff, enrolled-factor refusal/proof, invitation truth, process teardown and archive/reset/restore phases. No full local rer verify ran.
- Agent-door compatibility journey on the final head: {"browser": "/usr/bin/chromium", "browser_config": "Both UPTIME_BROWSER_EXECUTABLE and PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH name the installed real Chromium", "command": "cloud_run node tests/agent-door.mjs", "completed_at": "2026-11-13T16:36:30.249731+00:00", "exit": 0, "head": "83b2f2692149c9171a12cba0d7397734a1e8096b", "node": "22.20.0", "seconds": 509.53}. An earlier local attempt stopped only because that helper uses PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH rather than the other helpers' UPTIME_BROWSER_EXECUTABLE; both were set to /usr/bin/chromium for the replay. No repository change was made for this environment configuration.
- Final-head fresh dev launch in a clean detached worktree: RER_READY http://127.0.0.1:8787 after 87.16 s; independent /health HTTP 200 status=ok. It shut down gracefully by its recorded manager PID, and app/site listeners closed. The first pushed product tree separately passed in 79.6 s. Both actual receipts are retained.
- Staged diff whitespace/credential-shape checks and all-candidate identity/message checks are retained in the receipts. Commit hooks remained active, with fleet author/committer and no co-author trailers.
The complete no-Node installer journey belongs to release tags and was not run. No screenshots were requested for this dependency adoption.

## Source acquisition recovery
The initial refresh refused before any write on API HTTP 503 for blob 92fc8474e518242b849771081e216e6b51d0e959. Launcher refresh, complete fleet Git setup and credential re-read were repeated; the retry followed 15-second backoff.
The retry used an external immutable-object cache populated by gh api repos/runeditrun/base/tarball/c2efb501cbc148c2aee4d5e1107ebdba81469006. Each cached blob's computed Git identity was checked by the unmodified API reader against the immutable API tree; tree, ancestry and historical reads still used gh api. No Base repository was cloned. Cache metadata and the successful full refresh receipt are retained.

## Cleanup diagnostic note
The initial dev launcher process-group stop left its manager in a separate group. Its recorded PID and descendants were stopped, and both listeners were verified closed. An early process inspection displayed that owned manager's internal job-control token; the manager is stopped and that token is excluded from this packet. Final-head dev shutdown used the recorded manager PID directly and completed gracefully.

## CI history and correction
Initial Verify 43455110942 on df5963c7755ef64a5cb54307d419050df1ad1960: build, packaging and six shards passed. Job 131987598612, shards (push-3), failed in Run this shard: tests/local-signin-truth-support.mjs:19 expected /RER_OPEN/ from copy that Base intentionally replaced with executable rer dev guidance. Job 131987598615, shards (push-6), reached its timeout in Run this shard. The failed assertion log was read exactly once after completion with gh run view 43455110942 --repo just-every/run-uptime --job 131987598612 --log-failed; workflow environment listings were omitted from the retained non-secret log.
The obsolete wording assertion was replaced with the stronger public-door guidance/session check described above. The first local revision correctly hit the existing enrolled-factor refusal; the final revision explicitly asserts that refusal and completes the test-owned factor, preserving security.
Final Verify observation: {"conclusion": "success", "github_ci_calls": 10, "head": "83b2f2692149c9171a12cba0d7397734a1e8096b", "last_observed": 1794588313.9234629, "run_id": 43461700458, "status": "completed", "url": "https://github.com/just-every/run-uptime/actions/runs/43461700458"}.
CI reporting never treats another SHA, a saved bundle, an evidence transfer or local test success as exact-SHA green.
The CI budget includes discovery/status calls, the initial jobs lookup and one failed-job log invocation; eight calls were used before the final candidate's discovery.

## Change summary
 RUN-LOCALLY.md                                     |  14 +
 SEED-COMMAND-CONTRACT.md                           | 146 +++++++++-
 base-copies.json                                   | 296 +++++++++++----------
 package.json                                       |   2 +-
 pnpm-lock.yaml                                     |  10 +-
 sources.lock.json                                  |  58 ++--
 src/base/modules/agent-door/conformance/audit.mjs  |   3 +
 src/base/modules/agent-door/index.ts               |   3 +-
 src/base/modules/agent-door/policy-event.ts        |  19 ++
 src/base/modules/business-settings/ADOPTING.md     |  13 +
 src/base/modules/business-settings/README.md       |   5 +-
 src/base/modules/business-settings/apply.ts        |   7 +-
 src/base/modules/business-settings/retire.ts       |   8 +-
 src/base/modules/business-settings/team.ts         |  16 +-
 src/base/modules/business-settings/types.ts        |   5 +
 src/base/modules/d1-transport/limits.mjs           |   6 +-
 src/base/modules/operator-auth/README.md           |   2 +-
 src/base/modules/operator-auth/accounts/admin.mjs  |  12 +-
 .../modules/operator-auth/accounts/one-click.mjs   |   9 +-
 src/base/modules/operator-auth/dev-gate.mjs        |   7 +-
 src/base/modules/operator-auth/dev/index.mjs       |   8 +-
 src/base/modules/operator-auth/dev/invited.mjs     |  11 +
 .../operator-auth/identity/email-link/index.mjs    |   2 +
 src/base/modules/operator-auth/index.d.mts         |   3 +-
 src/base/modules/operator-auth/routes.mjs          |   4 +
 src/base/run-site.ts                               |   2 +-
 tests/command-journey.mjs                          |   2 +-
 tests/local-signin-truth-support.mjs               |  21 +-
 28 files changed, 492 insertions(+), 202 deletions(-)


## Terminal CI and custody
Exact-SHA Verify 43461700458 on 83b2f2692149c9171a12cba0d7397734a1e8096b: status=completed, conclusion=success. CI discovery, status, job and failed-log reads used 10 budgeted calls, with at least 300 seconds between run observations. The earlier candidate's copy assertion was corrected in a second real commit.
Product custody: READY on the named cloud branch. No outstanding check. The fleet owns landing and its independent publication scan.
No release or deployment was performed. This complete report and actual receipts are published only to the separate task evidence ref. The successful clone is removed after that transfer.

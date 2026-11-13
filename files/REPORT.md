The maintenance report is already resolved on current main. This run made no product change, created no product commit or PR, and did not push a product branch. The local cloud/gr-mt-uptime-ci-3 checkout is clean at 83b2f2692149c9171a12cba0d7397734a1e8096b, which was also the advertised main head when checked with git ls-remote. The required maintenance result is status=no-change.

The completed plan was:
1. Configure fleet identity, refresh the fleet launcher, install decrypted-bundle Git authentication and publication helpers, and clone just-every/run-uptime with full commit history.
2. Read the launcher and repository instructions, inspect the supplied failed run, and compare current main's exact-SHA CI and retained journey coverage.
3. Determine whether code work remains; make a minimal fix only if current main still fails. Current main is already verified, so no fix or test rewrite is warranted.
4. Run small structural checks, preserve actual non-secret receipts and the required result.json, and return the packet through the report-only evidence ref.

The supplied run 39058311379 failed in installer job 117470816508 at Run this shard; the final verify job failed as a consequence. All other listed historical shards passed. The one permitted archive request was:
gh run view 39058311379 --repo just-every/run-uptime --job 117470816508 --log-failed
It exited 0 with zero stdout and stderr bytes. historical-installer.log is therefore an actual empty capture. This run does not claim to have recovered a historical assertion or independently reproduced it.

Existing ancestor 6fbac75825bf66fca559d56be822fd31d3b7aafa (19 October) is titled "Fix the tag-tier installer journey and the restart snapshot race". Its commit explanation identifies a stale full definition-file input label after a Pingdom copy update; its diff replaces the full-label locator with a stable prefix, preserving import assertions. It also settles hosted work before the signed-runner restart snapshot. The ancestry check passed. Since then the current UI moved that workflow to Settings > Backup and files: tests/definitions-journey.mjs now uses /^A file from\b/ and continues to assert preview counts, created monitors, paused import, undo and retained history. This report distinguishes the existing fix's explanation from an unavailable old log.

Current retained coverage was traced through tests/command-journey.mjs, which imports and calls definitionsJourney, and package.json test:identity, which selects command-journey. scripts/verification-plan.mjs selects every runtime/delivery/protocols/data/transactions/console/identity/operations journey in its eight balanced shards, for both push and nightly. It includes signed-runner via test:runtime. No assertions were removed, skipped or weakened in this run.

Exact-SHA CI on 83b2f2692149c9171a12cba0d7397734a1e8096b:
- Full branch Verify 43461700458 completed successfully. Plan, prepare, build, all eight push shards, full-push-proof and verify passed. Its skipped light/nightly-proof jobs are the expected alternatives. The full run was on cloud/main-uptime-rer-0213-1; it is evidence for the identical main SHA, not a new run of this task's branch.
- Main Verify 43471590109 completed successfully. Its main shard/build jobs are skipped because the planner reuses the identical full branch proof; the independent full run's job receipt above establishes real coverage.
- Main Run site 43471590153 completed successfully.
- No new Verify was dispatched or rerun. Six explicit gh invocations were made for this investigation; no polling loop was needed. Report transport uses ordinary Git separately.

Local commands and outcomes are recorded completely in receipt.json and local-check-1.log through local-check-7.log:
- node --check tests/definitions-journey.mjs: PASS.
- node --check tests/signed-runner.mjs: PASS.
- node scripts/edition-authoring/cli.mjs check: PASS, ok=true; full JSON output retained.
- node src/base/contract-docs.mjs check: PASS, zero errors and warnings; generated documents current.
- git merge-base --is-ancestor 6fbac75825bf66fca559d56be822fd31d3b7aafa HEAD: PASS.
- git diff --exit-code origin/main HEAD: PASS, no diff.
- git status --porcelain: clean.
The supplied toolchain was sourced and the fleet commit hook installed after cloning and toolchain setup. It selected pnpm 10.12.4 and kept available Node v24.19.0 as permitted by the supplied minimum-version shim; CI used the workflow's pinned Node 22.20.0. No package dependency installation, application setup, build, browser or server was needed for this no-change investigation. No local runtime suite or typecheck rerun is claimed. The successful full CI includes typecheck in browser-suites' hosted task. Structural checks are not substitutes for that runtime proof.

Before/after product files changed: 0/0. New tests: 0. Clause changes: none. Contract counts before and after remain 37 done, 58 partial, 20 missing, 115 total (published 14/7/0; target and push further 23/51/20). No CLAIM lines or acceptance promotions are warranted. Generated views and the source lock remain untouched.

No product blocker remains: the reported failing main is superseded by exact-SHA green main and full branch verification. Limitation: the old failed-job archive returned no text, so the old assertion is supported only by the retained fix history, not an independently recovered trace. Default: resolve this maintenance item as no-change, with no landing request and no READY/PUSHED claim. The product publication scanner was not run and no product push was made; report-only evidence is distinct from product acceptance or custody.

The local clone and result remain under work/maint/gr-mt-uptime-ci-3/. Complete actual report and receipt files are under work/gr-mt-uptime-ci-3/packet/. No other repository was cloned, changed or published. No credentials, environment dumps, private held-out material or symlinks are selected for evidence publication. No application/server/browser processes were started; clone and check processes have exited.

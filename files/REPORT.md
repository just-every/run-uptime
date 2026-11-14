# gr-mt-uptime-ci-4

Result: **no-change**. The reported failure is historical; current main is already green on the exact checked-out SHA, with full journey coverage. No merge is required.

Repository: just-every/run-uptime  
Local branch: cloud/gr-mt-uptime-ci-4  
HEAD and origin/main: d47a432be0b9d6b1115de8579e23115b7a123646  
Product commits: 0. Product files changed: 0. Product branch pushed: no. PR: none.

## Plan and execution

1. Set the required fleet identity, read the launcher, refresh the injected bundle, install the fleet Git helper and push guard.
2. Clone the declared repository with full history, create the named cloud branch from origin/main, read its contributor guidance and inspect the failing run before changing code.
3. Retrieve the completed historical run's failed job and try its failed-log archive once. Check whether current main already meets the goal.
4. Confirm successful full verification at the exact current SHA, including the resilience journey in its selected shard. If already fixed, use the brief's no-change outcome without manufacturing a commit.
5. Record actual receipts and the maintenance result, inspect the selected public evidence files, and publish only the report packet through the separate evidence ref.

All five steps were followed. The packet publication receipt is returned separately by the evidence command.

## Historical failure

Run 40065737952 completed with failure at 2f664621e9b71f5531b8159e509b319ef4958279. Its only failed job was 120788528953, "shards (resilience, false)", at step 12, "Run this shard". The other 27 shard jobs succeeded.

Command attempted exactly once:

    gh run view 40065737952 --repo just-every/run-uptime --job 120788528953 --log-failed

The command exited 0 and returned zero stdout/stderr bytes. There was no HTTP error body to report. Historical assertion text and its precise root cause could not be recovered, so this report makes no attribution to any particular intervening fix. It does not call the original failure a false positive.

## Current exact-SHA evidence

- Full Verify: https://github.com/just-every/run-uptime/actions/runs/43559709154 — completed/success at d47a432be0b9d6b1115de8579e23115b7a123646. All eight push shard jobs succeeded, as did build, prepare, full-push-proof and the final verify job.
- scripts/verification-plan.mjs selects "node tests/resilience/watches.mjs" in push-4; job 132349310853 in that full Verify succeeded. The reported journey remains in verification coverage.
- Main Verify: https://github.com/just-every/run-uptime/actions/runs/43565906841 — completed/success at the same SHA. This later run used the workflow's existing successful-proof reuse path; it is not represented as a second execution of the suite.
- Run site: https://github.com/just-every/run-uptime/actions/runs/43565906738 — completed/success at the same SHA.

The exact-SHA discovery response and both job receipts are selected packet files.

## Local results

- git diff --exit-code origin/main: pass, no differences.
- git status --porcelain=v1: empty.
- node scripts/edition-authoring/cli.mjs check: pass, ok=true.
- node src/base/contract-docs.mjs check: pass, zero errors/warnings, documents current.
- Imported the verification plan and confirmed the resilience journey is in push-4.
- Candidate identity/trailer inspection returned no commits in origin/main..HEAD.

No application code, tests, workflow, source lock, contract or generated views were edited. No local application suite, setup, build, or typecheck was needed for this no-change outcome. No browser/server was started. The toolchain setup selected pnpm 10.12.4; the existing Node v24.19.0 satisfies the setup's minimum-pin logic.

## Counts and clause status

Historical failing Verify count: 1 supplied newest run. Current exact-SHA failing Verify count: 0; both observed runs succeeded. Historical shard results: 27 passed / 1 failed. Current full run: 8 passed / 0 failed; shard grouping changed on main before this task, so these are workflow counts, not test counts.

Changes from this task: 0 product files, 0 commits, 0 added/removed test registrations, 0 clause status changes. Acceptance counts and contract judgments remain unchanged. No CLAIM or DEFAULT is introduced.

## Publication and remaining work

No product push or PR is needed. The publication scanner was not run because there is no new product tree to publish; evidence publication contains only explicitly selected report/receipt files. READY/PUSHED is not claimed for a product branch. A successful evidence transfer is not product custody or landing approval.

The missing old log text limits historical diagnosis but does not block the explicitly permitted no-change outcome: a full successful Verify already exists on the exact current main SHA and includes the formerly failing journey. No owner ruling is needed.

GitHub investigation budget used: 7 of 10 calls, including the single failed-job archive command. No dispatches, reruns, short polling loops, GitHub comments or main pushes were made.

Maintenance result: work/maint/gr-mt-uptime-ci-4/result.json (copied verbatim into this packet). Preserve the clone as the requested maintenance output; no unpushed finished product work exists.

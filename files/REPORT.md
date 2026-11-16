# Uptime release-tag shard rebalance

Signed: Run Edit Run fleet, 2026-11-16.

Repository: `just-every/run-uptime`.
Branch: `cloud/main-uptime-tag-shards-1`.
Candidate: `ac70a02db514090d5f50828071d2237f1abe8f22`.
Main at clone and pre-push synchronization: `be708323f508df4bb0955c701763eb621f5dddff`.
No PR was required by this repository’s instructions or created.

## Cause confirmed

The workflow passes `TIER=all` for tag pushes. `planVerification` also requires all coverage for a release ref. The Uptime wrapper deduplicates same-named push/nightly shards and used `allShards` for the all-tier metadata and execution. Before this change, `allShards` used the original weights, while `plan.push` separately increased agent-door to 555 seconds and archive-roundtrip to 270 seconds. This exactly reproduces the supplied attempt-2 push-6 file order. The branch used the updated assignment; tags still used the old one.

## Plan and result

1. Read launcher and repository guidance; trace the workflow, planner, allocation and actual runner before changing them.
2. Capture both real CLI planning modes offline and record every selected whole test file. Confirm the old tag push-6 reproduces the supplied failing job.
3. Share the existing balanced allocation between branch push and release (`plan.push === allShards`); retain a separate original nightly allocation. Select nightly metadata and execution explicitly when `TIER=nightly`.
4. Exercise the real workflow planner and runner selection for branch, synthetic release ref and nightly. Typecheck, check workflow configuration, synchronize main, regenerate the source lock last, and check it. Commit only two CI source files and their generated source-lock updates. No application source, tests, timeout, workflow YAML, release metadata, contract or generated acceptance views changed.
5. Check all candidate identities/trailers, push the named product branch with the fleet guard, wait for its exact-SHA Verify, and publish this separate evidence packet. The fleet Mac owns publication scanning and landing.

## Coverage and timing

Before → after: 47 → 47 selected whole test files, 8 → 8 shard jobs, zero duplicate or omitted selections for branch, tag and nightly. Branch and nightly allocations and metadata are unchanged. No test was edited, removed, split or skipped. Timeout remains 20 minutes. No clause Status, Gap or Evidence cells changed; no acceptance claim or promotion is made.

Estimates below sum whole-file costs; they are not measured job runtimes. The proof uses the supplied tag costs (contact-schedules 130 s, incident-work 120 s, private-network 50 s, agent-door 580 s, alert-routes 60 s), the existing rebalance’s archive-roundtrip estimate (270 s), the source’s older estimates for the other named files and its 60 s fallback for unmeasured files. Runner installation, build restoration and hosted validation add overhead. The original tag push-6 alone sums to 20:24 before overhead. The new release assignment exactly matches the previously measured balanced branch plan.

Historical green push run `43728070013` (supplied): push-1..8 = 8:54, 10:16, 11:23, 8:36, 12:15, 10:55, 14:25, 12:12. Mean 11:07; maximum/mean 1.297. These observed complete-job durations are stronger operational evidence than the older per-file estimates. No release tag was created, pushed, deleted, dispatched or rerun.

### Tag plan before

| Shard | Test files, in execution order | Estimated journey time |
| --- | --- | --- |
| push-1 | `tests/flow-journey.mjs`, `tests/maintenance-windows.mjs`, `tests/metrics.mjs` | 8:05 |
| push-2 | `tests/notification-recovery.mjs`, `tests/roster-erasure.mjs`, `tests/owner-editor-browser.mjs`, `tests/alert-drill.mjs` | 7:56 |
| push-3 | `tests/command-journey.mjs`, `tests/definitions-import.mjs`, `tests/signed-runner.mjs`, `tests/api-transaction-journey.mjs`, `tests/failure-page-journey.mjs`, `tests/business-provisioned.mjs` | 8:06 |
| push-4 | `tests/control-runtime.mjs`, `tests/notify-delivery.mjs`, `tests/network-mixed-dns.mjs`, `tests/agent-rate-overrun.mjs`, `tests/resilience/watches.mjs`, `tests/public-paths.mjs`, `tests/hosted-alerts.mjs` | 8:05 |
| push-5 | `tests/notification-fallback.mjs`, `tests/mail-journey.mjs`, `tests/agent-erasure.mjs`, `tests/udp-monitors.mjs`, `tests/operator-security.mjs`, `tests/probe-native-evidence.mjs`, `tests/hosted-auth-browser.mjs` | 8:06 |
| push-6 | `tests/contact-schedules.mjs`, `tests/incident-work.mjs`, `tests/private-network.mjs`, `tests/agent-door.mjs`, `tests/alert-routes.mjs`, `tests/archive-roundtrip.mjs`, `tests/webhook-custom.mjs` | 20:24 |
| push-7 | `tests/discovery-jobs.mjs`, `tests/protocol-monitors.mjs`, `tests/reporting.mjs`, `tests/agent-query-token.mjs`, `tests/catalog.mjs`, `tests/access-matrix.mjs`, `tests/read-api.mjs` | 8:06 |
| push-8 | `tests/browser-suites.mjs`, `tests/slow-responses.mjs`, `tests/owner-deploy-lifecycle.mjs`, `tests/ping-monitors.mjs`, `tests/erasure-audit.mjs`, `tests/tls-auth.mjs` | 7:56 |

Total 76:44, mean 9:35.5, max 20:24, max/mean 2.127.

### Tag plan after (also the unchanged branch allocation)

| Shard | Test files, in execution order | Estimated journey time | Historical whole-job time |
| --- | --- | --- | --- |
| push-1 | `tests/agent-door.mjs`, `tests/probe-native-evidence.mjs` | 9:58 | 8:54 |
| push-2 | `tests/flow-journey.mjs`, `tests/agent-query-token.mjs`, `tests/api-transaction-journey.mjs`, `tests/alert-drill.mjs` | 9:32 | 10:16 |
| push-3 | `tests/notification-recovery.mjs`, `tests/owner-deploy-lifecycle.mjs`, `tests/agent-rate-overrun.mjs`, `tests/resilience/watches.mjs`, `tests/operator-security.mjs`, `tests/metrics.mjs`, `tests/hosted-alerts.mjs` | 9:41 | 11:23 |
| push-4 | `tests/command-journey.mjs`, `tests/mail-journey.mjs`, `tests/definitions-import.mjs`, `tests/ping-monitors.mjs`, `tests/catalog.mjs`, `tests/webhook-custom.mjs`, `tests/business-provisioned.mjs` | 9:40 | 8:36 |
| push-5 | `tests/archive-roundtrip.mjs`, `tests/protocol-monitors.mjs`, `tests/network-mixed-dns.mjs`, `tests/signed-runner.mjs`, `tests/erasure-audit.mjs`, `tests/failure-page-journey.mjs` | 9:41 | 12:15 |
| push-6 | `tests/control-runtime.mjs`, `tests/slow-responses.mjs`, `tests/private-network.mjs`, `tests/roster-erasure.mjs`, `tests/owner-editor-browser.mjs`, `tests/tls-auth.mjs`, `tests/hosted-auth-browser.mjs` | 8:58 | 10:55 |
| push-7 | `tests/notification-fallback.mjs`, `tests/browser-suites.mjs`, `tests/notify-delivery.mjs`, `tests/agent-erasure.mjs`, `tests/udp-monitors.mjs`, `tests/maintenance-windows.mjs`, `tests/read-api.mjs` | 9:31 | 14:25 |
| push-8 | `tests/contact-schedules.mjs`, `tests/discovery-jobs.mjs`, `tests/incident-work.mjs`, `tests/reporting.mjs`, `tests/alert-routes.mjs`, `tests/access-matrix.mjs`, `tests/public-paths.mjs` | 9:43 | 12:12 |

Total 76:44, mean 9:35.5, max 9:58, max/mean 1.039. The complete before/after branch, tag and nightly matrices, scheduling weights and file lists are in `plan-before.json` and `plan-after.json`.

## Validation

- `node ../packet/plan-proof.mjs before ../packet/plan-before.json`: passed on original main.
- `node ../packet/plan-proof.mjs after ../packet/plan-after.json`: passed after modification and synchronization. The proof runs the actual workflow `--plan` for branch and synthetic `refs/tags/v0.0.0`, asserts each complete test file exactly once, validates browser/engine/evidence placement, and intercepts only child-process launch to check every real shard runner’s task dispatch in push, all and nightly modes without running application journeys. It makes no provider calls.
- Cross-snapshot comparisons: unchanged branch and nightly; release allocation equals branch; identical 47-file set.
- `pnpm run typecheck`: passed (Node 24.19.0, pnpm 10.12.4 from the requested cloud toolchain; CI pins Node 22.20.0).
- `node scripts/verify-ci.mjs --check-workflows`: passed.
- `node scripts/edition-authoring/cli.mjs lock` then `check`: passed; only the two intentionally changed CI source digests moved.
- `node src/base/contract-docs.mjs check`: passed, no warnings. Contract and both generated views match main byte for byte.
- `git diff --check`: passed. Candidate author and committer are fleet identity and its message has no trailers.
- No full local rer verify, dev server, browser session or tag Verify was run.

## Product custody and CI

One real commit and one product push; the push guard succeeded on attempt 1. Exact-SHA Verify is run `43884855569`: https://github.com/just-every/run-uptime/actions/runs/43884855569 . Exact-SHA Verify completed successfully at the 15-minute observation, without a rerun; the final jobs receipt below records individual shard durations. This evidence publication itself does not signal readiness, acceptance or landing.

## Limitations

The estimates do not guarantee elapsed time on future GitHub runners. No new tag execution was requested or performed. The candidate branch tests the same balanced file assignment now used by tags. Nightly intentionally retains its existing assignment. Full publication scan and guarded landing remain the fleet’s work.

## Final exact-SHA result

Verify `43884855569` completed **successfully** on `ac70a02db514090d5f50828071d2237f1abe8f22`. All eight shards succeeded, with no failed-job rerun. Five builder GitHub calls total: discovery, three five-minute status polls, then one jobs read after another five-minute interval.

| Shard | Measured whole-job duration |
| --- | --- |
| shards (push-1) | 10:38 |
| shards (push-2) | 10:00 |
| shards (push-3) | 12:07 |
| shards (push-4) | 8:52 |
| shards (push-5) | 11:35 |
| shards (push-6) | 12:11 |
| shards (push-7) | 12:25 |
| shards (push-8) | 11:00 |

Mean 11:06; longest 12:25, 1.119 times the mean. Every shard has at least 7:35 margin below the unchanged 20-minute limit. This measures the branch run, whose exact file allocation and browser metadata match the offline release-tag plan; it does not claim an actual tag run.

No blockers. Product is a green exact-SHA landing candidate; independent fleet publication and landing gates still apply. No clause status changes or claims. The local clone will be deleted only after successful evidence publication and remote-ref confirmation; this packet remains outside it.

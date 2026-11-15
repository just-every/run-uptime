# Uptime stranger-33 carry and push-shard rebalance

Author: Run Edit Run fleet. Date: 2026-11-15 UTC.

Repository: just-every/run-uptime
Branch: cloud/main-uptime-stranger33-trips-1-c1
Candidate: 7e4e51b86b8f7081719eae4aa1fad74849ca2607
Base: 2045014b15f76380b5d7493c0c42b2caa430f88b
Original round: 6903eaf187eede00fc0f20abc3b34b00ad00449b
Carry commit: c301503815cbd82853caee4b9482730037d15114
Final-head Verify: 43728070013, https://github.com/just-every/run-uptime/actions/runs/43728070013
Earlier candidate Verify: 43726790128 (failed; correction recorded below)
PR: none; fleet landing uses the named branch and exact-SHA Verify.

## Plan

1. Configure fleet identity, refresh the authorized launcher, install bundle-reading Git authentication and the cloud push guard, clone full history, and install the forwarding commit hook.
2. Compare current main and the complete original-round diff. Carry every original change as one linear fleet-authored commit, preserving current release metadata, tests, contract judgments and the external-check default. Push this real commit as a skip-CI custody save.
3. Correct the underestimated agent-door and archive-roundtrip push scheduling weights, move only whole journey files through the existing eight-bin greedy planner, retain the existing nightly/release assignments, and pass the selected tier through planning, browser metadata and execution.
4. Check complete before/after assignment, unchanged task commands, nightly/release identity, matrix/browser/evidence routing, typecheck, contract generation freshness and workflow permissions. Regenerate the source lock last, check it, commit the CI change, audit every candidate commit's identities/trailers and push through the cloud guard. Watch exact-SHA Verify within the shared API budget, record measured shard durations, and publish this explicit report packet to the evidence ref only.

## Product preservation

Current main was already the original round's ancestor; no conflict resolution or newer-main replacement was needed. The carry commit's entire tree equals the original round's tree: 3437ba7f1e803e85c1733b7b68173e5584a11cb4. Thus all nine trip results, maintenance content carried by that round, product/docs changes and its main-example policy remain unchanged. The original round's 51-file, 391-insertion/177-deletion diff is carried as one linear commit. The CI changes affect scripts/verification-plan.mjs, .github/scripts/verify-ci.mjs, .github/workflows/verify.yml, its Base adaptation record in base-copies.json, and the generated sources.lock.json.

DEFAULT: Preserve main's example.org external-check default, as stated by the assignment dated 2026-11-15. No new policy decision.

Clause status changes: none. CONTRACT.md, ACCEPTANCE.md and docs/CLAIMS.md are unchanged. No new acceptance claims or claims of fresh stranger-trip work. No new test registrations, removed tests, skipped tests, split tests, weakened assertions, timeout increases, or journey-speed changes.

## Scheduling

The old planner assigned agent-door its 60-second fallback and archive-roundtrip only 19 seconds, overloading push-6. New push estimates are 555 and 270 seconds respectively, following the assignment's observed durations from run 43714780460. Other weights remain unchanged. The existing longest-processing-time allocation now separates those files into push-1 and push-5. Existing nightly and release allocation is retained exactly, including task order, browser-engine and evidence metadata. All-tier deduplication still schedules the legacy allocation once.

Before and after: 47 journey entrypoints, each assigned exactly once; eight shard jobs. This is an entrypoint count, not a claim about all assertions or independently registered subcases. All journey command lists and hosted flags are identical. The complete file assignments are in shard-plan-check.txt and shards-before.json/shards-after.json.

New push planning estimates, in push-1 through push-8 order: 573, 572, 581, 580, 581, 571, 571, 580 seconds. Mean: 576.125 s. Longest/mean: 1.0085. These are scheduling estimates; measured run durations are recorded separately after Verify completes.

Original run's latest-attempt shard job wall times (seconds): push-1 480, push-2 520, push-3 417, push-4 766, push-5 534, push-6 1204/cancelled, push-7 611, push-8 807. The cancelled shard is censored and is not a successful complete duration. Source: actual original-ci-jobs.json response.

## Local checks

- pnpm run typecheck: passed before and after the CI change, Node 24.19.0 and pnpm 10.12.4. The repository's CI runs its pinned Node 22.20.0.
- Shard plan check: passed; prints every before/after journey, checks exact-once coverage, byte-equivalent commands, unchanged nightly/release allocation and matching tier matrices, browser engines and evidence routing.
- node scripts/verify-ci.mjs --check-workflows: passed.
- node --check for both modified JavaScript modules: passed.
- node src/base/contract-docs.mjs check: passed, zero prose errors/warnings; generated views untouched.
- node scripts/edition-authoring/cli.mjs lock then check: passed; lock generated, never edited manually.
- git diff --check: passed; checkout clean after final commit.
- Identity and full candidate-message checks: three commits, fleet authors/committers, no trailers. Final candidate message has no skip marker.
- No full local rer verify, browser journey or build was run; this round's scope is carrying the already-tested round and CI allocation. Full exact-SHA Verify is the wall.
- Mac publication scan is delegated to the fleet lander, per the cloud adaptation; this VM did not run a Mac publication helper.

## Publication and custody

The skip-CI carry, initial CI candidate and corrected final candidate pushes succeeded through cloud-push.py. No force push, main push, merge commit, history rewrite, PR or other-repository write was used. Evidence is selected explicitly, contains no credentials/environment dump, and is published only to evidence/main-uptime-stranger33-trips-1-c1. Evidence publication does not constitute acceptance or landing.

## Exact-SHA Verify result

The initial CI candidate (73b0d3124e9692f7d32a54aabea0ed11c8c2434e) failed Verify 43726790128 because the added workflow tier environment changed an acknowledged Base adaptation hash. Job shards (push-7), Run this shard, failed before its journeys. Its completed log was read once with gh run view --job --log-failed; the exact response is in ci-failed-push7-attempt1.txt. The other seven shards passed, with job walls 9m45s to 11m25s. This was a change-induced metadata failure, so no blind rerun was requested. A corrective commit records the workflow adaptation with the authoring tool and regenerates the source lock. verify-base --offline then passes. No published history was rewritten.

The corrected candidate Verify completed successfully on the exact pushed head. A single REST watcher used intervals of at least 300 seconds, with a 15-minute wait followed by a final interval of at least five minutes on the corrected candidate to preserve the ten-call API budget. Complete responses for both candidates are retained in ci-receipts-first.json and ci-receipts.json. The final job response is ci-jobs-final.json.

Correction commit: 7e4e51b86b8f7081719eae4aa1fad74849ca2607 (Record the tier-aware Verify workflow adaptation).

## Final exact-SHA result and measured durations

Verify 43728070013: completed/success, exact SHA 7e4e51b86b8f7081719eae4aa1fad74849ca2607. All eight shards, shared build, prepare and full-push-proof passed. No rerun or workflow dispatch was used.

| Shard | Job wall | Run this shard |
| --- | --- | --- |
| push-1 | 8m54s | 8m20s |
| push-2 | 10m16s | 8m53s |
| push-3 | 11m23s | 10m52s |
| push-4 | 8m36s | 8m04s |
| push-5 | 12m15s | 11m40s |
| push-6 | 10m55s | 10m19s |
| push-7 | 14m25s | 13m40s |
| push-8 | 12m12s | 11m31s |

Mean job wall: 667.000 s. Longest: 865 s. Longest/mean: 1.2969, within 1.5. Job limit remains 1200 s; longest margin is 335 s. Eight shard jobs and all 47 journey entrypoints retained. The full workflow exceeds the fleet 10-minute aspiration; the requested timeout and imbalance correction is demonstrated by the measured job durations. No journey-speed changes were authorized.

Contract counts before and after: 37 done, 58 partial, 20 missing; no status changes.

GitHub budget: 10 counted invocations, including original timing lookup, both candidate watchers, the failed first-candidate job response/log and final duration response. No further GitHub API queries are needed.

Blockers: none. Product READY is a landing-candidate custody claim; the fleet still runs its independent publication and landing gates. Evidence publication is separate.

Author: Run Edit Run fleet. Finalized 2026-11-15T15:29:05.434872+00:00.

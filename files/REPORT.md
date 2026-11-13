# Uptime f172 exact-SHA CI triage

Task: sd-uptime-f172-ci-triage-1. Repository: just-every/run-uptime. Role: CI triage only. All timestamps are UTC from date -u. No source repair, permanent probe, test weakening, product commit, contract judgment, release, tag, PR, main, landing or hold write was made.

## Findings

The supplied timing assertion failure did not reproduce in either of the two local runs of the original failing command, `node tests/tls-auth.mjs`. Both completed with exit 0 on Node 22.20.0 and pnpm 10.12.4. This is not a same-GitHub-runner result and does not establish either a flake diagnosis or a product defect.

| Probe | Exact SHA | UTC start–end | Exit |
| --- | --- | --- | ---: |
| Failed head | e6b5aab6aeaa68f6b6317e1701f157e0405961ca | 2026-11-13T22:31:58Z–22:33:49Z | 0 |
| Freshly fetched main | 954353ad135f144d54f8e37013d6341a19a98e16 | 2026-11-13T22:34:20Z–22:36:11Z | 0 |

The failed SHA belongs to `cloud/sd-uptime-c-f172-rebase-e6b5aab6aeaa68f6b6317e1701f157e0405961ca`. The local triage branch is `cloud/sd-uptime-f172-ci-triage-1`, at main SHA 954353ad135f144d54f8e37013d6341a19a98e16. It has no candidate commits and was not pushed. READY does not apply to this read-only assignment.

## Original failure and authorized retry

The brief reports Verify run 43516474881 attempt 1, shard push-8/job 132199995867 failing at `tests/network-redirect-cycle-support.mjs:124`:

```
assert.ok(row.at>=observation.startedAt&&row.at<=observation.completedAt)
```

The stated stack is due → proveNetworkRedirectCycle:139 → tls-auth:12. Initial REST metadata independently confirmed exact failed head, completed/failure and run_attempt=1. The all-attempt job list contained only attempt-1 jobs: push-8 failed, all seven other shards, build, prepare and plan succeeded, and aggregate verify failed as a consequence. Original runner: GitHub Actions 1000322995, label ubuntu-24.04.

Exactly one `POST repos/just-every/run-uptime/actions/jobs/132199995867/rerun` was sent. GitHub returned HTTP 201 Created at 2026-11-13T22:27:47Z; the local receipt stamp is 22:27:47Z. The next scheduled REST read confirmed run_attempt=2 on the same failed SHA. No workflow dispatch, full-workflow rerun or successful-job rerun was requested. Dependent jobs that GitHub itself reruns are part of the supported job-rerun operation. The attempt-2 endpoint also re-exposes carried successes with new IDs and their original execution timestamps/runners; this does not mean those successful jobs executed again. The retried shard ran on GitHub Actions 1000323048, a different GitHub-hosted runner from the original 1000322995. Aggregate verify job 132215572665 completed/success, with fresh execution 22:40:31Z–22:40:33Z.

Attempt 2 completed/success on exact head e6b5aab6aeaa68f6b6317e1701f157e0405961ca; REST observation at 2026-11-13T22:43:30Z. Retried shard job 132209791853 (shards (push-8)) completed/success, starting 2026-11-13T22:27:51Z and ending 2026-11-13T22:40:24Z, on runner GitHub Actions 1000323048. The supported retry therefore did not reproduce the original failure. See jobs-after-rerun.json and ci-final-receipt.json. 8/10 budgeted GitHub commands were used; no failed retry log was requested because no retry job failed.

Original log limitation: the one permitted command `gh run view 43516474881 --repo just-every/run-uptime --job 132199995867 --log-failed` returned `run 43516474881 is still in progress; logs will be available when it is complete`, because the job retry had already made the run active. No archive/blob retry was attempted, and no HTTP status was supplied. The original assertion and stack above remain assignment evidence, not an independently downloaded original log. The actual diagnostic and request are retained in log-access-receipt.json and original-log-transport.txt; the empty original-failed-job.log is retained to avoid inventing log evidence.

## Local probe evidence

Required preparation was a frozen pnpm dependency install, `pnpm exec rer install`, and a fresh `npx -y @runeditrun/rer build` on each exact head, through the cloud subreaper. Both builds exited 0. No app setup/dev/server/browser was needed: the test creates and migrates its own isolated Worker fixtures. No full verification, typecheck, other test file, intentional machine stress or repeat loop was run.

Both tests passed keyword status/text failures and recovery, matching/wrong-name/restored public TLS, short redirects, bounded redirect-cycle refusal, two saved-timeout quiet windows across persistent Worker restart, restored scheduled recovery and DNS rebinding/refusal. Original assertions stayed intact.

The cycle phases on failed head/main respectively made six verified TLS connections and six ordered receiver requests, returned signed target_failure with the redirect check, and took 636/635 ms against the saved 3000 ms timeout. Short and restored phases each made two connections and two requests. The unchanged assertions verified each cycle receiver timestamp fell inside the signed observation interval. Full generated wire/history/incident receipts are in failed-head-redirect-receipt.json and main-redirect-receipt.json; wire-summary.json gives the durations and measured margins without replacing those raw receipts.

The helper, tls-auth entry point, redirect routing fixture, runner clock, runner loop and probe implementation are byte-identical between failed head and main (source-comparison.json). The candidate/main diff is limited to agent manual-check implementation, its new probe, contract wording/views and source lock (candidate-main-diffstat.txt). Equality does not establish the cause of the timing failure. CLOCK-COMPARISON.md records the precise receiver-wall-clock versus calibrated-signed-clock comparison and the evidence a future reproduction would need; it makes no cause or repair claim.

## Environment comparison and limits

The two local probes used the same dedicated cloud VM: Debian GNU/Linux 13.6, Linux 6.18.57 x86_64, OpenSSL 3.5.7. Node 22.20.0 was installed explicitly to match CI; the VM default Node 24.19.0 was overridden before each build/test. pnpm was the repository pin 10.12.4, with the frozen lock shared by both SHAs. Workflow test flags CI and metrics settings were matched, and each invocation used a fresh canonical temporary directory with the real HOME. Proxy detection was present in the cloud logs.

CI used a GitHub-hosted Ubuntu 24.04 runner, a build artifact shared from its earlier build job, runner-owned caches and the full push-8 sequence. Locally each SHA was freshly built, then only the failing test file was executed; preceding shard load, GitHub image/kernel/OpenSSL, transient scheduler/latency, proxy behavior and runner caches were not reproduced. No claim of same-runner proof is made. No provider account or production endpoint was contacted by the probe; network/provider edges were the repository's synthetic local fixtures.

## Disposition, counts and custody

Local classification: unreproduced. No candidate-only reproduction and no main failure have been established by the local tests. No repair lease or speculative patch is proposed on this evidence. A later repair writer would first need failed-head reproduction with actual failing timestamp/observation evidence. No known-infrastructure conclusion is asserted.

Clause status changes: none. NETWORK-001 remains partial. Source-table counts before → after: done 37 → 37, partial 58 → 58, missing 20 → 20; total 115 → 115. Tests added/removed/edited: 0/0/0. No suite-wide test-count audit was performed; registrations were unchanged. Product commits/pushes/PRs: 0/0/0. v0.5.12 release work and disjoint f173/f174 builders were untouched.

The product tracked tree/index were clean after both tests; task branch/head matched fetched main. Identity inspection of `origin/main..HEAD` was empty. Mac publication scans are unavailable in this VM; no product publication is attempted. Non-secret reports and actual receipts live outside the product tree, under `$HOME/rer-consolidation/work/sd-uptime-f172-ci-triage-1/packet/`, and are explicitly selected for report-only evidence publication. PLAN.md contains the full execution plan; github-calls.txt records the API budget and timestamps. No evidence is placed in a product branch or PR.

Both local test process trees settled through the subreaper; no Node/workerd process remained at the recorded process check. No broad process termination was used. After successful report publication and manifest/hash verification, the owned clone and its node_modules will be removed. The packet and returned evidence ref remain the custody record. Final disposition: CI triage complete; original failure unreproduced in the one authorized retry and both local probes, no repair proposed, no task blocker. The unavailable original log archive is an evidence limitation explicitly retained above.

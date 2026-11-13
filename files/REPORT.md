# Uptime 0.5.12 destination-cleanup CI triage

Task: sd-uptime-release0512-ci-triage-1. Repository: just-every/run-uptime. Read-only CI triage; no source writer or repair lease.

## Finding

The original destination cleanup HTTP 409 is **UNREPRODUCED** in the failed-head local probe. The authorized single-job retry completed successfully on the exact metadata candidate SHA. No cause is established, and no source or test repair is proposed. The same original public-door command passed on both the candidate and current main, including destination cleanup.

Candidate: `cloud/sd-uptime-release-0-5-12` at `7364b5f3dd7fcf29b533d3139315ad1701d0653e`.
Actual main, fetched initially and again before its probe: `954353ad135f144d54f8e37013d6341a19a98e16`.
No task product branch, product commit, PR, tag, release, deployment, landing or clause-status edit was made.

## Original failure and single retry

- Verify run `43518362117`, attempt 1: completed/failure on the candidate SHA. The failing shard was `shards (push-5)`, job `132206445155`. Aggregate `verify`, job `132213365263`, failed as a consequence.
- The failed archive was read exactly once using `gh run view 43518362117 --repo just-every/run-uptime --job 132206445155 --log-failed`. It shows `node tests/operator-security.mjs` reaching `proveDestinationStepUp` and failing the cleanup loop at `tests/destination-stepup-support.mjs:36:31`: actual HTTP 409, expected 200. The log does not identify which destination or include the response body, so it does not establish the underlying refusal reason.
- Initial run metadata showed `run_attempt: 1`; there was no earlier retry. Exactly one `POST repos/just-every/run-uptime/actions/jobs/132206445155/rerun` was sent. GitHub returned `HTTP/2.0 201 Created`, Date `Fri, 13 Nov 2026 22:56:11 GMT`. The request receipt is retained in `retry-receipt.txt`.
- Verify attempt 2: **completed/success**, exact head `7364b5f3dd7fcf29b533d3139315ad1701d0653e`, observed at `2026-11-13T23:05:24Z`. Run URL: https://github.com/just-every/run-uptime/actions/runs/43518362117 .
- Retried shard job `132222564613`: success, started `2026-11-13T22:56:15Z`, completed `2026-11-13T23:04:56Z`. Aggregate `verify` job `132226368915`: success, completed `2026-11-13T23:05:08Z`. Dependent `full-push-proof` job `132226329074`: success. Other successful shards retained their original execution timestamps; they were not requested for rerun. No full/new Verify dispatch occurred. Run `43516474881` and the separate f174 lease were not touched.
- Six of ten logical GitHub calls were used, including the one failed-log command. The only post-retry status read happened over 300 seconds after the initial read. No bare watch, short polling loop, archive retry or other watcher was used. `github-calls.json` records every call.

## Probe plan and results

The complete plan is in `PLAN.md`. Only the declared repository was shallow-cloned, using `--depth 1 --filter=blob:none`. The fetched candidate and fetched main were checked out detached, sequentially in that owned clone.

Preparation: source the supplied `/tmp/rer-cloud-toolchain.sh`; `cloud_run npx -y @runeditrun/rer setup --owner-email fleet@runeditrun.com --non-interactive`; then `cloud_run npx -y @runeditrun/rer build`. The candidate build passed. Main was rebuilt separately before its probe and that build also passed. Dependencies were reused because the lockfile and dependency versions are identical. The setup creates private local installation files; none is selected for evidence.

The original failing command was run once per head through `cloud_run node tests/operator-security.mjs`, with system Chromium selected by `UPTIME_BROWSER_EXECUTABLE=/usr/bin/chromium`. The committed test was not edited, weakened, instrumented or replaced. Its public destination creation, enrollment, stale proof, cancellation and cleanup flow runs at 1440 pixels. Each invocation owns fresh temporary Miniflare/D1 state and uses the existing cleanup. No other local shard journeys or full suite were run.

- Candidate `7364b5f3dd7fcf29b533d3139315ad1701d0653e`: **exit 0**. The output includes `Destination step-up PASS` and `OPERATOR-SECURITY completed one owner-to-runner lifecycle`. Therefore the unchanged cleanup loop's HTTP 200 assertions passed. Completion was observed at `2026-11-13T23:08:21Z`. See `probe-failed-head.log` and `probe-failed-head-receipt.json`.
- Main `954353ad135f144d54f8e37013d6341a19a98e16`: **exit 0**, started `2026-11-13T23:08:51Z`, completed `2026-11-13T23:11:12Z`. The output includes the same destination pass and final operator-security completion. See `probe-main.log` and `probe-main-receipt.json`. A workerd connection-reset diagnostic appeared after the import/erase pass; the original command continued and exited 0, with no retry.

## Precise comparison and limits

The candidate changes only seven release metadata files: CHANGELOG.md, README.md, RELEASE.json, RELEASE.md, package.json, seed.json and sources.lock.json (39 insertions, 13 deletions). Its release version is 0.5.12 versus main's 0.5.11. The destination test, operator-security journey, browser support, erasure implementation, server routes, pnpm lockfile and Verify workflow are byte-identical between heads. `source-comparison.json` retains file hashes and the actual main recheck.

Both local probes use the same Debian GNU/Linux 13 VM, Node 24.19.0, pnpm 10.12.4, Playwright 1.64.1 and system Chromium 154.0.8037.57. The supplied toolchain script preserves an installed Node newer than the pin; the direct test commands consequently use Node 24.19.0. `rer` build/setup select the checkout's pinned runtime. Browser flags include `--no-sandbox`, `--use-mock-keychain` and `--password-store=basic`. Only test-owned cookies and synthetic fixtures are used.

The GitHub job metadata identifies **Ubuntu 24.04**, not macOS; the failed log shows Node 22.20.0 and a runner-owned Playwright browser cache. Local results are not same-runner evidence and do not prove CI timing, shared-build identity or browser equivalence. Fresh local fixture state is also not a reconstruction of the entire CI shard's preceding journeys. One successful retry plus successful local cleanup does not establish the reason for the original 409 or prove absence of a timing-dependent defect. No speculative patch, temporary/permanent test modification or retry loop was added.

## Counts and disposition

- CI job conclusions: attempt 1 had 10 success, 2 failure and 3 skipped; attempt 2 has 13 success, 0 failure and 2 skipped. Failing shards: **1 to 0**. Aggregate failures: **1 to 0**.
- Product modifications and commits: **0 to 0**. Test registrations added, removed, skipped or weakened: **0**. Clause status changes: **none**. Generated full-target counts remain **37 done / 58 partial / 20 missing / 115 total** on both heads; this task did not rejudge clauses.
- Release lock remains in place until the separately authorized immutable-tag push. No ordinary f172/f174 work is readmitted. No release, tag or deploy was performed.
- Next action: root can route the unchanged metadata candidate through the supported lander using the exact-SHA successful attempt-2 receipt. No repair lease is justified without a demonstrated failing-head reproduction. If infrastructure investigation becomes necessary, route that work to fv. This report does not claim READY, acceptance, landing or release authority.

## Evidence custody

The packet contains actual non-secret reports and receipts only. The failed log's environment block and unrelated response headers were omitted; no credentials, settings, environment dump, test session, held-out material, symlink or raw installer log is selected. Evidence is published separately to `refs/heads/evidence/sd-uptime-release0512-ci-triage-1`; its exact evidence commit is returned in the terminal `EVIDENCE` line. Product custody and evidence publication are separate.

Report finalized at 2026-11-13T23:12:33Z (`date -u`). Both probes completed; no blockers remain for this read-only triage.

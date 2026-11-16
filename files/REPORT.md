# Seroval transitive dependency maintenance

Author: Run Edit Run fleet, 2026-11-15.

Repository: just-every/run-uptime. Branch: cloud/gr-mt-uptime-dep-6. Candidate: 096f7a919d34f13dc29ba59fdd26e2a91b4cd92b. Base: 433f7138430fa08d14570a58eb46bc5a14d7fadc. Candidate tree: 72548efa4b59a4253560302ba5402524988dfd96.

## Plan and implementation

The full pre-publication plan is PLAN.md. Configure fleet identity, decrypted-bundle Git helper and forwarding commit hooks; clone only the declared repository with complete history; inspect dependency constraints and all lockfiles; generate the minimal patched resolution with pinned pnpm; validate legitimate app operation and representative repaired package boundaries; regenerate the source lock last; commit; check exact committed publication tree; push only the named branch; inspect exact-SHA Verify; publish the actual non-secret packet on the separate evidence ref.

Root pnpm-lock.yaml resolved seroval 1.6.7, affected by every reported advisory. All four TanStack parent packages permit ^1.6.7, and seroval-plugins permits ^1.0. The nested mail lockfile has no seroval. Updating the shared resolution covers the existing framework SSR/server-function consumers without changing application policy or APIs.

The final product diff changes only pnpm-lock.yaml and sources.lock.json. It replaces seroval 1.6.7 with 1.6.11, updates its registry integrity and five consumer edges including the plugin peer snapshot, and regenerates the source-lock hash. Package manifests, all parent versions and seroval-plugins 1.6.7 remain unchanged. No override persists. The initial broad pnpm update was discarded because it changed unrelated transitive versions. A temporary seroval override guided pnpm installation; after removing it, another pnpm lockfile-only install generated the final minimal lockfile. No unrelated upgrade is retained.

## Local checks

Actual commands, exit statuses and artifact names are in checks-receipt.json. Node 22.20.0 and pnpm 10.12.4 were used for final installation, setup, build, typecheck and runtime checks.

Passed: pnpm install --frozen-lockfile; cloud_run npx -y @runeditrun/rer setup --owner-email fleet@runeditrun.com --non-interactive; cloud_run npx -y @runeditrun/rer build; pnpm run typecheck; pnpm spec:generate and spec:check; source-lock generation and freshness check; git diff --check. Spec generation left no tracked change. Setup's raw private log is excluded because it creates local authority; the actual exit status is retained.

Passed: six bounded package probe groups in seroval-probes.mjs, with actual output in seroval-probes.log. They check every reachable Seroval version against the five reported patched ranges; intrinsic typed-array constructor output despite attacker-controlled constructor metadata; escaped HTML-sensitive RegExp sources with legitimate round trips; rejection of malformed array-like nodes by fromJSON/fromCrossJSON; forged public sequence/stream markers remaining ordinary data; and a legitimate cyclic structured-data round trip.

Two initial external probe-harness errors were corrected: resolution of a transitive package must start from its direct parent under pnpm, and a constructor getter may be read during type classification even when its value cannot choose executable output. The final probe asserts the actual security invariant and the Uint8Array round trip. No repository test was changed or weakened.

Passed: UPTIME_BROWSER_EXECUTABLE=/usr/bin/chromium cloud_run node tests/hosted-auth-browser.mjs. Existing journey ran at its existing 1440 width with no-sandbox and native disposable HTTPS authentication, owner bootstrap, magic-link confirmation, Secure host-only owner session, native Origin and origin-only Referer. It exercises the emitted app's SSR documents and browser operation. No UI changed, so no new screenshot proof is required.

Independent pre-patch investigation and post-patch review are recorded in independent-review.md. The latter found no concrete source-backed surviving affected resolution or compatibility regression.

## Before and after

Vulnerable Seroval versions: 1 → 0. Reachable patched Seroval: 1.6.7 → 1.6.11. Consumer edges: 5 → 5, all patched. Reported advisory version ranges covered: 5. This is dependency remediation, not a claim that GitHub has closed the five alerts; alert closure was not queried.

Existing public-door CI task registrations: 47 → 47. Repository tests added/removed/weakened: 0/0/0. Clause status changes: none. Generated contract totals remain 37 done, 58 partial, 20 missing, 115 total. All contract judgments and generated acceptance views are unchanged. No CLAIM line is appropriate because this maintenance brief names no target clause.

## Security interpretation and limitations

All resolved Seroval copies now meet the first patched version covering GHSA-f86p-h4j2-7qgj, GHSA-9wx9-5pv9-3349, GHSA-97r2-qh9m-474h, GHSA-wp97-x4hv-qvhp and GHSA-7rv5-mrxv-xcr9. Representative formerly unsafe package boundaries are exercised with safe bounded inputs and preserve legitimate structured values. Application-specific remote exploitability was not established, and these package probes are not exhaustive advisory exploit reproductions. The complete suite belongs to exact-SHA branch Verify.

## Publication and custody

The first Base scan covered all 1,076 commits and 9,338 blobs but returned complete FAIL because I scanned the setup/build worktree and supplied a bare repository slug where a URL destination was required. Findings concerned invocation metadata and generated local authority/build artifacts, which are excluded from the committed product tree. The corrected scan materializes raw blobs from the identical committed tree, preserves history, supplies the matching project ID and URL destination, and uses the same injected-value checks. The corrected raw-source scan returned complete PASS with zero findings on candidate 096f7a919d34f13dc29ba59fdd26e2a91b4cd92b and tree 72548efa4b59a4253560302ba5402524988dfd96. Gitleaks 8.30.1 and injected-value inspection were enabled. Actual report: publication-scan.json. The fleet push guard published the named branch on its first attempt; an independent git ls-remote readback returned the exact candidate SHA. Every candidate author, committer and complete commit message passed fleet identity/trailer policy before push. Exact-SHA Verify run 43777108539 completed successfully at https://github.com/just-every/run-uptime/actions/runs/43777108539. Discovery plus three status polls were spaced by at least 301 seconds; no workflow rerun or dispatch was requested. Final status/head are retained in ci-verify-poll-3.json. Product custody is READY for the fleet guarded lander. No PR was required or created. No blockers remain. No landing, release, default-branch push or production deployment is authorized or performed. Evidence publication is separate report-only transport and does not constitute product acceptance or READY.

Finalized by Run Edit Run fleet on 2026-11-16. Result: fixed. Local result.json and the complete actual non-secret packet are retained outside the product checkout; evidence publication is recorded separately in the terminal transport receipt.

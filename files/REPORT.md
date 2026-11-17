# gr-mt-uptime-dep-2 report

Author: Run Edit Run fleet, 2026-11-17.

Repository: just-every/run-uptime. Product branch: cloud/gr-mt-uptime-dep-2.
Product head: e6dcb01c30c40241c6f63911fb56a9724848e209.

## Result and scope

Bumped the direct Hono dependency from 4.13.7 to 4.13.11, the first patched version for GHSA-5r4p-p66f-jhc7. Regenerated pnpm-lock.yaml with pinned pnpm 10.12.4 under Node 22.20.0 and regenerated sources.lock.json last. Only these three files are in the product commit (8 insertions, 8 deletions). No unrelated dependency resolution changed.

Vite was already exactly 8.2.4 in the current main manifest and lockfile, meeting the supplied first-patched version for GHSA-698v-4r3x-3vcv; no further Vite upgrade was needed. The installed dependency inventory confirms Hono 4.13.11 and Vite 8.2.4. One listed affected package and two manifest/lockfile exposures remain on the starting main: after this change both counts are zero. This verifies version resolution against the supplied advisories, not GitHub's current alert closure state.

## Plan and completed work

The full ordered plan is PLAN.md. Completed fleet credential setup, full-history clone, local Git identity and co-author cleanup hooks; read repository guidance; inspected exact versions; updated only Hono; frozen-installed; completed non-interactive setup; built and typechecked; ran existing public-route and access-control journeys; refreshed and checked the source lock; fetched current main; confirmed the branch was current through a no-op rebase before publication; and committed the scoped upgrade. The publication scanner was obtained read-only through gh api from Base's source archive without cloning or modifying another repository. It runs from a clean detached worktree of this exact product commit so generated local private settings are excluded from the candidate source tree.

## Local verification

All local touched checks passed. checks.json records the actual commands, exit codes and scope, with public-paths.log, access-matrix.log and typecheck.log retaining sanitized output.

- pnpm install --frozen-lockfile: passed.
- cloud_run npx -y @runeditrun/rer setup --owner-email fleet@runeditrun.com --non-interactive: passed; generated private settings remain local and are excluded from this packet.
- cloud_run npx -y @runeditrun/rer build: passed, including deployment descriptor generation; existing dynamic import warning remains informational.
- pnpm typecheck: passed application and runner TypeScript checks.
- cloud_run node tests/public-paths.mjs: passed actual emitted public surfaces, asset admission, private compiler path refusals, rate limits, safe configuration failure/recovery and published marketing reads.
- UPTIME_BROWSER_EXECUTABLE=/usr/bin/chromium cloud_run node tests/access-matrix.mjs: passed local and hosted native sessions, every owner-route denial without mutation, scope/role checks and existing browser controls at 1440.
- node scripts/edition-authoring/cli.mjs lock, then check: passed; only the two intended dependency-file hashes changed.
- node src/base/contract-docs.mjs check: passed, 0 errors, 0 warnings; generated views were untouched.
- git diff --check: passed.

No tests were added, removed, skipped or weakened; no full local test suite ran. No UI changes were made, so additional desktop/mobile screenshots are outside this dependency-only scope. Existing journeys close their own browser/Worker processes; the cloud subreaper waited for their descendants.

## Contract and counts

No clause text, Status, Gap or Evidence cell was changed, and no new clause-completion claim is made. Counts remain 37 done, 58 partial, 20 missing, 115 total, before and after. Published clauses remain 14/7/0 of 21; target and push-further remain 23/51/20 of 94. Test registrations are unchanged (0 added, 0 deleted).

## Publication and terminal custody

Base publication scan returned complete=true, status=PASS and zero findings for product commit e6dcb01c30c40241c6f63911fb56a9724848e209, tree 48df157b0667a4324cda02ec5fa5c49efb306d5f. The scanner inspected the clean committed tree plus full reachable history relative to the fetched public main; no finding or check was waived. Gitleaks 8.30.1's downloaded archive matched the committed upstream checksum. scanner-source.json records the exact read-only Base source and its version metadata; publication-scan.json contains the full value-free result.

Every candidate author and committer is Run Edit Run fleet with fleet@runeditrun.com, and no trailers are present (identity-check.json). The cloud push guard published the product branch on its first attempt; git ls-remote independently returned the identical full head. product-push.log records actual sanitized transport custody. The remote's banner also reports twelve preexisting default-branch alerts outside this scoped verification; this maintenance task does not claim to clear all repository advisories.

Exact-SHA Verify run 44120484569 was discovered in progress at https://github.com/just-every/run-uptime/actions/runs/44120484569. The single watcher made three REST polls spaced 300 seconds apart; the last observation at 2026-11-17T16:14:06Z still has status=in_progress and conclusion=null on the exact product SHA. ci.json retains all three actual responses, and ci-discovery.json retains the actual selected discovery metadata. The API budget limits further observation. Terminal custody is PUSHED, not READY; no green CI claim is made.

Remaining gate: Verify 44120484569 must complete successfully on e6dcb01c30c40241c6f63911fb56a9724848e209 before guarded landing. No local check or publication gate failed. Product work is fully preserved on the named remote branch; independent gates may continue exact-SHA verification. No missing ruling or account was encountered.

The complete relevant non-secret packet is selected explicitly for report-only publication through refs/heads/evidence/gr-mt-uptime-dep-2. The final message supplies the actual evidence head returned by the transport. Local setup settings, credentials, environment files and held gate material are excluded. The generated maintenance result is saved as result.json both in this packet and in the maintenance work directory. The full product clone and generated local test installation are removed only after confirmed remote product custody and evidence transfer, as the fleet clone-cleanup rule requires. Product publication and report-only evidence publication are separate operations. No default branch push, PR, tag, release or deployment was requested or performed.

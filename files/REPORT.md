# Uptime 0.5.12 metadata candidate

Observed 2026-11-13T22:21:08Z with `date -u`. Repository: just-every/run-uptime. Branch: cloud/sd-uptime-release-0-5-12. Product head: `7364b5f3dd7fcf29b533d3139315ad1701d0653e`. This is metadata preparation only, not a RELEASED claim.

## Full plan and results

1. Configure fleet Git identities, refresh the fleet launcher, read its AGENTS.md and install decrypted-bundle authentication, co-author cleanup and the cloud push guard. Completed. No other repository was cloned or written.
2. Clone the declared seed with `--depth 1 --filter=blob:none`, create the named branch from main and read the seed guidance and inline release rules. Fetch 50 additional commits and the previous release tag to inspect actual changes. Main was and remained `954353ad135f144d54f8e37013d6341a19a98e16`. Exact-main Verify runs 43512704887 and 43515950428 and Run site 43515951257 were independently observed completed/success.
3. Check ownership before editing: latest public non-draft Release was v0.5.11, published 2026-11-13T15:41:29Z. v0.5.12 Release returned HTTP 404; its tag and matching cloud release branch were absent. No duplicate release writer was found. Public release URL: https://github.com/just-every/run-uptime/releases/tag/v0.5.11.
4. Review `v0.5.11..origin/main`: five commits, covering rer 0.2.113/Base adoption, executable local sign-in guidance proof, the DNS rebinding journey and generated contract view refresh. Distinguish existing product changes from proof-only changes. Do not wait for unlanded feature work.
5. Set package.json, seed.json and RELEASE.json to 0.5.12, and RELEASE.json.previousVersion to 0.5.11. Add a dated CHANGELOG section from the actual main changes. Update only the existing current release references in README.md and the stale current CLI pin in RELEASE.md. Preserve the actual package.json pin at `@runeditrun/rer` 0.2.113. Completed.
6. Frozen-install dependencies; reinstall fleet hooks afterward. Run only typecheck and affected metadata/structural consistency checks, without setup, build, browser journeys or a full local suite. All completed with exit 0. No tests were added, deleted, skipped or weakened.
7. Fetch current main again and perform the required pre-publication rebase. It was already current; no source or generated-view conflicts occurred. Stage intentional metadata changes, regenerate sources.lock.json LAST using `node scripts/edition-authoring/cli.mjs lock`, then check it using `node scripts/edition-authoring/cli.mjs check`. Both exit 0; only six intended metadata hashes changed.
8. Commit once with explicit fleet author/committer environment, audit every candidate commit and trailer including side parents, inspect the complete diff, and push only the named cloud branch using the push guard. Completed on attempt 1. One product commit; no tags, main updates, force pushes, CI dispatches or reruns. PR not required by this seed's supplied fast-forward landing contract; none created. The fleet Mac owns full-history publication scanning and landing.
9. Discovered exact-SHA Verify through REST and waited at least 300 seconds between observations. Run 43518362117 is completed/failure on `7364b5f3dd7fcf29b533d3139315ad1701d0653e`, observed 2026-11-13T22:39:57Z. Polling/discovery GitHub API calls: 9/10, including one accidental empty discovery using an invalid placeholder SHA; that query supplied no CI evidence. No other-SHA run is used for readiness.
10. Explicitly select non-secret packet files, publish them only to `evidence/sd-uptime-release-0-5-12` through cloud_evidence.py, verify transport, then delete the successfully pushed disposable product clone and dependencies. Preserve report packet outside the clone. Evidence custody does not establish product acceptance or publication.

## Exact metadata paths

- package.json: product version 0.5.11 → 0.5.12; dependency pin unchanged at 0.2.113.
- seed.json: existing release version 0.5.11 → 0.5.12; all other metadata preserved.
- RELEASE.json: version 0.5.12, previousVersion 0.5.11, truthful public notes and existing screenshot path.
- CHANGELOG.md: new 2026-11-13 section for 0.5.12; every older section preserved byte-for-byte.
- README.md: current release record 0.5.12 and previous published version 0.5.11.
- RELEASE.md: existing “currently” rer version corrected from stale 0.2.65 to the actual 0.2.113 pin.
- sources.lock.json: regenerated last and checked, six changed metadata hashes.

There is no package-lock.json in this seed. Existing pnpm-lock.yaml remains unchanged, and a frozen install succeeds. No product, homepage, test, contract or generated view file changed. Diff: seven files, 39 insertions, 13 deletions.

## Release notes and limits

People see clearer local sign-in instructions: the terminal link or `rer dev --as owner`, conditional invited-person guidance, a plain next step after a refused local one-click link, and refusal of cross-site one-click entry without the explicit local key. The command guide documents `rer run --script` using rer's installed runtime and PATH guidance for later terminals. The release records adoption of rer 0.2.113 from 0.2.108 in v0.5.11; this round does not change the pin. No migration or new required setting is added by the included main changes. Notes make no new broad DNS/monitoring guarantee from proof-only commits.

Known debts carried forward: older stored heartbeat output is not rewritten; pattern-based redaction can miss unrecognizable unlabelled secrets; UptimeRobot monitor CSV import remains unsupported; archive restore does not restore erased-person fences; an adopted agent policy without settings returns an empty feed; bodies over 64 KiB fail the check. Hosted heartbeat evaluation needs a private runner, hosted Worker connections cannot be pinned, non-owner second-factor sign-in retains its command-line step, and broad product qualification remains partial. Bounded-memory archive restore and 500-monitor/90-day capacity remain unestablished; time-range selection and console chunk controls remain unavailable. The screenshot remains the existing 0.4.0 image and its age is explicit.

## Counts and clauses

Before → after: full target 115 → 115 clauses; DONE 37 → 37, PARTIAL 58 → 58, MISSING 20 → 20. Core: 37 done / 47 partial / 11 missing of 95; agent surface: 0 / 11 / 8 of 19; later: 0 / 0 / 1 of 1. Clause text/status/gap/evidence changes: none. Test registrations added/removed: 0/0. There are no target clauses or claim promotions for this version-only lease.

## Validation and custody

`dependency-install.log`, `typecheck.log`, `metadata-check.log`, `metadata-consistency.log`, `source-lock-write.json`, `source-lock-check.json`, `identity.log`, `product.patch` and `product-push.log` are actual outputs. `metadata-check.log` is empty because the successful command emitted no output. `receipt.json` records command exits, exact product provenance and CI observations. No private credentials or held-out gate material are included.

Local typecheck used the provided cloud setup's already-newer Node 24.19.0 and pnpm 10.12.4; pnpm warned that the repository pins Node 22.20.0. Exact-SHA CI uses that pinned Node. Full local suite and browser proof were intentionally not run for this metadata-only round. Full publication scanning is unavailable in cloud and remains the guarded Mac lander's responsibility.

Product push succeeded at `7364b5f3dd7fcf29b533d3139315ad1701d0653e`. Exact-SHA Verify: https://github.com/just-every/run-uptime/actions/runs/43518362117 (final observation: completed/failure). Exact-SHA Verify is red; the candidate is BLOCKED from readiness. Metadata readiness never means tag publication, deployment or RELEASED. Immutable tag production, signing, non-draft GitHub Release publication/readback and check-gh-release.sh remain with the authorized release producer. sd should route the release-lock notice; this cloud neither edits queue records nor unblocks ordinary landings itself.

Remote product ref readback matches the candidate SHA; product worktree is clean. GitHub push output reported 42 existing default-branch dependency alerts (16 high, 22 moderate, 4 low). These were not investigated or changed under the metadata-only lease.

Terminal product custody: BLOCKED at `7364b5f3dd7fcf29b533d3139315ad1701d0653e`. Evidence publication follows this final CI readback; the terminal message carries the exact evidence ref/head. The disposable clone and dependencies will be removed after successful evidence transport.

## Exact blocker and failed-run diagnosis

Verify 43518362117 completed with conclusion failure on the exact candidate. `shards (push-5)` failed in `proveDestinationStepUp`, `tests/destination-stepup-support.mjs:36`, called by `tests/security-controls-browser-support.mjs:40` and `tests/operator-security.mjs:59`. The cleanup loop DELETEs each notification destination and asserts 200; one returned 409. The aggregate verify job failed because SHARDS was failure. The log shows BUILD and PREPARE success. The actual response body was not logged, so the underlying 409 reason is not established.

The entire product and test diff against origin/main is empty. No unrelated runtime/test repair is permitted by the version-only lease; no failure assertion was changed, rerun requested or workflow dispatched. Do not waive the standing exact-SHA Verify bar. This is a real CI blocker, not a contract-generator-only failure and not merely pending CI. The lane needs a separately authorized diagnosis/fix of the destination cleanup failure before this candidate can be ready.

The remaining GitHub invocation was `gh run view 43518362117 --repo just-every/run-uptime --log-failed` (exit 0), a single successful archive read covering the failed shard and aggregate job. Job IDs were not separately fetched because that would exceed the ten-invocation budget; total calls are 10/10. The complete failed-step output is preserved in verify-failed.log with only environment header blocks removed before public evidence publication; the private unselected raw archive output remains outside the packet. No transport/download retry was needed.

BLOCKED branch=cloud/sd-uptime-release-0-5-12 head=7364b5f3dd7fcf29b533d3139315ad1701d0653e cause=Verify-43518362117-destination-cleanup-409

# Uptime 0.5.15 release metadata report

BLOCKED: metadata is committed and pushed, but exact-SHA Verify failed in the unchanged flow journey. Successful exact-SHA Verify is required before readiness.

Signed Run Edit Run fleet, 2026-11-16T15:59:24Z.

Product repository: just-every/run-uptime
Product branch: cloud/sd-uptime-release-0-5-15
Product head: 40a6a6d8104a7e4bc15ea89e47406f455a734fe9
Base main: 0cbeb3153edd8b4a067117ba572e32002b20713a
Previous published release: v0.5.13 (c1e8376c7dfd6ed601b6fe993567237449fc7143)

## Result and scope

Prepared the 0.5.15 metadata round in one real commit and pushed the named branch through the required cloud push guard, succeeding on attempt 1. The six changed files are package.json, seed.json, CHANGELOG.md, RELEASE.json, RELEASE.md and sources.lock.json. The diff contains 23 insertions and 15 deletions. pnpm-lock.yaml is unchanged because it contains no root product-version field to update.

Package and seed versions change from 0.5.14 to 0.5.15. RELEASE.json.previousVersion remains 0.5.13. The retired, unsigned v0.5.14 tag was left untouched; it was absent from the GitHub Release list. The tag probe returned v0.5.13 and v0.5.14 only, with no v0.5.15. The GitHub Release list likewise contained no v0.5.15 or v0.5.14; its latest published release was Uptime 0.5.13, published 2026-11-15T21:06:58Z. No tag or Release was created, modified or published by this task.

The unreceived 0.5.14 CHANGELOG section is folded into 0.5.15. Notes are based on the actual v0.5.13..main tree diff (67 changed files, 934 insertions, 325 deletions), including deliberate MAIL_PROVIDER=none installs; honest first-run and sign-in guidance; refused mail-off invitations before account/invitation creation; public health buildVersion; default SendGrid and saved-local-settings diagnostics; imported heartbeat editing while retaining settings; explicit simulated/restored notification outcomes; and re2js 2.8.7 (with transitive seroval 1.6.11 in the CHANGELOG). Notes make no claim that rer deploy can switch email back on. Test and shard changes are omitted from the new public notes.

The exact rer pin was already 0.2.119 on main. package.json, lock importer specifier and resolved lock version all remain exactly 0.2.119. Adoption files are unchanged. RELEASE.md's stale existing 0.2.118 reference is corrected to 0.2.119. The actual diff adds, changes or deletes no migration or SQL file. Migration inventory is none. Buyer backup, second-factor, private-settings, deployment-receipt and upgrade steps remain; the historical CHANGELOG from 0.5.13 down is byte-for-byte unchanged. Existing screenshot provenance and earlier known limitations remain explicit.

No application, homepage, README, other docs, workflow, test, contract source or generated acceptance view is changed. No UI proof applies to this metadata-only round. No PR was created: this seed uses fleet branch landing, with exact-SHA gates and publication scan performed by the fleet Mac.

## Plan and execution

The full plan is in PLAN.md. Executed sequence: fleet global/local identity, launcher refresh and decrypted-bundle credential helper; clone and clone-local forwarding commit hooks; inspect seed instructions and immutable release availability; compare v0.5.13 and current main; edit permitted metadata; frozen dependency installation and typecheck; refresh main and rebase with autostash before publication (main stayed at the brief's SHA); regenerate the source lock last and check it; inspect all outgoing identities, complete messages and trailers; push the first real commit; wait for exact-SHA Verify using REST and the 300-second minimum interval; assemble explicit non-secret report files for separate evidence publication.

The first attempt to configure/switch the checkout ran while cloning was still active and met its index lock. No lock was removed. After clone completion the local identity, hooks and named branch were installed successfully before any commit. All product work is in the single real commit named above.

## Verification and counts

- pnpm install --frozen-lockfile: PASS, pnpm 10.12.4. The supplied toolchain retained installed Node v24.19.0 (seed asks Node 22 or later); pnpm reported the package's exact Node 22.20.0 engine warning. TypeScript checks passed under that runtime. Branch CI uses Node 22.20.0.
- pnpm run typecheck: PASS for both application and runner TypeScript projects.
- node scripts/edition-authoring/cli.mjs lock: PASS; regenerated after all product edits and main refresh.
- node scripts/edition-authoring/cli.mjs check: PASS. Exactly five source-lock file identities change, matching CHANGELOG.md, RELEASE.json, RELEASE.md, package.json and seed.json.
- node src/base/contract-docs.mjs check: PASS, 0 errors and 0 warnings; generated views are current and untouched.
- Proportional metadata assertions: PASS for consistent 0.5.15 versions, previousVersion 0.5.13, all three exact rer pins, six-file scope, no migrations, one 0.5.15 entry, no 0.5.14 section, preserved old notes and backup steps, and expected source-lock entries. Actual receipt is metadata-check-receipt.json.
- git diff --check and clean committed HEAD/index: PASS.
- Every candidate commit (including side parents): fleet author and committer; no trailers or OpenAI/Codex co-author lines. One outgoing product commit.
- Full local suite and rer verify: not run under the metadata-only touched-check rule. No rer setup, build, dev server or browser session was needed.
- Base's publication scan: deferred to the fleet Mac as required by the cloud adaptation; no cloud publication-scan claim is made.

Before/after contract totals: 37 done / 58 partial / 20 missing / 115 total in both trees. Core stays 37/47/11 (95); Agent stays 0/11/8 (19); Later stays 0/0/1 (1). Clause changes: none; no CLAIM line. Test registrations added: 0; removed or weakened: 0. The existing verification plan continues to select 47 journey commands; it is unchanged. Product tracked-file count remains 2420.

## CI and custody

Product push receipt: product-push-receipt.txt.
Verify run: 43902164171, https://github.com/just-every/run-uptime/actions/runs/43902164171.
Exact SHA: 40a6a6d8104a7e4bc15ea89e47406f455a734fe9.
Initial discovery at 2026-11-16T15:57:55Z reported in_progress on that SHA. Final outcome is appended below from the actual REST receipt.

Evidence publication is independent of product readiness and does not claim acceptance, landing or release. Packet files are explicitly selected regular non-secret files. No inbox files are read or written here; the final report carries the relay line.

## Final exact-SHA result and blocker

Verify 43902164171 completed with FAILURE on 40a6a6d8104a7e4bc15ea89e47406f455a734fe9. The final REST observation was 2026-11-16T16:13:36.745364Z. This is not the allowed generated-contract-view exception: contract-docs passed.

The plan, build, prepare, contract-docs and seven of eight shards passed. Failed shard push-2 (job 133421899452) started at 15:58:41Z and finished at 16:11:54Z. Its flow-journey command started at 16:04:41Z. At 16:11:50Z its populated RUM restore proof attempted /api/archive and received HTTP 403 with code fresh_second_factor_required and message "Verify a second factor within the last five minutes". The stack is tests/pagespeed-support.mjs:470 (provePopulatedRumRestore), called by provePageSpeed at line 422 and tests/flow-journey.mjs:107. Owner sign-in occurs near the start of flow-journey; this long-running proof reaches archive after that freshness window. Both test files and all application/authentication code are unchanged from the base main tree. The aggregate verify job 133431249064 consequently failed; full-push-proof and nightly-proof were skipped.

Read each failed job archive once with the required gh run view --job --log-failed command. Both archive reads succeeded. Complete sanitized actual output and invocation receipts are in ci-failed-push-2.log, ci-failed-log-receipt.json, ci-failed-verify.log and ci-failed-verify-receipt.json. Eight GitHub API-budget calls were used in total: one Release listing, one exact-SHA run discovery, three run polls, one jobs listing and two failed-job log reads. No repeated archive read, run retry, new dispatch, empty commit, tag or main push was used.

The remaining repair needs a separately authorized test/flow round: renew the test owner's second-factor verification at the ordinary archive boundary while retaining the production freshness guard and every assertion, then obtain successful exact-SHA Verify for the final candidate. This task's explicit lease permits only release metadata and its source lock; it does not permit editing tests or production authentication to fix this inherited long-journey failure. No READY or RELEASED claim is made.

Remote product ref readback matched the committed SHA. Existing v0.5.13 and retired v0.5.14 tag objects stayed unchanged, and v0.5.15 was still absent on readback. Product work is safely pushed. The packet will be published through the separate report-only evidence ref; the terminal evidence receipt records its actual head independently. Clone cleanup follows successful evidence publication, as required by the brief. The fleet Mac still owns publication scanning, exact-SHA integration gates, any later release/tag operation and landing.

POST lanes/sd/INBOX.md: sd-uptime-release-0-5-15 metadata pushed on cloud/sd-uptime-release-0-5-15 at 40a6a6d8104a7e4bc15ea89e47406f455a734fe9; 0.5.14 -> 0.5.15, previousVersion 0.5.13, exact rer 0.2.119 retained, migrations none, clause/status changes none (37 done/58 partial/20 missing unchanged). Verify 43902164171 FAILED: push-2 job 133421899452, /api/archive 403 fresh_second_factor_required in unchanged tests/pagespeed-support.mjs:470 via flow-journey.mjs:107; aggregate job 133431249064 failed. Requires a separately scoped journey freshness repair and successful exact-SHA Verify; no tag, Release or self-submit.

BLOCKED branch=cloud/sd-uptime-release-0-5-15 head=40a6a6d8104a7e4bc15ea89e47406f455a734fe9 prerequisite="Successful exact-SHA Verify"

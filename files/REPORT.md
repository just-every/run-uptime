# Uptime 0.5.14 release metadata

Author: Run Edit Run fleet
Date: 2026-11-16 UTC
Tag: sd-uptime-release-0-5-14
Repository: just-every/run-uptime
Branch: cloud/sd-uptime-release-0-5-14
Product head: e52204f8e0627806456b77367205efdf7489fbd2
Base main: 91bdcfbac8b53121ccb1864873f19241c533bc4f
PR: none; this seed uses the fleet lander, and this task neither self-submits nor lands.
Product custody: pushed successfully with the fleet guard on attempt 1.
CI: exact-SHA Verify run 43805394437 completed/success on e52204f8e0627806456b77367205efdf7489fbd2, observed 2026-11-16T04:54:29Z. URL: https://github.com/just-every/run-uptime/actions/runs/43805394437
No immutable tag or GitHub Release was created. This is a release metadata candidate, not a RELEASED claim.

## Plan

The complete plan is PLAN.md. Execution followed these steps:

1. Set global fleet identity first, refreshed the fleet launcher, read launcher and seed instructions, installed the decrypted-bundle-only Git helper, push guard and co-author cleanup hook.
2. Cloned only the declared repository with depth 1 and blob filtering, installed local fleet identity, and created the named branch from origin/main. Deepened this same clone by 30 commits and fetched v0.5.13 to compare the actual release interval.
3. Read current metadata and the seven commits in v0.5.13..main. Confirmed the v0.5.14 tag and Release were absent, the package and lock both pinned rer exactly 0.2.118, and the migration diff was empty.
4. Changed only release metadata, ran the touched checks, refreshed main and completed an unpublished rebase with autostash because the metadata was already edited. Main remained 91bdcfbac8b53121ccb1864873f19241c533bc4f; the autostash restored the edits. No published history was rewritten.
5. Staged intended release files, regenerated sources.lock.json last using the supported edition-authoring lock command, then ran its check. Committed with explicit fleet author/committer variables and active hooks. Audited every candidate commit and all complete messages/trailers before pushing.
6. Pushed the first real commit through cloud-push.py, and started one exact-SHA REST watcher with at least 300 seconds between observations. Evidence remains outside the product tree and will be published only to the separate evidence ref.

## Changes and actual release inventory

Package, seed and RELEASE.json version: 0.5.13 → 0.5.14.
RELEASE.json previousVersion: 0.5.12 → 0.5.13.
RELEASE.md names Uptime 0.5.14 and corrects its stale reference to the existing rer 0.2.118 pin.
CHANGELOG.md adds the dated 0.5.14 section from the real v0.5.13..main diff; older sections are retained whole.
The source lock changes only the five metadata file hashes.

User-visible release notes describe deliberate hosted MAIL_PROVIDER=none installs and public /health buildVersion. Notes explain guarded rer signin from the deploying checkout, unavailable email links/invitations/alerts while off, and unchanged local development/demo mail behavior. Notes do not claim email can be re-enabled through rer deploy; that remains unestablished and the C1–C4 follow-up round is separate. No test-only work is advertised.

Buyer backup/upgrade guidance retains the Settings backup route, a second factor verified within five minutes, private settings and .rer/deploy backups kept separately, hosted database backup, verified-cookie CLI export, frozen install and ordinary deployment. Existing known issues and earlier cautions remain. The screenshot remains the existing 0.4.0 image with truthful provenance; no new screenshot or UI proof is claimed.

Exact rer package pin before/after: 0.2.118 → 0.2.118.
Exact rer lockfile specifier/resolution before/after: 0.2.118 → 0.2.118.
pnpm-lock.yaml and all mail-off adoption/application files are unchanged by this round.
Database migrations added: 0 → 0. Migration files changed since v0.5.13: none.
Changed product files: CHANGELOG.md, RELEASE.json, RELEASE.md, package.json, seed.json, sources.lock.json (6 files, 37 insertions, 12 deletions).
Application, homepage, README, other docs, contract source and generated views are unchanged.

## Counts and clause custody

Contract counts before/after: 37 done / 58 partial / 20 missing / 115 total → 37 / 58 / 20 / 115.
Published clauses: 14 done / 7 partial / 0 missing / 21 total, unchanged.
Target and push-further clauses: 23 done / 51 partial / 20 missing / 94 total, unchanged.
Clause Status/Gap/Evidence changes: none. No clause is targeted, promoted or claimed by this metadata round.
Test registrations added/removed: 0 / 0; no test files changed. Existing acceptance assertions are retained.
C1–C4 mail-off follow-ups are not part of this release metadata round.

## Validation

- pnpm install --frozen-lockfile: passed, exact rer 0.2.118 installed, lockfile unchanged.
- pnpm typecheck: passed both application and runner TypeScript projects.
- pnpm exec rer check --profile first-party: passed.
- node src/base/contract-docs.mjs check: passed, 0 errors and 0 warnings; generated documents current.
- One-time metadata consistency and scope review: passed; aligned product versions and previousVersion, rer pin and lock consistency, no migration changes, release section/title and tag absence.
- node scripts/edition-authoring/cli.mjs lock: completed after all intended source edits and staging.
- node scripts/edition-authoring/cli.mjs check: passed.
- git diff --cached --check: passed.
- All candidate commit authors/committers are Run Edit Run fleet <fleet@runeditrun.com>; trailers are absent, and no OpenAI/Codex co-author line is present.
- Product remote ref readback matches the pushed full SHA; see product-ref-receipt.txt.
- No full local verify, browser journey, deployment, tag or Release command was run for this metadata-only change. Full branch Verify is the CI gate.
- The supplied toolchain retained the VM's newer Node v24.19.0 with pnpm 10.12.4; pnpm emitted the repository engine warning. Exact-SHA CI uses the repository's Node 22.20.0 pin.

The full publication scan is delegated to the Mac fleet by the cloud instructions and has not been run or claimed here. Landing, post-landing Run site and any future immutable tag/Release remain with the fleet.

## Reports and receipts

PLAN.md contains the full plan. release-review-receipt.json contains the main interval, pin, migration, version, scope and check observations. Product-push and identity/ref receipts retain actual custody evidence. Local command outputs and exact-SHA CI discovery/poll observations are saved as separate actual files. All files selected for evidence publication will be checked for secrets and symlinks; no environment dump, credential, secret value or held-out gate material is selected.

## Blockers

None. Local touched checks and exact-SHA Verify passed. The Mac fleet retains the full publication scan and landing gates; no scan or landing is claimed here. Evidence publication is separate from product READY and landing.

## Final result

READY branch=cloud/sd-uptime-release-0-5-14 head=e52204f8e0627806456b77367205efdf7489fbd2
Verify: completed/success, exact SHA e52204f8e0627806456b77367205efdf7489fbd2, run 43805394437.
Verify URL: https://github.com/just-every/run-uptime/actions/runs/43805394437
GitHub calls used: 5 of 10 (one release-list call, one exact-SHA discovery call, three status polls). Run polls were at least 300 seconds apart. No retries, workflow dispatches, log archive reads or additional watchers were used.
Product head/index/worktree are unchanged after the successful push and final CI observation.
Evidence publication will use only refs/heads/evidence/sd-uptime-release-0-5-14; its exact EVIDENCE receipt is returned in the terminal message. The packet's manifest and hashes will be read back independently before cleanup.
Terminal custody is also recorded in terminal-custody-receipt.json.
— Run Edit Run fleet, 2026-11-16T04:55:08Z

# Uptime 0.5.10 release metadata candidate

Repository: just-every/run-uptime  
Task: sd-uptime-release-0-5-10  
Branch: cloud/sd-uptime-release-0-5-10  
Product head: bd7b21317cae0ae0082fa88127cef6842c377504  
Base main: 36779a7228727cb38d7180b26c5b5aa656ca1056  
Previous tag commit: 88c586f6fabdaed6768ddc8072af2340310a7ace  
PR: none; this brief hands the pushed branch to the guarded Mac lander.

## Plan

1. Configure fleet identity, refresh the authorized launcher, install the bundle-only Git helper, push guard and repository-preserving commit hook. Clone only just-every/run-uptime shallow and filtered into fresh scratch; work only on cloud/sd-uptime-release-0-5-10.
2. Confirm current main and its exact-SHA Verify and Run site both succeeded. Check v0.5.10 is absent and inspect release branches/open PRs for a competing builder. Stop without duplicating a carried version or live peer.
3. Read the inline fleet/release rules and repository guidance. Fetch only enough history to compare v0.5.9 with current main, including merged side branches. Inspect the actual prior metadata and user-visible implementation changes.
4. Update package.json, seed.json's existing release-version reference, RELEASE.json, README.md and prepend an honest dated CHANGELOG section. Preserve historical entries, existing screenshot disclosure, known issues, pinned rer 0.2.108 and all product/tests/contracts/homepage files. This repository has pnpm-lock.yaml, no package-lock.json; no dependency or lockfile change is needed for its root package version.
5. Frozen-install dependencies, reinstall the commit hook after setup, run metadata consistency checks and typecheck only. Do not add tests or run a local full suite, build, browser proof, provider gate or release producer for this metadata-only assignment.
6. Fetch/rebase current main before the first real commit and first push. If main moved, reconfirm its exact-SHA green workflows before proceeding. Regenerate the documented edition source lock last, then run its check. Review the exact path allowlist, preservation of generated views and contract, and all candidate authors/committers/messages/trailers including side parents.
7. Commit with explicit fleet author/committer environment and active hooks, and immediately push only the named product branch through cloud-push.py. Publication scanning and landing remain with the guarded Mac lander; never tag, sign, publish a release or push main here.
8. Use one REST watcher for the exact pushed SHA, no more than one call per 300 seconds per run including discovery, and a ten-call budget. Read a completed failure once per failed job if needed. Report READY only after exact-SHA Verify success (or the documented generated-view-only exception), otherwise PUSHED while CI is pending, or a precise real blocker. Preserve any unpushed work in a verified external bundle on transport exhaustion.
9. Save actual non-secret report/receipt files under the task packet. Publish explicitly selected files to evidence/sd-uptime-release-0-5-10 through the separate evidence entrypoint, keeping the product checkout unchanged. Verify transfer and preserve terminal provenance; delete the successful product scratch clone and dependencies. Emit sd POST custody and the required final READY/PUSHED line.

## Baseline and duplicate checks

- Main was fetched and confirmed unchanged at 36779a7228727cb38d7180b26c5b5aa656ca1056 immediately before the candidate push. Its exact-SHA Verify 43332501500 and Run site 43332501462 were completed/success. The older branch Verify 43326882775 for the same SHA was also successful. No red-main exception was used.
- Main carried 0.5.9 in package.json, seed.json and RELEASE.json. The actual annotated v0.5.9 tag resolves to 88c586f6fabdaed6768ddc8072af2340310a7ace. The GitHub latest-release readback reported non-draft Uptime 0.5.9, published 2026-11-12T18:01:29Z, at https://github.com/just-every/run-uptime/releases/tag/v0.5.9.
- Remote tag queries before editing and immediately before committing found no v0.5.10 tag. The matching cloud release-branch query found only prior release work through 0.5.9, with no 0.5.10 peer branch. Open-PR readback found no 0.5.10 release peer. No fleet INBOX or STATE file was read.
- Compared all reachable main changes since v0.5.9, including side branches. The actual implementation/docs, rather than commit titles alone, support the notes. The mail-sender and deadline commits predominantly add proof of existing behavior and do not become invented new release features.

## Product changes

Version changes from 0.5.9 to 0.5.10; previousVersion becomes 0.5.9. The pinned @runeditrun/rer remains exactly 0.2.108. Six paths changed:

- package.json: root version only.
- seed.json: existing root release-version reference only; capabilities and product policy remain unchanged.
- RELEASE.json: version, previousVersion and public release summary.
- README.md: previous/current release references only.
- CHANGELOG.md: prepend the dated 0.5.10 section; preserve every historical section and carried known issue.
- sources.lock.json: regenerated last through the documented edition-authoring command; only the five intended metadata file hashes change.

There is no package-lock.json in this checkout. The existing pnpm-lock.yaml contains dependency resolutions, not the root package version, and remains byte-identical. No pin update or new lockfile was introduced. Contract source, clause Status/Gap/Evidence, ACCEPTANCE.md, docs/CLAIMS.md, application source, tests and homepage are unchanged.

The notes describe resumable digest-checked archive transfers, larger record/journal support, the 500-monitor admission limit and its unmeasured-capacity qualification, mention-free incident-note editing through agents, cleanup-step accounting for API manual-check approval, statusless redirect-refusal snapshots, and explicit review of Auth0 tenant disclosure through the owner API. Auth0 remains Unknown and cannot be followed. Chunk transfer refusal bounds, legacy JSON archive bounds, retained scale/memory limitations and the old screenshot date are disclosed. The notes promise no new migration, provider completion or hosted-scale qualification. Full extracted notes are in release-notes.md.

## Local checks and identity

- Frozen dependency installation succeeded with pnpm 10.12.4. The fleet hook was installed after cloning and again after dependency setup. All repository hooks remained enabled.
- Metadata consistency and exact path allowlist: PASS. The package/seed/release versions agree; previousVersion and README agree; the rer pin, pnpm lockfile, generated views and contract are unchanged; historical changelog entries are preserved; the disclosed screenshot exists.
- Typecheck: PASS, both application and runner tsconfigs, using Node v22.20.0 and pnpm 10.12.4. An earlier run on the VM's Node v24.19.0 also passed, but the recorded authoritative typecheck receipt uses the exact repository Node pin.
- Source lock: `node scripts/edition-authoring/cli.mjs lock`, then `node scripts/edition-authoring/cli.mjs check`: PASS, 2,384 locked files. A second read-only lock check on the committed, rebased head passed.
- `git diff --check`: PASS. Candidate diff is six files, 42 insertions and 11 deletions. The working tree was clean after committing.
- Fetched main and ran the required pre-first-push rebase; it was already up to date and the head did not change.
- Full candidate range origin/main..HEAD, including side parents: one commit. Author and committer are Run Edit Run fleet <fleet@runeditrun.com>; full message inspected, no trailers and no CI-skip marker. Explicit author/committer environment and active hooks were used for the commit and rebase.
- cloud-push.py published the first real commit on attempt 1, only to cloud/sd-uptime-release-0-5-10. Product custody is confirmed in product-push.txt and product-receipt.json.
- No tests were added, deleted or changed. No full local suite, app build, browser proof or release/provider gate was run for this metadata-only change. The independent full-history publication scan remains with the guarded Mac lander, as the cloud adaptation requires.

## Before/after counts and clause status

| Tier | Before done/partial/missing | After done/partial/missing | Total |
| --- | --- | --- | ---: |
| Core | 37 / 47 / 11 | 37 / 47 / 11 | 95 |
| Agent surface | 0 / 11 / 8 | 0 / 11 / 8 | 19 |
| Later | 0 / 0 / 1 | 0 / 0 / 1 | 1 |
| Full target | 37 / 58 / 20 | 37 / 58 / 20 | 115 |

Clause status changes: none. Test additions/removals/modifications: 0 / 0 / 0. No target clause or CLAIM promotion is part of release metadata preparation.

## Candidate CI and custody

Verify run: https://github.com/just-every/run-uptime/actions/runs/43362380050  
Run ID: 43362380050  
Exact head: bd7b21317cae0ae0082fa88127cef6842c377504  
Final status: completed / success, confirmed by REST readback after the required polling interval. No generated-view exception was used. Blockers: none.

One watcher was used. Eight of ten gh calls were used across baseline, duplicate-release/PR reads, exact-head discovery and four permitted exact-run readbacks. Every poll was at least 300 seconds after discovery/the prior poll. No run was dispatched or rerun; only the exact candidate SHA's completed/success result authorizes this READY report.

READY repo=just-every/run-uptime branch=cloud/sd-uptime-release-0-5-10 head=bd7b21317cae0ae0082fa88127cef6842c377504

## Remaining custody

This task prepares release metadata only. Landing, full-history publication scanning, producer/tag work, immutable tag readback, signing and GitHub Release publication belong to the fleet's later authorized steps. No main/default branch or tag was pushed; no release or asset was created or signed. The existing screenshot and all product behavior remain untouched by this candidate. A tag by itself would still be RELEASE-PENDING; this report makes no RELEASED claim.

All actual non-secret files are retained in this packet. Evidence destination: refs/heads/evidence/sd-uptime-release-0-5-10. The actual evidence ref/head returned by publication is emitted verbatim in the terminal message, separately from product READY custody. The product clone is retained until transfer and final provenance checks complete, then removed with its installed dependencies as the brief requires. The terminal message confirms cleanup after it occurs.

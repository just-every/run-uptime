# Uptime 0.5.11 metadata candidate

Stamp: 2026-11-13T13:42:41Z.
Repository: just-every/run-uptime.
Branch: cloud/sd-uptime-release-0-5-11.
Candidate: 04016399e1e879e7be3b8e891baf02d975bb3901.
Base: 8e0b5af47df91cf6d05eabb6eba587329b4056a7.

## Plan and scope

1. Apply fleet identity, refresh the launcher, install decrypted-bundle Git authentication, commit hooks and push/evidence entrypoints. Read launcher AGENTS.md, seed AGENTS.md and the inline builder/release rules.
2. Clone with --depth 1 --filter=blob:none, create the named branch, inspect main and release ownership before editing, then deepen the declared repository to review all changes since the previous release.
3. Update only existing release metadata/version references. Move the existing Unreleased maintenance/erasure note into the dated release section and describe the actual heartbeat and local sign-in changes since v0.5.10. Retain old release sections and all known limits. Preserve the rer pin.
4. Frozen-install dependencies. Run metadata consistency, first-party structural check and typecheck only. Regenerate sources.lock.json last, run its check, commit with fleet identity, rebase onto fetched main and inspect every candidate author, committer and complete message.
5. Push the product branch once through cloud-push.py, read back the exact head and watch exact-SHA Verify through REST within the ten-call budget and 300-second polling interval. Publish explicit non-secret packet files to the separate evidence branch, verify the transfer and delete the successful scratch clone/dependencies.

## Pre-edit observations

Main was 8e0b5af47df91cf6d05eabb6eba587329b4056a7, matching the independently observed brief. REST confirmed Verify 43426265387 success and Run site 43426265447 success on that exact SHA; another branch Verify 43421074831 was also success. Latest published release was [Uptime 0.5.10](https://github.com/just-every/run-uptime/releases/tag/v0.5.10), published 2026-11-13T05:56:08Z. No v0.5.11 Release appeared among the newest 30 releases, no v0.5.11 tag was advertised, no matching v0.5.11 cloud branch existed and the open PR list showed no competing release writer. Tag v0.5.10 points through annotated tag 257698933c4482a4fb1b89f935d531a5f0e925d4 to bd7b21317cae0ae0082fa88127cef6842c377504.

Seven commits including a merge separate that release from main. The complete actual commit subjects/bodies are in changes-since-0.5.10.txt. Public-facing changes reviewed directly in the diff: named maintenance selections and readable monitor erasure receipts; saved cron/period heartbeat summaries and cron freshness evaluation; accurate local invitation non-delivery and private terminal sign-in handoff. The final two commits stabilize existing credential browser assertions; the release notes make no new product claims from those test changes.

## Metadata changes

- package.json: 0.5.10 → 0.5.11.
- seed.json: existing product version 0.5.10 → 0.5.11; all other fields preserved.
- RELEASE.json: version 0.5.11, previousVersion 0.5.10, honest public notes for the reviewed delta, retained limitations and actual existing screenshot path.
- CHANGELOG.md: dated 2026-11-13 section; move the existing Unreleased note, add heartbeat and local invitation changes, upgrade instructions and existing limitations. All 0.5.10 and older sections are byte-for-byte preserved.
- README.md: existing previous/current release references only, v0.5.10/v0.5.11.
- sources.lock.json: generated last using node scripts/edition-authoring/cli.mjs lock; check passed. Five file hashes changed; 2,387 tracked sources recorded.

There is no package-lock.json in this repository. Its existing pnpm-lock.yaml is unchanged. package.json pins @runeditrun/rer at **0.2.108**, unchanged. No homepage, application source, migration, test, contract clause, generated acceptance view or claim view changed. Product diff: six files, 38 insertions and 11 deletions.

## Validation and custody

All local checks listed in RECEIPT.json exited 0: frozen dependency install, metadata consistency (including matching versions, previous version, unchanged rer pin, actual screenshot, README references and preserved historical changelog), pnpm run typecheck, pnpm exec rer check --profile first-party, source-lock generation/check and diff whitespace check. The structural check returned no stdout. The supplied toolchain setup selected Node v24.19.0 and pnpm 10.12.4; pnpm printed the checkout's exact Node 22.20.0 engine warning. No new tests or full local suite were run for this metadata-only round.

Rebase onto fetched main reported already up to date. Every candidate author and committer was Run Edit Run fleet <fleet@runeditrun.com>; there were no trailers. Commit hook remained active. The first product push succeeded on attempt 1 and remote readback matched 04016399e1e879e7be3b8e891baf02d975bb3901. No save or second product push was needed. No PR was created: the brief assigns this candidate to the guarded fleet lander and the repository supplies branch-push Verify.

Candidate [Verify 43435854415](https://github.com/just-every/run-uptime/actions/runs/43435854415) remained **in progress** on the exact SHA at **2026-11-13T14:01:38Z**, after discovery and four subsequent observations at least 300 seconds apart. Eight GitHub calls were used in total. Polling stopped with two calls reserved: they would not cover another status poll plus failed-job discovery and a failed-job log read if the run turned red. No completed success or failure was observed, so terminal product custody is **PUSHED**, not READY or BLOCKED. The fleet must read the completed exact-SHA result before landing. No CI dispatch or rerun was requested; the sole task watcher was stopped by its own PID.

## Counts and clauses

Before and after: 115 clauses, 37 done, 58 partial, 20 missing. Core: 37/47/11 of 95; agent surface: 0/11/8 of 19; later: 0/0/1 of 1. No clause status changes or clause completion claims. Tests added: 0; tests removed: 0; every existing test retained. Registration count was not recomputed because no tests changed.

## Follow-up custody and debts

The guarded Mac lander owns the full-history publication scan, final integration and exact-SHA gates. The cloud brief explicitly excludes a remote publication scan. This is release metadata preparation only: no main/tag push, producer run, signing, GitHub Release publication, catalogue submission or deployment occurred. Later authorized production/signing/publication must use the actual rer pin and new output paths, verify the non-draft GitHub Release and run check-gh-release.sh before a RELEASED claim. The unchanged RELEASE.md contains a stale parenthetical rer 0.2.65 reference; the actual package.json pin is 0.2.108 and was used here. The existing screenshot remains from 0.4.0; the notes state its age. Existing archive/capacity, import, erasure-list restore, agent decision-feed, large-response and hosted/private-runner limitations remain follow-up work and do not hold this metadata candidate. GitHub's push response also reported default-branch dependency alerts; dependency changes are outside this lease.

No implementation blocker was observed. Product custody and evidence publication remain separate.

## Evidence and cleanup plan

Publish all explicitly selected report, actual receipt and log files using cloud_evidence.py to refs/heads/evidence/sd-uptime-release-0-5-11 only. Read back the ref and fetch it into isolated report storage, checking the manifest, blob identities and file hashes. Then delete this task’s successful scratch clone and its node_modules; retain the packet and evidence transfer receipts outside the clone. Evidence transfer is independent of product custody and never signals READY or acceptance.

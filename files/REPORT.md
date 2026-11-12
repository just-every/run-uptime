# Uptime 0.5.8 release metadata candidate

Recorded 2026-11-12T12:27:20.233183+00:00. Repository: just-every/run-uptime. Tag for this task: sd-uptime-release-0-5-8.

## Plan and execution

1. Set the fleet Git identity before other work. Read and refresh the fleet launcher, install the decrypted-bundle Git helper and guarded push entrypoint, and follow its AGENTS.md and the supplied builder/release rules.
2. Clone a fresh shallow filtered checkout, configure repository identity and the co-author cleanup hook, and create the named branch from main. Read the seed guidance, release procedure, contract and generated acceptance context.
3. Check current main, its exact-SHA Verify and Run site, the latest public releases, tags and open release candidates before editing. Main remains `3da4c79633ac6703928e540a92689a14457b81c2`. Verify 43184741006 and Run site 43184740903 succeeded on that exact SHA. v0.5.8 was absent from main, tags, release branches, open PRs and the latest release list; no live v0.5.8 peer was found. Other unrelated PRs were preserved.
4. Compare the actual v0.5.7 tag commit `a715d2188b5d38cc563465292bc8c461b93c6528` with main. Three commits changed documentation, key instructions, startup action handling, in-place definition-import and monitor-erasure verification, and erasure-receipt presentation. Review the actual changed implementation to make the notes accurately describe those changes.
5. Update the release versions, add dated public notes, retain known limitations and the historical screenshot caveat, and correct the README's existing release-version sentence. Keep the published rer dependency pin and all product/tests/contract files intact.
6. Install frozen dependencies using the supplied cloud toolchain and run typecheck. Check metadata consistency and scope without adding tests for a version bump. Fetch and rebase onto main before the first candidate push. No drift or conflicts occurred. Regenerate the source lock last and run its check.
7. Commit with the fleet author and committer, inspect all candidate identities and complete messages/trailers, and push the first real commit using cloud-push.py to the named branch only. Push succeeded on its first attempt. Discover and await the exact-SHA Verify through REST, observing the five-minute polling interval and ten-call budget.
8. Save this complete report, actual local receipts and CI responses outside the product repository. Publish only explicitly selected non-secret files through the separate evidence ref. After successful custody transfer, remove the product clone and dependencies as requested. The guarded Mac lander owns full-history publication scanning, landing and subsequent producer/tag/signing/publication.

## Product result

- Branch: `cloud/sd-uptime-release-0-5-8`
- Head: `ed5429192d18503c4c8caa8d797d82ffdcc78f54`
- Version: 0.5.7 → 0.5.8; previousVersion: 0.5.7.
- Files: CHANGELOG.md, README.md, RELEASE.json, package.json, seed.json, sources.lock.json.
- Diff: 6 files, 41 insertions, 11 deletions. Five source hashes changed in the regenerated lock (2,364 tracked locked files).
- package-lock.json does not exist in this repository. pnpm-lock.yaml stays byte-identical; the version field is not part of its importer metadata. No replacement lockfile was created.
- The published @runeditrun/rer pin stays 0.2.108; dependencies and settings are unchanged.
- The old screenshot is explicitly described as taken on 0.4.0; no new screenshot or browser proof is claimed.
- No product code, tests, migration, homepage, clause text/status/gap/evidence or generated view changes.
- Clause counts remain 37 done / 58 partial / 20 missing / 115 total. Core: 37/47/11 (95); agent surface: 0/11/8 (19); later: 0/0/1 (1). No clause claims or promotions. Tests: 0 added, 0 removed, no test-file changes.
- No PR created: the supplied landing contract assigns guarded branch custody to the Mac lander, and seed guidance adds no PR requirement for this candidate.

## Validation

- `pnpm install --frozen-lockfile`: exit 0.
- `pnpm run typecheck`: exit 0 for application and runner TypeScript.
- Metadata consistency, preserved dependency fields, version agreement, previousVersion, dated changelog, historical changelog retention, screenshot existence, unchanged contract/views/pnpm lock, and six-file scope: pass (metadata-check.json).
- `git diff --check HEAD`: pass.
- `node scripts/edition-authoring/cli.mjs lock`: exit 0, run last after intended edits and rebase.
- `node scripts/edition-authoring/cli.mjs check`: exit 0, full actual output in source-lock-check.json.
- Toolchain: the supplied setup initially selected Node v24.19.0 and pnpm 10.12.4, producing an engines warning despite a passing typecheck. Installed the exact Node 22.20.0 package from npm under the task-owned toolchain directory and repeated typecheck with Node v22.20.0 and pnpm 10.12.4: exit 0, with no engine warning (typecheck-node22.log). Branch CI also pins Node 22.20.0.
- No full local suite, product journeys, local build or browser gate run for this metadata-only change, per the brief.
- Candidate identity: Run Edit Run fleet <fleet@runeditrun.com> for author and committer. No co-author or other trailers. Repository hooks remain enabled.

## CI and custody

Exact-head Verify: https://github.com/just-every/run-uptime/actions/runs/43217811037 — completed/success on `ed5429192d18503c4c8caa8d797d82ffdcc78f54`, confirmed by the REST response in ci-final.json. No dispatch or rerun was requested.

Product publication succeeded through the push guard. This is a release-metadata candidate, not a completed release. No main/default-branch push, tag creation, signing, provider deployment or GitHub Release publication was performed. The full-history publication scan is required on the guarded Mac lander and was not invoked in this cloud VM. Release production and readback remain follow-on fleet work; no RELEASED claim is made.

Actual evidence files are selected explicitly for `refs/heads/evidence/sd-uptime-release-0-5-8`; evidence is absent from the product tree. RECEIPT.json carries terminal provenance and CI state. Public GitHub REST responses are preserved in numbered call receipts. The transfer manifest is generated by cloud_evidence.py with file hashes and product provenance.

## Blockers

None for this metadata candidate. Exact-SHA Verify completed successfully. The Mac lander still owns publication scanning and landing; producer/tag/signing/GitHub Release are subsequent release work.

## CI transport recovery checkpoint

Verify was in progress at the first permitted poll. The second permitted poll returned HTTP 401 Bad credentials. The launcher was refreshed and the complete fleet Git setup repeated; credentials are reread from the same injected bundle, with no other credential sought. The next retry observes the five-minute CI interval. Product custody is already PUSHED at the reported SHA. No green conclusion is inferred from the earlier main runs.

At 2026-11-12T12:41:52.485816+00:00, REST access recovered (call 7) using the same refreshed injected bundle. Verify remains in progress on the exact product SHA. Git remote lookup also succeeds. The first evidence checkpoint failed at ls-remote; a separate retry follows. No credential was substituted. A recovery bundle outside the clone was created and verified despite successful product push, to preserve an additional copy during the transient transport failure.

## Terminal candidate receipt

Confirmed 2026-11-12T12:46:44.688706+00:00. Exact-SHA Verify 43217811037: completed/success. 8 GitHub calls used of the ten-call budget. The metadata candidate is READY for guarded fleet landing. The complete selected packet is published separately through the evidence ref; its generated manifest records exact file hashes and this product SHA. Product clone and dependencies are removed after evidence publication and readback succeed.

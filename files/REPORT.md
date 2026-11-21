# Uptime 0.5.20 release metadata

Run Edit Run fleet · 2026-11-21T22:51:08Z

Repository just-every/run-uptime. Candidate cloud/sd-uptime-release-0-5-20 at 6d5fcba139c65c636f87799f432c5124bfc2f641. Fresh main 73a3c77de5857576281d558c111301f9988a3aa4. Published v0.5.19 commit b9bff679ec99b702de753d63ad385d232e6b6d1e.

## Plan and results

1. Fetch fresh main and the v0.5.19 tag, and compare the two trees before drafting. Main contained 6e7149d1 (local onboarding and operator workflows), 70abf592 (Run site transient reads) and 73a3c77d (scope the retry to Run site). The final Git ref probe and the GitHub Release lookup confirmed v0.5.20 was available before the push.
2. Advance package, seed and release metadata to 0.5.20 with previous version 0.5.19. The changelog and public release notes describe the private local sign-in link, localhost passkey setup, CLI archive confirmation and verification steps, definition import approval continuity, monitoring read tags, key copying and the updated operator guides. The Run site retry is in the reviewed baseline diff and is internal to the workflow. The 0.5.19 buyer backup and upgrade steps and Known limits carry forward. The existing console screenshot remains available and is labeled as a 0.4.0 capture.
3. Keep the exact RER pin at 0.2.125. The pnpm lock has no release version reference and passed a frozen install. Refresh the edition source lock after staging all metadata, check it and verify the recorded Base copies offline. The edited paths were CHANGELOG.md, RELEASE.json, RELEASE.md, package.json, seed.json, sources.lock.json.
4. Verify the candidate's scope, migration inventory, declared hashes and checked-in contract views. The application build, deployment spec check, both TypeScript project checks, contract generator check and diff whitespace check passed. The deployment spec check needs build artifacts and passed after building. The checkout was clean afterward.
5. Fetch and rebase onto origin/main before pushing. The candidate is one commit directly on the reviewed main SHA. The sole product push used the fleet guard and succeeded on its first attempt. A remote readback matched the candidate SHA, and the exact pushed tree's declared hash was checked again. The candidate branch has no open PR.
6. Check the exact candidate's push Verify and publish this report and receipt separately from the product commit. Verify completed/success. The fleet lander owns the full publication scan and the main-only Run site deployment check. This metadata round ends before the tag and release.

## Migration inventory

| Before (v0.5.19) | After (candidate) | Added | Removed | Changed |
| ---: | ---: | --- | --- | --- |
| 91 | 91 | None | None | None |

Every v0.5.19 SQL migration is byte-identical at the candidate. The recursive Git migration-tree listing has SHA-256 db9d2fb069e95a18f15e72504f035881fced822edce9b8ba16976ab98d4c3bb6 at both refs. No new settings are required.

## Declared project hashes

| Key path | File | Declared SHA-256 | Actual SHA-256 |
| --- | --- | --- | --- |
| setup.sha256 | rer-setup.json | 81aef96872569eb67d3dbaa2f2f561dca54aca2c32ded8021b153d3b818d6181 | 81aef96872569eb67d3dbaa2f2f561dca54aca2c32ded8021b153d3b818d6181 |

This was the only file-hash declaration in the project manifest. Fresh main already had the matching value. The retained screenshot blob is 239dff21ed54b8b9a43783abfe298778ba400435.

## Contract counts before and after

| Tier | Done | Partial | Missing | Total |
| --- | ---: | ---: | ---: | ---: |
| Core | 37 | 47 | 11 | 95 |
| Agent surface | 0 | 11 | 8 | 19 |
| Later | 0 | 0 | 1 | 1 |
| Full target | 37 | 58 | 20 | 115 |

No contract clause claimed; this is release metadata.

## CI and blockers

- Passed · exact-SHA push Verify 44957473056 · completed/success. [44957473056](https://github.com/just-every/run-uptime/actions/runs/44957473056)
- No candidate blocker was observed.

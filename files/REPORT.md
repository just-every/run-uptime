# Uptime 0.5.17 metadata candidate

Authored by Run Edit Run fleet, 2026-11-17 UTC.

Product repository: just-every/run-uptime
Product branch: cloud/sd-uptime-release-0-5-17
Product head: 2b23821dcb7627dec4df3f6409985ed0898c9377
Parent/main reviewed: 9ab0bb5f30aa4a6c2a40cf0fb83d7dda151e09e2
Pull request: none created; this repository's contributor guidance does not require one for this builder round.

## Plan and result

The full plan is in PLAN.md. Confirm the baseline and exact-main CI; compare the five landed rounds with the published baseline; inventory migrations and dependency pins; write buyer-facing release metadata; fetch/rebase before publication; regenerate the source lock last; validate locally; audit identities and messages; push the named product branch; require exact-SHA Verify; return reports separately on the evidence ref.

The latest published release was v0.5.16, published 2026-11-17T06:55:05Z. Main Verify runs 44176226191 and 44165327613 were completed/success on the reviewed main SHA. Run site 44176226072 was completed/success on that same SHA. See upstream-receipt.json and upstream-commits.log.

Updated package.json, seed.json, RELEASE.json and RELEASE.md to 0.5.17. RELEASE.json.previousVersion is 0.5.16. CHANGELOG.md adds only buyer-visible notes from the real v0.5.16..main diff: practice-target saving, stopped-checker visibility and alerts, Responder Alerts and signed-in identity/role controls, second-factor guidance and recovery codes, named member-removal confirmation, Pingdom field reporting and native Playwright preview steps. The optional setup wording round had not landed when the product was pushed and is omitted. See diff-review.md.

The Pingdom notes explicitly distinguish synthetic saved-file proof from live extraction or account cutover. TMS/Page Speed, relationships and history remain unconverted. Existing backup, private-settings, hosted-database, deployment-receipt, installation-key, mail-selector and earlier upgrade cautions remain. Previous changelog entries are byte-for-byte preserved. The old screenshot remains accurately dated; no new screenshot is claimed.

No product code, homepage, README, product documentation, identity, dependency pin, contract judgment, test or generated contract view was changed. pnpm-lock.yaml needed no edit because the root release version is not recorded there. The supported edition-authoring lock command ran last; sources.lock.json is the sixth changed file.

## Counts and scope

- Release version: 0.5.16 → 0.5.17; previousVersion: 0.5.15 → 0.5.16.
- Exact rer pin: 0.2.121 → 0.2.121; package.json and pnpm-lock.yaml agree.
- SQL migrations: 91 → 91; zero added, changed or removed. All SQL files, including reusable schema/adoption files outside migrations directories: 118 → 118, with zero changes. release-validation.json contains both exact migration path inventories.
- Clause status: 37 done / 58 partial / 20 missing / 115 total → the same counts. Core: 37/47/11 of 95; Agent surface: 0/11/8 of 19; Later: 0/0/1 of 1.
- Clause status changes: none. No CLAIM line is made.
- Tests added, deleted, weakened or modified: zero. Six product-branch files changed; 44 insertions and 11 deletions.

## Validation and custody

- pnpm typecheck: exit 0. The supplied cloud toolchain selected Node 24.19.0 with pnpm 10.12.4; pnpm emitted the exact-engine warning for the package's 22.20.0 pin. Typecheck completed successfully.
- pnpm exec rer check --profile first-party through cloud_run: exit 0; this command emitted no output.
- Supported source-lock generation and check: exit 0. Lock SHA-256: 153eb4d0056bfc708edd809f6d85579de362cd1b772c7c29f771cff70d59014c.
- The seed has no validate:release script. Its pinned rer release inspectSource and listingContent readers validated the committed source/version/listing; additional release continuity checks verified previousVersion, unchanged rer pin and lock agreement, migration inventory and preserved prior changelog. See release-validation.json.
- git diff --check and the staged diff's credential-shape review passed. All candidate author/committer identities are the fleet identity and there are no trailers or OpenAI/Codex co-author lines. Hooks remained active.
- The guarded product push succeeded on its first attempt. A credential-free Git ref probe independently matched the remote product head and confirmed main was still the reviewed SHA. No published history was rewritten.
- The Mac lander owns the full publication scan, final integration and landing; the cloud cannot perform that scan. No tag, GitHub Release, deployment, main push or self-submission was performed.
- No browser proof or full local verification was run for this metadata-only change; exact-SHA branch Verify is the required full gate.

Candidate Verify: run 44178521324, exact head 2b23821dcb7627dec4df3f6409985ed0898c9377. Discovery and the first two permitted REST polls reported in_progress. The third permitted poll confirmed completed/success on this exact SHA at 2026-11-17T21:34:39.941575+00:00. Six GitHub API calls were used in total; no failed-job log reads were needed. See ci-final.json and terminal-product-receipt.json. Product custody is READY; no builder blocker remains. The Mac publication scan and landing remain fleet-owned. Successful checkout cleanup follows evidence publication.

## Evidence handling

This packet contains actual report and receipt files only. The checkout path in typecheck.log is redacted as <checkout>; no credential values, environment dump or private held-out gate material is selected. Product commits and READY custody remain separate from this report-only evidence publication.

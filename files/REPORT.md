# Uptime 0.5.9 release metadata candidate

UTC report started: 2026-11-12T16:38:00Z. Task: sd-uptime-release-0-5-9.
Repository: just-every/run-uptime.
Branch: cloud/sd-uptime-release-0-5-9.
Candidate: da70990aaf1add3cc760ef355df28f92c14ac115.
Base: 015cfa43cac61079a5809996696bbf193add85ff.

## Plan and execution

1. Refreshed the fleet launcher, installed the decrypted-bundle Git helper and guarded push entrypoint, set the fleet identity, and installed active commit-message cleanup while preserving repository hooks. Read launcher/repository guidance and the supplied release rules. Used only the declared product repository.
2. Cloned main shallow with blob filtering, deepening only to inspect the prior release and its ancestry. Verified current main, the v0.5.8 release/tag, exact-main green CI, version files and remote branches/open PRs. No v0.5.9 tag, GitHub Release, main version, release branch or live release PR existed at preflight. The latest published release was Uptime 0.5.8, published 2026-11-12T13:38:20Z. Its annotated tag resolves to ed5429192d18503c4c8caa8d797d82ffdcc78f54. Main was four commits ahead, including side-parent ancestry.
3. Inspected all actual changes since v0.5.8: two startup configuration proof additions, their contract evidence and generated-view bookkeeping, source-lock updates, and their merge. No application implementation changed. Wrote honest maintenance notes saying application behavior is unchanged; did not present additional proof as a newly implemented feature or guarantee. Retained earlier release notes, known issues and screenshot provenance.
4. Updated the five existing version/notes files and regenerated sources.lock.json last. Preserved the published rer pin, frozen dependency lock, all product/test code, contract text/status/gap/evidence, generated views and homepage. seed.json is an existing release-version reference; there is no package-lock.json in this pnpm repository. The prior 0.5.8 metadata commit changed the same six paths.
5. Frozen-installed dependencies, reinstalled publication hooks after setup, ran metadata consistency checks and typecheck, checked unchanged contract documents, generated the source lock and checked it. The supplied toolchain script initially retained the VM's newer Node 24.19.0; typecheck passed there, then the exact Node 22.20.0 pin was installed outside the checkout and typecheck passed again without the engine warning. Final source-lock generation/check used Node 22.20.0 and pnpm 10.12.4.
6. Created one real fleet-authored/committed metadata commit without skip markers. Fetched main and rebased the unpublished candidate; main was unchanged. Inspected every candidate commit's author, committer, complete message and trailers. Both identities were Run Edit Run fleet <fleet@runeditrun.com>; no trailers. Pushed only the named cloud product branch through cloud-push.py. The first push succeeded. No retry, history rewrite, force push, main push, PR, tag, producer, signing, release publication or deployment was performed.
7. Discovered the candidate's exact-SHA Verify via REST. A single watcher observes at least 300 seconds between calls for that run. Final CI custody is recorded below and in candidate-ci.json and ci-poll-history.json. Publish this report and actual selected receipts separately to evidence/sd-uptime-release-0-5-9; evidence transport does not declare acceptance or landing. Remove the successfully pushed clone/dependencies after provenance and evidence verification, retaining the packet.

## Metadata changes

- package.json: 0.5.8 → 0.5.9 only; @runeditrun/rer remains 0.2.108.
- seed.json: 0.5.8 → 0.5.9 only.
- RELEASE.json: 0.5.9, previousVersion 0.5.8, truthful maintenance notes; prior known issues and existing 0.4.0 screenshot provenance retained.
- CHANGELOG.md: dated 2026-11-12 maintenance section, upgrade instructions and carried known issues; all prior sections remain verbatim. No contract identifiers, invented guarantees or internal check descriptions in the new public notes.
- README.md: previous published version 0.5.8 and release record 0.5.9.
- sources.lock.json: regenerated last; only those five metadata file hashes changed.

Diff: six files, 30 insertions, 11 deletions. pnpm-lock.yaml is unchanged; no package-lock.json was introduced.

## Validation

- Frozen pnpm dependency install: passed.
- Metadata consistency review: 17 checks passed; actual receipt metadata-checks.json.
- pnpm run typecheck: passed, application and runner TypeScript projects, exact Node 22.20.0 and pnpm 10.12.4; actual output typecheck.log.
- node src/base/contract-docs.mjs check: passed, 0 errors, 0 warnings, generated documents current; actual output contract-check.log.
- node scripts/edition-authoring/cli.mjs lock and check: passed; 2,366 tracked source entries, exactly the five intended metadata hashes changed; actual source-lock-receipt.json.
- git diff --check: passed; intended path scope and clean committed tree confirmed.
- Complete candidate identity/message/trailer review: passed; actual candidate-identity.txt and candidate-messages.txt.
- Guarded product push: succeeded on attempt 1; actual product-push.log.
- No tests added, deleted, skipped or weakened. No local test suite or browser proof was run for metadata-only work, as instructed.
- Full-history publication scanning remains with the guarded Mac lander. No unsupported cloud scanner was invoked.

## Before/after counts and clause custody

| Tier | Before Done/Partial/Missing | After Done/Partial/Missing | Total |
| --- | --- | --- | --- |
| Core | 37 / 47 / 11 | 37 / 47 / 11 | 95 |
| Agent surface | 0 / 11 / 8 | 0 / 11 / 8 | 19 |
| Later | 0 / 0 / 1 | 0 / 0 / 1 | 1 |
| Full target | 37 / 58 / 20 | 37 / 58 / 20 | 115 |

Clause status changes: none. Contract/Gap/Evidence/generated views untouched. No DONE claim. Tests added/removed: 0 / 0. No product behavior changes. No new migration or required setting.

## CI and release custody

Main's exact-SHA Verify runs 43255567259 and 43258718347 were completed/success at 015cfa43cac61079a5809996696bbf193add85ff. Run site 43258718329 was completed/success on the same main SHA. Actual preflight main-ci.json preserves the API results.

Candidate Verify run: 43260670273.
URL: https://github.com/just-every/run-uptime/actions/runs/43260670273.
Exact head: da70990aaf1add3cc760ef355df28f92c14ac115.
Final status: completed; conclusion: success.
Observed UTC: 2026-11-12T16:57:56.615846+00:00.
GitHub calls used: 8 of 10.

PR: none; this brief delegates landing to the guarded Mac lander and does not require a release-metadata PR. Product branch publication is not release publication. The tag/producer/signing/GitHub Release/readback steps remain outside this builder assignment. The release-completion rules and all later release/publication gates remain required.

Blockers: none. Terminal product custody: READY, based on the actual exact-head Verify receipt. Evidence publication is separate.

## Actual evidence packet

PLAN.md contains the full initial plan. product-receipt.json records exact product provenance, path scope, counts and validation. Other actual receipts retain source-lock results, metadata results, typecheck output, main and candidate CI, preflight release/peer checks, complete candidate messages/identities, actual guarded push output and the exact product patch. Files are explicitly selected, regular and non-secret; no credentials, environment dumps, private gate material or symlinks are selected. The cloud evidence manifest hashes every selected file and binds it to the product head. Successful transfer receipts are retained outside this immutable selected packet to avoid a self-referential manifest.

Final product status: READY branch=cloud/sd-uptime-release-0-5-9 head=da70990aaf1add3cc760ef355df28f92c14ac115
Finalized UTC: 2026-11-12T16:58:08Z

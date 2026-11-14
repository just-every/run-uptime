# gr-mt-uptime-dep-4 — transitive Zod maintenance

Repository: just-every/run-uptime
Product branch: cloud/gr-mt-uptime-dep-4
Candidate: 03323cf01c8c86f42211faea3226bb8db2600670
Candidate tree: 9ba153ee75c3ded10ce9bb1cc239941b9eb62fcb

## Result

Upgraded the sole Zod resolution from 4.6.3 to the advisory's first patched version, 4.6.6. This addresses the brief's GHSA-mrhx-c7xc-m3w5 / Dependabot alert 55 dependency exposure. The three existing consumers, @tanstack/router-generator, @tanstack/router-plugin and @tanstack/start-plugin-core, retain their exact versions and now share patched Zod. All three parents declare zod ^4.5.4, which accepts 4.6.6. No override or direct dependency change is necessary.

Only pnpm-lock.yaml and the generated sources.lock.json dependency-lock digest changed. The commit has the required fleet author and committer and no trailers. No UI, application source, test, contract, clause judgment, generated contract view, release identity or workflow changed.

Before/after: one unique vulnerable Zod resolution -> zero; three vulnerable consumer edges -> zero; one Zod version -> one patched version; unrelated package upgrades: zero. Tests added/removed/weakened: 0/0/0. Full-target clause counts remain 37 done, 58 partial, 20 missing, 115 total. Clause status changes: none. No CLAIM lines apply to this dependency-only maintenance task.

## Plan and implementation

PLAN.md records the full plan. Read the repository guidance and dependency graph, used the pinned pnpm 10.12.4, regenerated the lockfile, compared complete dependency package inventories, frozen-installed, performed noninteractive local setup and built using Node 22.20.0. Regenerated the edition source lock last and checked it before the commit. Fetched origin/main and rebased before publication; main had no intervening changes and the candidate SHA remained unchanged.

An initial targeted pnpm update recalculated unrelated transitive packages; all of that uncommitted output was discarded. A temporary range-limited Zod override let pnpm select only patched Zod while preserving the existing graph; that temporary override was removed and the lockfile was regenerated again. The final committed manifest is byte-identical to main. The complete package inventory delta is exactly removal of zod@4.6.3 and addition of zod@4.6.6.

## Validation

Actual command outcomes are in local-receipt.json, with raw non-secret logs explicitly selected for this packet:

- pnpm install --lockfile-only: passed, final package inventory contains no unrelated version changes.
- pnpm install --frozen-lockfile: passed.
- cloud_run npx -y @runeditrun/rer setup --owner-email fleet@runeditrun.com --non-interactive: passed. The private setup log and all setup state are excluded from public evidence.
- cloud_run npx -y @runeditrun/rer build: passed. This exercises Zod's TanStack router/start build-tool consumers. Existing dynamic-import bundling warnings remain warnings.
- pnpm typecheck: passed, both application and runner TypeScript projects.
- cloud_run node --experimental-strip-types tests/public-paths.mjs: passed, public documents/assets/routes and private-route refusals through the emitted Worker, with durable rate-limit boundary behavior and restart checks. No new tests were added.
- node scripts/edition-authoring/cli.mjs lock, then check: passed; generated source lock committed.
- node src/base/contract-docs.mjs check: passed, zero prose errors/warnings, generated contract documents current.
- pnpm why zod: one version, 4.6.6, across all three existing consumers.

No full local suite, deployment, release, PR or browser UI proof was requested or run. Branch Verify supplied the full CI wall and passed on the exact candidate. This dependency-only change has no changed screens. No hosted/provider acceptance is claimed.

## Publication and custody

Base's scanner is included in the repository's pinned @runeditrun/rer 0.2.113 package. Gitleaks 8.30.1 was installed from its official release asset using gh api; its SHA-256 was checked against the release's checksum list. These three API requests count against the task's ten-call GitHub budget.

The first scanner invocation was intentionally interrupted after recognizing it would inspect development setup/build files as well as the commit; its value-free interrupted report is retained as publication-initial-interrupted.json. The authoritative scan uses a clean detached worktree of the exact committed tree, full history and the declared remote public base, with an 1800-second limit. It changes no scanner policy or source. Product publication remains gated on COMPLETE/PASS with zero findings. The authoritative report is publication-scan.json.

Terminal publication and exact-SHA CI results are recorded below and in the custody/CI receipts when available. All evidence is report-only and separate from product READY, acceptance and landing. The fleet performs its independent publication and landing gates.

Authoritative publication scan: complete=true, status=PASS, findings=0, exact source SHA 03323cf01c8c86f42211faea3226bb8db2600670, tree 9ba153ee75c3ded10ce9bb1cc239941b9eb62fcb, pinned scanner 0.2.113, Gitleaks 8.30.1; total 290.73 seconds. Environment-value matching was not part of this source scan; explicit selected evidence receives a separate injected-value check before transfer.

Guarded product push succeeded on attempt 1 to refs/heads/cloud/gr-mt-uptime-dep-4. The full candidate identity/trailer audit passed. No PR is required by this repository's documented branch landing process, and none was created. Blockers: none. Verify push run 43580179019 completed/success on the exact candidate.

A complete-history recovery bundle was independently verified outside the clone at work/maint/gr-mt-uptime-dep-4/product.bundle, SHA-256 468110b0d0d53a81aba28008404154c9f4551d2d042fc9d91385c78c6a1ab06d. It is recovery data only, excluded from report-only evidence, and never establishes READY.

Additional required generated-descriptor check: pnpm spec:check passed after the build; deployment spec, setup digest and local setup match the build. No descriptor regeneration or product change was needed. Independent git ls-remote product-ref readback matches the pushed candidate exactly.

## Terminal result

READY product candidate: cloud/gr-mt-uptime-dep-4 at 03323cf01c8c86f42211faea3226bb8db2600670. Verify push run [43580179019](https://github.com/just-every/run-uptime/actions/runs/43580179019) completed successfully on that exact SHA. No exception for generated views was needed. The single watcher made five REST observations at 300-second intervals; including the Gitleaks asset requests and scanner reference resolution, the task used nine GitHub API calls. No PR was created and no blocker remains. The fleet owns independent publication, acceptance and landing gates.

The complete selected packet is transferred separately to evidence/gr-mt-uptime-dep-4 by cloud_evidence.py. The transfer ref/head is returned in the terminal message; evidence never serves as product READY or landing proof. The disposable worktree and checkout are removed after successful transfer; the verified recovery bundle, actual result.json and packet remain outside the checkout.

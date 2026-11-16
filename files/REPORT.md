# gr-mt-uptime-dep-8: verified no-change

Author: Run Edit Run fleet. Date: 2026-11-16.

Current main already resolves undici 7.30.1 in both required dependency trees. No product change, dependency refresh, commit, pull request or merge is necessary. The maintenance result is `no-change`, not an uninvestigated false-positive claim. No owner ruling is needed.

Repository: just-every/run-uptime. Inspected local branch: cloud/gr-mt-uptime-dep-8. Full inspected HEAD and remotely confirmed main: `980b3ef806a6b72d4a83b55b32294cd509d6f03b`. The cloud branch has no unique commits and was not pushed. No READY or PUSHED product custody is claimed.

## Plan and completed results

1. Set the fleet Git identity; refresh the launcher; install the decrypted-bundle credential helper and clone-local hook forwarding; clone only the declared repository with full commit history.
2. Inspect the root and copied mail manifests and lockfiles, history and relevant Miniflare callers. Independently verify the finding boundary through a read-only investigator.
3. Verify main already contains the exact requested fix; do not create an unrelated change. Install both graphs with pinned pnpm and frozen lockfiles; verify the installed package reached through each Miniflare parent.
4. Validate the current implementation with typecheck, build, existing TLS/network journeys, both Miniflare runtime request roundtrips, source-lock freshness and generated-contract checks.
5. Record the no-change result, command receipts, counts and exact-SHA CI evidence. Publish only the explicit non-secret report packet to the separate evidence ref; leave product publication and landing unnecessary.

## Source evidence and dependency paths

The actual landed fix is `8529deda750510402236ece09a9ab91f934a3231`, dated November 14, titled “Upgrade undici to 7.30.1 in both dependency trees.” It is an ancestor of HEAD and origin/main. Its historical diff changed 7.29.1 to 7.30.1 in both manifests/graphs, without needing new changes in this task.

- `package.json:85` overrides undici to 7.30.1. `pnpm-lock.yaml:9`, `:1577`, `:2907` and `:3103` hold the override, package, Miniflare edge and snapshot.
- `src/base/modules/mail/package.json:16` overrides undici to 7.30.1. Its lockfile at `:9`, `:287`, `:483` and `:531` records the same version and matching integrity.
- Root Miniflare 5.20260926.1-alpha is direct and also reached through Cloudflare Vite/Wrangler. Copied mail Miniflare is 5.20260907.0-alpha. Both installed parents resolve undici 7.30.1.
- Undici requires Node >=20.18.1; all retained final checks ran Node 22.20.0 and pnpm 10.12.4. The provided toolchain initially selected the VM's Node 24; exact Node 22.20.0 was installed and put first on PATH, and the root frozen install was repeated on it.
- `scripts/local-worker.mjs` uses Miniflare for the emitted Worker. `src/base/modules/mail/src/core/transport.mjs` uses injected/platform fetch with bounded timeout and manual redirects. No direct application import of npm undici was found in the affected paths.

## Security result and limits

The four supplied advisories affect undici >=7.0.0 <7.30.1: GHSA-4w7w-5xrc-9h26, GHSA-2m5v-pch6-74hx, GHSA-qrxm-fqhp-jwvm and GHSA-9fm3-97px-rjf6. Their dependency boundary is the shared HTTP client reached through the two Miniflare graphs. The invariant is that neither graph can select an affected undici version; ordinary Worker requests, bodies, TLS validation, redirect limits and destination pinning must remain intact.

The reported vulnerable package resolution is absent from both lockfiles and both frozen-installed graphs; each contains only undici 7.30.1. This proves the requested dependency remediation is already present. Upstream exploit PoCs were not reimplemented or rerun, and GitHub Dependabot alert closure was not queried. Existing TLS/network journeys and direct request-body roundtrips in both Miniflare runtimes provide compatibility evidence.

Before/after this run: vulnerable undici package resolutions **0 → 0**, patched lockfile graphs **2 → 2**, product files changed **0**, product commits **0**. Historical remediation changed the two 7.29.1 resolutions to 7.30.1; the eight alert instances are four advisories across two graphs, not eight independent installed versions. Clause status changes: none. Existing tests and generated views remain unchanged.

## Validation

All final gates passed:

- `pnpm install --frozen-lockfile` at the root and copied mail module: pass with pnpm 10.12.4; no lockfile changes.
- `pnpm typecheck`: pass for both application and runner TypeScript configurations.
- `cloud_run npx -y @runeditrun/rer build`: pass; normal Vite warnings about future native config loading and an ineffective dynamic import remain unrelated.
- `cloud_run node tests/tls-auth.mjs`: pass, including ordinary HTTPS execution, wrong-host refusal with zero HTTP requests, redirect-cycle exhaustion, DNS rebinding, recovery and history retention across restart.
- `dependency-proof.mjs`: final pass; parses both lockfiles, inspects installed undici through each Miniflare parent, asserts absence of the affected range, and completes POST/body roundtrips through both actual Worker runtimes. Source and receipt are included in the packet.
- `node scripts/edition-authoring/cli.mjs check`: pass (`ok: true`). No source regeneration was needed because no product source changed.
- `node src/base/contract-docs.mjs check`: pass, 0 errors and 0 warnings; views current.
- `git diff --exit-code` and `git status --porcelain=v1`: pass/empty. Prior fix ancestry and remote main identity: pass.

The first ad hoc runtime probe used obsolete Miniflare constructor options; the next used a compatibility date newer than the older copied mail runtime supports. Both harness-only failures were corrected using the repository's existing `convertV4MiniflareOptions` convention and compatibility date 2026-09-01. Both failed logs and the successful final receipt are retained. No product edit or test weakening occurred. Standalone copied mail test files are absent, so its advertised standalone test scripts were not invoked; the installed mail runtime was directly exercised instead. All started runtimes disposed and no task server remained.

## Exact-SHA CI and custody

A single GitHub REST discovery call returned completed/success Verify runs **43835711910** and **43795038126** for `980b3ef806a6b72d4a83b55b32294cd509d6f03b`, and completed/success Run site **43835711841** on that same SHA. These are existing main runs, not cloud branch runs. Other returned runs are retained in `ci-receipt.json`. No dispatch, rerun, product push, PR write or default-branch write occurred. No product publication scan was required because no new product commit is being published. The task's separate evidence transport is report-only and does not claim product READY or landing.

Maintenance result: `work/maint/gr-mt-uptime-dep-8/result.json`, also copied into this packet. Complete validation receipt: `validation-receipt.json`; installed dependency proof: `dependency-proof.json`; CI receipt: `ci-receipt.json`. No blockers or unimplemented task changes remain. Default: close the maintenance item as already fixed on main.

Evidence transport note: the initial report publication stopped before pushing because an added identity-history audit tried to import missing blobs from the partial product clone. The audit import was corrected to request commit/tree history without blobs through a named local source remote (an intermediate attempt using an absolute path was rejected by Git's promisor validation); packet data and product history were unchanged. The initial diagnostic is retained.

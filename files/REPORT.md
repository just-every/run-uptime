# gr-mt-uptime-dep-3 report

Repository: just-every/run-uptime
Branch: cloud/gr-mt-uptime-dep-3
Base: d47a432be0b9d6b1115de8579e23115b7a123646
Candidate: dc2114e58eaa72a2e459024fecae5761f07112e5
Product custody: ready
PR: none; no PR landing requirement was declared in this checkout.

## Plan and implementation

The complete original plan is in PLAN.md. Initialize fleet tooling and a full-history clone; inspect both dependency graphs; apply the smallest patched-version overrides; regenerate with pinned pnpm; install/build/typecheck and run touched behavior checks; acknowledge the intentional Base copy adaptations; regenerate the source lock last; commit and reconcile main; complete the publication gate before the guarded branch push; observe exact-SHA Verify; return results through a separate evidence ref.

Pinned Undici 7.30.1 in root and Base mail pnpm overrides, regenerated both lockfiles, and refreshed Base copy acknowledgements and the source lock; no unrelated package versions changed.

Changed product files:

- package.json: root transitive Undici override to 7.30.1.
- pnpm-lock.yaml: root Undici package, integrity, override and resolved edges.
- src/base/modules/mail/package.json: existing Undici override raised to 7.30.1.
- src/base/modules/mail/pnpm-lock.yaml: nested Undici package, integrity, override and edge.
- base-copies.json: generated acknowledgement of the two intentional mail-file adaptations, retaining the original Base comparison revisions and digests.
- sources.lock.json: regenerated source hashes for the five changed inputs above.

Before/after: two reported lockfiles resolving vulnerable Undici 7.29.1 -> zero; both now resolve 7.30.1. Root installed graph has four paths through Miniflare/Wrangler/Cloudflare Vite; the nested mail graph has one. No unrelated package version changed. The root and mail Miniflare versions were retained. The pnpm metadata-only removal of sixteen unrelated Sharp libc declarations was excluded to preserve platform metadata.

Clause changes: none. Clause status changes: none. Contract source and generated acceptance views were not modified. No tests were added, removed, skipped or weakened; no application or UI source changed. No acceptance claims are made for unrelated clauses.

## Validation

Runtime: Node 22.20.0, pnpm 10.12.4, checkout-pinned RER 0.2.113. Setup, build and behavioral runtime checks used cloud_run. At most two independent checks ran concurrently. No browser was required for dependency-only maintenance.

- PASS (exit 0): pnpm install --lockfile-only --ignore-scripts (root and src/base/modules/mail)
- PASS (exit 0): pnpm install --frozen-lockfile (root and src/base/modules/mail)
- PASS (exit 0): npx -y @runeditrun/rer setup --owner-email fleet@runeditrun.com --non-interactive
- PASS (exit 0): npx -y @runeditrun/rer build
- PASS (exit 0): pnpm spec:generate
- PASS (exit 0): pnpm typecheck
- PASS (exit 0): node tests/probe-native-evidence.mjs
- PASS (exit 0): node tests/notify-delivery.mjs
- PASS (exit 0): node <packet>/mail-miniflare-smoke.mjs (from checkout root)
- PASS (exit 0): node scripts/edition-authoring/cli.mjs adapt-base src/base/modules/mail/package.json; node scripts/edition-authoring/cli.mjs adapt-base src/base/modules/mail/pnpm-lock.yaml
- PASS (exit 0): node scripts/edition-authoring/cli.mjs lock; node scripts/edition-authoring/cli.mjs check
- PASS (exit 0): node src/base/contract-docs.mjs check
- PASS (exit 0): git diff --check
- PASS (exit 0): node scripts/edition-authoring/cli.mjs verify-base --offline

The HTTP journey exercised saved assertions, retries, signed history, unsafe-DNS refusal, failure/recovery and evidence integrity. The notification journey exercised emitted Worker/D1 behavior, real synthetic probes, independent email/webhook/Slack receivers, restart-safe delivery history and provider rejection/timeout outcomes. The nested mail smoke dispatched through its own installed Miniflare and performed an actual Worker/D1 roundtrip. Its initial harness used an obsolete constructor shape; adapting only that evidence script to the existing convertV4MiniflareOptions API produced a passing result.

Setup succeeded and stopped its temporary processes. Its private installer log and generated owner settings are intentionally excluded from the public packet. All non-secret selected command logs and the actual validation receipt accompany this report. No held provider gate, hosted deployment, browser sign-in, default-branch push or landing was performed.

Publication scan: status=PASS, complete=True, findings=0; exact source={'commit': 'dc2114e58eaa72a2e459024fecae5761f07112e5', 'tree': '32001917c503592f68eab80502589c587bc783e1'}. Full actual report: publication-scan.json.

The initial scan report in publication-working-tree-scan.json includes generated local settings/build artifacts and incomplete destination arguments. It is retained as actual attempt evidence. The authoritative publication-scan.json uses a clean detached checkout of the same SHA, verified against all 2,405 committed Git blobs, and correct explicit project/repository identities. No product change was needed between scans.

Verify: {"conclusion": "success", "github_calls_used": 10, "head_sha": "dc2114e58eaa72a2e459024fecae5761f07112e5", "html_url": "https://github.com/just-every/run-uptime/actions/runs/43580780410", "id": 43580780410, "name": "Verify", "observed_at": "2026-11-14T09:45:05.870434+00:00", "status": "completed"}

Custody: {"blockers": [], "branch": "cloud/gr-mt-uptime-dep-3", "ci": "completed/success", "ci_run_id": 43580780410, "ci_url": "https://github.com/just-every/run-uptime/actions/runs/43580780410", "finding_count": 0, "head": "dc2114e58eaa72a2e459024fecae5761f07112e5", "pr": null, "product": "ready", "publication_status": "COMPLETE/PASS", "push_attempts": 1, "pushed_at": "2026-11-14T09:30:00.101928+00:00", "ready_at": "2026-11-14T09:45:33.643402+00:00", "remote": "https://github.com/just-every/run-uptime.git"}

GitHub API calls used: 10/10, including scanner subprocess calls. No full local Verify or full test suite was run; branch Verify is the full wall.

Evidence custody is independent of product readiness. This packet is selected explicitly and published only to refs/heads/evidence/gr-mt-uptime-dep-3. The evidence manifest binds the complete files to the product branch and HEAD; its exact ref/head is returned in the terminal message. The local result.json uses the cloud branch HEAD under the cloud adaptation.

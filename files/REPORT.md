# gr-mt-uptime-dep-1 — no-change

## Outcome

The maintenance item is already fixed on current origin/main at `83b2f2692149c9171a12cba0d7397734a1e8096b`. No product change, commit, PR or product branch push was necessary. Local branch `cloud/gr-mt-uptime-dep-1` points to that same existing main commit. This is the brief's explicit no-change case, not an unreproduced or dismissed advisory. The original security change is already in history as `f0754606cfdb4c9752513cfd8d82bfada50d20cd` (PR #21), titled “Security: TanStack Start 1.168.60 (GHSA-qx66-fv34-fjm8)”; CHANGELOG.md also records the advisory fix.

## Dependency evidence

| Target | First patched | Current manifest | Current root lockfile | Result |
| --- | --- | --- | --- | --- |
| @tanstack/react-start | 1.168.60 | 1.168.60 | 1.168.60 | Patched |
| @tanstack/start-server-core | 1.169.39 | Transitive | 1.169.39 | Patched |

The complete root pnpm-lock.yaml was parsed with the repository's vendored YAML parser. Each target has exactly one package entry and one snapshot entry. No alternate vulnerable target version remains in the root lockfile. All three server-core edges (from react-start-server, react-start and start-plugin-core) resolve to 1.169.39. The react-start importer specifier and resolved version agree with package.json. A repository-wide search of package.json and lockfiles found these target packages only in the root manifest/lockfile.

Before/after this task: affected vulnerable package resolutions 0 → 0; targeted packages already patched 2 → 2; tracked files changed 0 → 0; tests added/removed 0/0. The original alert listed three alerts against two packages; this task does not claim that GitHub's alert state was queried or closed.

## Checks and CI

- PASS: complete YAML parse, advisory threshold checks for every target package/snapshot and all three server-core dependency edges, and manifest/importer consistency checks. The actual data is in dependency-receipt.json.
- PASS: git diff --exit-code origin/main -- package.json pnpm-lock.yaml CONTRACT.md ACCEPTANCE.md docs/CLAIMS.md sources.lock.json; no differences. Tracked working tree is clean and HEAD equals origin/main.
- PASS: one REST discovery call for this exact SHA. Verify 43471590109 (main push), Verify 43461700458 (existing cloud branch) and Run site 43471590153 are all completed/success at `83b2f2692149c9171a12cba0d7397734a1e8096b`. Run demo 43471590115 was skipped. Push on main 43471589718 succeeded. These are existing runs; no workflow was dispatched or rerun. See ci-receipt.json for exact URLs and SHA bindings.
- NOT RUN: install, setup, build, typecheck and application/browser tests. The no-change verification establishes the requested dependency fix without modifying or installing the application. No new compatibility claim is made from local testing.
- NOT RUN: Base publication scan; there is no new product commit or product publication. No missing-scanner exception was used to publish product code. Only the explicitly selected non-secret report packet is eligible for evidence transport.

The prescribed cloud toolchain setup was sourced and selected pnpm 10.12.4. It retained preinstalled Node 24.19.0 because its supplied script only replaces older Node versions; no application build or typecheck was performed under that runtime. The repository pin is Node 22.20.0.

## Contract and scope

No target clauses were assigned by this dependency-only brief, and no clause text, judgment, generated view or source lock was changed. Recorded acceptance counts remain: Core 37 done / 47 partial / 11 missing (95); Agent surface 0 / 11 / 8 (19); Later 0 / 0 / 1 (1); full target 37 / 58 / 20 (115), before and after. No CLAIM, DEFAULT or GAP line is applicable. No UI change or browser proof is needed.

## Plan and execution

The complete original plan is retained in PLAN.md. Fleet identity was configured before repository work; the launcher was read and refreshed; the bundle-only helper, push guard and commit hook were installed. Only the declared repository was cloned. Initial clone attempts 1–3 failed with an authentication rejection; retries used the same decrypted-bundle credential source after refresh and setup, with 15/45/90-second backoff. Attempt 4 succeeded. Git supplied no HTTP status for those failures. No alternative credential was sought or used. The actual retry receipt is clone-receipt.json.

Repository guidance and dependency/lockfile evidence showed the advisory was already fixed, so the plan stopped before unnecessary edits, installation and product commits. A history search located the existing security change and was stopped by its own PID after obtaining that evidence. No application server or browser was started. Global and local identity are Run Edit Run fleet <fleet@runeditrun.com>; there are no new product candidate commits or trailers to correct, and published history was not rewritten.

## Custody and remaining work

The required result.json is saved under work/maint/gr-mt-uptime-dep-1 and copied into this packet. This packet contains actual non-secret files only. Evidence publication uses refs/heads/evidence/gr-mt-uptime-dep-1, independently of product custody. No product READY or PUSHED claim is appropriate because this task produced no product commit or product push. No PR was created; no product merge, tag, release, deployment or default-branch write occurred.

No dependency blocker remains. The lane can close this maintenance item as no-change/already fixed. Initial authentication failures recovered. Evidence publication's actual terminal ref/head or failure is returned separately and must not be interpreted as product READY.

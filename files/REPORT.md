# gr-mt-uptime-dep-5-c1 report

Repository: just-every/run-uptime (treated as public).
Branch: cloud/gr-mt-uptime-dep-5-c1.
Base: a79f1a90c76d4453f602aab8c2c1fe0e22582c85.
Product head: 8e1966b14902e4923198677e4048cd978336522a.
Commit: Upgrade Vite to 8.2.4. One fleet-authored commit, no trailers.

## Plan and implementation

The full plan is in PLAN.md. The declared repository was cloned independently; the named cloud branch was created from current origin/main. The earlier cloud/gr-mt-uptime-dep-5 candidate was inspected only, never merged or cherry-picked. TESTING.md does not exist; AGENTS.md and the repository's lifecycle, operations, contract and CI instructions supplied the commands.

Changed the exact Vite development dependency from 8.2.2 to 8.2.4 and regenerated the root pnpm-lock.yaml using exact Node 22.20.0 and pnpm 10.12.4. A normalized lockfile comparison proves there are no unrelated package resolutions: only Vite's version, integrity and peer resolution labels change. The previous candidate changed no other dependency lockfile. The nested mail pnpm lock is untouched.

Regenerated sources.lock.json from main's current source selections with the documented edition-authoring lock command, followed by its check. Exactly the package.json and pnpm-lock.yaml SHA-256 entries changed; all other main source hashes, provenance, toolchain and selections are preserved. This necessary freshness update is not a copy of the older candidate's source lock.

Product diff: 3 files, 32 insertions, 32 deletions. All other source, documentation and contract files remain unchanged. No UI or copy change, new tests, PR, workflow dispatch/rerun, release, tag, Dependabot dismissal or main update was made. The product branch was pushed once through the required fleet guard and the advertised remote head was checked.

## Validation

Passed: frozen dependency installation; rer production build; both TypeScript projects; deployment-spec freshness; contract documents/prose (0 errors, 0 warnings); edition source lock freshness; first-party structural check; complete test:base (offline Base integrity, no drift/unrecorded copies); git diff whitespace; dependency scope; fleet author/committer/trailer checks; clean worktree; remote-head equality. See checks.json and the actual logs/receipts selected in the evidence packet.

The complete command-journey test passed through the real installed CLI and scratch installation. It proves real Vite assets/HMR and imported Vite client modules, browser hydration and saved forms at 1440, a readable PDF download, local identity/forms, exact repeated setup, conflicts, production preview, active reset refusal, private archives, reset/import/export and process teardown. Chromium used /usr/bin/chromium with --no-sandbox. It did not require provider credentials or change product tests.

Additional public-path probe limitation: the initial silent exit was not counted as a completed test. Instrumented runs with and without the cloud proxy settings stalled before any assertion result and were stopped after approximately three and two minutes respectively. No public-path pass is claimed. This is a local test limitation, with no failing assertion establishing a Vite regression. The command journey and required touched build/type/source checks passed; full CI remains the lander's wall. Build warnings concern existing chunk sizes/dynamic import placement and did not fail the build.

## Contract and counts

Vite 8.2.2 -> 8.2.4; unrelated dependency upgrades: 0. Lockfile package/snapshot entries: 643 -> 643.
Published clauses: done 14 -> 14, partial 7 -> 7, missing 0 -> 0, total 21 -> 21.
Target clauses: done 23 -> 23, partial 51 -> 51, missing 20 -> 20, total 94 -> 94.
All clauses: done 37 -> 37, partial 58 -> 58, missing 20 -> 20, total 115 -> 115.
Clause changes: none. CONTRACT.md, ACCEPTANCE.md and docs/CLAIMS.md are byte-identical to main.

## Custody and CI

The push guard succeeded on attempt 1. All candidate commits including side parents were inspected: there is exactly one candidate, both identities are Run Edit Run fleet <fleet@runeditrun.com>, and there are no trailers or OpenAI/Codex co-authors. Product head and advertised remote head match. No published history was rewritten.

One REST discovery found exact-SHA Verify run 43607110443, in_progress, conclusion null: https://github.com/just-every/run-uptime/actions/runs/43607110443. Per this carry brief's specific instruction, no wait, dispatch or re-run was performed. No exact-SHA green CI result is claimed. The terminal READY line follows the brief's requested custody handoff; the Mac lander must independently require exact-SHA Verify success and perform the publication scan before landing. The Mac publication scan cannot be run from this cloud. No product push blocker remains; the incomplete extra local public-path probe is recorded above.

Report files and receipts are kept outside the product clone under the task packet directory and are published separately to evidence/gr-mt-uptime-dep-5-c1. Evidence publication does not establish product acceptance or landing.

CLAIM: none (dependency security bump)

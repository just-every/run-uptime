# Read-only operator console repair

Repository: just-every/run-uptime
Branch: cloud/main-uptime-readonly-console-1
Candidate: 594574662a8a692ff6d3311718c968f43363892c
Base: c14aafe38f2a5c754a550251593170404f1363a5
PR: none; this repository's supplied rules require a branch candidate, not a PR.
Verify: 43560095485, exact candidate SHA; currently running.
URL: https://github.com/just-every/run-uptime/actions/runs/43560095485

## Outcome

The invited read-only operator can load the workspace monitor list after a fresh sign-in and reload, read check results, immutable revisions, incident history and heartbeat runs, and generate period reports. Run now and representative direct create/update/run/key/erase/schedule-delete requests remain refused with 403. Refused writes create no monitor revision.

The existing owner/editor/responder/admin role rules, live Base status/version checks, product assignment revisions, second-factor checks and service/team boundaries remain in force. Empty scopes retain their documented workspace meaning. Scoped members continue using bounded monitor APIs; workspace console reads remain refused.

## Plan and execution

1. Read the launcher, repository guidance, contract and supplied fleet rules. Install fleet Git authentication, identity hooks and the required cloud toolchain. Set up the application through the pinned rer entrypoint.
2. Reproduce People -> Read-only invitation -> fresh private development gate -> /signin account picker -> monitor list -> reload. Save only non-secret response facts and the failing monitor screen.
3. Trace the seed's permission classifier and actual console requests. Grant documented monitoring reads without changing Base, rer, product roles or scopes. Keep configuration endpoints and mutating methods behind their existing checks.
4. Keep the monitoring overview free of notification destinations/delivery configuration and runner grants. Compute its monitoring projection without checkpoint/default-setting writes or hosted-work kicks. Avoid configuration requests while rendering monitoring-only detail/report screens.
5. Extend existing invitation/access journeys through emitted native email-link sign-in and the real development picker. Assert behavior at 1440; capture monitor list, check details and reports once at 1440 and 390. Repeated development captures hit the existing public asset limiter; the journey honors an observed Retry-After once, without changing the limiter or skipping any assertion.
6. Run the two touched journeys, typecheck, build, contract-view check and the exact CI source-lock check. Fetch main and rebase while unpublished, retaining main unchanged; regenerate the source lock last. Audit every candidate author, committer and trailer, retain hooks, commit and push only the assigned cloud branch.
7. Watch exact-SHA Verify using one REST watcher with calls at least 300 seconds apart. Return reports and actual receipts separately on evidence/main-uptime-readonly-console-1. The fleet owns publication scanning and landing; this cloud never pushes main or submits a landing.

## Root cause and implementation

/api/access/self already classified as a monitoring read. The console's /api/overview fell through to settings_write, and immutable /api/monitors/:id/revisions did too. The valid read-only assignment therefore passed self inspection but failed the console's initial data read.

src/domain/role-permissions.mjs now classifies GET/HEAD overview and revision history as the existing read action. Mutating methods keep their preceding classifications. src/server.ts adds live effective role/scopes/revision facts to the console response and selects a monitoring-only overview for member roles. src/domain/control.server.ts omits notification configuration and runner grants and uses the existing read-only projection path for those responses. public/monitor-reads.js and the report components avoid requesting privileged configuration to display monitoring data. docs/access.md describes the working console and its preserved scope boundary.

Vendored src/base and rer were not changed. This is a seed-owned classification and presentation fault; no upstream Base change is needed.

## Reproduction and before/after

Before: self HTTP 200, role read-only, scopes [], assignment revision 1; overview HTTP 403, Product permission required. The console failed again on reload.

After development: self and overview agree on role/scopes/revision; monitor list survives reload; 7 check rows containing 13 observations are readable; the report loads. Run now is 403 and all six direct representative writes are 403. Revision history remains unchanged.

After emitted production build: the same email-link monitoring/refusal journey passes. The isolated fixture contains one queued check row, correctly readable without manufacturing an observation. Both desktop and phone screenshots are included.

Counts: 47 -> 47 top-level push assertion scripts; no new registered suite. Contract totals remain 37 done, 58 partial, 20 missing, 115 total. Clause status changes: none. No CONTRACT.md Status/Gap/Evidence cell, generated acceptance view or summary count was edited or committed.

## Validation

- UPTIME_BROWSER_EXECUTABLE=/usr/bin/chromium node tests/access-matrix.mjs: PASS. Covers UI invitations, native email-link reader sign-in, monitor/report reads, console/API refusals, unchanged revisions, nonmutating refreshes, owner/editor actions, scoped refusal, stale assignments and revocation.
- UPTIME_BROWSER_EXECUTABLE=/usr/bin/chromium node tests/command-journey.mjs: PASS. Real setup, Vite development gate/account picker, invited read-only monitoring journey, native forms, archive/reset/import/export and teardown.
- pnpm run typecheck: PASS (application and runner TypeScript).
- npx -y @runeditrun/rer build: PASS.
- node src/base/contract-docs.mjs check: PASS; contract prose has zero errors/warnings and generated views are current.
- node scripts/edition-authoring/cli.mjs lock, followed by node scripts/edition-authoring/cli.mjs check: PASS. The lock was generated, never hand-edited.
- pnpm run spec:generate and pnpm run spec:check: PASS; deployment spec, setup digest and local setup already match the build, with no generated diff.
- git diff --check and changed-diff credential-shape scan: PASS.
- Fleet identity/trailer audit: PASS on the sole candidate commit, including all side parents; no co-author trailers.
- Product push guard: PASS on attempt 1. The advertised branch head matches the candidate.
- Exact-SHA Verify: pending. See ci-receipt.json for actual REST responses and call timestamps.

The cloud adaptation explicitly reserves the full publication scan to the fleet Mac. That scan remains required at landing; it was not claimed from this cloud.

CLAIM ACCESS-001 PARTIAL points=1 tests=tests/access-matrix.mjs#proveMemberLifecycle; tests/command-journey.mjs#proveLocalSignInTruth
DEFAULT ACCESS-001: No scope rows means workspace-wide access for the assigned role; existing service/team fences and scoped-console refusals are retained.
GAP ACCESS-001: This repair proves the invited read-only monitoring/refusal slice, not completion of every background-job, credential and member-management obligation in the clause.

## Custody and return

Only the product/docs/tests and regenerated source lock are in the product commit. All reports, receipts and screenshots are outside the product clone in this packet and are selected explicitly for the separate report-only evidence ref. No credentials, environment dumps, real browser profiles, held-out gate material or symlinks are included.

No product blocker is known. CI is still running. Product custody and evidence transfer are independent; evidence publication is not READY, acceptance or landing.

# Uptime scheduled-job heartbeat console

Repository: just-every/run-uptime
Branch: cloud/main-uptime-heartbeat-console-1
Candidate: 7138ac8714be14f7220c1d794a3cb4f50abd1e8a
Base main: b2147519f1fb6cc8ea1c24486e5657248010d6fd
Product custody: READY; exact-SHA Verify completed successfully. Evidence publication is separate from product readiness and landing.
PR: none required by this repository's builder instructions; fleet owns landing.

## Plan and implementation

The complete working plan is in PLAN.md. Reproduce the gap through native sign-in; extend the existing form and heartbeat route rather than introduce a model; show the real one-time URL and curl command on the monitor page; document the console path; extend the signed-runner public-door journey; run touched checks and typecheck; regenerate the source lock last; publish only the named product branch; require exact-SHA Verify; and return the non-secret packet on the separate evidence ref.

1. The original New monitor form was reproduced at 1440 and 390. Its nine existing type options contained no heartbeat. `gap.json` and `before-*.png` retain the actual observation.
2. Added **Scheduled job (heartbeat)** beside existing types. The selected form asks for the monitor name, expected interval in seconds and grace in seconds. It uses the existing `heartbeat.maxAgeMs` and `graceMs` configuration, authenticated monitor POST, and shared server validation. New console values accept 30 seconds to 31 days and zero to 24 hours of grace. The pre-existing API's legacy five-second periods remain accepted.
3. New jobs use the API's existing eligible private-runner assignment, installation external-check settings, and one scheduled confirmation/recovery. The heartbeat form does not send the HTTP form's selected Cloudflare Worker assignment. That hosted-install case was found and fixed through the emitted-Worker browser probe.
4. A successful explicit creation leaves only the new monitor's non-secret ID as a single-use browser instruction. The monitor page consumes it and issues authority through the existing protected key route. **Connect your job** displays the real installation URL, a `curl -fsS` one-liner and separate copy controls. No raw authority is stored in browser storage. The server continues storing only hashes. The URL survives ordinary page polling, clears on page exit/sign-out/detachment, and is retired by a revision or key rotation. After reload, the page offers explicit replacement with a confirmation. Existing protected-header commands and scheduler snippets remain available in the original one-time dialog.
5. Both the form and page explain success, missed interval plus grace, Unknown before a first success, and scheduled evaluation in plain words. Existing cron jobs retain cron/time-zone deadline wording. Private-runner and external-check requirements remain in effect: a receipt alone never establishes health.
6. `docs/heartbeat-jobs.md` now leads with the console path and copy instructions. It retains API and definitions-file creation, protected headers and advanced scheduler instructions as alternatives.

## Validation and proof

All local touched checks passed on candidate 7138ac8714be14f7220c1d794a3cb4f50abd1e8a. `validation.json` names each exact command, exit result and complete log hash. The checks were the production build, typecheck, deployment spec generation/check, source lock generation/check, contract document check and complete touched `tests/signed-runner.mjs` journey. No full local suite was run.

The committed `proveHeartbeatConsole` helper extends that existing signed-runner lifecycle. At 1440 it opens New monitor through the native console, selects the heartbeat type, refuses an invalid period without a write, saves the form, reads the real URL, proves both clipboard controls and absence of raw authority in browser storage, sends actual GET, HEAD and POST receipts without owner authority, and observes Unknown until the real signed Node runner evaluates them. It then sees Healthy, retains the one-time URL through polling, remains out of Failing during the interval and grace (including one millisecond before the deadline), reaches Failing at the exact deadline, and recovers after a late success plus signed evaluation. Worker and runner clocks are controlled at the test transport edge; no monitor, receipt, health or scheduling row is rewritten to simulate transitions. Hosted timing is not claimed.

The same run retains existing signed runner restart, authentication, revision isolation, rotation, inactive import and real runtime checks. The deliberate missing-table diagnostic in `signed-runner.log` belongs to the existing storage-failure probe and is followed by its passing result.

The candidate's browser proof shows the changed form, one-time check-in setup, Healthy page and missed-job page once each at 1440 and 390. Functional and accessibility/reflow assertions run at 1440; the 390 images are visual proof, not a second parameterized test. Capability input and command are masked before capture. The earlier local test development failures were browser selector/response-read races and the hosted runner assignment refusal; each was corrected before the final successful complete run. All actual final receipts and logs are included.

## Counts and clause custody

- New monitor type options: 9 before, 10 after; heartbeat options: 0 before, 1 after.
- CI journey entrypoints: 47 before, 47 after. New test registrations: 0. Extended the existing heartbeat lifecycle; added no independently selected test and requested no cap increase.
- Contract status counts before and after: 37 done, 58 partial, 20 missing, 115 total. HEARTBEAT-002 and HEARTBEAT-003 remain partial. No Status, Gap or Evidence cell, generated view, or summary count was edited. CONTRACT.md, ACCEPTANCE.md and docs/CLAIMS.md have no candidate diff.

CLAIM HEARTBEAT-002 PARTIAL points=none tests=tests/heartbeat-console-support.mjs#proveHeartbeatConsole
CLAIM HEARTBEAT-003 PARTIAL points=1 tests=tests/heartbeat-console-support.mjs#proveHeartbeatConsole
DEFAULT HEARTBEAT-002: New console jobs use an expected period, 24-hour initial interval and 15-minute initial grace, with one scheduled confirmation/recovery; existing cron configuration stays in Job schedule and runs.
DEFAULT HEARTBEAT-003: Preserve hashed, revision-scoped capability authority: display the URL for one visit and require explicit replacement after reload; never recover or persist the raw capability.
GAP HEARTBEAT-002: This round proves period-based console creation, grace, signed deadline failure and recovery; it does not newly qualify the full cron/DST acceptance point or hosted SCHEDULE-002 timing.
GAP HEARTBEAT-003: Native scheduler execution and the remaining snippet qualifications in main's existing gap are outside this brief; no complete-clause claim is made.

## Publication, limitations and handoff

The first real save was pushed as 3eee512c1babe14d04816a301c726869fd94ce22 with skip CI. Updated main was fetched and merged (already current) before preparing the final non-skipped candidate. Both candidate commits' author/committer identities and all trailers were inspected, with no AI co-author trailers. `identity-audit.json` and `product-push.txt` retain the actual check and final guarded push. No main/default branch, other repository or PR was written.

The required cloud runtime setup and launcher instructions were followed. The required 12ui workflow was attempted against the reproduced screen; it required an account connection before returning any candidate, so its design generation was unavailable. The implementation preserves existing console components, typography and styling; no generated design was claimed or copied. One shell spec check initially used the VM's pnpm 11 without the provided setup and refused; the required sourced toolchain uses pnpm 10.12.4 and the final spec checks passed. Local Node was v24.19.0 (Node 22 or later); branch CI pins 22.20.0.

The publication scan remains the fleet Mac lander's responsibility, as required by the cloud adaptation. Evidence files are explicitly selected regular files, kept outside the product clone and sent only to the evidence branch. This packet contains no credential bundle, environment dump, browser profile/session, live capability, raw private key or held gate material. Final CI receipt and terminal custody are recorded below before evidence publication. The pushed clone will be deleted after final handoff preparation.

## Exact-SHA CI and final custody

Verify run 42997434322 completed/success on exact candidate 7138ac8714be14f7220c1d794a3cb4f50abd1e8a:
https://github.com/just-every/run-uptime/actions/runs/42997434322

`ci-verify.json` retains the actual REST status receipt. `ci-api-calls.json` retains the calls and timestamps; status/discovery checks were separated by at least 300 seconds. Local checks passed, both candidate commit identities/trailers passed, and the guarded product push and remote-ref check passed. No product blocker remains. The unavailable 12ui account did not prevent implementing and proving the requested behavior with the existing design.

The complete packet is published separately on refs/heads/evidence/main-uptime-heartbeat-console-1. Evidence custody does not waive the fleet's publication scan, independent acceptance or landing checks. The fleet owns landing; the cloud never updates main.

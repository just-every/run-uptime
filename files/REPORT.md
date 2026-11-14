# Uptime install truth — main-uptime-install-truth-1

Repository: just-every/run-uptime
Branch: cloud/main-uptime-install-truth-1
Baseline: c14aafe38f2a5c754a550251593170404f1363a5

## Goal and scope

Fix stranger-30 items 6 and 7: make the report PDF download work after the documented installation and correct the public docs' monitor kinds and installation capacity. No report content/layout, monitor-kind or capacity changes. No vendored Base, rer, CONTRACT.md status/gap/evidence or generated acceptance views were edited. The full execution plan is PLAN.md.

## Public-door reproduction

A checkout initialized by the pinned rer setup and launched by rer dev reproduced the reported installer runtime failure. The native terminal handoff, real owner MFA enrollment and first-run completion led into the console. The actual monitor editor offered ten kinds. A monitor created through POST /api/monitors opened its generated report. Clicking Download PDF for this range returned HTTP 400 and {"error":"PDF report font unavailable"}; no PDF downloaded. JSON and CSV for that monitor/range both returned 200. The authenticated bulk-add preview returned quota.limit=500, used=1 and available=499. Its proposed external target was refused because public DNS validation was unavailable in this cloud; that refusal did not affect the real quota response.

The public /docs index said “The four monitor kinds.” /docs/definitions said at most 100 monitors in two active passages; /docs/monitors also repeated 100 in its bulk-add instructions. before-installed.json contains the actual HTTP/report/docs receipt; before-*.png contains the browser evidence at 1440 and 390.

The existing tests/reporting.mjs journey passed against the emitted production Worker before the fix, including its PDF response checks, JSON/CSV figures and scheduled/recurring report coverage. This isolates the missing regression to the installed development asset path.

## Root cause and change

The Noto Sans font and its license already ship in public/design-assets/fonts. The seed's PdfReportWriter fetched it through ASSETS using https://uptime-assets.invalid. In development, the Cloudflare Vite plugin forwards this binding to Vite's middleware, whose host checks reject that synthetic host. The production asset handler accepted the path, explaining why the old emitted-Worker test passed.

The seed now passes the validated incoming app origin into the PDF writer and constructs the bundled font URL with that origin. The request still uses the ASSETS binding; it does not fetch a font from the network, add an external font service or relax Vite's host checks. Report rendering/content/layout and JSON/CSV code are unchanged. This is a seed-owned URL error, so no Base/rer correction is required and no vendored path was changed.

The documentation builder now reads the actual checkType options from src/ui/editor.html and imports MONITOR_LIMIT from the same admission-policy source used by the bulk planner. It substitutes the kind count in the /docs card, the complete labeled kinds in /docs/monitors and /docs/definitions, and the capacity in both /docs/definitions limit passages and /docs/monitors. Both source files are watched for docs rebuilds. Historical contract and acceptance prose remains intact.

## Verification and counts

The existing tests/command-journey.mjs installation journey is extended, not registered again. After its fresh setup/build and real monitor-editor journey, it opens the report page at 1440, clicks the real PDF button, requires HTTP 200 and a completed browser download, parses the downloaded file and verifies that it has pages and identifies the requested monitor. Optional evidence capture writes only the actual PDF, receipt and browser screenshots outside the checkout. Copy has no pin tests.

Selected public-door verification journeys: 47 before, 47 after. Registration delta: zero; no test-budget.json exists in this checkout. The existing script journey was extended within the default 200 cap.

Visible kind count: four claimed / ten offered before; ten derived / ten offered after. Installation capacity: 100 claimed / 500 enforced before; 500 derived / 500 enforced after. No capacity policy changed. Full-target clause counts remain 37 Done, 58 Partial and 20 Missing out of 115, before and after. CONTRACT.md is byte-for-byte unchanged from origin/main; no DONE claim is made.

Local checks and exact source/CI custody are recorded in CHECKS.json and CI.json when available. The cloud has no Mac publication scanner; the fleet retains its independent publication/landing gates.

## Clause reporting

CLAIM REPORT-001 PARTIAL points=none tests=tests/command-journey.mjs#COMMAND-JOURNEY PDF PASS; tests/reporting.mjs#owner period reports
GAP REPORT-001: This round proves the installed PDF download and retains existing reporting coverage; it does not newly qualify every REPORT-001 acceptance point or provider delivery.

## Operational notes

The first attempted build while dev owned the checkout correctly refused with exit 4. The round stopped only its own recorded server PID before rebuilding. The first manual after-capture coincided with Vite's config restart and timed out waiting for a document; it is not claimed as after proof. Final after proof comes from the fresh committed installation journey. No credentials, environment dumps, private held-out material, archives or symlinks are selected for evidence publication.

## Product custody

Pushed once through the cloud guard on its first attempt. The remote cloud/main-uptime-install-truth-1 ref was read back as d47a432be0b9d6b1115de8579e23115b7a123646. PUSH.json records the actual custody check. No PR is required by this checkout's instructions; none was created. Main was fetched and the unpublished branch rebased before publication (already up to date). No default branch was pushed.

## CI watcher

Verify run 43559709154 belongs to exact candidate d47a432be0b9d6b1115de8579e23115b7a123646: https://github.com/just-every/run-uptime/actions/runs/43559709154. One REST watcher reads at intervals of at least 300 seconds, including discovery, and records every call in CI.json. Final conclusion is recorded there and in the final message.

## Initial CI outcome and recovery

Verify 43559709154 attempt 1 completed with GitHub conclusion cancelled. Build and credential-free packaging passed; seven of eight shards passed. Job 132340647810, shards (push-6), was cancelled at Run this shard; aggregate job 132345842300 failed at Require the selected coverage and its proof because coverage was incomplete. Push-6 selects contact-schedules, incident-work, private-network, agent-door, alert-routes, archive-roundtrip and webhook-custom, none of this round's touched journeys. CI-JOBS.json contains the actual job/step receipt. There was no reported product assertion failure to diagnose in that cancelled job. GitHub accepted the one failed-job-only retry under the brief's recovery rule (gh run rerun 43559709154 --repo just-every/run-uptime --failed, exit 0). The cancelled shard ran for 1,217 seconds, consistent with its declared 20-minute timeout. The changed installation and reporting journeys belong to push-3 and push-7 respectively, both of which passed on this exact SHA. Final retry status is in CI.json; no READY claim is made without completed/success.

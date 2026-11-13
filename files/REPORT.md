# Uptime cron heartbeat carry

Repository: just-every/run-uptime
Branch: cloud/main-uptime-cron-rules-1-c1
Head: 1bf4132ecfaba4a94a34202bbd33a1de2b5e4ba6
Base: fb3fb8b7d7b75136459a57f5c183f8fd1d4e6888
Source: 8dd2213c2c1a74d0d96d04026ddb27a80541f1e3

## Result

The entire original round was squashed into exactly one commit on current main. There is no merge commit. The only squash conflict was sources.lock.json, regenerated with the documented edition-authoring tool from main plus the carried source. No product or test carry repair was needed. All nine carried code and test files are byte-identical to the source round, and seed.json retains main’s declarations plus only the new heartbeat-rules.js static asset door (source-carry-comparison.json). The original branch was read and remained unchanged.

Up or down, Heartbeat receipts, Connect your job, and Job schedule and runs now all describe the saved cron expression, IANA time zone, scheduled-time deadline plus grace, and maximum run duration. Period rules remain available for period heartbeats. The carry also includes the original correctness fix: a valid cron snapshot is evaluated against its calendar deadline instead of being made Unknown by the unused period age limit. Legacy snapshots without a job window cannot establish cron freshness.

## Validation

The emitted application built successfully. The changed tests ran via `node tests/signed-runner.mjs` under Node 22.20.0, with Chromium at /usr/bin/chromium and --no-sandbox. This exercised proveHeartbeatConsole at 1440, with masked screenshots at 1440 and 390. The four summaries all show `0 2 * * *`, America/New_York, 15-minute grace, and 30-minute maximum duration, with no old period-rule summary. A signed cron success stayed Healthy after the saved 60-second period plus grace; the next cron window did not fail early, failed exactly at its deadline, and recovered on a late success. Existing period, ingress, revision isolation, redaction and import lifecycle assertions also passed. See browser/heartbeat-console.json, browser/cron-rules-observed.json and signed-runner.log.

Both TypeScript checks passed (`pnpm run typecheck`). The source lock check and contract-document check passed. The contract source and both generated views are byte-identical to origin/main. Local testing stayed within touched tests; full Verify belongs to branch CI. The runner-contact test intentionally exercises an unavailable schema and logs its expected 503, then completes successfully.

Browser proof was visually inspected at both widths: all changed summaries are legible and reflow with the saved values. Screenshots mask capability fields, executable snippets and preformatted heartbeat content. No browser profiles or real sessions were copied. Browser contexts and the test's owned Worker, runner and fixture processes closed normally.

## Counts and contract

Before and after: 37 done, 58 partial, 20 missing, 115 total clauses. HEARTBEAT-002 remains partial. No clause status, gap or evidence was changed. No test registration was added; the original round extends the existing heartbeat console journey. This carry adds no tests beyond that round. No test was removed, skipped or weakened.

CLAIM HEARTBEAT-002 PARTIAL points=none tests=tests/heartbeat-console-support.mjs#proveHeartbeatConsole
GAP HEARTBEAT-002: Hosted SCHEDULE-002 timing remains outside this local carry; current main's judgment is retained.

## Custody and scope

The single commit has fleet author and committer identities, with no trailers. All reachable candidate commits, including side parents, were inspected before the product push. The named branch pushed successfully on the first attempt through cloud-push.py. No main/default-branch push or PR operation was performed. No evidence or screenshots were committed to the product branch. No operator-security or security-controls files were changed. The full publication scan is reserved for the fleet Mac lander under the cloud adaptation.

Full working plan: PLAN.md. Exact-SHA Verify status and run IDs are recorded in ci-run.json and ci-observations.json. Evidence publication is separate from product readiness and landing.

## CI attempt 1 and authorized retry

Exact-SHA Verify 43383674178 completed cancelled. Plan, build, prepare and seven of eight shards passed, including push-3 (the changed signed-runner journey) and push-5 (operator-security). Push-6, job 131747398585, was cancelled at “Run this shard” after about 20 minutes; the workflow configures a 20-minute shard job limit. The aggregate verify job 131755179466 then failed at “Require the selected coverage and its proof.” Push-6 contains only untouched contact-schedules, incident-work, private-network, agent-door, alert-routes, archive-roundtrip and webhook-custom journeys. Its precise active test could not be determined: the one mandated `gh run view ... --job 131747398585 --log-failed` command exited 0 with no log content. No transport download failed or was retried.

The permitted single `gh run rerun 43383674178 --repo just-every/run-uptime --failed` request was accepted (exit 0). One final status observation is scheduled after 15 minutes, using the tenth and last GitHub call. No additional product commit, new run dispatch, or product push was made. Full job results, commands and actual receipts accompany this report.

## Terminal CI and custody

Final permitted REST observation: Verify 43383674178, attempt 2, exact head 1bf4132ecfaba4a94a34202bbd33a1de2b5e4ba6, status in_progress/None. The task used ten GitHub calls: six original status observations, one jobs inspection, one cancelled-job failed-log request, one authorized failed-jobs retry, and this final status observation. No further GitHub API request or workflow rerun was made.

Terminal product custody: PUSHED. The product branch is pushed, but Verify has not been established green after its one authorized retry. The API budget is exhausted; the fleet must watch or diagnose the same run. The original cancelled job was push-6 / Run this shard; the precise active test was unavailable from the completed failed-step-log request.

The product branch is one commit, with no product changes made after the tested carry. All contract counts and judgments remain unchanged. Evidence is published separately through the report-only transport. The product clone is deleted after a successful evidence transfer; the complete packet stays under the fleet task work directory.

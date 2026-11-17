# Checker-loss owner journey: final candidate

Run Edit Run fleet, 2026-11-17 (UTC). Task sd-uptime-checker-1.
Repository: just-every/run-uptime. Branch: cloud/sd-uptime-checker-1.
Final head: 701fa86628060e8057ec43a8366af3013b2581d8. Tree: a4ce50b0d23a6ff86b1e8f774e238def5cc38d73.
Baseline and fresh main: 6fd9399cf9ce9acf4e009999581cc20f32c9e129.

## Plan and product changes

PLAN.md contains the full plan. The work followed the local-checker lease: Monitors, a monitor page, Locations, Run now, checker-loss notifications, the local dev start/check path, focused tests, one signed documentation paragraph and the generated source lock. No release metadata, rer pin, product identity, schema, contract text or clause status was changed. Main was fetched and the unpublished branch rebased before publication; main remained unchanged. The second commit preserved published history.

Assigned-location contact is projected separately from immutable target observations. Monitors and monitor details show Unknown when no assigned location reports, name the stopped location and give restart commands. Locations says Stopped checking after contact expires. A location that has never joined keeps its original waiting state. The monitor detail hides its passing share during the gap; the list labels its percentage as past checks.

The existing public manual-check route refuses with 409 when no assigned location reports and creates no undeliverable slot. Contact returning makes the route available again. The app's existing scheduled watcher queues one durable checker warning per lost-contact episode to every enabled destination. It dispatches checker-warning email, webhook and Slack independently of the stopped Node checker; ordinary local webhook jobs retain their private-runner dispatcher. Repeated schedules deduplicate, disabled destinations are excluded, and a later loss after contact returns can create a new warning. Checker loss creates no target failure/recovery incident. Archive validation preserves these installation-level warnings as inactive history.

Dev startup probes the app, starts its owned checker and waits for authenticated contact. A private process record also makes the local Vite health middleware detect a checker process crash immediately. Contact freshness catches an unresponsive live checker. Re-entering rer dev refuses the abandoned runtime without RER_READY. Stopping the owned runtime and starting dev again launches a new checker. Hosted health remains independent of optional private-runner contact.

## Actual before/after results

The browser fixture runs the emitted built app, native owner admission and MFA, migrated D1, and a real signed Node checker against a certificate-checked synthetic HTTPS target. Only DNS/HTTPS receiver edges and fixture clocks are controlled. It creates three Healthy monitors, kills its checker by recorded PID with SIGKILL and leaves the app and target alive. The clock crosses the existing two-minute contact window. Baseline browser age labels use their wall clock; final candidate browser ages follow the controlled server clock.

Before: three falsely reassuring Healthy rows, queued Run now work without a result, only an age in Locations and zero checker-warning deliveries. After: zero falsely Healthy rows; three Unknown rows naming the stopped checker with restart steps; 409 for Run now without a slot; actionable Locations status; and one accepted email warning in Sent alerts. The route journey additionally proves email, signed webhook and Slack acceptance once each, no disabled-destination delivery, no duplicate on repeated schedules, retained signed history across Worker restart, no fabricated target incident and a new episode after returning contact. Restarting the real checker restores all three Healthy monitors.

Sixteen screenshots are included: four screens (Monitors, monitor details, Locations and Settings > Alerts) once at each of 1440 and 390 before and after. The final eight captures ran on 701fa86628060e8057ec43a8366af3013b2581d8; completed 2026-11-17T13:57:49.879Z. Neither candidate width has horizontal overflow. Actual screen text, refusal, delivery outcomes and recovery counts are in before-browser-receipt.json, after-browser-receipt.json and journey-summary.json.

The independent native dev proof also ran on 701fa86628060e8057ec43a8366af3013b2581d8. Its health changed 200 -> 503 immediately after its owned checker was killed. Re-entering rer dev exited 4 with no RER_READY. A fresh dev run started a different checker and returned health 200. All owned native servers and browsers were stopped. dev-checker-receipt.json and dev-checker.log contain the non-secret outcomes.

## Checks

- Typecheck: passed under Node 22.20.0.
- Build and deployment-spec check: passed.
- Source lock: regenerated last after both source edits; check passed.
- node tests/resilience/watches.mjs: passed, including the extended existing stale-coverage registration and existing crash/uncertain-send guards.
- node tests/signed-runner.mjs: passed.
- node tests/access-matrix.mjs: passed. Its successful manual-action fixtures now establish the required authenticated checker contact; all role and refusal assertions remain.
- node tests/browser-suites.mjs: passed both operator evidence and archive-recovery journeys after the correction. browser-suites-receipt.json and browser-suites-fixed.log retain the actual result.
- Test registrations added/removed: 0/0. No assertion was removed or weakened.
- Both product pushes succeeded on their first guarded attempt. Remote head was checked with Git. Authors and committers of all candidate commits are Run Edit Run fleet <fleet@runeditrun.com>; trailers are absent. The worktree is clean.

Complete sanitized passing logs and actual receipts are explicitly selected in selected-files.json. An exploratory --input-type=module invocation stalled Miniflare's internal CommonJS worker; it was replaced by a normal .mjs runner. Temporary dependency diagnostics were fully restored before passing validation. Exploratory failures are not counted as passing checks.

## Verify and evidence custody

First-head Verify 44092928309 completed failure on 3b1930bd894b1b7903be7214e331f2beec1b1d25. Build, contract-docs and seven shards passed. Browser shard 134072977584 reported operator-browser.mjs:270:24 without its private child assertion. The required ordinary gh run view log archive was retrieved once. The retained private browser artifact download returned HTTP 403 Forbidden; ci-artifact-refusal.txt records the exact command and sanitized transport response. No blocked blob download was retried.

Locally, the operator evidence journey passed. The full local run found a separate concrete regression in recovery-browser.mjs:63:201: a never-joined location displayed Not checking instead of the original Waiting to join state. Commit 701fa86628060e8057ec43a8366af3013b2581d8 restores that initial state and retains stopped-checker instructions after lost authenticated contact. Full local browser integration then passed. browser-repro-receipt.json records this distinction; the CI failure is not misrepresented as a reproduced local operator failure.

FINAL_VERIFY_STATUS: completed/success. Verify 44097734965 (https://github.com/just-every/run-uptime/actions/runs/44097734965) is green on exact final head 701fa86628060e8057ec43a8366af3013b2581d8. Discovery returned the completed run, so no additional poll was needed. The conservative ten-call GitHub budget was retained. No PR was created; the fleet landing lane owns landing. The Mac publication scan is unavailable in this cloud and remains a landing gate.

A report-only checkpoint was published at evidence/sd-uptime-checker-1 head 0a09dec575dcd86608b4f61de1d6f30c5b25d40d while Verify was pending. Evidence publication is separate from product READY/acceptance. This final packet carries the observed completed/success Verify outcome. Product custody is READY; evidence transfer remains separate from acceptance or landing.

## Limits and clause status

A running app can detect and alert on a stopped checker; shutdown or sleep of the entire computer still requires an independent external watch. Local development/demo email remains simulated. Network-edge acceptance is not a real provider account or recipient-receipt claim. A private local handoff appeared in an early tool log by mistake; its runtime was stopped and no handoff or injected credential value is included in this packet.

No contract clause claimed; these are owner-journey fixes (DIRECT 87).
Clause status changes: none. Before/after display counts: 3 false Healthy -> 0; checker warnings in browser walk 0 -> 1 (three channel deliveries separately proven); Healthy after restart: 3.

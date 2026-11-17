# Local checker loss: owner journey fix

Run Edit Run fleet, 2026-11-17 (UTC). Task sd-uptime-checker-1. Repository just-every/run-uptime. Branch cloud/sd-uptime-checker-1. Baseline 6fd9399cf9ce9acf4e009999581cc20f32c9e129.

## Plan and implementation

The complete plan is PLAN.md. The change keeps target observations immutable and adds a separate availability projection for each assigned location. Monitors and monitor details show Unknown when none reports, name the stopped location, and show restart commands. Locations says Stopped checking and shows the same recovery path. The monitor detail hides its passing share during the gap; the list explicitly calls its share past checks. The existing public manual-check route refuses an unreachable queue with 409 and creates no slot. Reporting contact restores admission.

The existing scheduled watcher creates one durable warning per lost-contact episode for every enabled destination. The app dispatches checker-warning email, webhook and Slack jobs independently of the stopped Node checker. Ordinary local webhook dispatch remains with the private runner. Repeated schedules reuse the same event/destination identity, disabled destinations are excluded, and returning contact permits one new warning after a later loss. A checker warning is not a target failure or recovery and opens no target incident. Archive validation retains this installation-level warning as inactive portable history.

Dev startup probes the app, starts its owned checker and waits for authenticated contact. A private local PID record lets the Vite health middleware catch process death immediately. Contact freshness also catches an unresponsive live checker. Re-entering rer dev refuses the stopped runtime without printing RER_READY. Stopping the owned dev process and running rer dev starts it again. There is no rer pin, release metadata, product identity, schema or contract change. One signed paragraph was added to docs/runner.md.

## Before and after evidence

The browser fixture runs the emitted built app, real native owner admission and MFA, migrated D1, and the real signed Node checker against a certificate-checked synthetic HTTPS target. Only DNS/HTTPS receiver edges and the fixture server clock are controlled. It creates three Healthy monitors, kills its checker by recorded PID with SIGKILL, and keeps the app and target running. The clock advances beyond the existing two-minute contact window. The baseline browser age labels use their wall clock; the candidate browser and server clocks both advance beyond the existing contact window. This is a bounded local crash proof, not a live provider or sleeping-computer proof.

Before: all three monitor rows remained Healthy; Run now queued work without a result; Locations showed only an age; no destination delivery existed. After: all three rows show Unknown with the stopped location and restart path; monitor details explain the gap; Run now returns 409 without adding a slot; Locations explains recovery; the enabled email destination has one accepted checker warning in Sent alerts. The focused route journey additionally proves one accepted delivery each to email, signed webhook and Slack, none to a disabled destination, no duplicate across repeated schedules and persisted Worker restart, preserved signed history and no target incidents. A real returning checker restores Healthy monitoring and Run now admission, and a later loss creates the next warning episode.

There are eight baseline and eight candidate full-page screenshots: Monitors, one monitor, Locations and Settings > Alerts once each at 1440 and 390. Candidate horizontal overflow is absent. before-browser-receipt.json and after-browser-receipt.json retain the actual screen text and wire outcomes. journey-summary.json records the counts: 3 false Healthy rows -> 0; 0 checker warning deliveries -> 1 in the browser walk (3 supported channels in the route journey); 3 Healthy monitors after checker restart.

The independent real rer dev command proof records health 200 -> 503 immediately after SIGKILL of its owned checker. The repeated dev command exits 4 and emits no RER_READY. dev-checker-receipt.json contains only the actual non-secret outcome and PIDs; private handoff links and settings were never included in the packet.

## Validation and publication

The existing stale-coverage journey was extended inside the existing resilience registration. The signed-runner fixture gained an optional receiver edge and a scheduled envelope; no production flow is mocked. Existing access journeys now make an authenticated idle checker claim before exercising successful manual actions. Assertions and test registrations were retained; no test registration was added or removed. Typecheck, build, deployment-spec check and source-lock check pass. The three touched test commands all pass: node tests/resilience/watches.mjs (1 registered test, 174 seconds), node tests/signed-runner.mjs and node tests/access-matrix.mjs. Complete sanitized logs and touched-tests-receipt.json are included. Existing access assertions are retained; only their now-required checker-contact prerequisite was added.

Initial exploratory proof invocation had a redirect-following mistake, corrected to preserve native redirects. A separate exploratory command using --input-type=module inherited that flag into Miniflare's CommonJS worker thread and stalled. It was replaced by a normal .mjs runner. Temporary dependency diagnostics were fully restored before passing validation. These exploratory attempts are not passing receipts.

No contract clause claimed; these are owner-journey fixes (DIRECT 87).
Clause status changes: none. This cloud does not run the Mac publication scan or land main. Evidence publication is report-only custody, not product acceptance. The running app can detect a lost checker; shutdown or sleep of the entire computer still requires an independent external watch. Local development/demo mail stays simulated; network-edge acceptance is not recipient receipt.

## First candidate custody

Product push succeeded on its first attempt: 3b1930bd894b1b7903be7214e331f2beec1b1d25 (tree 88ce7ca91ed5080b628030c107a43664fe2ff90e), based on unchanged fresh main 6fd9399cf9ce9acf4e009999581cc20f32c9e129. All candidate authors and committers are fleet identity; there are no trailers and the worktree is clean. Source lock was generated after the final source edits and its check passed. Exact-SHA Verify run 44092928309 completed failure; its diagnostic and the subsequent correction are recorded below. No pull request was created; this seed uses the fleet landing lane. The real dev restart passed with a new checker process and health 200; its owned server was stopped by recorded PID.

Final candidate browser capture: 3b1930bd894b1b7903be7214e331f2beec1b1d25; completed 2026-11-17T13:29:25.620Z. All eight candidate screens were recaptured from the built candidate, including the Alerts notice that checker warnings still send. Both widths have no horizontal overflow. The candidate browser clock follows the fixture clock for meaningful contact-age labels.

## First Verify failure and correction

Verify 44092928309 completed failure on 3b1930bd894b1b7903be7214e331f2beec1b1d25. Build, contract-docs and seven shards passed. The browser shard 134072977584 reported operator-browser.mjs:270:24, without its private child assertion in the workflow log. The ordinary gh run view log archive was retrieved once; an attempt to read the retained browser log artifact was refused by its blob endpoint with HTTP 403 Forbidden. ci-artifact-refusal.txt records the exact command and sanitized response. No retry of that blocked download was made.

A full local browser integration reproduced a different concrete regression: the receiving installation’s never-joined location read “Not checking” instead of its original “Waiting to join” state. The operator evidence journey passed locally. The correction restores the original never-joined state, leaving stopped-checker guidance for a previously reporting location. No test assertion was removed or weakened. Full browser integration then passed both operator and archive-recovery journeys; browser-suites-receipt.json and browser-suites-fixed.log retain the actual result.

The correction is a second ordinary commit, 701fa86628060e8057ec43a8366af3013b2581d8; the published first commit was not rewritten. sources.lock.json was regenerated last and its check passed again. The second guarded product push succeeded on its first attempt, and its remote head was verified. This is the final candidate; its exact-SHA Verify is pending.

Final-head recapture: 701fa86628060e8057ec43a8366af3013b2581d8; 2026-11-17T13:57:49.879Z. Eight built-page captures pass at 1440 and 390 with no horizontal overflow. The real checker was killed, the alert was recorded, Run now refused, and restarting the real checker restored all three Healthy monitors. The final-head native dev process crash also returned health 503 immediately and rer dev exited 4 without RER_READY.

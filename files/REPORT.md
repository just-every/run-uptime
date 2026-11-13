# main-uptime-cron-rules-1

Repository: just-every/run-uptime
Branch: cloud/main-uptime-cron-rules-1

## Plan
1. Install the fleet identity, credential helper, commit hooks and guarded product/evidence transport.
2. Reproduce through the emitted app: create a period heartbeat in the console, save cron `0 2 * * *`, America/New_York, grace 900 seconds and maximum duration 1800 seconds.
3. Compare Up or down, Heartbeat receipts, Connect your job and Job schedule and runs. Trace the signed runner and overview projection against the saved cron deadline.
4. Share the saved schedule description across the four summaries. Correct period-only evaluation if the public flow exposes it. Preserve the existing time zone/DST implementation.
5. Extend the existing signed-runner console journey (no new registration), proving saved values in every summary at 1440, preserving period behavior and exercising the daily cron deadline. Capture changed screens at 1440 and 390.
6. Run touched signed-runner and control-runtime journeys, typecheck and source lock check. Fetch main before publication, retain its changes, regenerate the lock last, inspect all candidate identities/trailers, then use the cloud push guard.
7. Inspect exact-SHA Verify via REST at 300-second intervals within the ten-call budget. Publish this non-secret packet only on the evidence ref, and return terminal provenance plus the lane POST.

## Reproduction
Current main reproduced the reported mismatch through the console schedule form. Up or down showed Success period + grace / 16 min; Heartbeat receipts showed Success age limit (period + grace) / 16 min; Connect your job showed cron and zone plus 15 min grace but omitted the maximum duration. Job schedule and runs also retained period-only introductory wording.
The real signed runner produced passing cron snapshots, but the overview health projection additionally required receipt age within the unused 60-second period plus 900-second grace. The public overview changed from Healthy to Unknown at that obsolete limit. This is an evaluation correctness bug and was corrected in this round.
Actual baseline observations and masked screenshots are in before/cron-rules-observed.json and before/cron-job-rules-{1440,390}.png. The baseline regression failed the all-panels cron/zone assertion as expected after recording the health mismatch.

## Implementation
A shared static heartbeat rule renderer now supplies the saved cron expression and IANA zone, next scheduled time plus grace, and maximum run duration to all four summaries. Period heartbeats continue to show their period-plus-grace rule. Disabled duration limits are named explicitly. No schedule kind or time zone semantics changed.
The overview evaluator now uses the immutable job snapshot’s cron/period deadline and duration evaluation. Legacy receipt-only evidence keeps its period behavior and cannot qualify a cron schedule. Runner reasons use scheduled-time wording for cron results.
CONTRACT.md Status, Gap and Evidence cells and both generated views remain untouched. No DONE claim is made. No product evidence or screenshots are committed.

## Validation and publication
All local touched checks passed: emitted build, signed-runner suite (including proveHeartbeatConsole, revision isolation and incumbent heartbeat imports), control-runtime suite, public-paths suite, typecheck, deployment spec and regenerated source lock. Browser assertions run at 1440; masked changed-screen proof exists at 1440 and 390. Exact-SHA Verify completed/success on 8dd2213c2c1a74d0d96d04026ddb27a80541f1e3, run 43364553827. No PR was required or created. The fleet lander owns publication scan and main landing.

A supplemental months-long DST clock jump was attempted, but expired the native owner session. It was removed from this narrow regression; existing calendar/DST code is unchanged. No new DST acceptance is claimed.

Local check history: an initial changed-build browser run exposed the missing public asset declaration, which was fixed in seed.json. The supplemental DST jump then expired owner authentication, so this round keeps the ordinary daily schedule regression. A subsequent run hit an existing pre-cron one-time URL timeout while the public-path journey was also running; the final isolated run passed after the following MFA-boundary adaptation. No assertion was weakened or removed from the original journey.

Counts before/after this round: app verification journey registrations 47 -> 47 (existing proveHeartbeatConsole extended); contract statuses done 37 -> 37, partial 58 -> 58, missing 20 -> 20. Reported stale period summaries 2 -> 0; missing maximum-duration summaries among the three requested panels 2 -> 0. These are scoped presentation counts, not whole-product acceptance counts.

The isolated run passed proveHeartbeatConsole completely (including exact cron deadline and late recovery), then the following revision-isolation journey refused credential issuance with 403 because the new daily clock advance exceeded the MFA step-up window. The suite now uses its existing public second-factor verification between those journeys; no authentication policy or protected assertion changed.

Final local result: complete signed-runner suite exit 0 after the MFA-boundary adaptation. No production authentication policy changed. The initial one-time-URL timeout did not repeat in the isolated final run.

Product head: 8dd2213c2c1a74d0d96d04026ddb27a80541f1e3
Base main: 36779a7228727cb38d7180b26c5b5aa656ca1056
Guarded product push: success on attempt 1, branch cloud/main-uptime-cron-rules-1.

CLAIM HEARTBEAT-002 PARTIAL points=none tests=tests/heartbeat-console-support.mjs#proveHeartbeatConsole
GAP HEARTBEAT-002: This round proves the daily cron summary and deadline regression; it adds no new DST or hosted SCHEDULE-002 timing acceptance. Clause status remains partial; Status, Gap and Evidence were not edited.

Product custody was independently read back through git ls-remote: advertised cloud/main-uptime-cron-rules-1 equals 8dd2213c2c1a74d0d96d04026ddb27a80541f1e3 and the checkout is clean. Actual custody is in push-receipt.json. Exact-SHA Verify run: 43364553827 (https://github.com/just-every/run-uptime/actions/runs/43364553827). One REST watcher made six discovery/poll calls at least 300 seconds apart, within the ten-call cap. It observed completed/success on the exact product SHA at its twenty-five-minute poll and exited successfully.

## Final outcome
All local touched checks and exact-SHA branch Verify passed. Verify run 43364553827: completed/success, head 8dd2213c2c1a74d0d96d04026ddb27a80541f1e3. No blockers remain for this builder candidate. No PR was required or created. Product branch: cloud/main-uptime-cron-rules-1. Evidence destination: refs/heads/evidence/main-uptime-cron-rules-1, with eighteen explicitly selected regular files and no product-tree evidence. The fleet owns the full publication scan, generated views, landing and main-only deployment. This report makes no landing or hosted-acceptance claim.

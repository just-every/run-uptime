# Acceptance requirements

Local verification must exercise the actual product runtime with isolated migrated D1 and authorized test endpoints. Preserve existing assertions and fixtures; a failing check is evidence to repair the implementation, not permission to weaken the expected behavior.

The source release candidate additionally requires signed self-runner enrolment, real certificate-verified HTTPS up/down/recovery and restart against the emitted production Worker, owner-deploy test-provider provision/repeat/interruption/resume/collision, and first-owner Base development-outbox sign-in with zero axe violations at 1440 and 390 pixels. `node scripts/rer.mjs verify` runs full verification and the separately hosted browser suites in an isolated checkout. `node scripts/rer.mjs release --repo . --project just-every/uptime-monitor --repository https://github.com/just-every/uptime-monitor --output ../uptime-release --dry-run --clean-history` invokes that actual verification command and complete parentless-export publication scanning. The public export must retain every byte of the final private tree and have zero findings without exclusions or reviewed findings. Private development history remains private. Hosted installation and public publication require separate owner authorization and acceptance.

Prove one-off fixes with before/after evidence outside the permanent suite. Release acceptance requires the actual release dry run and complete publication/export proof.

- Install, repeat additive setup, restart and preserve prior definitions, observations, migration history and authorized sessions.
- Configure/edit/pause/resume monitors with immutable revisions and complete assertion preservation; reject invalid or contradictory inputs before execution.
- Run real scheduled HTTP probes and authenticated heartbeats through signed runner claims/results; retain retries, categories, durations and exact assertion bundles.
- Verify fixed selected-probe denominator, missing/future/expired coverage, Unknown/Degraded/Failing distinctions, confirmation/recovery hysteresis, maintenance and manual isolation.
- Reject duplicate/foreign/expired leases, wrong signatures, stale submissions, scalar/assertion contradictions and revision-mismatched heartbeat snapshots without durable side effects.
- Exercise address normalization, mixed DNS answers, numeric socket pinning, every redirect, TLS hostname mismatch, downgrade, credential stripping, body/timeout bounds and synthetic grant custody.
- Protect private documents and direct native/framework transports with server-side authority, configured-origin checks, fail-closed input handling and revocation.
- Export/restore bounded archives with integrity/version/semantic validation, prior format compatibility, preserved history, new paused revisions, portable destination definitions and notification history, installation-local authority and credentials, and no alert replay.
- Verify contact Never seen/Fresh/Stale/unavailable states and portability without treating contact as target health.
- Verify durable action feedback, read failure/recovery, editor criterion round-trip, keyboard/focus, responsive layout and actual rendered state.
- Exercise notification destination create/edit/disable/delete/rotation through the actual Worker and migrated D1. Use authorized fake SendGrid and webhook endpoints with the real private runner to verify scheduled trigger/recovery fan-out, one job per event and enabled installation-wide destination, duplicate suppression, test isolation, secret visibility/custody, exact signatures and payloads, timeout/connection/HTTP 500 uncertainty without automatic resend, escaped email/Slack content, restart recovery, upgrade preservation, and rendered operator controls.

Build, types and local runtime suites are separate from hosted proof. A hosted installation requires account/resource-bound setup, deployment readback, actual health verification, additive migration evidence, signed runner operation and recovery in an independently configured installation. Notification acceptance additionally requires an authorized hosted destination, send/readback evidence for a specific event and endpoint, and recipient-side confirmation; local fakes and provider acknowledgments do not establish inbox receipt or that a person was notified. Provider uncertainty must stay uncertain; neither local checks nor a command exit code substitutes for provider acceptance. CI claims require an inspected result for the exact candidate.

A useful operator release also requires an authorized endpoint, real runner placement and isolation, an inspected operator workflow. Single-vantage checks do not establish regional independence. Automated accessibility checks do not certify screen-reader speech or WCAG conformance. Retention economics, operator demand and larger-scale reliability remain unmeasured; they are outside this source release's acceptance.

Notification delivery is bounded to configured email, signed JSON, and Slack incoming-webhook destinations. A stored outbox row, local receiver, or provider acknowledgment cannot establish inbox delivery or human notification. Each event/destination pair gets one automatic send attempt; an uncertain result is not retried automatically. Browser checks, arbitrary scripts, DNS/ping/TCP/domain-expiry checks and public status communication are outside the implemented monitor types.

This document states requirements, not a passing release verdict. Executed candidate evidence must identify the exact source and preserve failures alongside successes.

Notification custody verification must inspect raw populated D1 across the
0008-to-0009 key-bearing Worker upgrade and restart, including active and
obsolete credential versions. Require no plaintext, isolated unavailable
credentials for missing/wrong keys and modified/swapped ciphertext, preserved
monitor/outbox/history identities, complete obsolete retirement erasure, and no
upgrade sends or replay. Unchanged keys preserve authorized sessions; rotating
SESSION_SECRET invalidates old authentication while allowing sign-in and
credential re-entry/deletion. Monitoring and probe claims/results remain
available with a damaged destination. Exercise the actual runner RPC bridge with an ahead clock, a clock
inside the claim boundary, a behind clock and preparation that outlives its
claim. Retain exact external request-byte/signature assertions.

Notification browser verification must audit every add and edit destination kind and the New monitor editor at 1440, 390 and 320 pixels. Require zero serious or critical axe findings, no overflow or page errors, named delete/rotation confirmation with no network mutation on cancellation, actual API changes on acceptance, owner email review/update, credential re-entry, and native clipboard equality without recording secret values. Secret dismissal must clear detached nodes and retained dialog handlers. Capture credentials only behind screenshot masks. Verify mail setup warnings and unsent wording, mobile help placement, runner contact beside queued rows, recent check pass/failure marks, healthy badge color and mobile detail heading focus. Human timing units must round-trip exact millisecond policy values; failure thresholds and retry semantics remain unchanged.

## Local command journey

Run the literal README clone, `node scripts/rer.mjs install`, explicit-owner setup and foreground dev. Check health, Vite/HMR assets, ordinary one-use outbox sign-in, native form POST before hydration, first-run `/setup` at 1440 and 390, unfinished-owner app redirects, signed-out sign-in return, durable native-form completion, signed-in documents and unsigned private-access refusal. Local sign-in makes no mail-provider request. Setup must stop all temporary processes, preserve exact settings and owner/data on repeat, and reject a conflicting owner.

Stop dev and verify descendant teardown and released ports. Reset must refuse active state and unconfirmed execution, preserve source/exports/deployment receipts, and enable fresh empty setup. The populated export/reset/import/setup/export journey must retain complete portable records/history with explicit inactive transformations and excluded installation authority. Import requires integrity, an empty destination and confirmation; no imported event dispatches.

## Candidate release state and unmet obligations

The product exposes the rer command contract, owner-account deployment, local
export/import and versioned archive history.
The candidate is unreleased and has no tag. No fresh Cloudflare account,
deployed `/health`, hosted runner, target, or recipient acceptance is recorded
here. A local `pnpm run health`, an operations descriptor check, or a successful
deployment command cannot substitute for that evidence.

BASE-DATA-001's archive exception is pending owner confirmation. `ARCHIVE-001`
preserves product definitions and notification histories while excluding
installation-local authority and destination credentials. The replacement
`tests/archive-roundtrip.mjs` must prove equivalent portable data after
export/import/export; it is not a passing result until the exact candidate run
is inspected. Other baseline clauses remain requirements. In particular,
startup configuration diagnostics, complete public-path and rate-limit
coverage, entity erasure with durable anonymized audit history, full migration
recovery and accessibility across sign-in/setup surfaces remain unaccepted.

The [BASELINE.md](BASELINE.md) status list names each clause, the current test
evidence and the gap that prevents a satisfied result. A test filename or tag
without an inspected result is a lead for verification, not a release verdict.


## Verification coverage

`tests/readme-journey.mjs` executes the current README shell blocks in a fresh Git clone and signs in through the actual outbox. `tests/command-journey.mjs` covers owner failures, exact-settings reruns, Vite/HMR, native forms, active reset refusal, complete populated portability and retained deployment receipts. Base shared tests remain in Base; the seed ships required runtime source. Results must be inspected on the exact candidate; these tests claim no hosted acceptance.

## Assisted delivery and owner editor

See `scripts/delivery/README.md` for the pinned producer, immutable managed
workflow, exact setup-manifest digest, trusted signed-claim bindings and native
owner editor policy. `pnpm run test:admission` checks these public flows against
the emitted application; its management peer is only a test network edge.
Stage installation, live Cloudflare and the public release remain owner work.

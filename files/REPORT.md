# Uptime mail-off adoption

Author: Run Edit Run fleet, 2026-11-15.
Repository: just-every/run-uptime.
Branch: cloud/main-uptime-mail-off-1.

Plan:
1. Refresh the fleet launcher, install credential and push guards, clone only the declared repository, configure fleet identity and commit hooks.
2. Read Uptime’s contributor guidance, deployment and authentication paths, and rer 0.2.118’s mail-off and operations contracts. Move the rer package pin to 0.2.118 through pnpm.
3. Adopt deliberate none in hosted setup, operations inspection, deployment declaration/plan, native validation, runtime sender and installer/command adapter. Keep enabled-provider validation and refuse conflicting sending credentials.
4. Render only the changed hosted sign-in state with guarded rer signin guidance, without a local-dev entry or token disclosure.
5. Extend existing hosted-auth and deployment journeys. Use the actual setup model, native owner claim and first-run doors, Settings, monitor/incident and notification APIs. Capture the sign-in screen at 1440 and 390.
6. Run touched journeys and typecheck, refresh the generated deployment descriptor and source lock, integrate current main, inspect every candidate identity and trailer, then push through the cloud guard.
7. Discover and poll exact-SHA Verify through REST within the ten-call budget. Publish this explicit public-safe evidence packet to the separate evidence branch, then relay provenance and clause claims to main.

Scope: no release/version bump, live deployment, real provider account or live mail. CONTRACT.md clause text only; no Status, Gap or Evidence judgment changes, and no generated acceptance/claims views committed.

Policy defaults: none is explicit, missing/deferred selection never means off. Off means no sender object, no email delivery and no hosted local-development shortcut. Existing setup-token owner admission remains installation-authorized; subsequent mail-free owner sign-in uses the deploying checkout’s receipt and provider credentials.

Implemented results:
- Rer is pinned to 0.2.118 by package.json and regenerated pnpm/source locks. Current main's 0.5.13 release metadata is retained.
- Hosted manifest selection accepts explicit none with no sender or sending inputs. Enabled-provider sender requirements use conditional presentations. Both generated manifests use canonical JSON bytes.
- Native configuration, operations inspection and selected deployment declarations agree on mail off. Conflicting sending credentials refuse; none is bound to the Worker and the runtime returns no mail sender.
- Optional operator sign-in mail can report off. A required mail loop still reports disabled-required when deliberately off, as checked through the operations inspector.
- Owner-authorized invitations and public email-link requests report mail_unavailable equally for known and unknown addresses. Private and cross-origin doors retain their guards. Email alert delivery records are unavailable, never accepted.
- The browser journey starts with the actual hosted setup model's output, uses native owner bootstrap and first-run, saves Settings and creates a monitor/incident through public APIs. It uses network-edge fakes only; it does not seed product or owner rows directly.
- The existing controller lifecycle journey now uses Base's real auth service against the provider fixture's migrated D1 store. A real rer deploy with none binds no sender/key; rer signin issues a one-time owner grant only against that recorded deployment. Confirmation succeeds once; replay, missing credentials, wrong environment and a missing receipt refuse. Only the token digest is stored.
- Only the sign-in page's explicit mail-off state changes. Proof screenshots show it at 1440 and 390. Normal email-enabled hosted auth remains in the existing browser journey.

Clause source: STARTUP-001's requirement now makes sender requirements conditional on enabled outbound mail and records the guarded mail-free owner path. No Status, Gap or Evidence judgments were edited. Generated ACCEPTANCE.md and docs/CLAIMS.md are deliberately restored from origin/main for the fleet lander.

Before/after judgment counts: DONE 37 -> 37; PARTIAL 58 -> 58; MISSING 20 -> 20; total 115 -> 115. Existing registrations are extended; no new node:test registration or verification task is added. No test-budget.json exists; the brief's 200 default applies.

No live deployment, provider account or live mail was used. Base/package reads used two GitHub calls; CI calls and terminal provenance follow below.

Local verification history: an inline-module probe exposed a Miniflare worker-thread incompatibility, so final journeys use module files and pinned Node 22.20.0. A stale build after integrating main's 0.5.13 metadata was rebuilt before final alert regression. These were local harness/build-state corrections, not weakened assertions.

Terminal product provenance:
- Product head: d600eba12c99ca0865b91f77b12556f9aad314c6.
- Integrated origin/main: c1e8376c7dfd6ed601b6fe993567237449fc7143.
- Product push completed at 2026-11-15T19:57:23.671628+00:00 through cloud-push.py, first attempt.
- Candidate author and committer: Run Edit Run fleet <fleet@runeditrun.com>; no co-author trailers. All candidate commits were inspected before push.
- Product checkout is clean. No proof, screenshots, report files, release metadata or generated acceptance/claims views were added to the product commit.
- Local final checks passed: native setup/build, spec generation, hosted-auth browser including proveMailOff, owner deployment/sign-in lifecycle, startup/public paths, hosted alerts including managed relay, typecheck, contract generation/check, source-lock generation/check and diff validation.
- The build and alert regression were repeated after integrating main's release metadata. No full local rer verify was run.
- Verify run 43755285415 on d600eba12c99ca0865b91f77b12556f9aad314c6 completed with raw conclusion failure. Plan and prepare passed. Build job 132937982016 failed only at `node src/base/contract-docs.mjs check`: `ACCEPTANCE.md: generated content differs; run contract-docs write.` Contract prose had zero errors/warnings. Shards were skipped; verify job 132938130792 then failed its coverage assertion because build failed. Both failed-job logs were read once successfully.
- This is precisely the task's permitted generated-view exception, including dependent failed/skipped jobs. No generated views were committed to turn it green. READY is reported under that explicit exception; the workflow itself is not described as successful. The fleet lander regenerates the views and runs its own exact-main gates.
- GitHub budget: six task calls total (two Base facade reads, one exact-SHA discovery, one jobs read and two failed-job log reads). No workflow rerun or extra status polling was needed.
- Blockers: none under the stated acceptance exception. No live deployment or recipient-delivery claim is made.
- Report custody is published separately to evidence/main-uptime-mail-off-1; this does not claim product acceptance or landing.

CLAIM STARTUP-001 PARTIAL points=none tests=tests/mail-off-support.mjs#proveMailOff; tests/owner-deploy-lifecycle.mjs#real rer deploy covers fresh custody, automatic legacy upgrade, conflicts, named keys, exact repeat, resume and foreign ownership refusal
DEFAULT STARTUP-001: Only explicit none turns outbound mail off; no missing/deferred selector is treated as off. Existing broad STARTUP-001 qualification remains with the lander.

Signed: Run Edit Run fleet, 2026-11-15.

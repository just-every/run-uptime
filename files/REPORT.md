# sd-uptime-import-pingdom-2

Repository: just-every/run-uptime
Branch: cloud/sd-uptime-import-pingdom-2
Author: Run Edit Run fleet <fleet@runeditrun.com>

## Assignment and approach

Repair the two regressions from prior branch head `67752d3d186946e643ca58a833c171dcb86cce2e` while retaining its documented synthetic capture corpus, field dispositions, download, import behavior and guides. The full executable plan is in PLAN.md. The prior branch was fetched and its exact head confirmed. Its net product diff, excluding the old generated source lock, was applied to fresh main `395b92f1c37ab3ff166a18112643b18a31b5339e`. This produces a linear candidate with no candidate merge commits. Only the declared lease is changed.

## Repairs and actual reproductions

The native Playwright preview first failed through the real production import door: `create: 0, refused: 1` rather than `create: 1, refused: 0`, because the operation kind of the first step had become `[withheld]`. The final withholding traversal preserves steps only inside a native flow monitor's `flow` member. All other source step payloads remain withheld, including type-less Pingdom transaction-performance rows. Credentials and executable payload fields keep their existing rules and field-report topology. The added regression uses the real Playwright translator and authenticated recognition/upload/plan/preview, compares the original recognized steps, credential reference and immutable source, and cancels its unused plan before later custody assertions. Existing secret sentinel assertions remain unchanged.

The full baseline command journey then reproduced `5 !== 4` at `tests/command-journey.mjs:255` after export/reset/import into a receiving installation. Undo intentionally retains batch history, so the report journey cannot clean up shared state by undo alone. It now runs in a separate migrated Worker and browser context, both from the command journey and from its focused executable. The original command's four-batch count and expected identities are unchanged. Full failure details and transport observations are in REPRODUCTIONS.md.

## Local checks

All local commands use Node 22.20.0 and pnpm 10.12.4. The complete final import suite passes: native Playwright preview, ordinary refusal and secret custody, UptimeRobot, Better Stack, Site24x7, Pingdom, typed definition/CI paths, deterministic generation, exhaustive leaf and resource dispositions, paused apply, exact read-back, stable reordered re-import, stale/malformed refusal and secret-free custody. This includes the type-less transaction-performance counterproof that rejected the first attempted withholding scope.

The focused report-screen journey passes with keyboard and download checks, focus and accessibility-tree checks, error retention, paused apply and undo. Assertions run at 1440. Seven changed screens are each captured once at 1440 and 390; all seven axe receipts contain zero serious or critical violations. Browser files and hashes are enumerated in BROWSER-RECEIPT.json.

Build, typecheck, deterministic fixtures, deployment-spec consistency, structural first-party check, offline Base copy verification, contract generation/check and source-lock check pass. This checkout has neither `validate:release` nor `verify:release`; its documented equivalent build/check list was exercised. No clause meaning or judgment changed, so no RELEASE.json entry is required. The source lock was regenerated last after staging intended source. Generated ACCEPTANCE.md and docs/CLAIMS.md were restored whole from origin/main and are not changed.

The cloud's oversized-request connection resets are recorded honestly. The final import replay uses the packet's external `local-http.mjs` transport: actual standard Node HTTP, bounded writes and actual response status/body, without retries, synthetic responses, payload changes or weakened assertions. GitHub Verify independently uses the repository's normal clients. No transport harness is in the product branch.

CHECKS.json and checks/ contain actual successful local results. Terminal product and exact-SHA CI custody are recorded in RECEIPT.json and the CI receipts at completion. The fleet's publication scan and landing remain the fleet's own work under the cloud assignment; no release, tag, self-submit, deploy or default-branch push is performed here.

## Counts and judgments

Native Playwright preview: 0 accepted / 1 refused before; 1 accepted / 0 refused after. Command history: 5 batches before, 4 after isolation, proven by the full unchanged command journey. The assertion is untouched. Fixture inventory: 192 deterministic files including the manifest, 65 uptime checks plus four TMS checks, and eight TLS companions counted separately; see RECEIPT.json for the full supplied inventory. This is synthetic documented-shape proof.

Clause totals before and after: 37 done, 58 partial, 20 missing, 115 total. IMPORT-001, MIGRATE-002 and INTERFACE-001 remain partial, points=none. No Status, Gap or Evidence cell was edited.

CLAIM IMPORT-001 PARTIAL points=none tests=tests/incumbent-fixtures-support.mjs#proveIncumbentCaptures
CLAIM MIGRATE-002 PARTIAL points=none tests=tests/incumbent-fixtures-support.mjs#proveIncumbentCaptures
CLAIM INTERFACE-001 PARTIAL points=none tests=tests/definitions-journey.mjs#incumbentReportJourney

GAP IMPORT-001 Authentic account extraction, live count reconciliation and side-by-side cutover remain unproved; unsupported supplied fields remain named rather than silently imported.
GAP MIGRATE-002 Pingdom TMS, Page Speed, contacts/teams/integration relationships, maintenance/history and AWS converters remain unsupported or not carried; geographic intent, SMTP details and other documented adapter gaps remain as named by the report and guides.
GAP INTERFACE-001 Broader console qualification, human screen-reader proof and a VPAT remain unproved.

## Custody

Product and evidence publication are separate. Only the named product branch may be pushed. The complete explicitly selected non-secret packet is published only on refs/heads/evidence/sd-uptime-import-pingdom-2 and does not assert acceptance or landing. The final terminal receipt supplies actual product SHA, CI run IDs, evidence transfer result and any blocker.

Product commit: `99cfebdf813f0f639239e0a8add9ba6a6bec4941`. The named branch was pushed successfully on its first attempt. Fleet identity and absent trailers were inspected for every candidate commit; no candidate merge exists. PR: none created. The complete command journey passed with the unchanged four-batch count and exact expected batch identities.

Terminal CI receipt, observed 2026-11-17T17:21:40Z: Verify run `44133159499` completed successfully on exact product SHA `99cfebdf813f0f639239e0a8add9ba6a6bec4941` (https://github.com/just-every/run-uptime/actions/runs/44133159499). Four of ten GitHub calls were used. No job rerun was needed. All required local checks and exact-SHA Verify pass. Product custody: READY. Blockers: none. Clause statuses and counts remain unchanged. Landing and the fleet publication scan remain separate.

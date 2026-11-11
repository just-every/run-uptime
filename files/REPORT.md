# Uptime CSV paste and file-import guidance

Tag: main-uptime-import-paste-1  
Repository: just-every/run-uptime  
Branch: cloud/main-uptime-import-paste-1  
Product head: b2147519f1fb6cc8ea1c24486e5657248010d6fd  
Base after the required refresh: c379fc602df7e8fbe56de96407a28287d3519af6  
PR: none; this repository’s contributor rules do not require a PR for the fleet branch.

## Result

Pasting CSV and uploading its bytes now both select the same server CSV reader automatically. The original three-line `url,name,interval` example changed from **0 create / 3 refused** through paste (including the header) to **2 create / 0 refused**, at **60 seconds / every 1 minute**, matching file upload. The browser extension also proves name-first column order, a quoted comma in a name, optional per-row tags, zero-write previews, exact saved-definition equality after both apply paths, paused defaults and plain URLs after a file upload. No new provider or monitor type was added.

The paste box now gives its accepted URL/CSV shape and interval units in one visible sentence. Its shared settings retain explicit format overrides, with automatic detection first. Automatic mode resolves to the existing `catalog.add.csv` or `catalog.add.urls` source; preview, quota, validation, selection, reviewed digest, atomic apply and undo remain in the existing pipeline.

Both the New monitor file panel and Settings’ shared import component show accepted saved formats, small recognized JSON samples, export steps and provider guides. Existing Pingdom, Better Stack and Site24x7 guides are now published on `/docs` and linked alongside UptimeRobot and definition-file guidance. They retain their existing mapping limits. Phone samples wrap inside the field/card width.

The `Friendly Name,URL/IP,Type,Interval (min)` monitor CSV is not the documented saved UptimeRobot v3 format. Its refusal names **v3 GET /monitors JSON**, the exact API endpoint, every `nextLink` page and `/docs/moving-from-uptimerobot`. The file panel explains UptimeRobot event-log CSV separately: that door counts history rows only and creates no monitor/current evidence. The source selector now names Better Stack monitor pages separately from heartbeat/status-page resource pages.

## Plan and execution

The full original plan is in [PLAN.md](PLAN.md). Executed: fleet setup and identity/hook installation; isolated shallow clone; read product rules and contract; reproduce before changes through the emitted public screen; implement automatic parser selection and file guidance; extend the existing browser journey without new registrations; run focused public checks and typecheck; refresh main and rebase before publication; regenerate and check the source lock last; inspect all candidate identities/trailers; publish the product branch through the supplied push guard; await exact-SHA Verify; publish this report-only packet separately.

The pre-publication main refresh adopted the fleet’s independent rer 0.2.108 update. It did not conflict with the product change. Setup, build and focused browser proof are repeated on the resulting candidate checkout with its new pin. The first product push succeeded on attempt 1. No main/default branch was pushed, and no published history was rewritten.

## Validation

- The existing catalog public-route test passed on Node 22.20.0: 1 registration, 1 pass, no skips. It retains the 47-create/1-duplicate/2-refusal batch, first scheduled work and history-preserving undo assertions.
- The complete existing operator-browser journey passed again on the exact candidate with rer 0.2.108, through a temporary local copy of its existing runtime harness, with only the unrelated recovery invocation omitted from that temporary wrapper. The committed harness and recovery test are unchanged. The new support function is mounted by the existing `bulkAddDoor` journey at 1440; the seed’s existing 390 smoke remains.
- The focused browser receipt covers both CSV column orders through real UI, owner API and D1; provider samples recognized through `/api/definitions/recognise`; all linked guides return 200; an unreadable CSV creates no monitor. Screenshots show paste preview, file guidance and refusal at 1440 and 390. Browser contexts and owned runtimes are closed after each run. Only the network DNS/provider edge uses synthetic fixtures. The retained exact-candidate operator receipt records 13 accessibility/reflow checks plus the actual owner journey.
- Typecheck, application build, generated delivery-spec check, source-lock check, diff review, identity/trailer review and Git whitespace check passed. No generated contract view was committed.
- Two optional broader local definition-import attempts encountered `write ECONNRESET` in the existing test transport (one at the oversized-file refusal). One reached the existing saved-import assertions before its reset. No assertion was removed, skipped or weakened to address those attempts. The exact-SHA branch Verify is the full wall.

Actual receipts: before-receipt.json, after-original-receipt.json, browser-receipt.json, test-receipt.json, product-receipt.json, test-budget-receipt.json, clause-status-receipt.json, diff-review-receipt.json, operator-browser-receipt.json, evidence-first-transfer-receipt.json, remote-product-receipt.json, ci-jobs-receipt.json, ci-final-receipt.json and ci-calls.json. The packet contains only selected non-secret reports, receipts and screenshots; no auth/session data, environment dumps or private held-out material.

## Clause custody

CONTRACT.md, ACCEPTANCE.md and docs/CLAIMS.md are unchanged. Status counts before/after: **37 done, 58 partial, 20 missing (115 total)**. MONITOR-001, IMPORT-001 and MIGRATE-001 remain partial. No DONE claim or status/gap/evidence edit is made. No new registration or verification entry was added; the test cap is unchanged.

CLAIM MONITOR-001 PARTIAL points=5 tests=tests/catalog.mjs#MONITOR-001 catalog adds, metadata, lifecycle and undo keep reviewed revisions and history; tests/operator-browser.mjs#bulkAddDoor
CLAIM IMPORT-001 PARTIAL points=none tests=tests/operator-browser.mjs#bulkAddDoor
CLAIM MIGRATE-001 PARTIAL points=none tests=tests/operator-browser.mjs#bulkAddDoor
DEFAULT MIGRATE-001: Accept the documented saved UptimeRobot v3 JSON pages; do not guess a monitor CSV format or minute/type mapping.
GAP MIGRATE-001: Authorized incumbent-account extraction, complete account mapping and cutover remain outside this bounded saved-file guidance change.
GAP IMPORT-001: This round proves file recognition/refusal and catalog CSV application, not every definition-file acceptance obligation.

## CI and landing

Exact-SHA Verify: run 42983465124, https://github.com/just-every/run-uptime/actions/runs/42983465124. **Completed / success on b2147519f1fb6cc8ea1c24486e5657248010d6fd**, confirmed by REST. All eight shards, full-push-proof and the aggregate verify job succeeded; no contract-generator exception was needed. Six GitHub API calls were used. See [ci-final-receipt.json](ci-final-receipt.json) and [ci-calls.json](ci-calls.json).

The cloud adaptation reserves the complete Base publication scan and landing for the fleet Mac. The local diff review is not a COMPLETE publication scan. No landing, deployment, live provider migration or recipient acceptance is claimed. Evidence publication is report transport only and never signals product READY.

Observed CI jobs: all eight shards, full-push-proof and aggregate `verify` completed successfully on the candidate. Aggregate verify completed at 08:14:47Z, 942 seconds after run creation. The longest shard was push-6 at 879 seconds. The existing wall exceeds the fleet’s 10-minute timing target; this is a process follow-up, with no CI-shape changes in this brief. The final REST observation confirmed completed/success on the exact candidate SHA.

Product blockers: none. The broader local definition-import transport resets did not reproduce as a failed CI shard: the full branch wall passed. The final checkout was clean, and its exact product ref was read back from origin. All actual report/receipt files and selected changed-screen images are published on the separate report-only evidence ref. Clone cleanup follows verified final evidence publication.

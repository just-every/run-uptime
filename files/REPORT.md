# Plain monitor text — results

Repository: just-every/run-uptime
Branch: cloud/main-uptime-plain-monitor-text-1
Candidate: 15581293dc4be4e079132f70a2d1bdad3aa44274
Initial saved commit: 3eb7472ea56c12a7ba477ace83d1f6a0cfeb9707 [skip ci]
PR: none; this repository documents candidate-branch landing by the fleet.
Initial candidate Verify: 42997246922, https://github.com/just-every/run-uptime/actions/runs/42997246922, failed in the existing browser-artifact snapshot selector. CI-INITIAL.json, CI-JOBS.json and CI-FAILED-JOB.log retain the completed run and diagnostic. Corrected exact-SHA Verify: 43000305698, https://github.com/just-every/run-uptime/actions/runs/43000305698, on 15581293dc4be4e079132f70a2d1bdad3aa44274. It completed with conclusion failure. CI.json retains the exact-SHA result. The ten-call GitHub budget was exhausted by this final scheduled poll, so the corrected run’s failed jobs/logs could not be retrieved. The initial run’s diagnostic is retained separately and is not represented as the corrected run’s cause.

## Reproduction and result

Before editing, native browser sign-in, public owner APIs and the real scheduled private runner reproduced all three findings. A two-URL preview showed `local-a` and the internal pricing clause. Full check details displayed a bare JSON object. A scheduled 503 incident showed a place followed by its probe ID and a generic status failure. BEFORE.json and six before screenshots retain these observations. An initial reproduction request used a scalar status range that the public API correctly refused; the corrected request used the documented range array before any product edit.

After the change, the same doors show the actual assignment display name in both preview rows, omit the unpriced cost section, show labelled saved settings, and retain support data in a closed Raw data disclosure. Incident evidence says the measured status and the expectation saved with that incident's slot. The regression changes today's rule while the incident is still open and proves the original expected range stays on the incident. AFTER.json and the after screenshots show these results at 1440 and 390. SNAPSHOT-PROOF.json separately binds the real HTTP snapshot captures to the candidate and records the viewport/document extent at both widths.

## Changes found by the wider search

- `public/catalog-dialogs.js`: resolve probe slots through definition assignments instead of comparing them to runner IDs; omit the unpriced API reason; remove selected-monitor UUIDs and the missing-monitor ID fallback; use readable nested values and field labels in batch changes.
- `public/monitor-incidents.js`, `monitor-reads.js` and `monitor-page.js`: use the event's own saved slot/revision, render actual and expected HTTP status, preserve other failed assertions, turn outcome enums into words, and omit probe IDs from notification context. Reconcile when history arrives so load order cannot leave the generic reason in place.
- `public/monitor-folds.js`: labelled state, places, interval and criteria; reuse existing readable HTTP/protocol/mail/transaction/flow summaries; keep saved support payload and the engine explanation in Raw data. Private grant references move there too.
- `public/monitor-rules.js` and `monitor-recent-checks.js`: shared measured-status text and readable assertion labels; an unavailable location is described without showing its internal ID.
- `public/monitor-report.js` and `report-render.js`: place names in raw sample rows, chart tooltips, report headings and incident evidence, including pagination; readable outcome words; All locations in place of the `all` selector value. Downloads and API JSON retain their original representation.
- `public/failure-snapshots.js`, `monitor-page.js` and `assets/failure-snapshot-view.js`: resolve incident snapshot places using their revision, keep immutable UUID references behind Raw data, and describe unavailable location names without exposing a slot ID. The restricted evidence viewer has no assignment names in its existing payload, so it uses that plain unavailable-location fallback.
- `public/monitor-page.js`: the missing-monitor message describes an incomplete or deleted link without printing its ID.
- `CHANGELOG.md`: unreleased user-facing description. `sources.lock.json`: generated last through edition-authoring and checked.

This round’s diff against the merged main changes no API response fields, prices, contracts, clause Status/Gap/Evidence cells, generated acceptance views, package IDs or deployment settings. The inherited MFA round remains intact.

## Validation

- Build, typecheck, generated deployment-spec check, source-lock check and contract-docs check passed. Commands and actual outputs are in CHECKS.json and the selected log files.
- Extended the existing operator journey and pasted-import helper. Assertions at 1440 reject location IDs, clause IDs, UUIDs and JSON braces in the relevant visible text. They verify the immutable expected range after an edit, labelled details, closed/reachable Raw data and named report samples. The existing 390 phone smoke remains. The operator journey passed all 13 existing accessibility/reflow audits.
- Extended the existing HTTP failure-page journey to prove references start hidden and remain reachable, and snapshot summaries omit the probe code. Its existing masking, screenshot, owner/member access, export, archive and erasure assertions all passed. Nested disclosure selectors now target the snapshot's direct summary; no existing assertion was removed.
- The initial branch Verify passed build, packaging and seven shards, then failed in the browser-artifact journey because its descendant `summary` selector also matched the newly introduced Raw data summary. The fix targets the snapshot’s direct summary, proves the reference starts hidden, explicitly opens Raw data, and keeps the existing reference, video, trace, waterfall, table, accessibility and erasure assertions. The standalone real browser-artifact journey passed locally; it was rerun after merging updated main. FLOW-ARTIFACT-TEST.log records the actual result.
- The first snapshot run lacked the product runner's bundled browser and correctly returned browser_unavailable. Installing the official pinned Playwright Chromium build 1248 resolved this environment prerequisite; the browser driver uses /usr/bin/chromium with --no-sandbox. The next complete snapshot run passed.
- An early new owner-journey assertion assumed the synthetic transport retained response snapshots. That transport intentionally does not. The assertion was moved to the real HTTP snapshot journey rather than changing production behavior or fabricating evidence. The complete operator journey was then rerun successfully.
- Candidate screenshots were inspected at 1440 and 390. No horizontal overflow was observed on the changed screens. Snapshot proof also records equal document and viewport widths.
- 47 configured verification journey commands remain 47; the 12 node:test registrations and 37 standalone entry scripts remain 49 entry tests. No new registration was added. These are entry counts, not a claim to recount every nested verification script. The task stays within the existing cap by extending current journeys.

## Counts, claims and limits

Reported screens with visible internal forms: 3 → 0 (PACKET-CHECK.json).

Contract counts before → after: Done 37 → 37; Partial 58 → 58; Missing 20 → 20; Total 115 → 115. No clause status changed and no DONE claim is made.

CLAIM INTERFACE-001 PARTIAL points=1 tests=tests/plain-monitor-text-support.mjs#provePlainMonitorEvidence; tests/operator-browser.mjs#bulkAddDoor
CLAIM EVIDENCE-002 PARTIAL points=1 tests=tests/failure-page-journey.mjs#owners capture safe failure pages, share only monitor evidence, export every artifact and revoke access
CLAIM MONITOR-001 PARTIAL points=none tests=tests/import-paste-browser-support.mjs#provePasteImport
DEFAULT COST-001: unpriced console previews omit cost; pricing and API cost data remain unchanged.
DEFAULT EVIDENCE-002: display only retained measurements and immutable criteria; never substitute today's expected status for an older incident.
GAP EVIDENCE-002: events older than the recent history/revision windows can lack per-location status/criteria in the existing API payload. Their recorded reasons remain visible; a single retained webhook status can be shown when unambiguous. No missing measurement is invented. This run adds no evidence fields or API changes.
GAP MONITOR-001: this is the requested text round, not proof of the complete 50-URL/route/enable/undo acceptance flow or pricing/capacity.

## Outstanding blocker

BLOCKED: exact-SHA Verify 43000305698 failed on 15581293dc4be4e079132f70a2d1bdad3aa44274. The permitted ten GitHub calls are fully recorded in GITHUB-CALLS.json. The corrected run’s failing job/assertion is unknown because no diagnostic calls remain. Local merged-tree build, typecheck, owner-console, HTTP snapshot and real browser-artifact journeys pass; they do not substitute for the red branch Verify. The fleet must read that run’s failed-job log before landing. No READY claim is made.

## Publication and custody

The initial save and candidate product pushes succeeded on their first attempts through cloud-push.py. The first real commit was saved immediately. Main was fetched before publication and merged after the save. During the CI correction, the parallel MFA round advanced main to f7eaeebdd4bf1a93fa8cc505433f8cfe8ce3bea1; its product and tests were retained in a merge, dependencies refreshed, and the touched checks rerun. This round changes none of that round’s policy or assertions. Published history was not rebased or force pushed. Every candidate author and committer was checked across origin/main..HEAD, including side parents; all three task commits use Run Edit Run fleet <fleet@runeditrun.com>, with no trailers. The corrected merge head has no CI skip marker, and its product push also succeeded on its first attempt (CORRECTED-PUSH.txt).

The candidate diff has no credential-shaped matches. The full Base publication scan is reserved for the fleet's Mac lander by the supplied cloud adaptation; this report is not that scan. Verify and landing remain separate from report transfer. All actual selected reports and receipts stay in this packet and publish only to evidence/main-uptime-plain-monitor-text-1. No credentials, environment dump, sign-in link, private settings, archives, browser sessions, held-out material or symlinks are selected. The evidence transport also checks all report-only candidate identities and trailers before its push.

The full plan is PLAN.md. Product acceptance and exact-SHA CI state are recorded separately from evidence publication. No account or ruling dependency is required for this text change. No production deployment or main push was performed.

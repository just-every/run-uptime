# Uptime period report result

Repository: just-every/run-uptime
Branch: cloud/main-uptime-period-report-1
Product head: 29325cbd849cc16324e302f6bac83425192f813e
Base: 06dccf2ce2a48aedabd482aee468fa22e6f4e8b1; candidate synchronized with main before its first publication, with no main changes or published history rewrites.
PR: none; this lane hands its cloud branch to the fleet lander.

## Plan and implementation

The full plan is in PLAN.md. Reproduction used the emitted Worker, native owner admission and completed first-run setup, a monitor created through the operator API, signed scheduled runner observations from a controlled target, an actual confirmed failure and recovery, and the console's Reports control. No application response or markup was mocked.

The monitor's Reports fold now has a compact period selector and Generate report button. The button opens a dedicated report view under the same authenticated monitor document (`?view=report&period=…`). It uses the wide content area and has a Back to monitor link. The complete existing filter form lives behind Change period or filters. Generation closes that disclosure and focuses the snapshot heading. The existing report rendering, paging, coverage, Slow section, incident evidence and JSON/CSV/PDF download handlers remain in use.

Readable elapsed durations now appear once. Coverage, SLA, Slow time, incident durations and job-run durations use the existing humane duration formatter without a second parenthesised exact value. The existing API and exports retain their exact numeric data. Response-time measurements retain their single millisecond representation. There are no API, schedule, provider, contract-judgment or new-report-kind changes.

The report retains the existing responsive table: regular columns on the wide view and labeled stacked rows on the phone, so no sideways table gesture or scroll hint is necessary. Phone facts use one column. Report headings follow h1/h2/h3 order. The report has one card border, and its error message has no one-sided border.

## Measured results

| Measurement | Before | After |
| --- | ---: | ---: |
| Report content width at 1440 | 322.39 px | 1070 px |
| Report inside monitor side column | yes | no |
| Parenthesised exact-seconds forms in the reproduced report | 11 | 0 |
| Document width at 390 | 390 px | 390 px |
| Report content width at 390 | 320 px | 320 px |
| New test registrations | — | 0 |
| Selected push journeys | 47 | 47 |
| Contract done / partial / missing / total | 37 / 58 / 20 / 115 | 37 / 58 / 20 / 115 |

The original generated desktop monitor page was 5,132 px tall for the reproduction. The generated report now has its own document view, and returning to the monitor leaves no generated snapshot or results container there. Report height belongs to the report view. The before and after captures use separately executed synthetic runs, so timestamp and measured latency values differ; the observations are layout and formatting comparisons, not a data-equivalence claim across runs.

The existing `tests/plain-monitor-text-support.mjs#provePlainMonitorEvidence` journey calls `provePeriodReport`. It asserts at 1440 that generation opens outside the side column, the chosen period is retained, regeneration changes period and raw resolution, coverage/SLA/incident figures exist, locations retain readable names, durations have no parenthesised numerical duplicate, the page fits, axe has zero violations, polling preserves the snapshot, JSON equals the displayed snapshot, CSV retains exact durations, PDF downloads, and returning leaves the monitor compact. Browser proof records the report and returned monitor once each at 1440 and 390. No fixed copy, screenshot pixel or implementation-string test was added.

## Validation and custody

Passed: fleet setup; product build; focused report browser journey with real scheduled incident; zero axe violations at the journey width; typecheck; source-lock regeneration and check; contract generator check; diff whitespace and changed-source credential-shape check. Actual structured receipts are browser-receipt.json, report-layout.json and checks-receipt.json. The complete existing owner browser journey also passed, including all checks after returning from the report and its 390 phone smoke; its actual results are in owner-journey-receipt.json. The exact-SHA CI outcome is recorded separately in ci-receipt.json.

The first real commit was immediately pushed with the cloud push guard, with fleet author and committer, no co-author trailer and no CI skip marker. All candidate identities and trailers were inspected before that push. No evidence, screenshots, test credentials or fleet packet files were committed to the product branch. The full Base publication scan is the fleet Mac's landing gate and cannot run in this cloud.

Verify run: 43037562670, https://github.com/just-every/run-uptime/actions/runs/43037562670, exact head 29325cbd849cc16324e302f6bac83425192f813e. See ci-receipt.json for the actual terminal state. Discovery included one mistaken SHA query that returned no runs; it was discarded and supplies no green evidence. One watcher polls the correct run at intervals of at least 300 seconds. The ten-call task budget includes that unused query.

## Clause reporting and limits

CLAIM REPORT-001 PARTIAL points=none tests=tests/plain-monitor-text-support.mjs#provePeriodReport
DEFAULT REPORT-001: Reuse the existing authenticated monitor document for a dedicated wide report view; retain all existing periods, data and export endpoints.
GAP REPORT-001: This polish round proves the brief's layout and duration behavior, not every obligation of a full REPORT-001 acceptance point. Existing clause judgments and gaps remain the lander's responsibility.

No CONTRACT.md Status, Gap or Evidence cell changed. No DONE claim is made. ACCEPTANCE.md and docs/CLAIMS.md were not committed. No new clause or acceptance point was added.

12ui was installed and invoked against the original report capture. Hosted generation required an unavailable account sign-in, so no design kit was generated or claimed. The implementation uses existing Uptime components. The complete polish playbook's Mac path was not shipped; the brief's inline essentials were applied.

Only local synthetic data and public source identifiers are in this explicitly selected packet. No credential, environment dump, real session material, held-out gate input, private settings or symlink is selected for evidence publication. Evidence publication is report-only custody, not product READY, acceptance or landing. The initial 14-file packet was fetched back from its published ref and all manifest/file hashes verified; see evidence-readback-receipt.json. Final CI updates advance the evidence ref without rewriting its published history.

## First Verify attempt and permitted retry

The first exact-SHA Verify attempt failed: push-3 reached the unchanged command journey export and Workerd returned ERR_RUNTIME_FAILURE (scratch-installation assertion 1 !== 0); push-1 failed in Install browsers and probe bundled engines. Build, prepare and six other shards succeeded. Failed logs were requested once per failed shard. The push-3 assertion log was readable. The exact command `gh run view 43037562670 --repo just-every/run-uptime --job 130580932646 --log-failed` failed with `failed to get run log: zip: not a valid zip file`; no HTTP status was supplied and no archive retry was made. The required single rerun of failed jobs was accepted on the same SHA. See ci-failure-receipt.json. At the rerun request, nine of ten explicit GitHub-budget calls had been used; the tenth was reserved for its terminal observation.

## Terminal product provenance

Status: BLOCKED

Exact-SHA Verify failed again after the one permitted unrelated-failure rerun; API budget exhausted.

Run: 43037562670; observed attempt: 2; status: completed; conclusion: failure; head: 29325cbd849cc16324e302f6bac83425192f813e. The final observation was at 2026-11-11T14:50:31Z. All ten explicit GitHub-budget calls are accounted for. No further workflow dispatch, rerun, API read or product push was made.

The product checkout is clean. The clone will be removed after this complete packet is published to its report-only evidence ref. The fleet still owns the full publication scan, landing and main verification. See terminal-product-receipt.json and ci-receipt.json for actual custody.

Attempt 2 failed. Its failed-job identities and logs were not fetched because the explicit ten-call budget was exhausted. The initial Workerd/export and browser-install failures are facts about attempt 1 only; this report does not assign them as the cause of attempt 2. The remaining prerequisite is successful exact-SHA Verify, with failure diagnosis under a fresh authorized API budget. No READY claim is made.

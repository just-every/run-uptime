# Uptime readable check details and erasure receipts

Repository: just-every/run-uptime
Branch: cloud/main-uptime-readable-details-1
Product head: 4487112e58139713fb0bf4fb482de68778588d3d
Initial published head: d0ff7f539fd16f8e032c4d5c0539ff27a7c1ec7d
Starting/main integration base: c14aafe38f2a5c754a550251593170404f1363a5
PR: none; repository guidance permits a branch candidate for the fleet lander.

The two assigned stranger-30 findings are fixed. Heartbeat Full check details displays its success deadline and maximum run duration, plus current evidence in words. The raw data disclosure is removed from this panel for every monitor kind; existing HTTP, protocol, mail, API and browser-flow summaries remain kind-specific. Failed overview reads propagate Unknown and the readable refresh-failure explanation into the panel. Raw definitions, assertions, API responses and exports are unchanged.

Expanded monitor Receipt details retains the existing ER reference and completion time, with nonzero counts grouped by what was erased. It never displays the stored receipt UUID or derives labels from storage/authority names. Every stored count contributes to exactly one category, including a plain fallback for future dependent records. Zero-count groups are omitted. The original receipt object, download, stored counts and later archive remain unchanged. Counts wrap and align at phone width using the existing receipt styles.

## Plan and execution

1. Configured fleet global/local commit identity, refreshed the fleet launcher, installed decrypted-bundle Git authentication, the cloud push guard and preserved repository hooks with the fleet commit-message cleanup.
2. Cloned only the declared repository, created the named branch from main, and read the launcher, repository guidance, contract and operational references. Applied the inline polish essentials to the existing components. This is a narrow data-presentation repair; no new interface or visual redesign was created.
3. Reproduced both findings through public authenticated import and monitor routes before editing. An imported heartbeat expanded Full check details into `{ "status": 200 }`. An imported HTTP monitor erased through Edit > Erase monitor displayed its raw UUID and the internal inventory. `reproduction.json` and the four before screenshots preserve the observations. A first exploratory heartbeat erasure followed its existing direct navigation path; the receipt finding was then reproduced through the assigned imported-monitor editor path.
4. Changed only the check-details presentation, the receipt presentation/styles, their existing browser helpers and the regenerated edition source lock. No API, storage, exports, contract judgments, generated contract views or unrelated findings were changed.
5. Extended the existing owner maintenance/erasure journey to import a heartbeat, inspect expanded details and inspect the expanded receipt. Updated the existing HTTP check-details journey to preserve raw API criteria without requiring JSON on screen. Extended the existing signed-runner heartbeat journey to check actual scheduled Healthy evidence and saved cron criteria. Updated existing second-factor erasure assertions to verify the readable totals alongside unchanged per-table storage and archive contents. Added no test registration.
6. Built the app and ran only the affected browser helpers, their signed-runner parent journey and typecheck. Asserted at 1440 only. Captured and visually inspected the changed screens at 1440 and 390. Axe checks and page reflow passed at the assertion width. The receipt shows the entire expanded summary at 390 without horizontal overflow.
7. Fetched main and rebased unpublished work with fleet identities. Main remained at the starting SHA. Regenerated sources.lock.json last with `node scripts/edition-authoring/cli.mjs lock`, and passed CI's exact lock check, `node scripts/edition-authoring/cli.mjs check`. Contract document check also passed. Audited every candidate commit's full author/committer identities, trailers and message, then committed without any co-author trailer or skip marker.
8. Published the first product commit through the supplied cloud push guard; its first attempt succeeded. Initial Verify 43559246813 failed in the browser shard because an older nested assertion still required the deliberately removed raw JSON disclosure. Its other seven shards, build and packaging passed. The failed jobs were rerun once before the nested cause was identified. Replaced the obsolete UI reachability check with readable details, no raw payload and exact saved criteria through the API. The full parent replay also prompted an explicit console-ready wait before sign-out, a native sign-out success assertion and the same fresh public-asset window for the cold phone context that the desktop already used. Production limits and all phone assertions remain intact. Fetched main again and ran merge without rewriting the published head; main remained unchanged. The correction and regenerated source lock are an append-only second commit. Final exact-head Verify discovery and the ten-call budget are recorded in the CI receipt. Reports and screenshots travel only on evidence/main-uptime-readable-details-1. The fleet owns the publication scan and landing.

## Actual validation

- `cloud_run npx -y @runeditrun/rer build`: exit 0.
- `cloud_run node /tmp/uptime-readable-checks.mjs`, with system Chromium and the existing production Worker runtime: exit 0. Invokes `tests/readable-maintenance-erasure-support.mjs#proveReadableMaintenanceAndErasure` and `tests/monitor-stepup-support.mjs#proveMonitorStepUp`. Covers public imports, readable heartbeat criteria, the actual editor erasure, hidden UUID and raw inventory even when expanded, all counts represented, exact receipt download, copy-reference equality, completion time, monitor removal, native fresh-second-factor retry, unchanged stored receipt and later archive. The existing maintenance assertions also remain and pass.
- `cloud_run node tests/signed-runner.mjs`, with system Chromium: exit 0. Covers the changed `tests/heartbeat-console-support.mjs#proveHeartbeatConsole`, real signed scheduled Healthy, period and grace boundaries, saved cron/time-zone criteria, failure and late recovery. The ordinary expected missing-schema fault in its runner-contact probe is recorded in the log and successfully recovered.
- `cloud_run node tests/browser-suites.mjs`: exit 0 after the correction, including the full desktop operator lifecycle, the 390 phone smoke and recovery; owned runtime groups stopped and temporary grant/state removed.
- `cloud_run pnpm run typecheck`: exit 0 for console/server and runner projects, repeated on the final correction.
- `node scripts/edition-authoring/cli.mjs check`: exit 0.
- `node src/base/contract-docs.mjs check`: exit 0; 0 prose errors or warnings, generated views current.
- `git diff --check`: exit 0.

`RECEIPTS.json`, `readable-receipts.json`, the original downloaded synthetic receipt and `touched-checks.txt` retain actual results. The local shell used Node 24.19.0 for direct test/typecheck commands; rer selected its pinned Node 22.20.0 runtime for lifecycle operations. CI uses the repository's pinned Node 22.20.0. Build emitted the repository's existing size/dynamic-import warnings and succeeded.

## Before and after counts

| Measurement | Before | After |
| --- | ---: | ---: |
| Assigned reproducible stranger findings | 2 | 0 |
| Raw JSON disclosure in Full check details | 1 | 0 |
| Stored UUID in expanded monitor receipt | 1 | 0 |
| Internal storage labels in expanded receipt | present | 0 |
| Product verify-plan journey scripts | 47 | 47 |
| Top-level product assertions/registrations | 49 | 49 |
| Added registrations | 0 | 0 |

The registration count counts each standalone product assert script once, or each explicit node:test registration within it. Existing imported helpers extend their parent registrations. Base-owned conformance is unchanged. No test-budget.json exists, so the default cap is 200. The candidate receipt fixture has 42 stored inventory entries, displayed as two nonzero categories accounting for all four affected records. The raw per-table receipt remains downloadable and matches the server exactly.

## Clause judgments and bounded claims

No clause Status, Gap or Evidence changed. INTERFACE-001 remains partial; ERASURE-001 retains main's done judgment; HEARTBEAT-002 remains partial. This polish round proves the assigned readable screens, not every acceptance obligation of those clauses. No DONE claim is made and no complete acceptance point is promoted.

CLAIM INTERFACE-001 PARTIAL points=none tests=tests/readable-maintenance-erasure-support.mjs#proveReadableMaintenanceAndErasure; tests/heartbeat-console-support.mjs#proveHeartbeatConsole
CLAIM ERASURE-001 PARTIAL points=none tests=tests/readable-maintenance-erasure-support.mjs#proveReadableMaintenanceAndErasure; tests/monitor-stepup-support.mjs#proveMonitorStepUp

DEFAULT INTERFACE-001: Reuse each kind's existing readable criteria and the current status explanation; raw objects remain in machine-facing doors.
DEFAULT ERASURE-001: Group each stored count once into a plain content category, omit zero-count groups, and preserve the complete raw downloadable receipt.
GAP INTERFACE-001: This scoped round does not requalify all healthy/stale/failing/unavailable journeys at both assertion widths, human screen-reader work or the VPAT.
GAP ERASURE-001: This scoped display repair does not requalify all supported entities, concurrent erasure, last-owner refusal or old-archive journal fencing.

## Custody and limitations

Both product commits use fleet identity and no co-author or skip marker. Product pushes use the supplied guard; no published history was rewritten. The initial evidence packet was preserved remotely before the CI correction, and the final evidence publication supersedes it through an ordinary fast-forward. There are no local touched-check blockers. Hosted providers, public deployment, a whole-clause promotion, Mac publication scan and landing are outside this cloud repair. Evidence publication is separate from product READY and never establishes landing. Final exact-head CI status and evidence transport identity accompany the terminal report.

## Terminal CI and custody

Final Verify 43562712656 is in_progress on exact head 4487112e58139713fb0bf4fb482de68778588d3d: https://github.com/just-every/run-uptime/actions/runs/43562712656. The ten-call GitHub budget is exhausted after initial discovery, five spaced status reads, failed-job discovery, one failed-shard log archive read, one failed-job rerun and final-head discovery. The final browser suite, focused candidate proof, typecheck and source-lock check all pass locally. Final custody is PUSHED while the new exact-head Verify completes. Initial Verify failure 43559246813 is retained honestly in the packet; it led to the corrected nested assertion. No READY, contract completion, publication-scan or landing claim is made.

# Uptime console asset limiter repair

Author: Run Edit Run fleet, 2026-11-15.

## Plan and scope

1. Clone current main, start through rer dev, use its native development sign-in handoff, and reproduce rapid full console loads in one minute. Retain request counts and safe response metadata only.
2. Repair asset caching and asset-class allowances while retaining the persistent limiter, API/page budgets, all authentication and session authority, and development HMR. Add an honest rate-limited read state and automatic Retry-After recovery without replaying writes.
3. Extend the existing operator journey and public-path assertions, run only touched checks and typecheck, and inspect the changed state at 1440 and 390.
4. Refresh main, preserve newer source and published history, regenerate the source lock last, check candidate identities/messages, and push only the assigned cloud branch through the fleet guard.
5. Run timing proof on the committed candidate, wait fifteen minutes before exact-SHA Verify discovery, and publish complete selected non-secret evidence separately. Leave landing, the full publication scan, releases and deployment to their existing lanes.

Declared write scope: just-every/run-uptime only. Product branch: cloud/main-uptime-asset-limit-1. Final product head: 3cb0b1d831860675f03a16333a6878eaeaa3eda3. Final push completed: 2026-11-15T17:01:05.240854+00:00. No PR was required by this repository's branch landing rules, and none was created.

## Reproduction

Main was 7e4e51b86b8f7081719eae4aa1fad74849ca2607, Uptime 0.5.12. The assets bucket allowed 600 requests per fixed minute/client; the separate development compiler bucket allowed 1,800. Local mode shared the loopback identity. Development /app.js returned Cache-Control: no-cache; production resources had a one-minute cache policy without immutable fingerprint handling.

The first six-load diagnostic inadvertently waited thirty seconds after each successful page for an absent loading-note element. Its actual receipt is retained as baseline-six-loads.json, but it is not a one-minute burst proof. The corrected probe used an immediate text lookup and attempted twelve full loads at 1440, starting in a fresh fixed window.

The corrected baseline completed seven loads, encountered an asset 429 on load eight, and stalled on load nine with Loading still visible. That burst took 49,365 ms and recorded 68 asset 429s with Retry-After; /app.js and styles were refused. This environment needed more loads than the reporter's three or four, but reproduced the same cause within one minute. The full actual receipt is baseline-reproduction.json.

With the repair, all twelve dev loads finished in 50,344 ms, with zero 429s and zero browser exceptions. Development resources still used no-cache. The full actual receipt is after-dev-reproduction.json.

## Implementation

Only the static resource budgets change: assets 600 to 12,000, and development-assets 1,800 to 12,000. Both remain owner-tunable, estimated and not a capacity promise. The existing D1 limiter, keyed client hashes, fixed-minute windows, shared local bucket and fail-closed storage behavior are unchanged. Every other class budget and its 429/Retry-After behavior remain in place.

Fingerprint-named production JS/CSS output receives public, max-age=31536000, immutable. Vite records the copied public/assets inventory at build time so stable names such as security-controls.js and alert-route-fallback.css retain one-minute revalidation even though their suffixes resemble hashes. This follow-up corrected the initial filename-only classifier before readiness. Missing resources are never made immutable. Vite development revalidation/HMR remains intact.

Console reads that receive 429 show a plain rate-limit notice, replace the first-read loading skeleton, retain Unknown health and honor Retry-After before refreshing. Integer seconds and HTTP dates work. Ordinary polling and other refresh calls cannot beat the shared read cooldown, and console disposal clears the retry timer. A refused mutation remains an action failure and is not automatically replayed. Sign-in authority, sessions, reachability and server-side permission checks are unchanged.

The final product diff has ten files: cache handling, the generated-at-build static inventory, asset budgets, existing console feedback/styles, matching operator documentation, extensions to the two existing journeys and the regenerated source lock. No proof, screenshot, credential or report file is in either product commit.

## Local results

Passed on the final source: cloud_run npx -y @runeditrun/rer build; pnpm spec:generate and spec:check; node tests/public-paths.mjs; pnpm run typecheck under Node 22.20.0; node src/base/contract-docs.mjs check; node scripts/edition-authoring/cli.mjs check after regenerating the lock last; and git diff --check. The existing operator/recovery wrapper passed on both published heads. The final committed exact-SHA run passed at 2026-11-15T17:05:15.077629+00:00 and stopped its owned runtime groups and removed temporary grants/state. No full local rer verify ran.

The initial production operator run completed six full loads in 5,700 ms with zero failed resources, despite routing disabling Chromium's HTTP cache. A genuine API burst admitted 180 requests and returned 429 with positive Retry-After on request 181, while the independent private overview remained available. The HTTP-date read refusal recovered after 7,314 ms at 1440 and the integer-seconds refusal after 8,008 ms at 390, each after its required deadline with exactly two requests. Both changed screens had zero axe violations, valid accessibility trees and no document overflow; both were visually inspected. Existing 503 action-error assertions were retained alongside the added 429 case and no-replay assertion.

Public path assertions discover real built JS/CSS from the served documentation and verify immutable GET/HEAD caching. Copied stable JS/CSS and missing assets retain appropriate cache behavior. All existing declared/private route, credential, second-client, concurrent final-slot, unknown-client, shared-loopback, restart, cleanup and removed-counter-storage assertions remain and pass.

## Publication and counts

The pre-publication main fetch remained at 7e4e51b86b8f7081719eae4aa1fad74849ca2607. The first commit used the required pre-push rebase; after that publication, the final round used merge origin/main and preserved both published commits. The source lock was regenerated and checked last after the final repair. Recorded checked-file hashes match the final committed blobs.

Both product commits use Run Edit Run fleet <fleet@runeditrun.com> as author and committer, have no trailers and have no CI skip marker. Every candidate commit and message, including side parents, was inspected before each push. Both pushes succeeded on their first attempt through cloud-push.py. No history was rewritten, and no main/default branch, release, deployment or other repository was changed.

The intended diff passed a credential-pattern check. The complete publication scan remains with the fleet Mac lander under the cloud adaptation. Contract source, Status/Gap/Evidence cells and generated views are unchanged. Before/after clause counts: done 37 to 37, partial 58 to 58, missing 20 to 20. Test registrations added: 0. Both existing assert-script journeys were extended; push task entry scripts remain 47 to 47.

CLAIM PUBLIC-002 DONE points=1 tests=tests/public-paths.mjs#BASE-ACCESS-003 public paths and rate limits; tests/operator-browser.mjs#repeatConsoleLoads
CLAIM INTERFACE-001 PARTIAL points=none tests=tests/operator-browser.mjs#rateLimitedJourney; tests/operator-browser.mjs#actionErrorJourney
GAP INTERFACE-001: The pre-existing complete-phone-journey qualification remains outside this defect repair; the clause status is unchanged.

## CI and evidence custody

The pending watcher for the first head was stopped before making any GitHub call after the copied-file classifier issue was found. One watcher now targets the final head, with discovery due fifteen minutes after its push and no more than one call per 300 seconds thereafter. GitHub budget: ten calls, reserving calls for finished-run failure logs if needed. Exact-SHA Verify completed successfully: run 43738698569, push event on cloud/main-uptime-asset-limit-1, head 3cb0b1d831860675f03a16333a6878eaeaa3eda3. The first authorized discovery after the final push returned completed/success; one GitHub API call was used, so no status poll or failure-log call was needed. No contract-generator exception was used.

The packet contains actual reports, safe original observations, receipts, selected screenshots and accessibility results. It excludes credentials, browser storage, auth URLs, environment dumps, archives, private runtime logs, private held-out material and symlinks. Evidence publication is separate from product readiness and landing.

Final committed-head browser measurements (3cb0b1d831860675f03a16333a6878eaeaa3eda3):

```json
[
  {
    "label": "repeated-console-loads-1440",
    "loads": 6,
    "elapsedMs": 5462,
    "failedResources": 0
  },
  {
    "label": "api-over-limit-1440",
    "requests": 181,
    "limited": 1
  },
  {
    "label": "rate-limited-1440",
    "violations": 0,
    "documentWidth": 1440,
    "accessibilityNodes": 33,
    "textInspected": true
  },
  {
    "label": "rate-limited-recovery-1440",
    "attempts": 2,
    "retryWaitMs": 7965,
    "retryAfterHonored": true
  },
  {
    "label": "rate-limited-390",
    "violations": 0,
    "documentWidth": 390,
    "accessibilityNodes": 34,
    "textInspected": true
  },
  {
    "label": "rate-limited-recovery-390",
    "attempts": 2,
    "retryWaitMs": 8011,
    "retryAfterHonored": true
  }
]
```

## Final outcome

READY product candidate: cloud/main-uptime-asset-limit-1 at 3cb0b1d831860675f03a16333a6878eaeaa3eda3. Verify: https://github.com/just-every/run-uptime/actions/runs/43738698569 (completed/success on that exact SHA). No product blocker remains. The full publication scan and landing remain with the fleet. Evidence is published only on evidence/main-uptime-asset-limit-1; no evidence changes the product checkout or constitutes landing. The clone is removed only after the evidence ref and product ref are verified.

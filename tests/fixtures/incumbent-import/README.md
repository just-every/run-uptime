# Synthetic incumbent captures

Author: Codex, 17 November 2026.

These fixtures contain synthetic test data only. Generation is offline: it does
not call a provider, fetch an artifact reference, extract a ZIP or execute any
captured script. Names and targets use reserved example domains/IPs; AWS uses
dummy account `000000000000`. Credential/device strings are test sentinels whose
absence from durable product state and reports must be checked.

Run from the checkout root:

```sh
node scripts/generate-incumbent-import-fixtures.mjs
node scripts/generate-incumbent-import-fixtures.mjs --check
node scripts/generate-incumbent-import-fixtures.mjs --output /path/to/test-output
```

`--check` compares every generated file byte for byte without writing. Two fresh
outputs have identical manifests. Seed `ct-import-plan-uptime-1`, clock
`2026-11-01T00:00:00Z`, ordered JSON keys, UTF-8/LF, stable IDs and fixed ZIP DOS
timestamps make generation repeatable. Source modules live in `generator/` and
are hashed in the root manifest. They are test-support code, not application
fallbacks. Generation removes only obsolete paths named in a previous generated
manifest; it does not clear arbitrary directories.

`pingdom/capture.json` and `aws/capture.json` are single-file upload bundles:

```json
{
  "format": "uptime.incumbent-capture.v1",
  "source": "pingdom",
  "synthetic": true,
  "seed": "ct-import-plan-uptime-1",
  "capturedAt": "2026-11-01T00:00:00Z",
  "scope": {"account": "synthetic-pingdom-account"},
  "schemaNotes": [],
  "records": [{
    "id": "tms/detail-83001",
    "kind": "tms-detail",
    "sourceId": "83001",
    "request": {"method": "GET", "path": "/api/3.1/tms/check/83001", "query": {}},
    "response": {"type": "script", "name": "Illustrative shape only", "interval": 5, "steps": []}
  }]
}
```

This is versioned Uptime transport packaging, not a claimed incumbent export
format. Provider response objects remain separate and unmodified inside each
descriptor. TMS IDs come from the native list and request context because its
native detail schema omits an ID. Results/reports retain their request's check
ID and time window. AWS scope retains account and region; code input is a
separately supplied `CanaryCodeInput`, never manufactured inside GetCanary.Code.
`request.query` records operation parameters; for AWS POST operations this is
capture context, not a claim those parameters were sent in a URL query.

Each provider `manifest.json` associates native response filenames with kind,
request, source ID, pagination, record count, byte count and SHA-256. The root
`manifest.json` hashes all generated payloads, provider manifests and expectations.
The manifest never substitutes a path fetch for supplied response bytes.

The baseline corpus contains:

| Set | Contents |
| --- | --- |
| Pingdom uptime | 65 list rows in 25/25/15 offset pages: 25 HTTP, 10 TCP, 10 ping, 10 DNS, 10 SMTP; 55 separate non-ping details; eight eligible HTTPS expiry companions counted separately |
| Relationships | Two teams, five contacts, two distinct integration IDs, three probes, two windows and five native epoch occurrences across the November US DST boundary |
| History | 60 days, three outages of 61/733/3671 seconds, 1,205 result samples in seven 200-row pages, 60 daily aggregates, overlapping hourly/weekly alternatives, and one unmapped result |
| TMS | Two scripts and two recordings with separate list/detail files: login, signup, sandbox checkout, and a documented `wpm_close_tab` conversion refusal; attributed status/performance reports |
| AWS | Two canaries in two token pages and an empty terminal page; matching detail objects and deterministic browser/API ZIPs; four metric alarms and one composite alarm in two pages |
| Page Speed | Separately labeled operator transcription in `pagespeed/`; source `pingdom-pagespeed-transcription`; no native export claim |

`expected/expectations.json` records independently authored source counts,
identities, exact outage durations, a 90-day window spanning cutover, intended
outcomes and absence-of-effects obligations. It never calls the mapper under
test. `expected/documented-field-map.csv` preserves the planner's 363-row public
schema inventory and its assessment, with the planner commit named in
`expected/provenance.json`. `expected/documented-field-coverage.json` links each
inventory row to actual fixture paths, without copying any source values. The
planner dispositions are migration obligations and an earlier assessment, not
an assertion that all those conversions now exist.

`empty/`, `edge/`, `aws/proposals/`, `reimport/` and `negative/` keep exceptional
cases separate from the baseline. Cases cover unknown nested fields, documented
contact alternatives, adapter-only ping/regex conventions, additional protocols,
AWS scheduling/runtime/placement/visual/alarm differences, changed/reordered and
overlapping captures, malformed encodings/envelopes/numbers/dates, missing detail,
pagination gaps/token repetition, conflicting IDs, depth/size/monitor bounds,
credential-bearing URLs, XSS/prototype keys, forbidden targets, source secrets,
and inert hostile ZIP paths/symlinks/bombs/code. `negative/501-monitors.json` and
`negative/expanded-companion-bound.json` distinguish source monitors from native
companion expansion. Attack ZIPs must never be extracted without validation.

`pingdom-checks.synthetic.json` is the corrected seven-record legacy adapter
fixture (two create, three refused, two unsupported). Its explicit TMS IDs are
legacy adapter metadata; the native capture corpus preserves ID-free TMS detail
responses. Positive HTTP keywords are exclusive and request headers are arrays,
including values containing colons.

The capture's schema notes retain the missing Pingdom ping-detail variant,
contact example/schema alternatives, integer-threshold schema defect, TMS
recording security-description ambiguity and absent public Page Speed export.
No synthetic test establishes authentic extraction, geographic equivalence,
provider cutover, public-page handoff or release publication.

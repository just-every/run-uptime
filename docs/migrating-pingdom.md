_Authored by sd, 2026-11-17 (UTC). Public source documentation checked on that date._

Open **Settings › Backup and files** to preview saved Pingdom check details or a documented capture package. Review every difference before applying. Accepted definitions arrive paused; credentials, runner authority and notification authority require local setup. Importing never executes a source script, contacts an incumbent account, enables monitoring or turns a source status snapshot into current health.

## Saved responses and capture packages

The [Pingdom API 3.1 schema](https://docs.pingdom.com/API_3.1.yaml) documents uptime details at `GET /api/3.1/checks/{id}`, inside a `check` object. Save each response separately or collect detail responses in a JSON array; complete responses written sequentially are also accepted. The CLI uses the same preview and reviewed apply as the console:

```sh
node scripts/definitions.mjs preview --input saved-checks.json --source pingdom --json
node scripts/definitions.mjs apply --input saved-checks.json --source pingdom --digest REVIEWED_DIGEST --json
```

A bare `/checks` summary cannot supply missing HTTP/protocol settings. In a capture package, list pages and detail requests retain separate identities. Native response bodies remain unchanged. The Uptime packaging records the request method, path, query and source identity alongside each response; it is not a provider export format. The current package accepts only explicitly synthetic captures (`synthetic: true`). A package identifies itself with `format: "uptime.incumbent-capture.v1"`, `source`, `synthetic`, `seed`, `capturedAt`, `scope`, `schemaNotes` and `records`. Each record has `kind`, `request` and `response`; detail records require a stable `sourceId` matching their list/request identity. Request metadata describes the saved operation; separately supplied local input/transcription uses `LOCAL`. TMS details lack an ID in the published schema, so their identity comes from the list/request metadata, never array position.

Capture metadata and page tokens describe saved evidence. Import does not follow URLs, tokens, code references or presigned artifact locations. Missing details, offset gaps, repeated tokens and conflicting identities are reported or refused rather than filled by a live request. The current file bound applies to expanded resource rows as well as native companions; the entire history corpus is not a single apply file. The existing bounded apply remains a sequence of guarded batches; an earlier successful batch is not rolled back when a later batch fails.

## What converts today

HTTP, TCP, DNS and SMTP detail settings have bounded conversions; ping also has an adapter convention. See the [field-level conversion table](/docs/definitions#pingdom-saved-check-details) for protocol restrictions, trust settings and timing differences. New definitions remain paused, re-import reconciles stable source identities, and undo preserves history and later local edits.

HTTP headers are documented as an array of colon-separated strings. Header/body/authentication values are withheld and must be re-entered in a monitor-bound local credential file. Header names are not currently preserved by the withholding path. A nonempty TCP send payload or SMTP credentials remains unsupported. SMTP's exact expected greeting and source IPv6 intent are not currently carried. DNS uses the named server over TCP port 53 with includes matching. Nonempty geographic filters refuse the check and name the filters; source probes never become authorized Uptime runners.

A response-time threshold becomes a one-slot native Slow policy for HTTP; Pingdom describes that threshold as a down-alert condition. Review the resulting downtime difference. Failure counts used as native confirmation slots and the separate contact-timing preview also need joint review so a delay is not counted twice. Repeated alerts, recovery preferences and integration IDs do not become notification routes through definition import.

Certificate-expiry settings can expand one source HTTP check into an HTTP definition and a separate TLS companion. Count the original check once and show the companion separately in native create/change/refusal totals and quota usage. The TLS check verifies trust even if the source HTTP check ignores certificate errors. Current expansion also occurs with source verification disabled, although Pingdom says expiry is ignored in that case; this remains a visible semantic limitation. Review and activate each resulting monitor separately.

## Source-schema defects and absent exports

These are explicit source ambiguities, not invented native export formats:

- **Ping:** create/list types include ping, but GET detail's `oneOf` omits it. Captures therefore retain documented ping summaries and label any normalization separately. `type: {"ping": {}}` is an adapter convention, not a documented GET response. Missing policy cannot be inferred from a status summary; packet loss, RTT and retry settings must not be fabricated.
- **Response threshold:** the GET schema declares `responsetime_threshold` boolean but gives integer example `30000`; create/modify describe integer milliseconds triggering a down alert. The importer validates integers and reports the native Slow semantic difference. A boolean is not silently converted to milliseconds.
- **Contacts:** the published example uses channel-keyed `notification_targets.email` and `.sms`; the schema describes alternative arrays. Synthetic captures retain both labelled variants. Integration IDs remain distinct from contact IDs, and neither source owner flags nor team membership grant local roles.
- **Keywords:** source descriptions prohibit combining inclusion and exclusion. Positive captures separate them; their combination is a negative case. An undocumented regex extension is labelled separately.
- **Page Speed:** the [Page Speed guide](https://documentation.solarwinds.com/en/success_center/pingdom/content/topics/page-speed-check.htm) and [setup guide](https://documentation.solarwinds.com/en/success_center/pingdom/content/gsg/set-up-page-monitoring.htm) describe UI settings and results, but API 3.1 supplies no established native Page Speed export schema. A transcription of name, URL, 30-minute cadence and region is explicitly operator-entered evidence, not an API export or an automatic conversion. Median load time, YSlow grade, waterfall, filmstrip and source history remain unconverted. [Uptime response time and full-page load time differ](https://documentation.solarwinds.com/en/success_center/pingdom/content/topics/difference-between-response-time-and-page-load-time.htm); an uptime threshold is not a Page Speed budget.

## Reading the reconciliation report

Expand **Field report** in the console and use **Download field report JSON** to save it. CLI `preview --json` includes the same `fieldReport`; ordinary terminal output includes field-disposition summaries in entry differences. For capture packages, the report contains:

- `counts.sourceChecks`: distinct uptime/TMS check identities, deduplicating list/detail representations.
- `counts.sourceRecords`: supplied resource rows, including unsupported resources; these are not all runnable checks.
- `counts.nativeEntries`: potential native plan entries, including refused/unsupported check details and expanded TLS entries. This is not a successful-create count.
- `counts.tlsCompanions`: generated companion entries, counted separately from original checks; `counts.leaves` counts supplied leaf paths.
- `fields`: each path, disposition and reason, with `sourceId` and `target` where available. Unknown fields and empty containers are included. `records` accounts for resource identities/paths/kinds; `containers` accounts for every nested object/array record; `captures` accounts for request descriptors. `schemaNotes` retains the public-schema defects.

The `summary` groups dispositions as `mapped`, `lossy` (changed semantics), `withheld` (local re-entry needed), `metadata` (source attribution only), `unsupported` and `refused`. Read the reason and target for review work. Source paths identify the saved record without displaying secret values. A field being present in the sanitized package or report does not mean it has an operative native mapping.

Review the report after apply/reconcile as well as before apply. Source up/down/unknown snapshots, lifecycle timestamps, result samples, outages and aggregates remain attributed source data; this definition import does not create observations, incidents or Healthy state from them. TMS scripts/recordings, Page Speed transcription, contacts, teams, integration relationships, maintenance and Pingdom history remain explicitly unsupported or not carried. The separate contact delay/repeat/recovery preview still requires explicit local destination mapping; it is not account extraction. AWS captures likewise do not establish a canary, code, schedule or alarm converter.

Request secrets, device authority and credential-bearing URLs must never appear in the report, download, logs, retained uploads or archives. Review local re-entry requirements instead of relying on source credentials to travel. Reports may name fields whose values were withheld.

## Synthetic evidence and remaining work

The checked-in corpus is generated offline with `node scripts/generate-incumbent-import-fixtures.mjs`. Its fixed seed is `ct-import-plan-uptime-1`, capture clock is `2026-11-01T00:00:00Z`, and manifests describe request metadata, file byte lengths and SHA-256 hashes. All identities, contacts, domains, IPs, account IDs and code artifacts are synthetic. Regeneration is evidence about saved-file behavior; it does not prove authentic provider extraction or a live account cutover.

| Capture set | Contents and accounting |
| --- | --- |
| Uptime checks | 65 source summaries in pages of 25/25/15: 25 HTTP, 10 TCP, 10 ping, 10 DNS and 10 SMTP. The 55 non-ping checks have separate native detail responses. Eight expiry settings can produce eight native TLS companions; those companions are not part of the 65 source count. The 55 details repeat existing source check identities; they are not 55 additional checks. Ping adapter conventions are labelled separately; documented ping summaries remain unsupported pending reviewed normalization. |
| Relationships | Two teams, five contacts spanning email/SMS/device and login/notify-only distinctions, two integration IDs different from contact IDs, one one-time and one recurring maintenance window, and explicit occurrences spanning November US DST. Native epochs carry no invented timezone. |
| History | A 60-day interval with three outages, 1,205 samples in 200-record pages, daily and overlapping aggregates, a 90-day report window spanning cutover, an unmapped ID and duplicate-page overlap. These are source fixtures, not imported native history or fresh observations. |
| Transactions | Two scripts and two recordings with separate lists/details: login, signup and sandbox checkout examples plus an unsupported-command case. Scripts are inert source data; conversion and browser execution remain separate work. |
| Page Speed | A labelled UI transcription with unconverted measurement/history requirements. No native API export is claimed. |
| AWS | Two synthetic canaries across two token pages and an empty terminal page, matching GetCanary responses, explicit account/region context, separate deterministic local source ZIPs, metric and composite alarms, and schedule/runtime/placement/visual variants. No AWS migration mapping is implied. |
| Negative inputs | Empty resources, malformed JSON/UTF-8/envelopes/types/numbers/dates, duplicate identity conflicts, missing details, paging defects, unknown/prototype keys, XSS text, credential URLs, deep/oversized inputs, expanded-companion limits and 501 monitors; separate hostile ZIP/code/target cases. Whole-file failures are kept outside the valid corpus. |

AWS's [CanaryCodeOutput](https://docs.aws.amazon.com/AmazonSynthetics/latest/APIReference/API_CanaryCodeOutput.html) provides handler/storage references, including `SourceLocationArn`; it does not return script bytes. S3 coordinates and base64 `ZipFile` belong to [CanaryCodeInput](https://docs.aws.amazon.com/AmazonSynthetics/latest/APIReference/API_CanaryCodeInput.html). A local ZIP is a separately supplied artifact, not a field manufactured inside GetCanary's `Code`. [DescribeCanaries](https://docs.aws.amazon.com/AmazonSynthetics/latest/APIReference/API_DescribeCanaries.html), [GetCanary](https://docs.aws.amazon.com/AmazonSynthetics/latest/APIReference/API_GetCanary.html) and [DescribeAlarms](https://docs.aws.amazon.com/AmazonCloudWatch/latest/APIReference/API_DescribeAlarms.html) are separate captures. Alarm action ARNs are inert source references, never local destinations or authorization to send. No source reference is fetched and no supplied code is executed during import.

Absent public-page or integration-detail captures mean the source count is unknown, not zero; they do not prove that an account has no such resources. Live extraction, complete relationship/history conversion, TMS and Page Speed conversion, managed geographic equivalence, invitations/channel reauthorization, Lamp handoff and side-by-side account cutover remain unfinished. Authentic extraction/cutover needs owner-authorized test-account evidence; authentic Page Speed export parsing needs an established export/schema. Synthetic capture coverage does not complete MIGRATE-002, MIGRATE-005 or HISTORY-001, and does not establish product publication or deployment.

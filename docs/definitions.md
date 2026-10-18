A definition file lists your monitors as reviewed text, so you can keep them in version control, review a change before it happens, and move monitors between installations. Uptime always shows you what a file would do before it changes anything, and it applies exactly what you saw.

## The file

The default name is `uptime.monitors.json`. New exports use version 4; versions 1–3 remain readable (a flow needs version 2 or later, TCP, DNS, TLS and domain need version 3, and UDP needs version 4). Supported public monitor types are HTTP(S), keyword, heartbeat, TCP, UDP, DNS, TLS and domain. UDP requires a private runner and uses `udp: {"host":"service.example.com","port":9000,"payloadHex":"50494e47","expectedHex":"504f4e47","match":"exact"}`; bytes are hexadecimal (`PING` and `PONG` here), never credentials. Its minimum interval is 30 seconds.

```json
{
  "format": "uptime.monitors",
  "version": 4,
  "monitors": [
    {
      "name": "Shop home",
      "type": "http",
      "url": "https://shop.example.com/",
      "method": "GET",
      "assertions": { "status": 200 },
      "intervalMs": 60000,
      "timeoutMs": 5000,
      "retries": 1,
      "probes": ["local-a"],
      "failureQuorum": 1,
      "confirmSlots": 2,
      "recoverSlots": 2,
      "freshnessMs": 180000
    },
    {
      "name": "Nightly backup",
      "type": "heartbeat",
      "heartbeat": { "maxAgeMs": 86400000 },
      "intervalMs": 3600000
    },
    {
      "name": "Shop certificate",
      "type": "tls",
      "tls": { "host": "shop.example.com", "port": 443, "warnDays": [30, 14, 7], "owner": "Web team" }
    },
    {
      "name": "Shop mail exchange",
      "type": "dns",
      "dns": { "name": "example.com", "recordType": "MX", "resolvers": ["cloudflare", "google"], "expect": { "values": ["10 mail.example.com"], "match": "exact" } }
    }
  ]
}
```

Each entry uses the same fields as the monitor editor, and the same validation checks them: `name`, `type` (`http`, `keyword`, `heartbeat`, `tcp`, `dns`, `tls` or `domain`), `url`, `method`, `assertions`, `intervalMs`, `timeoutMs`, `retries`, `probes`, `failureQuorum`, `confirmSlots`, `recoverSlots`, `freshnessMs`, `heartbeat` (`maxAgeMs`, at most one day), `tcp` (`host`, `port`, `readBanner`, `bannerIncludes`), `dns` (`name`, `recordType`, `resolvers`, `expect`, `approved`), `tls` (`host`, `port`, `warnDays`, `owner`), `domain` (`name`, `warnDays`, `owner`), `enabled` and `maintenanceUntil`. A TCP, DNS, TLS or domain monitor takes its address from these settings and no `url` or `method`; its only assertion is `latencyMs`. A header assertion takes only `name` and `equals`, and a JSON assertion only `path` and `equals`. Fields you leave out take the editor's defaults. Monitors are matched to your installation by name.

Public HTTPS HTTP and keyword entries may also contain `tlsTrust`: exactly `{"mode":"fingerprint","sha256":"…"}`, `{"mode":"ca","certificate":"…"}` or `{"mode":"ignore","acknowledged":true}`. Replace the ellipsis with a leaf SHA-256 fingerprint or one CA PEM certificate as appropriate. The fingerprint is 64 hex digits, optionally colon-separated; the CA PEM is limited to 16 KiB. Omitting the field restores normal certificate verification. These public trust settings are portable revision data and require a private runner. They never include a client private key or grant permission to send credentials through an exception. That separate owner grant, `allowUnverifiedTls`, belongs only in the monitor-bound local credential file. See [TLS trust and credential custody](/docs/runner#explicit-tls-trust-for-legacy-targets).

Some things never go in the file:

- **Secrets.** Request headers, bodies and passwords are refused. A check that needs them names an installation-local credential instead, with `"request": { "credentialRef": "partner-api" }`. The preview lists that entry as needing a local credential.
- **Installation authority.** Runner assignments, canary URLs, heartbeat tokens and notification destinations stay with the installation.
- **On and off.** `enabled` and `maintenanceUntil` are written when you export, so you can read them, but a file never changes them. New monitors always arrive paused, and an existing monitor keeps its current state.

A file may be at most 2 MiB and list at most 500 monitors, and it must be UTF-8 JSON. An unknown field, including one inside a header or JSON assertion, or a duplicate name refuses that entry, and the reason names it. An installation still holds at most 100 monitors.

## Preview, then apply

In the console, open **Definitions**, choose or paste a file and select **Preview**. A preview writes nothing. It shows the counts first, then one row per entry:

- **Create**: a new monitor, which arrives paused.
- **Unchanged**: it matches the monitor of the same name.
- **Change**: the fields that differ. Applying it saves a new immutable revision, like an edit in the editor, and keeps the monitor's enabled and maintenance state and its runner assignments. A heartbeat keeps its token, so your jobs keep calling the same URL. A change that turns a heartbeat into another type retires its token, and the preview says so.
- **Refused**: the entry is invalid; the reason says why.
- **Unsupported**: an imported entry Uptime cannot run.

The preview ends with a plan digest. **Apply** sends that digest back. If anything changed since the preview, such as a monitor edited in another tab, the apply is refused and nothing is written; preview again. Otherwise every create and change commits together, or none do. A file never enables a monitor, issues a heartbeat token, sends a notification or changes a destination.

A new revision's first check is due no sooner than the shorter of its old and new intervals after the monitor's previous check started, so an applied change never makes checks run closer together than either cadence.

For a newly created heartbeat, continue with [Incoming heartbeat](/docs/monitors#incoming-heartbeat): authorize its runner and resume it, issue a token for its active revision, then configure your job to send receipts. The HTTP editor is not the heartbeat editor; change heartbeat settings through Definitions.

## Undo

Each apply is recorded as a batch. **Undo this batch** pauses the monitors it created and restores the monitors it changed to their earlier settings, as a new revision. A restored heartbeat keeps its token. A monitor edited or enabled after the import is left alone, and the undo says so. Undo never removes checks, results or incidents. To remove a monitor completely, erase it from its page.

Batches travel in a private archive as history. In the installation that restores the archive they are marked as coming from an archive and cannot be undone there.

## Export

**Export current definitions** downloads your monitors as this file. Previewing that file against the same installation shows every entry as unchanged.

## From the command line

With `rer dev` and `rer preview` stopped, the same engine runs from a terminal:

```sh
node scripts/definitions.mjs preview --input uptime.monitors.json
node scripts/definitions.mjs apply --input uptime.monitors.json --digest PLAN_DIGEST
node scripts/definitions.mjs export --output uptime.monitors.json
node scripts/definitions.mjs batches
node scripts/definitions.mjs undo --batch BATCH_ID
```

`validate` is `preview` that exits with status 1 when any entry is refused or unsupported, which suits a review check. Add `--json` for machine output. Changes from the command line are recorded as made by the local command.

Moving from UptimeRobot uses the same preview and apply. See [Moving from UptimeRobot](/docs/moving-from-uptimerobot).

## Saved incumbent HTTP definitions

The same bounded preview/apply/undo engine also accepts the saved source formats below. File size remains 2 MiB and at most 500 entries; the installation's 100-monitor limit still applies. New entries stay paused, and importing never authorizes credentials, enables traffic, sends alerts or rewrites current monitoring evidence.

### UptimeRobot certificate settings

For supported saved UptimeRobot v3 monitor pages, an HTTPS monitor with `checkSSLErrors: false` maps to `tlsTrust: {"mode":"ignore","acknowledged":true}`. The preview names the source exception, its restriction to the initial HTTPS origin and the private-runner requirement. It grants no local credential authority. Authentication, request headers and body still need the previewed local credential reference to be filled by the receiving owner. A changed or copied monitor ID cannot inherit another monitor's credential file.

### Pingdom HTTP check details

Supply saved `GET /api/3.1/checks/{id}` response objects, each containing a `check` object. One object, an array of response objects or several complete JSON responses written in sequence are accepted. The source is detected automatically; API callers may select `source: "pingdom"`, and CLI preview/apply accept `--source pingdom`. Summary-list responses are refused because they lack complete HTTP settings. Uptime does not fetch the Pingdom account or its pages for you.

The mapped check needs `name`, `hostname`, an integer `resolution` from 1 to 1,440 minutes, and HTTP detail at `check.type.http`. The HTTP detail must explicitly contain boolean `encryption` and `verify_certificate`; trust is never guessed. Optional `port` must be 1–65,535, and `url` is a path beginning with `/`, not `//` or a separate origin. Missing paths use `/` and missing ports use the selected protocol's default.

| Source setting | Reviewed Uptime definition |
| --- | --- |
| `encryption`, `hostname`, `port`, `url` | Public HTTP or HTTPS URL. Unsafe targets still fail the editor's destination validation. |
| `resolution` | Interval in minutes converted to milliseconds. |
| `shouldcontain`, `shouldnotcontain` | Required/forbidden literal body text; either makes a keyword monitor. `useRegularExpression` is unsupported and is not silently converted to literal text. |
| `verify_certificate: false` on HTTPS | Labelled initial-origin `ignore` trust policy, requiring a private runner and a separate local credential grant when credentials are used. On plain HTTP the preview explains that no TLS connection exists to exempt. |
| `username`, `password`, nonempty `requestheaders` or `postdata` | A `pingdom-<source ID>` local credential reference; values are not imported. Re-enter them privately on the runner. `postdata` selects POST; otherwise the mapped method is GET. |
| `sendnotificationwhendown` | Scheduled confirmation-slot count, subject to Uptime's normal validation. It defaults to two when absent. |

Mapped definitions accept HTTP 2xx/3xx responses, use a ten-second timeout, no in-slot retries, two recovery slots and one initial `local-a` probe. Review these settings and independent-vantage/canary coverage before activation. A source certificate-expiry downtime setting is named separately in the preview; add a reviewed TLS certificate monitor. Source response-time thresholds are named as not imported; choose an explicit latency failure or supported slow-response policy before enabling.

This is a saved HTTP-definition conversion, not complete Pingdom or UptimeRobot migration. Probe regions, contacts, teams, maintenance, scheduled reports and history are not transferred by the Pingdom adapter. Other Pingdom protocol checks and transaction/page-speed checks need reviewed conversion. Live extraction, account reconciliation, historical reports, provider reauthorization and side-by-side cutover remain broader migration work; the import does not establish that those journeys have been completed.

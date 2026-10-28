A definition file lists your monitors as reviewed text, so you can keep them in version control, review a change before it happens, and move monitors between installations. Uptime always shows you what a file would do before it changes anything, and it applies exactly what you saw.

## The file

The default name is `uptime.monitors.json`. New exports use version 8; versions 1–7 remain readable (a flow needs version 2 or later, TCP, DNS, TLS and domain need version 3, UDP needs version 4, private network scope and local grant references need version 5, ICMP ping needs version 6, a followed service's catalog part, `catalog`, needs version 7, and a page-speed monitor, `pagespeed`, needs version 8). Supported public monitor types are HTTP(S), keyword, heartbeat, TCP, UDP, ICMP ping, DNS, TLS and domain. UDP requires a private runner and uses `udp: {"host":"service.example.com","port":9000,"payloadHex":"50494e47","expectedHex":"504f4e47","match":"exact"}`; bytes are hexadecimal (`PING` and `PONG` here), never credentials. Its minimum interval is 30 seconds.

```json
{
  "format": "uptime.monitors",
  "version": 5,
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

Each entry uses the same fields as the monitor editor, and the same validation checks them: `name`, `type` (`http`, `keyword`, `heartbeat`, `tcp`, `udp`, `dns`, `tls` or `domain`), `url`, `method`, `assertions`, `intervalMs`, `timeoutMs`, `retries`, `probes`, `failureQuorum`, `confirmSlots`, `recoverSlots`, `freshnessMs`, `heartbeat` (`maxAgeMs`, at most one day), `tcp` (`host`, `port`, `readBanner`, `bannerIncludes`), `dns` (`name`, `recordType`, `resolvers`, `expect`, `approved`), `tls` (`host`, `port`, `warnDays`, `owner`), `domain` (`name`, `warnDays`, `owner`), `enabled` and `maintenanceUntil`. A TCP, DNS, TLS or domain monitor takes its address from these settings and no `url` or `method`; its only assertion is `latencyMs`. A header assertion takes only `name` and `equals`, and a JSON assertion only `path` and `equals`. Fields you leave out take the editor's defaults. Monitors are matched to your installation by name.

Private HTTP/keyword, TCP and browser-flow entries use `"network":"private"` and a non-secret `"privateGrantRef":"warehouse-local"`. The reference grants no access by itself: assign an enrolled private-capable Node runner and provision its protected monitor-bound local grant before resuming the paused import. Browser entries also carry their reviewed `flow` steps and outcomes. Grant files, runner identity and credentials never travel in the definition. See [Private network grants](/docs/runner#private-network-grants).

Public HTTPS HTTP and keyword entries may also contain `tlsTrust`: exactly `{"mode":"fingerprint","sha256":"…"}`, `{"mode":"ca","certificate":"…"}` or `{"mode":"ignore","acknowledged":true}`. Replace the ellipsis with a leaf SHA-256 fingerprint or one CA PEM certificate as appropriate. The fingerprint is 64 hex digits, optionally colon-separated; the CA PEM is limited to 16 KiB. Omitting the field restores normal certificate verification. These public trust settings are portable revision data and require a private runner. They never include a client private key or grant permission to send credentials through an exception. That separate owner grant, `allowUnverifiedTls`, belongs only in the monitor-bound local credential file. See [TLS trust and credential custody](/docs/runner#explicit-tls-trust-for-legacy-targets).

Some things never go in the file:

- **Secrets.** Request headers, bodies and passwords are refused. A check that needs them names an installation-local credential instead, with `"request": { "credentialRef": "partner-api" }`. The preview lists that entry as needing a local credential.
- **Installation authority.** Runner assignments, canary URLs, heartbeat tokens and notification destinations stay with the installation.
- **On and off.** `enabled` and `maintenanceUntil` are written when you export, so you can read them, but a file never changes them. New monitors always arrive paused, and an existing monitor keeps its current state.

A file may be at most 2 MiB and list at most 500 monitors, and its evaluated form must be UTF-8 JSON. The CLI also accepts a trusted local TypeScript module as described below; the Worker receives only its evaluated definition file. An unknown field, including one inside a header or JSON assertion, or a duplicate name refuses that entry, and the reason names it. An installation still holds at most 100 monitors.

## Preview, then apply

In the console, open **Definitions**, choose or paste a file and select **Preview**. Every import runs through Uptime's one import pipeline, the owner's import door, the same one Business uses: the server recognises the file and withholds its request secrets, that text uploads, the server plans it, and the preview shows that plan. A preview writes no monitor, check or evidence. The door keeps the uploaded file and its plan in this installation until they are applied, cancelled, replaced by a newer preview of the same source (any definition file counts as one source) or erased; a preview with nothing to apply is cancelled as soon as it is shown, so the door keeps nothing of it. An upload that still carries a request secret is refused and discarded. It shows the counts first, then one row per entry:

- **Create**: a new monitor, which arrives paused.
- **Unchanged**: it matches the monitor of the same name (or, for an earlier import of the same source record, the monitor that import created).
- **Change**: the fields that differ. Applying it saves a new immutable revision, like an edit in the editor, and keeps the monitor's enabled and maintenance state and its runner assignments. A heartbeat keeps its token, so your jobs keep calling the same URL. A change that turns a heartbeat into another type retires its token, and the preview says so.
- **Refused**: the entry is invalid; the reason says why. An import never stores anything that reads as a credential: a URL with a user name or password, or a query parameter whose name names a credential by its whole parts, such as `?api_key=`, `?access_token=` or `?sig=` (a name that only contains such a word, such as `?keyword=` or `?author=`, imports). Such an entry is refused on its own, with that reason, and the rest of the file previews and applies; add or change that monitor in the editor.
- **Unsupported**: an imported entry Uptime cannot run.

The preview ends with a plan digest, the plan's fingerprint. **Apply** sends that fingerprint back and applies exactly that plan in bounded batches. Each monitor it writes is guarded: if that monitor was edited since the preview, or another monitor took its name, the apply stops as **Apply failed** and the failing batch writes nothing; preview again. A file never enables a monitor, issues a heartbeat token, sends a notification or changes a destination. A monitor that an earlier import created and its undo or an erasure released stays in Uptime as its own monitor: a later preview explains it ("Imported before and released by undo or erasure") instead of changing it.

A new revision's first check is due no sooner than the shorter of its old and new intervals after the monitor's previous check started, so an applied change never makes checks run closer together than either cadence.

For a newly created heartbeat, continue with [Incoming heartbeat](/docs/monitors#incoming-heartbeat): authorize its runner and resume it, issue a token for its active revision, then configure your job to send receipts. The HTTP editor is not the heartbeat editor; change heartbeat settings through Definitions.

## Undo

Each apply is recorded as a batch, "Approved by" the owner with its time and fingerprint, in the same list as Business imports. **Undo this batch** releases the monitors it created, which stay paused with their history, and restores the monitors it changed to their earlier settings, as a new revision. A restored heartbeat keeps its token. A monitor edited or enabled after the import is left alone, and the batch says so ("Edited since; left as is" or "Enabled since; left running"); undo never overrides an edit. The batch reads as undone, with its time. Batches applied before the import door keep their earlier undo, which works the same way. Undo never removes checks, results or incidents. To remove a monitor completely, erase it from its page.

Batches travel in a private archive as history, the import door's included: each with its approval time, the owner who approved it, its source, fingerprint, counts and undo time, and per monitor the revision it wrote, as recorded when the apply wrote it (an undo adds revisions of its own between imports). The door's uploads, plans and grants stay in this installation. In the installation that restores the archive the batches are marked as coming from an archive and cannot be undone there.

## Export

**Export current definitions** downloads your monitors as this file. Previewing that file against the same installation shows every entry as unchanged.

## From the command line

With `rer dev` and `rer preview` stopped, the same planner and import door run from a terminal:

Set `UPTIME_ACCESS_COOKIE` to your current installation session in the command's environment. Local commands check the live product permission; imports also require a second factor verified within five minutes. Holding the local files alone does not authorize an import.

```sh
node scripts/definitions.mjs preview --input uptime.monitors.json
node scripts/definitions.mjs apply --input uptime.monitors.json --digest PLAN_DIGEST
node scripts/definitions.mjs export --output uptime.monitors.json
node scripts/definitions.mjs batches
node scripts/definitions.mjs undo --batch BATCH_ID
```

`validate` is `preview` that exits with status 1 when any entry is refused or unsupported, which suits a review check; both write nothing. `preview` plans the file as the import door does, a catch-up of an earlier import of the same source included, with request secrets withheld. `apply` uploads the file with those secrets withheld, plans it through the import door as the installation's owner, refuses (and cancels that plan) unless it reads exactly as the preview whose digest you give, then applies and reconciles it. Add `--json` for machine output. Command-line imports appear in the same history, approved by the owner; `undo` takes any batch ID that `batches` lists.

Moving from UptimeRobot uses the same preview and apply. See [Moving from UptimeRobot](/docs/moving-from-uptimerobot).

## Saved incumbent HTTP definitions

The same bounded preview/apply/undo engine also accepts the saved source formats below. File size remains 2 MiB and at most 500 entries; the installation's 100-monitor limit still applies. New entries stay paused, and importing never authorizes credentials, enables traffic, sends alerts or rewrites current monitoring evidence.

### Third-party service monitors

A third-party service monitor in a saved incumbent file maps onto its [service catalog](/docs/monitors#following-a-third-party-provider) entry and applies as a paused followed service. Its status source has not been checked live yet, so its monitor page asks you to check it before you enable it. One monitor follows each catalog part; an entry for a part this installation already follows is refused.

- **UptimeRobot** has no third-party monitor type. A saved v3 HTTP or keyword monitor of a provider's status address in the catalog maps onto that entry; any other status address stays an ordinary proposal.
- **Better Stack** monitor pages map the same way. A status page's third-party service row (`resource_type` `ThirdPartyService`) is refused: [Better Stack's public API](https://betterstack.com/docs/uptime/api/get-a-single-status-page-resource/) names no vendor, region or service for it. Follow that provider from the catalog instead.
- **Site24x7** monitor lists map a Website monitor of a provider's status address. StatusIQ third-party components a status page subscribes to map by their [published service id](https://www.site24x7.com/help/statusiq/api/) and the component's name, such as Stripe API or Amazon Elastic Compute Cloud (Ohio). A component the catalog follows by the provider's own component id, a provider the catalog lacks, an AWS Health monitor and an Office 365 monitor are refused with the reason. Other Site24x7 monitors are not converted.

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

### ICMP definitions

Use version 6 and `type: "ping"` with `ping: {"host":"gateway.example.com","family":4,"packets":3,"maxLossPercent":0,"maxRttMs":1000}`. Select family 6 for IPv6. Ping requires an assigned private Linux/macOS runner with system ping permission. Definitions carry settings and immutable evidence, never executable paths or host privileges. Imports stay paused; the receiving installation must assign and authorize its own runner. The interval floor is 30 seconds and the timeout must be 8–10 seconds.

## API transactions

Choose **Multi-step API transaction** in the owner editor, set the exact HTTPS origin and select a private runner. The shared credential reference names an owner-only file bound to that monitor and origin (see [runner credentials](/docs/runner)). Credentials and extracted values stay on the runner. Do not put passwords or tokens in the configuration. Transactions run every minute or slower, with no automatic replay of writes and a total time limit of 60 seconds.

The steps JSON has `variables` for non-secret fixed inputs and ordered `steps`. Each step names its `phase` (`setup`, `request`, `cleanup`), full same-origin URL, method, assertions and optional `extract` mapping from a variable name to JSONPath. Use `{{variable}}` in later paths, headers or JSON bodies. URL values are encoded and JSON values escaped. Authentication headers require HTTPS and a runtime variable. The runner reserves time for cleanup after a failure; history records each step, timing, skipped requirements and cleanup outcome without response content or extracted values. A later successful cleanup cannot clear a failed requirement.

```json
{"variables":{},"steps":[
  {"name":"Log in","phase":"setup","url":"https://sandbox.example.com/login","method":"POST","assertions":{"status":200},"extract":{"token":"$.token"}},
  {"name":"Create record","phase":"request","url":"https://sandbox.example.com/records","method":"POST","headers":{"authorization":"Bearer {{token}}"},"assertions":{"status":201},"extract":{"id":"$.id"}},
  {"name":"Read record","phase":"request","url":"https://sandbox.example.com/records/{{id}}","method":"GET","headers":{"authorization":"Bearer {{token}}"},"assertions":{"status":200,"json":{"path":"$.ready","equals":true}}},
  {"name":"Remove synthetic record","phase":"cleanup","url":"https://sandbox.example.com/records/{{id}}","method":"DELETE","headers":{"authorization":"Bearer {{token}}"},"assertions":{"status":204}}
]}
```

Use a dedicated synthetic account and sandbox resource. Setup and cleanup steps make up to 3 attempts each; cleanup runs after a failure and after a cancellation. A cleanup that cannot finish stays visible in the attempt history and becomes cleanup debt on the monitor page: clean up by hand, then resolve it with a short note. At 3 open debts the monitor stops running setup and reads Unknown until you resolve one. A step marked `"effect"` (`live-payment`, `refund` or `destructive-write`), a refund path, a Stripe live-mode key or a `livemode: true` response needs an exact grant for that monitor and effect (`POST /api/monitors/<id>/effect-grants` with `effect`, an integer `spendLimit` and an `expiresAt` within 24 hours); without one the step is refused and nothing is sent. Each live request takes its amount from the grant before it is sent, so one spend limit covers every location and attempt of the monitor, and revoking a grant stops runs already under way. Stripe test mode needs no grant.

## Mail protocols

Choose **SMTP or mailbox protocol** in the owner editor and select a private runner. Set `protocol` to `smtp`, `pop3` or `imap`, `host`, an optional `port`, and `security` to `none`, `starttls` or `tls`. SMTP defaults to STARTTLS on 587; POP3 and IMAP default to implicit TLS on 995 and 993. Plain connections check only the connection and greeting; authentication requires verified TLS. Each `credentialRef` names a protected runner-local file containing Basic username/password authority bound to the exact monitor and origin `https://HOST:PORT`. Never put a password in monitor settings. The runner uses its normal trusted CA store, including an explicitly installed `NODE_EXTRA_CA_CERTS` file for a private CA.

```json
{"protocol":"smtp","host":"smtp.example.com","security":"starttls","credentialRef":"synthetic-sender","transaction":{"dedicatedMailbox":true,"from":"synthetic@example.com","to":"synthetic-inbox@example.com","receive":{"protocol":"imap","host":"imap.example.com","security":"tls","credentialRef":"synthetic-inbox","mailbox":"INBOX"},"receiptTimeoutMs":10000,"pollIntervalMs":500}}
```

Synthetic send/receive is optional and requires a dedicated test mailbox. An SMTP accept is recorded separately from receipt of the exact random Message-ID. POP3 removes only that message and commits deletion with QUIT; IMAP requires UIDPLUS and expunges only the matching UID. Unrelated messages remain untouched. The console retains Message-ID, per-step timing and distinct receipt/cleanup outcomes without mailbox content or passwords. A late message beyond the receipt deadline is not silently removed: inspect the dedicated mailbox using the recorded Message-ID when cleanup is unconfirmed. Checks have a total 60-second limit and no automatic write replay; SMTP/POP3/IMAP require a private runner.

### Playwright source imports

Use the [supported Playwright import](/docs/browser-flows#import-a-supported-playwright-suite) to translate a suite into an ordinary monitor file before preview/apply. `import-playwright` is offline and writes a new file only; it requires `--input`, `--fixtures`, `--lock` and `--output`, with optional `--base` for API definitions. Unsupported source is refused by file and line, never executed. Source, JSON fixtures and npm v3 lock bytes remain in immutable flow revisions and definition exports under the ordinary revision digest; selected secret values remain runner-local. This is a constrained translation door; arbitrary script execution and the full FLOW-002 acceptance remain partial.


## TypeScript definitions and CI

Keep a typed definition module in the checkout when your monitors share settings or derive names and URLs from reviewed configuration. The module runs on the buyer's machine before the CLI sends the resulting native definition file to Uptime. The Worker never executes the module. Only run source you trust with the authority of the local user.

The same planner validates the evaluated definition file, and the review digest binds that file and the installation revisions it would change. A changed evaluated definition or live revision requires a new preview. The digest does not attest to every imported TypeScript dependency: review that source in version control too.

New monitors still arrive paused. A definition never supplies request secrets, runner authority or notification credentials, and applying one never enables traffic. Alert-route and maintenance TypeScript deployment and Checkly suite migration remain outside this bounded monitor-definition slice.


For a module at the checkout root:

```ts
import type { NativeDefinitions } from './src/domain/definitions/types.ts';

const environment = 'staging';
export default {
  format: 'uptime.monitors',
  version: 8,
  monitors: [{
    name: 'Staging API',
    type: 'http',
    url: 'https://example.com/health',
    environment,
    tags: ['ci-team'],
    assertions: { status: 200 },
  }],
} satisfies NativeDefinitions;
```

Use the TypeScript file as `--input` for the same preview and apply commands. The loader accepts `.ts` and `.mts` with Node 22.20's supported type stripping and relative imports. Run your TypeScript compiler separately to check the declared types; runtime validation still checks every evaluated entry. Module output and thrown source values are withheld from CLI errors.

### CI credentials

The Base owner creates a credential through `POST /api/credentials` after a second-factor check within five minutes. Give it an expiry, one environment and a tag selection. For example, the request shape is:

```json
{
  "name": "Staging definitions",
  "scopes": ["definitions:preview", "definitions:apply"],
  "expiresAt": 1792800000000,
  "environment": "staging",
  "resources": { "mode": "selection", "monitorIds": [], "tags": ["ci-team"] }
}
```

Choose an expiry in the future when creating your own credential. Creation shows the token once. Store it in the CI secret named `UPTIME_CI_TOKEN`; never commit it or put it in a command argument. Set `UPTIME_ORIGIN` to the installation origin and select the environment on each command:

```sh
node scripts/definitions.mjs preview --origin "$UPTIME_ORIGIN" --environment staging --input uptime.monitors.ts --json
node scripts/definitions.mjs test --origin "$UPTIME_ORIGIN" --environment staging --input uptime.monitors.ts --json
node scripts/definitions.mjs apply --origin "$UPTIME_ORIGIN" --environment staging --input uptime.monitors.ts --digest REVIEWED_DIGEST --json
```

`test` performs the shared definition validation and planning checks and refuses invalid or unsupported entries. It does not run a network check or browser journey. CI authority covers only native monitor definitions in the saved environment and tag selection. Both a changed monitor's current definition and its proposed definition must remain in scope. Mail checks, private or synthetic network grants, local credential references and cross-monitor dependencies need separate authority and are refused by this CI slice. The credential cannot read secrets, export definitions, change roles or undo an applied batch. Revocation, expiry and changes to the issuing owner's authority block the next operation. Preview-only credentials cannot apply.

An owner can still export and undo through the ordinary session-authorized commands. A changed live revision or evaluated file refuses a previously reviewed apply. The supplied CI workflow exercises preview, definition validation and apply with the same credential and explicit environment; GitHub execution against a live installation remains the buyer's deployment step.

## Revoked CI jobs

Settings shows each CI key's definition jobs: initiating owner, authorized checkpoint, the next operation and an explicit revoked stop state. An authorized batch remains stored when the token is revoked; the next batch is refused. The same durable projection is available with `node scripts/api-keys.mjs jobs --origin ORIGIN --id CREDENTIAL_ID`, using the owner's `UPTIME_ACCESS_COOKIE`. Restart does not change it. The underlying engine checkpoint is retained as history; a new key cannot adopt another key's import namespace.

## UptimeRobot source history (API and CLI)

History uses separate source tables. It never creates or changes a scheduled slot, observation, native incident, notification, follow-up or current health. The console move-in preview and report charts do not yet expose this import.

An owner session may `POST /api/definitions/history/preview` with `{"text":"<saved file>"}`. The read-only response gives a `reviewDigest`, file digest, source monitor mapping, named unmapped rows, per-monitor date range, row/outage counts, exact timestamp downtime and separately stated source durations. Apply with `POST /api/definitions/history/apply`, the same `text`, optional context and `digest` set to that reviewed value. Changed bytes, target revisions, mapping or existing history refuse with 409. Conflicting existing source row content refuses; identical rows add zero records. Unmapped rows are named and skipped. The response names the new batch and receipt counts.

Files are UTF-8, at most 2 MiB and 5,000 source rows per import; exceeding either bound refuses, without truncation. Content is parsed as data and never executed. Timestamps need ISO 8601 with `Z` or an explicit offset; JSON timestamp numbers mean epoch milliseconds. Ambiguous local times and invalid calendar dates refuse with the row and column.

UptimeRobot does not publish a fixed CSV header. Accepted column vocabulary (case-insensitive) is:

- **Source monitor ID:** `Monitor ID`, `monitor_id`, `monitorId`.
- **Display name:** `Monitor`, `Monitor Name`, `friendlyName`, `Friendly Name`.
- **Event:** `Event`, `Status`, `Type`: `Down`/`Up` or `1`/`2`.
- **Timestamp:** `Date-Time`, `Date Time`, `DateTime`, `Date`, `Time`, `Timestamp`.
- **Explicit end:** `Resolved At`, `resolved_at`, `resolvedAt`, `End Time`, `Ended At`.
- **Source row ID:** `ID`, `Log ID`, `Incident ID`, `Source Row ID`.
- **Source duration:** `Duration`, `Duration Seconds`: seconds or `HH:MM:SS`.
- **Source text:** `Reason`, `Root Cause`, `Author`, `Source Author`, `Comment`, `Comments`.
- **Capture metadata:** `Exported At`, `Extracted At`, `Period Start`, `Coverage From`, `Period End`, `Coverage To`.

Unknown or repeated headers refuse by name. Source identities are bounded to 256 characters and each retained source-text field (including a combined comment thread) to 20,000 characters; longer values refuse by row rather than being truncated. Down/Up pairs use their exact timestamps; a stated duration never invents an end time. An unresolved final Down retains a null end. Without row IDs, a digest of the source row provides identity. Mapping uses the migrated source ID, never a display-name guess. For a per-monitor CSV without an ID column, provide `sourceMonitorId` in the request. `extractedAt`, `coverageFrom` and `coverageTo` may supply explicit capture context; export/extraction time is required for apply, and coverage bounds must be supplied together. They must agree with file columns. Without a declared range, only the interval between that monitor's earliest and latest source timestamps is covered. A missing export/extraction time is named in the preview and refuses apply until supplied; import receipt time is stored separately.

Saved v3 `/incidents` pages use `data` rows with `id`, `monitor.id`, `startedAt` and `resolvedAt`. Save all relevant pages, as an array or sequential JSON values. A detail response has no monitor field: wrap it as `{"monitorId":"SOURCE_ID","extractedAt":"ISO_TIME","coverageFrom":"ISO_TIME","coverageTo":"ISO_TIME","incidents":[DETAIL]}`. The same wrapper may hold `incidents` pages, per-incident `comments` pages keyed by incident ID, and `responseTimes` with the published `/monitors/{id}/response-time-stats` `time_series` (`timestamp`, millisecond `value`). Source comments retain `comment`, `user.fullName` and `created` as source text/time, never workspace membership. Source root-cause text, diagnostics and non-secret URLs/headers are retained; credential fields and credential-bearing URL values use the existing import withholding policy. `includeInReports: false` remains visible and its time is excluded from the source denominator.

```sh
node scripts/definitions.mjs preview --input history.csv --source uptimerobot-log --json
node scripts/definitions.mjs apply --input history.csv --source uptimerobot-log --digest REVIEW_DIGEST --json
node scripts/definitions.mjs preview --input per-monitor.csv --source-monitor SOURCE_ID --extracted-at ISO_TIME --from ISO_TIME --to ISO_TIME --json
node scripts/definitions.mjs history-batches --json
node scripts/definitions.mjs history-remove --batch BATCH_ID --json
node scripts/definitions.mjs history-cutover --monitor UPTIME_ID --at ISO_TIME --json
```

Add `--origin ORIGIN` with `UPTIME_SESSION_COOKIE` for a remote owner session. Local commands retain the existing `UPTIME_ACCESS_COOKIE` authority. History refuses CI credentials. Repeat capture context on apply, including `--source-monitor` for a two-column per-monitor log. The reviewed digest binds this context as well as the file and mapping. `GET /api/definitions/history/batches` lists provenance; `DELETE /api/definitions/history/batches/{id}` removes only that batch's source rows and headers, returning per-table counts. `POST /api/definitions/history/cutover/{uptimeMonitorId}` takes `cutoverAt`; it must be within source coverage overlapping scheduled Uptime time. Default cutover is the first nonmanual scheduled slot. Source history travels in workspace archives and restores as inactive history with batch IDs/digests intact; monitor erasure removes all three source tables with per-table receipt counts.

These are synthetic-fixture-tested saved-file doors. Real exports, an authorized live account and hosted import remain unmeasured. Pingdom, Better Stack, Site24x7 and challenger history remain unavailable.

A monitor describes what to check, how often, and what counts as success. Uptime runs the check on schedule, keeps the result as evidence, and only raises an incident when a failure is confirmed. This page explains the monitor kinds and how a series of checks becomes a state you can trust.

## Supported monitor kinds

### HTTP(S)

An HTTP(S) monitor requests a URL and tests the response against rules you set. You can assert on:

- an expected status code, set or range,
- required or forbidden body text and a safe regular expression,
- a response header,
- a value in a JSON response, and
- latency.

A monitor that sets no status rule expects 200. **Expected HTTP status** accepts `200`, `200, 201`, `2xx`, or `200-299`. In definition files, `status` is a number or an array such as `[200, 201, "3xx"]`. A response must satisfy every configured assertion, even when its status is accepted.

Use **Body must not contain** for error text such as `temporarily unavailable`. **Body regular expression** supports bounded RE2 expressions and optional `i`, `m` and `s` flags. Backreferences and lookaround are refused. Saved definitions use `bodyExcludes` and `bodyRegex: {"pattern":"ready", "flags":"i"}`. Body and header values are never retained as raw response content.

### JSON values and latency

In the HTTP form's **Additional checks (JSON)** field, enter:

```json
{"json":{"path":"$.status.indicator","equals":"none"},"latencyMs":1500}
```

This requires the response's `status.indicator` value to equal `"none"` and its response time to be at most 1,500 ms. Both `$.status.indicator` and `status.indicator` are accepted. `json` is a single object with `path` and `equals`, not an array; either the JSON check or `latencyMs` may be omitted. JSONPath also selects nested arrays, for example `$.items[0].ready`, wildcard children and filtered selections. Every selected value must equal the scalar; no selection fails. Unsupported path features are refused on save. Keep the expected HTTP status, body and header checks in their separate fields.

### Keyword

A keyword monitor is an HTTP(S) check that requires specific text to be present or absent in the response body. Use it when a page can return 200 while the content is wrong.

### TCP port

A TCP monitor opens a connection to a host and port, for example a database, a mail server or an SSH service. It records the connection time and, if you choose, the first line the service sends (its banner, at most 256 characters), which can be required to contain some text. A refused connection, a connection that times out and a check that could not run (the runner's own DNS failed, or this vantage cannot reach the address) are separate outcomes; only the first two count against the target.

### DNS record

A DNS monitor asks public resolvers (Cloudflare and Google, over HTTPS), and if you choose the zone's own authoritative name server (asked directly over TCP), for an A, AAAA, CNAME, MX, TXT, NS, SOA, SRV or CAA record. Without expected values it needs at least one record; with them, the answer must match exactly or include them, or it may require that the record does not exist. A missing name (NXDOMAIN), a resolver failure (SERVFAIL), resolvers that disagree, and a resolver that could not be reached at all are reported separately; the last is a fault in the monitoring path and stays Unknown. Before a planned change, add the new values as an **approved change**: they pass as well, while a missing name or a failing resolver still fails. SOA compares the primary name server and the responsible mailbox, not the serial.

### TLS certificate

A TLS monitor connects to a host (port 443 unless you set another) and checks that the certificate chain is trusted, covers the host name and is within its validity dates. It warns before expiry at stages you choose (30, 14 and 7 days by default), once per certificate and stage, naming the certificate and its accountable owner. A warning stays open until a renewed certificate, valid beyond every stage, is observed; then one renewal notice closes it. Expiry checks run at least hourly.

### Domain registration expiry

A domain monitor reads the registration's expiry date from the registry's RDAP service (found through IANA's bootstrap) and from the registrar's RDAP record the registry links. It keeps each source and when that source last updated. It warns before expiry (60, 30, 14 and 7 days by default) and follows each warning until a renewed expiry date is observed. A redacted or missing date, registry data that could not be read, or a registry and registrar that disagree by more than a day are Unknown, never healthy. Certificate renewal is not domain renewal.

### Where each check runs

The Cloudflare Worker runs HTTP(S), keyword, TCP, TLS, DNS and domain checks at an interval of at least one minute. A Worker cannot open sockets to Cloudflare's own addresses, so a TCP or TLS check of a site hosted on Cloudflare, or an authoritative DNS query to a Cloudflare name server, is Unknown there and says so; a private runner can check it. The Worker reads a certificate from a TLS 1.2 handshake, so a server that accepts only TLS 1.3 is also Unknown at the Worker. A private runner runs every type. ICMP ping is not offered.

### Incoming heartbeat

A heartbeat monitor waits for your own job to call Uptime. It suits cron jobs, backups and workers that should check in on a schedule. Creation and configuration use **Definitions**; the New monitor HTTP form does not create heartbeats.

1. Open **Definitions**, paste a file like the one below, choose **Preview**, review it, then **Apply**. The heartbeat arrives paused. `maxAgeMs` is how old the last receipt may be; `intervalMs` is how often the runner evaluates it. Maximum age is at most one day.
2. Keep the [private runner](/docs/runner) running. Dev starts one automatically; a hosted installation needs its separately supervised runner. From the deployment checkout, set `UPTIME_CONTROL_ORIGIN` to its exact hosted HTTPS origin and run `node scripts/runner-start.mjs --environment production` (replace `production` with your environment). Open the new monitor and choose **Authorize & resume** to use its assigned runner. Imported definitions select installation-local runners; runner authority and heartbeat keys never come from the file.
3. After resuming, choose **Issue heartbeat key** on the monitor's page. Review **Issue a new heartbeat key?** and choose **Issue key**. The **Heartbeat key** dialog shows the endpoint and a curl command with the new key once. Save the key in your job's secret settings before closing the dialog. Issuing another key creates a new revision, retires the old token and resets its receipt and sequence.
4. From your job, send exactly `{}` as JSON to the receipt path on your Uptime origin, with `Authorization: Bearer <token>` and an `X-Heartbeat-Sequence` header. Start at 1 and persist a strictly increasing positive integer across job restarts; do not restart at 1 on each run.

```json
{
  "format": "uptime.monitors",
  "version": 2,
  "monitors": [{
    "name": "Backup job",
    "type": "heartbeat",
    "heartbeat": { "maxAgeMs": 300000 },
    "intervalMs": 60000,
    "probes": ["local-a"]
  }]
}
```

Use the endpoint from the dialog for `HEARTBEAT_RECEIPT_URL` and its key for `HEARTBEAT_TOKEN`, both in your job's private settings. Keep the key out of URLs, definition files, screenshots and logs; the command shown in the dialog is also private. Only an owner can issue a key. With those job settings loaded, and `HEARTBEAT_SEQUENCE` set to the next persisted number (starting at 1):

```sh
curl --fail --silent --show-error -X POST "$HEARTBEAT_RECEIPT_URL" \
  -H "Authorization: Bearer $HEARTBEAT_TOKEN" \
  -H "X-Heartbeat-Sequence: $HEARTBEAT_SEQUENCE" \
  -H "Content-Type: application/json" \
  -d '{}'
```

A successful call returns `received: true` and the server's receipt time. It records receipt only. The assigned runner must claim and complete a scheduled check using the receipt snapshot taken at claim time. A call received after that claim is considered on a later check. Wait for a completed scheduled result, with fresh receipt evidence for every selected probe and the recovery threshold met, before expecting Healthy. Fresh runner contact and HTTP 200 from receipt ingestion alone do not establish heartbeat health.

Each monitor accepts up to 60 calls per one-minute window. A window starts with the first call after the previous window has ended and lasts 60 seconds; further calls in a full window get HTTP 429. Replayed sequences and paused or foreign-revision tokens are refused. Ordinary saves, including pause/resume and maintenance changes, retire the token: issue a replacement after the final change and update your job. Applying a Definitions change that keeps the heartbeat type preserves its token and sequence. Restored archives have no heartbeat authority; resume, issue a new key and repoint the job.

## Schedules and thresholds

Each monitor has a schedule and a few knobs that decide when a bad check becomes an incident.

- **Interval** is how often the check is due. A slot is one due check. A check never starts sooner than one interval after the monitor's previous scheduled check started, at each of its vantages and by the Worker's own clock, so a late check moves later due times back by its delay instead of letting two checks run closer together. The Worker's clock is the one that counts: a runner whose own clock is off by seconds reports its times in the Worker's clock and still has its results accepted. Because each due time slides to the previous start plus one interval, real cadence is a little slower than the interval you set: the delay between a check becoming due and starting (the runner polls every second) adds to every check, measured at about 0.4 s at a 60 second interval and about 0.26 s at the 5 second minimum, which runs about 5.3 seconds apart. Slots missed while no runner was working are counted rather than caught up. A vantage whose runner falls behind (a busy or stalled machine) does not catch up either: it skips the checks it missed and takes only the newest, so its own checks stay at least one interval apart, and each check it skipped shows its part as missing evidence (coverage incomplete), never as a pass or a failure. A skipped check neither confirms nor breaks confirmation or recovery: the monitor's state passes through it, so an incident both vantages see is confirmed, and recovers, however steadily one of them lags. A vantage that takes no newer check at all (its runner is down) leaves its part as missing evidence that does break them.
- **Edits** save a new revision of the monitor, and so does enabling a paused monitor. After an edit that changes the interval, the first check is due the shorter of the old and new intervals after the previous check started (so an edit never delays a check by a whole new longer interval, and never makes two checks run closer than either cadence), or straight away if that is already past. A runner restart, a pause or a URL edit never makes two scheduled checks start closer than one interval. Use **Run now** when you want an immediate result; a manual check is excluded from this floor, does not move the schedule and never confirms or recovers an incident.
- **Retries** are extra attempts inside a slot. A retry never erases an earlier failure and never counts as another slot.
- **Confirmation** is how many consecutive scheduled slots must fail before the monitor is Failing.
- **Recovery** is how many consecutive fresh, passing scheduled slots are needed before it recovers.
- **Failure agreement** requires two independent network labels, or one failing vantage whose external check (canary) passed in the same slot. A monitor on one network gets that check from the installation's External check URL when you save it (default `https://example.org/`, changed on Runner / archive and applied to monitors saved afterwards), unless you give the monitor its own. Checks on the same network count once.
- **Freshness** is how long a result stays usable before it counts as expired.

Because of confirmation and recovery, one blip does not wake you, and one lucky pass does not close an incident.

## Maintenance and manual checks

**Maintenance** pauses alerting while you work on a service. Checks and evidence keep being recorded, and no incident notifications are sent while it is on. If a failure is still confirmed after maintenance ends, a real completed check can open it.

A **manual check** runs a check now. It is recorded with its own identity, but it does not move the schedule, and it never confirms or recovers an incident.

## What each state means

- **Healthy** means fresh checks passed for every selected probe, and any recovery threshold has been met.
- **Degraded** means a target failed without independent network agreement, its canary failed, or agreement has not yet met the scheduled confirmation threshold.
- **Failing** means two independent runner networks agree on terminal failure, or one terminal failure has a passing external canary in the same slot, and the confirmation threshold has been met.
- **Recovering** means passing checks are arriving after a confirmed failure, but the recovery threshold is not yet met.
- **Maintenance** means a maintenance window is on.
- **Unknown** means there is not enough fresh evidence to say.

Unknown covers a result that never arrived, an incomplete set of passing results, and a result that has expired. Unknown never means healthy, and it does not quietly close an open incident. A runner error or a missing result is kept distinct from a target that answered badly.

In the 24-hour and 7-day figures, each complete scheduled result (every selected probe answered, no runner error) counts from when it finishes for up to one interval, or until the next scheduled check finishes if that comes sooner, and never past its freshness or, for a passing heartbeat, the receipt's maximum age. A runner error, failed canary or incomplete result adds no time. The figures include retained scheduled results across revisions, using the settings of each result's own revision. Maintenance and paused time are listed separately; changing those settings does not erase earlier observed time. Time before the monitor existed and time without usable evidence are Unknown. Current health still uses the current revision. Manual checks and retries do not add time.

## Evidence you can read later

Every slot and attempt keeps the monitor revision, the policy in force, the probes chosen, runner version, start and finish times, each assertion result and an error category. Evidence is immutable: editing a monitor creates a new revision, and old checks stay tied to the revision that ran them.

A hostname that does not resolve, because the name does not exist (NXDOMAIN) or has no A or AAAA records, is a failed check with that cause, so a lapsed domain or a deleted DNS record opens an incident like any other outage. A resolver that errors or answers with a private address is a runner problem instead, and the check is Unknown.

Target response bodies and request secrets are not stored. Observation metadata is never deleted automatically, so storage grows with time and is yours to look after.

## How requests stay safe

For public HTTP(S) targets, a private runner checks every DNS answer and every redirect hop, rejects unsafe or mixed addresses, and then pins the connection to the address it validated. The original host name and its certificate are still verified. Hosted checks run in the Cloudflare Worker: it validates every DNS answer and redirect hop the same way through Cloudflare DNS over HTTPS, but Workers cannot pin a connection, so the request itself relies on Cloudflare's outbound network, which does not reach private addresses. Downgrading from HTTPS is rejected, and a redirect to another origin drops credentials, custom headers, the body and any mutating method. Responses are limited to 64 KiB, and compressed responses are rejected.

## What this evidence is

A check tells you what one runner saw at one moment. It is sampled evidence, not a promise about every visitor, and a past success does not guarantee the target is up now. See [What Uptime does not do](/docs/limits).

When a failure is confirmed, [notifications](/docs/notifications) tell you.


## Period reports and v1 reads

Each monitor has a **Period report** panel. Choose 24 hours, 7, 30 or 90 days, or a custom range, an IANA time zone, location and latency resolution. Generate a snapshot, inspect its timestamp, and download JSON or CSV. Local times use the selected zone; daylight-saving gaps and repeated times require an explicit UTC offset. Fixed latency buckets align to UTC and display in your selected zone.

Passing is healthy time divided by observed scheduled time (healthy plus not passing). Unknown, maintenance and paused seconds remain separate; they do not turn into passing time. An optional SLA target uses this same explicit denominator and cannot certify unobserved time. Incident duration measures confirmed incident transitions, which differs from the per-slot not-passing total. Manual runs and retry attempts never add denominator time.

The authenticated owner-session API returns the same figures:

- `GET /api/v1/monitors/ID/uptime`
- `GET /api/v1/monitors/ID/report`
- `GET /api/v1/monitors/ID/response-times`
- `GET /api/v1/openapi.json` (OpenAPI 3.1)

For example, `/api/v1/monitors/ID/report?period=30d&timeZone=America%2FChicago&sla=99.9&bucket=1h&location=all`. A custom period takes `period=custom&from=2026-10-01T00:00:00-05:00&to=2026-10-15T00:00:00-05:00`; percent-encode query values in a client. `format=csv` or `Accept: text/csv` downloads report CSV. `format=pdf` or `Accept: application/pdf` downloads a paginated PDF of the same period, with coverage, SLA, Slow time, latency rows, incidents/root causes and heartbeat runs. The console offers the same PDF download. PDF exports use a bundled Noto Sans font; unsupported characters and reports exceeding 200 pages refuse explicitly rather than omit text or rows. Choose a shorter period or coarser response-time resolution for a smaller PDF. Latency supports `raw`, `1m`, `5m`, `1h` and `1d`, with min, mean, p50, p95, p99 and max. Percentiles use nearest rank. A response over 10,000 points refuses with HTTP 400 instead of truncating; select a coarser resolution. Incidents include every confirmed outage overlapping the period, rather than the monitor page's latest-100 list.

These reads require the same active owner session as the console; signed-out, non-owner and revoked sessions are refused. API keys, tag scopes, bulk reads, per-key limits and incident cursor endpoints remain unimplemented. UptimeRobot's uptime ratios map to `/uptime`, response times to `/response-times`, and log-style incident information to the `incidents` section of `/report`. Heartbeat reports also show a paged run table: server receipt/start times in the selected zone, immutable revision/sequence, outcome, duration, exit code, late-run flag and redacted output. The generated table stays fixed across console refreshes. Imported source history, service aggregation and scheduled report delivery remain contract gaps.

## Organize and operate the catalog

Monitors can carry a project, environment, service, group, tags, accountable owner label, intended customer outcome and dependency monitor IDs. Ownership is a label, not a permission. Search and filters stay in the URL; selection and text edits survive the console refresh. Edit labels, pause, resume and clone operate on an explicit selection. Preview names the revisions and changes; apply refuses a changed catalog instead of overwriting it. Every apply is an undoable Definitions batch. Pause and undo retain observations, revisions and incidents. A clone starts its own history, paused unless enabled in preview, and does not copy maintenance schedules or heartbeat authority.

Bulk add accepts pasted URLs or UTF-8 CSV with a `url` header and optional `name`, `type`, `keyword`, `interval` (seconds), `tags` and `group`. Shared type, cadence, locations and labels fill omitted row settings. At most 500 input rows are reviewed; the installation still holds at most 100 monitors. Duplicates, unsafe destinations and quota refusals show their reasons. Select accepted rows, preview that exact selection again, then apply it in one transaction. New monitors start paused unless the reviewed enable option is checked. Preview shows scheduled traffic and remaining quota. USD pricing is unavailable; it is never reported as zero. Per-monitor alert routes remain unsupported and any requested route is disclosed as unsupported; current installation-wide destinations still apply.

## Plan maintenance

Plan maintenance from a monitor or a selected catalog group. The preview freezes explicit monitor IDs and revisions; later group membership changes never widen that selection. A monitor can hold up to ten one-time or weekly windows. Choose an IANA zone, a calendar, and either **continue checks; suppress notifications** or **pause execution and notifications**. A weekly rule lasts at most 366 days and has an explicit first and last date. Preview lists actual UTC and local occurrences before apply. Weekly clocks that move forward skip a nonexistent start; repeated clocks use the first occurrence. One-time starts also use the first repeated time and refuse a nonexistent start. Durations are elapsed minutes, so a local end time can cross the clock change.

Suppression retains the real check results and underlying target state. Execution pause stops new claims while preserving results already in flight. Cancellation creates a new immutable revision; past windows, observations and audit remain available. Expiry and cancellation evaluate actual evidence and cannot send recovery for a trigger that maintenance suppressed. The timeline and period reports show maintenance separately from paused and Unknown time. Overlapping windows are merged, bounded by each revision, and excluded once from the availability denominator; they never create Healthy evidence. Definition-file imports preserve current maintenance rather than applying schedules from a file. Inactive archives retain the historical schedule definitions without enabling restored monitors.

## Incident notes and follow-up

Open a monitor’s **Incidents** section and choose **Notes and follow-up** on an open or recovered incident. Owner sessions can write private comments (5,000 characters), edit them with visible earlier versions, or delete their text and history while retaining a deletion entry. Links render as escaped text with ordinary HTTP(S) links. Drafts remain intact while the monitor refreshes.

Assign an active owner, acknowledge the response, record a stop or resolve the response. These actions never establish monitor recovery: scheduled evidence continues to decide health. The timeline combines confirmation/recovery, human actions and durable notification attempts/outcomes. Per-contact delays and reminders are configured in **Edit alert route**. Next due shows the earliest pending contact delay or reminder from the incident’s confirmation-time policy. Acknowledgement stops repeats only for contacts whose policy selects it; stop and manual resolution end reminders. Team responder/read-only roles, mentions/email, grouped acknowledgement and status-page publication remain unimplemented. Product access continues to require an owner session.

Choose a root-cause category and a private account of up to 2,000 characters, during or after the outage. **Manage root-cause categories** adds, renames or removes future choices; old incident accounts retain their recorded category label. The machine’s failure cause remains separate. Period reports filter incident rows by category and group their overlap duration. Availability and SLA retain their complete scheduled denominator. CSV and JSON exports use the same report data.

**Download incident JSON** includes the comments, edit history, root cause and activity timeline. Product archives retain this account and restore monitoring inactive. Monitor erasure removes incident work, comment text/history and timeline with per-table receipt counts. Operator erasure retains comments attributed to a former member. No comment is sent to a destination or public page.

Owner-session reads are available at `GET /api/v1/incidents` and `GET /api/v1/incidents/{id}`. The ID is the stable trigger event ID supplied by the list or the monitor’s incident read. The list supports `monitor`, `tag`, `from`, `to`, `state` (response state: open, acknowledged, resolved) and `rootCause` category ID. Dates are ISO 8601 or epoch milliseconds. `limit` is 1–100 (default 50); pass `nextCursor` back as `cursor` for the next stable confirmation-ordered page. Detail carries the private account, delivery activity, source, and the next scheduled contact delay or reminder (null when none is due). API keys/scopes and per-key rate limits are still absent; all requests require an active owner session. The OpenAPI document is `/api/v1/openapi.json`.

## ICMP ping

Choose **ICMP ping** to check public IPv4 or IPv6 reachability from assigned private Node runners. Enter a host, address family, 1–5 echo requests, maximum packet loss (0–100%) and maximum round-trip time (1–10,000 ms). At least one reply is required even with a 100% loss allowance. The maximum RTT threshold applies to the slowest reply, not an average that could hide a slow packet. Each location retains its numeric address, sent/received counts, loss, and minimum/mean/maximum RTT in immutable scheduled evidence.

Checks run every 30 seconds or slower. The 8–10 second execution limit includes resolution and the bounded native sample; a cancelled or incomplete sample cannot pass. Native ping runs without a shell at its fixed system path on Linux/macOS, with numeric output and no inherited credentials. Install the operating system's ping package and grant its normal ICMP permission on the runner host. A missing executable, missing privilege, unsupported platform or malformed output is **Unknown**, with the reason retained. Cloudflare Workers cannot perform ICMP and cannot be assigned these checks.

No echo replies means a target failure with **ICMP unreachable or filtered** wording: it cannot distinguish a dead host from an ICMP firewall. HTTP success is never substituted for ping. All DNS answers must be safe public addresses before selecting and pinning the requested family; private or mixed answers are refused. Independent-vantage confirmation, retries, maintenance, pause and recovery retain the same rules as other monitor types. Stopping a probe leaves missing/expired coverage Unknown. Public ping is separate from private-network grants.


## Failure snapshots

Open an HTTP or keyword monitor’s **Failure snapshots** section to inspect a failed response. **Load failure snapshots** refreshes a fixed selection of 20 records; **Older snapshots** pages through the rest. The incident’s **Incident evidence** section can load the snapshots from its confirming run and subsequent failures. Notes and follow-up and the incident JSON retain their own activity and per-location evidence alongside these diagnostics.

Each snapshot names the immutable revision, attempt, location and capture time, the final request method and redacted URL, redirect chain, request header names, bounded response headers, elapsed time and the first 16 KiB of response text. Text is escaped; HTML and scripts never run. Query values and all request header values are masked. Only content-type, content-length, server and retry-after response values can remain; other response values are masked. Built-in masks cover authorization, cookie and common credential patterns, email addresses and Luhn-valid card numbers. Known local request credentials and the owner’s literal masks are removed before capture. Unknown secrets with no recognizable pattern require a literal mask. An unavailable capture is explicitly labelled and never changes the check result.

**Retention and redaction** sets 1–365 days (90 by default) and up to 20 literal masks of 128 characters each. Adding masks also scrubs retained snapshots in the same guarded transaction. Shortening retention shortens existing expiry; increasing it does not resurrect or extend already captured records. Expired snapshots are unavailable to reads and new archives immediately, and Cron removes their stored text. Settings and mask literals stay local; archives carry only the already redacted snapshots and original expiry.

**Download selection as JSON** exports the displayed selection. Full archives retain snapshots as inactive history. **Erase retained snapshots** returns a receipt and fences old copies when the later erasure journal accompanies restore. Erasing the monitor also erases its snapshots and settings, with receipt counts. Previously downloaded files remain outside local custody. Reads, settings and erasure require an owner session; runner authority and metrics keys cannot read snapshots. Snapshot text never enters alerts or observation rows and never changes monitoring state or availability.

This is the text-snapshot subset of EVIDENCE-002. Screenshot capture, per-header safe-value exceptions and email-allowance controls, complete incident-artifact export and evidence-specific team roles are not available. A runner predating snapshot support can still submit ordinary immutable evidence without a snapshot.

### Connection diagnostics

HTTP and keyword failures show the final exchange’s measured DNS lookup, TCP connection, TLS handshake and time to response headers beside the original check duration. A missing measurement says **Unavailable**. Cloudflare’s fetch transport exposes DNS and header timing, but no direct TCP/TLS timing or route tool. Diagnostics never decide health or clear an incident.

On a private Node runner, a timeout, refused/reset connection, DNS or TLS failure also attempts a numeric traceroute to the address already validated for that request. It sends at most one probe per hop and five hops, with a three-second hard deadline and 16 KiB tool-output bound. There is no extra DNS lookup, request credential or body. The report retains numeric hop addresses, round-trip time and one-sample loss, not native output. A nonreply is ambiguous. A missing/blocked tool, a deadline or an unsupported platform/family is labelled unavailable; private-network targets are not traced. Install the host’s traceroute package and its ordinary permission to enable that measurement.

The incident report keeps each location’s original outcome beside its diagnostic snapshot. Downloads, retention, archives and erasure use the snapshot’s existing custody. Non-HTTP attachment and real independent-location route/TLS/DNS qualification remain open under DIAG-001.

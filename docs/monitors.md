A monitor describes what to check, how often, and what counts as success. Uptime runs the check on schedule, keeps the result as evidence, and only raises an incident when a failure is confirmed. This page explains the monitor kinds and how a series of checks becomes a state you can trust.

## Supported monitor kinds

### HTTP(S)

An HTTP(S) monitor requests a URL and tests the response against rules you set. You can assert on:

- the status code,
- text in the body,
- a response header,
- a value in a JSON response, and
- latency.

A monitor that sets no status rule expects 200.

### JSON values and latency

In the HTTP form's **Additional checks (JSON)** field, enter:

```json
{"json":{"path":"$.status.indicator","equals":"none"},"latencyMs":1500}
```

This requires the response's `status.indicator` value to equal `"none"` and its response time to be at most 1,500 ms. Both `$.status.indicator` and `status.indicator` are accepted. `json` is a single object with `path` and `equals`, not an array; either the JSON check or `latencyMs` may be omitted. Keep the expected HTTP status in its separate field.

### Keyword

A keyword monitor is an HTTP(S) check that requires specific text in the response body. Use it when a page can return 200 while the content is wrong.

### TCP port

A TCP monitor opens a connection to a host and port, for example a database, a mail server or an SSH service. It records the connection time and, if you choose, the first line the service sends (its banner, at most 256 characters), which can be required to contain some text. A refused connection, a connection that times out and a check that could not run (the runner's own DNS failed, or this vantage cannot reach the address) are separate outcomes; only the first two count against the target.

### DNS record

A DNS monitor asks public resolvers (Cloudflare and Google, over HTTPS) for an A, AAAA, CNAME, MX, TXT, NS, SOA, SRV or CAA record. Without expected values it needs at least one record; with them, the answer must match exactly or include them, or it may require that the record does not exist. A missing name (NXDOMAIN), a resolver failure (SERVFAIL), resolvers that disagree, and a resolver that could not be reached at all are reported separately; the last is a fault in the monitoring path and stays Unknown. Before a planned change, add the new values as an **approved change**: they pass as well, while a missing name or a failing resolver still fails. SOA compares the primary name server and the responsible mailbox, not the serial.

### TLS certificate

A TLS monitor connects to a host (port 443 unless you set another) and checks that the certificate chain is trusted, covers the host name and is within its validity dates. It warns before expiry at stages you choose (30, 14 and 7 days by default), once per certificate and stage, naming the certificate and its accountable owner. A warning stays open until a renewed certificate, valid beyond every stage, is observed; then one renewal notice closes it. Expiry checks run at least hourly.

### Domain registration expiry

A domain monitor reads the registration's expiry date from the registry's RDAP service (found through IANA's bootstrap) and from the registrar's RDAP record the registry links. It keeps each source and when that source last updated. It warns before expiry (60, 30, 14 and 7 days by default) and follows each warning until a renewed expiry date is observed. A redacted or missing date, registry data that could not be read, or a registry and registrar that disagree by more than a day are Unknown, never healthy. Certificate renewal is not domain renewal.

### Where each check runs

The Cloudflare Worker runs HTTP(S), keyword, TCP, TLS, DNS and domain checks at an interval of at least one minute. A Worker cannot open sockets to Cloudflare's own addresses, so a TCP or TLS check of a site hosted on Cloudflare is Unknown there and says so; a private runner can check it. The Worker reads a certificate from a TLS 1.2 handshake, so a server that accepts only TLS 1.3 is also Unknown at the Worker. A private runner runs every type. ICMP ping is not offered.

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

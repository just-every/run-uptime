A monitor describes what to check, how often, and what counts as success. Uptime runs the check on schedule, keeps the result as evidence, and only raises an incident when a failure is confirmed. This page explains the monitor kinds and how a series of checks becomes a state you can trust.

## The four kinds

### HTTP(S)

An HTTP(S) monitor requests a URL and tests the response against rules you set. You can assert on:

- the status code,
- text in the body,
- a response header,
- a value in a JSON response, and
- latency.

A monitor that sets no status rule expects 200.

### Keyword

A keyword monitor is an HTTP(S) check that requires specific text in the response body. Use it when a page can return 200 while the content is wrong.

### Incoming heartbeat

A heartbeat monitor waits for your own job to call Uptime. It suits cron jobs, backups and workers that should check in on a schedule.

1. While signed in as the owner, issue a key for the monitor with `POST /api/monitors/:id/heartbeat-key`. The response gives you a token, the receipt path and the first sequence number, which is 1. Keys belong to one revision of the monitor, and issuing a new one replaces the old.
2. From your job, send an empty JSON object to the receipt path, with `Authorization: Bearer <token>` and an `X-Heartbeat-Sequence` header.
3. Increase the sequence number on every call. Uptime uses it, with its own clock, to reject replays.

```sh
curl -X POST "$HEARTBEAT_RECEIPT_URL" \
  -H "Authorization: Bearer $HEARTBEAT_TOKEN" \
  -H "X-Heartbeat-Sequence: 1" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Each monitor accepts up to 60 calls per one-minute window. A window starts with the first call after the previous window has ended and lasts 60 seconds, and further calls in a full window get HTTP 429. A received heartbeat is recorded as a receipt. It does not change health on its own: the next scheduled check evaluates the receipts it finds.

### Browser flow

A flow monitor runs one path in a real browser, on a runner that has one: it opens a page, fills fields from credentials that stay on the runner, clicks, waits, and then checks the outcomes you require. Use it for one question, such as "can a person still sign in and see their dashboard?" A pass is evidence of that flow only. It says nothing about any page or step the flow does not visit.

A flow is defined in a [definitions file](/docs/definitions) or through the monitor API, not in the editor form. The page of a flow monitor shows what it tests, the outcomes it requires, the revision running and each check's step trace. A flow is an ordinary monitor otherwise: it has revisions, a schedule (at least every 5 minutes), probes on separately keyed runners, confirmation and recovery, and incidents that notify.

```json
{
  "name": "Sign in",
  "type": "flow",
  "url": "https://app.example.com/login",
  "intervalMs": 300000,
  "flow": {
    "intent": "A person can sign in and reach their dashboard",
    "steps": [
      {"kind": "goto", "url": "https://app.example.com/login"},
      {"kind": "fill", "target": {"label": "Email"}, "credentialRef": "app-login-email"},
      {"kind": "fill", "target": {"label": "Password"}, "credentialRef": "app-login-password"},
      {"kind": "click", "target": {"role": "button", "name": "Sign in"}},
      {"kind": "waitFor", "what": "text", "value": "Welcome back"}
    ],
    "outcomes": [{"id": "dashboard", "what": "url", "value": "/dashboard"}]
  }
}
```

- **Steps** are `goto` (a URL), `click` (a target), `fill` (a target and a `credentialRef`, never a value), `waitFor` and `expect` (what: `text`, `url` or `element`). A target is exactly one of `css` (one plain CSS selector), `text`, `label`, or `role` with its `name`. There are no scripts, expressions or raw browser code, and an unknown step kind or field is refused with the entry's name.
- **Required outcomes** must all be observed after the last step for a pass. Each has an `id` and the same `what` as an expectation.
- **Credentials** are files on the runner, named by `credentialRef`: see [The runner](/docs/runner#browser-flows).
- **Network:** every request the page makes goes through one filtering door on the runner. Public addresses only; private, loopback, link-local and metadata addresses are refused, including after a redirect or from a subresource, and the page may only load top-level pages on the origins the flow names.
- **A failed flow says which step and why:** the expected text or element did not appear, no element matched a click, a page answered with an error status, the flow ran past its time limit, the page tried to reach a forbidden address or open a second window, or a required outcome was missing. A runner without a browser, or one missing a credential the flow names, makes the flow Unknown with that reason, never a pass and never a failure.
- **Revisions:** every edit is a new revision, and the monitor's page lists when a revision's required outcomes shrank. A pass under a revision that requires less than the one an open incident began under, including one that changed the monitor's type, recovers that incident labelled as a changed definition, with what is no longer required named in the recovery notice. See the [limits](/docs/limits#browser-flows-are-small-and-bounded).

## Schedules and thresholds

Each monitor has a schedule and a few knobs that decide when a bad check becomes an incident.

- **Interval** is how often the check is due. A slot is one due check. A check never starts sooner than one interval after the monitor's previous scheduled check started, at each of its vantages and by the Worker's own clock, so a late check moves later due times back by its delay instead of letting two checks run closer together. The Worker's clock is the one that counts: a runner whose own clock is off by seconds reports its times in the Worker's clock and still has its results accepted. Because each due time slides to the previous start plus one interval, real cadence is a little slower than the interval you set: the delay between a check becoming due and starting (the runner polls every second) adds to every check, measured at about 0.4 s at a 60 second interval and about 0.26 s at the 5 second minimum, which runs about 5.3 seconds apart. Slots missed while no runner was working are counted rather than caught up. A vantage whose runner falls behind (a long browser flow on the same machine, or a stalled machine) does not catch up either: it skips the checks it missed and takes only the newest, so its own checks stay at least one interval apart, and each check it skipped shows its part as missing evidence (coverage incomplete), never as a pass or a failure. A skipped check neither confirms nor breaks confirmation or recovery: the monitor's state passes through it, so an incident both vantages see is confirmed, and recovers, however steadily one of them lags. A vantage that takes no newer check at all (its runner is down) leaves its part as missing evidence that does break them.
- **Edits** save a new revision of the monitor, and so does enabling a paused monitor. After an edit that changes the interval, the first check is due the shorter of the old and new intervals after the previous check started (so an edit never delays a check by a whole new longer interval, and never makes two checks run closer than either cadence), or straight away if that is already past. A runner restart, a pause or a URL edit never makes two scheduled checks start closer than one interval. Use **Run now** when you want an immediate result; a manual check is excluded from this floor, does not move the schedule and never confirms or recovers an incident.
- **Retries** are extra attempts inside a slot. A retry never erases an earlier failure and never counts as another slot.
- **Confirmation** is how many consecutive scheduled slots must fail before the monitor is Failing.
- **Recovery** is how many consecutive fresh, passing scheduled slots are needed before it recovers.
- **Failure agreement** requires two independent network labels, or one failing vantage whose external check (canary) passed in the same slot. A monitor on one network gets that check from the installation's External check URL when you save it (default `https://example.com/`, changed on Runner / archive and applied to monitors saved afterwards), unless you give the monitor its own. Checks on the same network count once.
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

In the 24-hour and 7-day figures, each complete scheduled result (every selected probe answered, no runner error) counts from when it finishes for up to one interval, or until the next scheduled check finishes if that comes sooner, and never past its freshness or, for a passing heartbeat, the receipt's maximum age. A runner error, failed canary or incomplete result adds no time. The rest of each full window, including time before the monitor existed, is Unknown. Manual checks and retries do not add time.

## Evidence you can read later

Every slot and attempt keeps the monitor revision, the policy in force, the probes chosen, runner version, start and finish times, each assertion result and an error category. Evidence is immutable: editing a monitor creates a new revision, and old checks stay tied to the revision that ran them.

Target response bodies and request secrets are not stored. Observation metadata is never deleted automatically, so storage grows with time and is yours to look after.

## How requests stay safe

For public HTTP(S) targets, the runner checks every DNS answer and every redirect hop, rejects unsafe or mixed addresses, and then pins the connection to the address it validated. The original host name and its certificate are still verified. Downgrading from HTTPS is rejected, and a redirect to another origin drops credentials, custom headers, the body and any mutating method. Responses are limited to 64 KiB, and compressed responses are rejected.

## What this evidence is

A check tells you what one runner saw at one moment. It is sampled evidence, not a promise about every visitor, and a past success does not guarantee the target is up now. See [What Uptime does not do](/docs/limits).

When a failure is confirmed, [notifications](/docs/notifications) tell you.

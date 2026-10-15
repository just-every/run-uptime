Uptime does a small set of things carefully. This page lists what it leaves out, so you can decide quickly whether it fits. Where something is not verified yet, we say so.

## Checks it does not run

Uptime monitors HTTP(S) endpoints, keyword text and incoming heartbeats. Its supported public feature set does not include:

- DNS checks,
- ping,
- TCP port checks,
- domain-expiry monitoring,
- scripts, recorded sessions or screenshots of pages, or
- browser checks.

## Channels and workflows it does not have

Notifications go to email, a signed JSON webhook or a Slack incoming webhook, for every monitor in the installation. Uptime does not provide:

- per-monitor destination filters,
- Teams or Discord delivery,
- SMS,
- on-call paging,
- incident escalation, or
- public status pages or other public communication.

If you need those, you can send Uptime's signed JSON to a receiver of your own. See [Notifications](/docs/notifications).

## A check's cadence is slightly slower than its interval

A scheduled check never starts sooner than one interval after the previous one started, at each vantage, by the Worker's clock. To guarantee that, each next due time is the previous check's latest start at any vantage plus one interval, so the delay between a check becoming due and starting (the runner polls every second) is added to every check. Measured on loopback with the production runner, a 60 second interval runs about 60.4 seconds apart and the 5 second minimum about 5.26 seconds apart, about 5 % slower than configured. A slower or busier runner adds more. A vantage that falls more than an interval behind skips the checks it missed instead of running them back to back; each skipped check keeps that vantage's part as missing evidence, and confirmation and recovery count only the checks it took, so a steadily lagging vantage still confirms an incident.

## Hosted checks share a per-minute request budget

On Cloudflare's Workers Free plan, one scheduled run of the Worker may make 50 outbound requests. Each run, Uptime spends at most 35 of them on public checks and keeps the rest for notifications and its own watch. Before it starts a check, the Worker sets aside the most that check can need without redirects: two DNS lookups for each hostname, plus one request for the external check and one for each attempt. A check that does not fit is not started: it stays due, and the next minute's run takes it first. A check that runs out partway through, for example on a long redirect chain, is recorded as Unknown with the reason "Not checked: this scheduled run reached its outbound request budget", never as a target failure.

With the defaults (one retry and the external check), one run fits about seven healthy checks. More monitors than that at a one-minute interval are each checked a little less often than their interval; at a five-minute interval about 35 monitors fit. Paid Workers plans allow more requests, but Uptime keeps this bound. For more checks, add a [private runner](/docs/runner) and assign monitors to it.

## One runner is one vantage

A single runner checks from one network position. Monitors can list up to three named probes, but those names do not mean different places. Sampled evidence from one runner is not a claim about every visitor's experience, and a past success does not guarantee a target is up now. Independent monitoring uses separately keyed runners with different declared network labels. The owner supplies and supervises those placements; logical probe names never establish independence.

## What an import does not bring

Importing from UptimeRobot moves HTTP(S), keyword and heartbeat monitors as paused definitions. It does not bring history, alert contacts, status pages, regions, maintenance windows, request secrets or heartbeat URLs, and it has not been tried with a real UptimeRobot export. See [Moving from UptimeRobot](/docs/moving-from-uptimerobot).

## What a result does not prove

- A provider's "accepted" is not proof that a person read a notification.
- A healthy Worker is not proof that the [runner](/docs/runner) is working.
- A signed result identifies the holder of the runner key, not an uncompromised machine.
- An archive digest detects changed bytes, not who made the archive.

## Not yet verified

- **Hosted installation.** The Cloudflare deployment path is implemented and has been exercised end to end once, on version 0.1.1. See [Deploy to Cloudflare](/docs/deploy).
- **Notification recipients.** Local checks and provider acknowledgements do not establish that a recipient received an alert.
- **Capacity.** Larger capacity and storage costs have not been measured.
- **Network isolation.** Running the runner in an independently isolated placement is your responsibility and has not been independently proven.
- **Accessibility.** Current accessibility conformance has not been measured.

## Storage is yours to manage

Observation metadata is never deleted automatically. See [Move your data](/docs/data).

If a limit here is the thing standing between you and adopting Uptime, open an issue at https://github.com/just-every/run-uptime and tell us.

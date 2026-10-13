Uptime does a small set of things carefully. This page lists what it leaves out, so you can decide quickly whether it fits. Where something is not verified yet, we say so.

## Checks it does not run

Uptime monitors HTTP(S) endpoints, keyword text, incoming heartbeats and, on a runner that has a browser, a few bounded [browser flows](#browser-flows-are-small-and-bounded). It does not offer:

- DNS checks,
- ping,
- TCP port checks,
- domain-expiry monitoring,
- scripts, recorded sessions or screenshots of pages, or
- browser checks beyond the one flow type below.

## Channels and workflows it does not have

Notifications go to email, a signed JSON webhook or a Slack incoming webhook, for every monitor in the installation. Uptime does not provide:

- per-monitor destination filters,
- Teams or Discord delivery,
- SMS,
- on-call paging,
- incident escalation, or
- public status pages or other public communication.

If you need those, you can send Uptime's signed JSON to a receiver of your own. See [Notifications](/docs/notifications).

## Browser flows are small and bounded

A flow is one business path in a real browser on your own runner, for example a sign-in or an order confirmation. It is a closed list of steps and the outcomes that must all be observed; it is not a script. The limits are fixed and a run that exceeds one fails and names it, instead of hanging:

| Limit | Value |
| --- | --- |
| Interval | at least 5 minutes |
| Flow monitors in one installation | 5 |
| Wall time of one run, browser start included | 60 seconds (a flow may set less, down to 10) |
| Steps in one flow | 20 |
| Required outcomes in one flow | 8 |
| Top-level pages loaded in one run | 8 |
| Response bytes through the browser's one network door in one run | 5 MiB |
| Step trace kept with an observation | 8 KiB |
| Flows running on one runner at the same time | 1 |

A flow keeps no screenshots and no page bodies. Its fill steps name a credential that lives on the runner; the value never reaches Uptime. A pass is evidence of that flow only: it says nothing about pages or steps the flow does not visit, and Uptime never describes it as the site or the checkout working. See [Monitors](/docs/monitors#browser-flow) and [The runner](/docs/runner#browser-flows).

## A check's cadence is slightly slower than its interval

A scheduled check never starts sooner than one interval after the previous one started, at each vantage, by the Worker's clock. To guarantee that, each next due time is the previous check's latest start at any vantage plus one interval, so the delay between a check becoming due and starting (the runner polls every second) is added to every check. Measured on loopback with the production runner, a 60 second interval runs about 60.4 seconds apart and the 5 second minimum about 5.26 seconds apart, about 5 % slower than configured. A slower or busier runner adds more. A vantage that falls more than an interval behind skips the checks it missed instead of running them back to back; each skipped check keeps that vantage's part as missing evidence, and confirmation and recovery count only the checks it took, so a steadily lagging vantage still confirms an incident.

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

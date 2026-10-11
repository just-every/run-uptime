Uptime does a small set of things carefully. This page lists what it leaves out, so you can decide quickly whether it fits. Where something is not verified yet, we say so.

## Checks it does not run

Uptime monitors HTTP(S) endpoints, keyword text and incoming heartbeats. It does not offer:

- DNS checks,
- ping,
- TCP port checks,
- domain-expiry monitoring, or
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

## One runner is one vantage

A single runner checks from one network position. Monitors can list up to three named probes, but those names do not mean different places. Sampled evidence from one runner is not a claim about every visitor's experience, and a past success does not guarantee a target is up now. Independent regional monitoring would need independently operated placements, which Uptime does not provide today.

## What a result does not prove

- A provider's "accepted" is not proof that a person read a notification.
- A healthy Worker is not proof that the [runner](/docs/runner) is working.
- A signed result identifies the holder of the runner key, not an uncompromised machine.
- An archive digest detects changed bytes, not who made the archive.

## Not yet verified

- **Hosted installation.** The Cloudflare deployment path is implemented, but a fresh-account hosted installation has not been verified. See [Deploy to Cloudflare](/docs/deploy).
- **Notification recipients.** Local checks and provider acknowledgements do not establish that a recipient received an alert.
- **Capacity.** Larger capacity and storage costs have not been measured.
- **Network isolation.** Running the runner in an independently isolated placement is your responsibility and has not been independently proven.
- **Accessibility.** Current accessibility conformance has not been measured.

## Storage is yours to manage

Observation metadata is never deleted automatically. See [Move your data](/docs/data).

If a limit here is the thing standing between you and adopting Uptime, open an issue at https://github.com/just-every/uptime-monitor and tell us.

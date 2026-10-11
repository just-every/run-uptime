Uptime is self-hosted uptime and API monitoring. It checks your sites and APIs on a schedule, tells you when a failure is confirmed, and never calls a missing check healthy. You run it yourself, it is free and open source under the MIT license, and the source is at https://github.com/just-every/uptime-monitor.

## How it works

Uptime has four parts, and it helps to know which does what.

- **A Cloudflare Worker** serves the console and its APIs, and decides what each result means.
- **A D1 database** stores every scheduled check, every attempt and every incident, so history is never rewritten.
- **A Cron trigger** runs every minute to expire abandoned work and clear out old sign-in records.
- **A private runner**, a small Node process that you start and supervise separately, makes the actual requests to your targets and sends back signed results.

You work in the console at `/app` once you have signed in. Only the installation owner can open it.

Because the runner is a separate process, a healthy Worker does not tell you the runner is working. The [runner page](/docs/runner) shows how to keep it running.

## What Unknown means

Every green mark in Uptime is a check that ran and passed. If a result never arrives, or arrives too late to count, Uptime shows that time as **Unknown**. Unknown is not healthy, and it is not failing either: it means Uptime has no fresh evidence either way.

Read more in [Monitors and evidence](/docs/monitors).

## Three kinds of monitor

- **HTTP(S)** checks a URL and tests the response against your own success rules: status, body text, headers, JSON values and latency.
- **Keyword** is an HTTP(S) check that requires a piece of text in the response body.
- **Incoming heartbeat** waits for your job or service to call Uptime on schedule, which suits cron jobs and background workers.

## Notifications

When a failure is confirmed, Uptime can notify you by email, a signed JSON webhook or a Slack incoming webhook. Destinations apply to every monitor in the installation. See [Notifications](/docs/notifications).

## Who it suits

Uptime suits you if you want to run your own monitoring and read the evidence behind every alert. It fits a small team or one person who is comfortable running a Cloudflare Worker and a small Node process, and who would rather see an honest "no check received" than a reassuring green.

It does not cover everything. Uptime uses sampled evidence from the assigned runner networks, not a promise about every visitor's experience. See [What Uptime does not do](/docs/limits).

## Where to go next

1. [Install Uptime](/docs/install) on your own computer to look around.
2. [Deploy to Cloudflare](/docs/deploy) when you want it running for real.
3. Start [the private runner](/docs/runner) so checks begin.
4. Add [monitors](/docs/monitors) and [notifications](/docs/notifications).

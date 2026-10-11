The private runner is the part of Uptime that actually visits your sites and APIs. It is a small Node process that you start yourself, on a machine you trust to reach your targets, and that you keep running. Without it the console works but no checks happen.

## Why it is separate

The Worker stores evidence and decides what it means, but it does not make the requests. Keeping the runner separate means your targets are probed from a network you choose, and credentials for those targets never need to leave it.

The runner also does the delivery work for notifications: it sends signed JSON webhooks and Slack messages when it polls. See [Notifications](/docs/notifications).

## Start it

Give the runner the exact address of your Uptime installation and the runner key, then start it.

```sh
export UPTIME_CONTROL_ORIGIN="https://your-uptime-address.example"
export UPTIME_RUNNER_KEY="the key from your private deployment settings"
node runners/src/private-runner.mjs
```

- `UPTIME_CONTROL_ORIGIN` is the exact HTTPS origin of your installation. It is required, and the runner refuses to start without it.
- `UPTIME_RUNNER_KEY` is the scoped key that matches your installation. For a hosted deployment, it is in `.rer/deploy/production-secrets.json`. See [Deploy to Cloudflare](/docs/deploy).

The runner is run from a clone of the source, so use the same checkout you installed from. `node scripts/rer.mjs dev` starts a runner for you; the steps above are for a hosted installation.

## Keep it under a supervisor

Run the runner under something that restarts it when it stops, such as systemd, a container restart policy or a process manager. A runner that quietly stopped looks like a quiet night, so you want to notice.

A healthy Worker does not mean the runner is operating. Uptime shows when it last heard from your runner as "contact", and that is separate from whether your targets are healthy. Contact counts as fresh for 120 seconds. If the runner stops, checks that should have run appear as Unknown rather than green.

Keep the runner's clock in sync with real time. If its clock is a minute or more ahead of the Worker's, it skips claiming notification work, and that work waits for a correctly timed runner instead of being sent twice. Results are stricter: if the runner's clock differs from the Worker's by more than 60 seconds in either direction, the Worker rejects its results with HTTP 403 and they are not recorded.

## One runner, one vantage

Everything the runner checks, it checks from where the runner sits. A monitor can list up to three named probes, but they all run on the same runner, so they share one network position. They are not separate places.

## Request secrets stay with the runner

If a check needs a header, a body or a bearer or basic credential, put it in a file on the runner's machine and point the monitor at it. Those files are read only by the runner, and are bound to the origin they are meant for.

- Credential files are owner-only regular files in the folder named by `UPTIME_CREDENTIAL_DIR`.
- A monitor refers to a file by name and never contains the secret itself.
- If a reference is missing or invalid, the check fails with a runner error. It does not fall back to an unauthenticated request.
- Never put a bearer credential in a URL.

Raw secrets and response bodies never go into stored evidence or archives.

## Signed results

The runner signs its enrolment before it polls, and keeps this installation's single durable runner identity across restarts. It identifies itself with its key on every request, including when it claims checks and notification work. Results carry more: each one is also timestamped and signed with the key, and the Worker accepts only results that match an exact check it handed out. The runner refuses redirects when talking to the Worker, and only a local review setup may use plain HTTP loopback.

A signature shows that the holder of the runner key sent the result. It does not prove the runner was uncompromised, so protect the key like any other secret.

## Next

Add a [monitor](/docs/monitors) and watch its first checks arrive.

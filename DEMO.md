# Uptime demo

After the ordinary `rer setup`, run `rer demo` (`rer dev --demo`) and open its
private `RER_OPEN` link. The installed, unmodified published `@runeditrun/rer` 0.2.8
release includes demo mode; see [the adoption note](patches/README.md). No package
patch or external Base checkout is needed. `rer demo --stop`, Ctrl-C, or expiry
stops its owned runtime, runner and synthetic target and deletes
`.rer/demo/<start>/`. Restarting starts afresh.
Normal `.wrangler/state` data and private settings are retained.

The owner lands on a completed first run with three runnable sample monitors:
Checkout API (HTTP/JSON), Service response (keyword), and Browser journey.
Every name says “Demo sample”. They target only the bundled synthetic service.
No successful observation is seeded: monitors begin Unknown and become Healthy
only after the real private runner has checked that service. This is evidence
about a local synthetic target, never evidence of a customer's website health.

Base's demo module at `src/modules/demo` adds the Demo bar and Worker outbound
guard. Its only edition adaptation is the two relative imports back to the
unchanged operator-auth helpers in `src/base/modules/operator-auth`; its guard
behavior is unchanged. [Source provenance](patches/README.md) records both the
adapted index and the five unchanged files.
The outside-Worker Node runner has a narrower rule: only the live owner-only
synthetic grant's exact origin, allowed paths and GET/HEAD methods may be probed.
Redirects cannot leave it; public probes and canaries, discovery (including a
start URL), webhook/Slack deliveries and independent watch sends are refused
before DNS/socket work. Browser requests share the custody proxy; CONNECT and
WebSockets are refused, popup navigation is stopped, and forbidden requests
cannot produce a passing observation. Refusals are recorded in monitor history,
notification outcomes, the Demo bar and the private demo's `blocked.jsonl`.
If the control plane itself is unavailable, independent watch refusals remain in
that local log; they are never recorded as delivered. Worker mail uses the
existing development outbox, including on the hosted demo's HTTPS origin.
Base currently refuses development authentication delivery on non-local origins:
a hosted magic-link request captures its message, revokes the link, and returns
unavailable. Hosted visitors sign in through their signed owner claim instead;
no captured message is described as delivered.
The Demo bar lists captured mail and blocked sends. External heartbeats pass
through the Worker guard and record failure when refused.

The demo's migration database, synthetic grant, flow workspace and credential
folder all live in its fresh state directory. Saved owner's credentials are
never read by demo probes. Production authentication and outbound policy do not
change when `RER_DEMO` is absent.

## Hosted demo

`rer deploy --demo --dry-run` now passes Base's canonical demo import boundary
and prepares the front Worker, configuration and workerd image locally. The
credential-free check returned `dryRun: true` and `deployed: false`, with Worker
`uptime-monitor-production--demo` at the declared `demo.run-uptime.com` domain,
the synthetic runner, demo egress denial and `enableInternet: false`.
This proves local image preparation only: Docker execution, Cloudflare container
operation, visitor isolation and expiry, hosted egress, startup latency and
public availability remain unverified. Published RER 0.2.8 includes the owner-deploy
exact-repeat fix: an unchanged repeat preserves the receipt and avoids provider
writes after setup-token retirement. Hosted acceptance and owner go-live remain pending.

The existing Uptime project identifiers are retained. The hosted configuration
provides one isolated container per visitor, its own owner claim keys,
session/setup secrets, derived runner key, D1 state and synthetic process.
Only the trusted exact `UPTIME_ORIGIN` binding can supply the demo owner-claim
origin. Production still requires its explicit owner-claim binding.
The private runner reaches the control plane over the container's loopback
port; it never sends enrollment credentials to an external origin.

Base's container image currently has no Playwright/Chromium installation.
The hosted browser monitor therefore reports Unknown with the missing-browser
reason; it cannot invent success. HTTP and keyword checks run against the
container's synthetic process. Local browser acceptance uses real Chromium.

`.github/workflows/run-demo.yml` uses the `run-demo` environment and the fixed
approved Cloudflare account. It is triggered only by manual dispatch, which
deploys independently of `RUN_DEMO_DEPLOY`; pushes do not trigger this workflow.
The optional `test_only` dispatch creates a separate `demo-test` Worker at
`demo.test.run-uptime.com` using Turnstile's test keys in workflow environment
inputs only. Production always uses the environment's real widget keys.
No repository variables are changed. The run-site landing pages and CTA are
unchanged. Start/ended pages are Base's existing shared pages.

## Actual outbound surface

Uptime has HTTP/keyword/browser probes, runner discovery, canary checks,
webhook/Slack notifications, authentication/notification/watch mail and external
heartbeats (`runners/src/private-runner.mjs`, `public-http.mjs`,
`notification-dispatch.mjs`, `watch.mjs`; `src/domain/monitoring-watch.server.ts`).
Its definition-file/UptimeRobot import reads supplied files; it is not a remote
import-provider connector (`src/domain/definitions/`). It has no subscriber,
Teams, AI, public statuspage or R2/upload features (`seed.json`, `deploy.json`,
`src/domain/public-paths.ts`, `src/domain/notification-destinations.server.ts`,
`CONTRACT.md`). Those Lamp-specific rows do not justify adding features here.

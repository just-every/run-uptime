# Checking another service in the same Cloudflare account

Run Edit Run fleet, 2026-11-16.

## Diagnosis

The hosted scheduled path is `scheduledPublicChecks` in `src/domain/worker-checks.server.ts`, calling `workerProbe` and `publicResponse` in `src/domain/worker-http.server.ts`. Its `fetchDemoRead` delegates ordinary hosted requests to global fetch. It validates public targets and DNS answers before each manually followed redirect. The signed Node runner uses its own socket transport and does not depend on the Workers routing flag.

Before this change, `wrangler.jsonc` and `deploy.json` declared compatibility date `2026-09-08` with only `nodejs_compat`. The older artifact-controller plan in `scripts/deployment/plan.mjs` independently declared the same date and flag. The Vite build emits `dist/server/wrangler.json`; `scripts/local-worker.mjs` and the hosted test runtime consume its date and flags. `management/integration/deployment-spec.json` is regenerated from that output by `pnpm spec:generate`.

Cloudflare documentation read on 2026-11-16:

- [Compatibility flags, Global fetch() strictly public](https://developers.cloudflare.com/workers/configuration/compatibility-flags/#global-fetch-strictly-public), rendered lines 1684–1692: “the global fetch() function will strictly route requests as if they were made on the public Internet.” Without the flag, own-zone requests reach the origin, ignoring mapped Workers and bypassing Cloudflare security settings. This section lists an explicit enable/disable pair, with no date at which strict public routing becomes the default.
- [Fetch, Worker to Worker](https://developers.cloudflare.com/workers/runtime-apis/fetch/), rendered lines 614–615: Worker-to-Worker requests require service bindings or this flag. A service binding would select a different door from the public URL being monitored.
- [Errors and exceptions](https://developers.cloudflare.com/workers/observability/errors/), rendered line 624: error 1042 can mean a same-zone Worker fetch without the flag; it can also mean a workers.dev URL without a serving Worker. A 404 alone therefore does not prove which cause occurred.

The confirmed repository defect is the missing explicit public-routing flag in every Worker deployment configuration. The reported same-account Lamp failure is consistent with that defect, but its original body was not captured here and its precise error remains unverified. The fix adds `global_fetch_strictly_public` in all three configuration sources and regenerates the deployment spec. The existing `2026-09-08` date supports the flag; no date bump or CLI/Base adoption is needed. The built configuration is exercised by the emitted-runtime tests.

## Failure details and limits

A failed HTTP status assertion now includes the actual HTTP status and any numeric `Error 1xxx` label returned in the body. A code names the returned error; it does not independently prove its cause. No arbitrary body text enters the indefinitely retained check reason.

The existing ordinary failure-snapshot API and console details retain the first 16 KiB of the body, under the existing encrypted storage, retention, erasure, literal masks and credential/email redaction policy. A snapshot can report capture unavailable; it is never treated as a healthy result. Reading the body keeps the existing 64 KiB response limit and timeout. Expected-status assertions retain their saved semantics, including deliberately accepted non-2xx statuses. Redirect handling, TLS policy, DNS validation, outbound budgets and signed runner authority are unchanged.

The flag changes routing, not Uptime's target authorization. Explicit loopback, localhost, metadata and private addresses remain refused, including redirect destinations and private DNS answers. The hosted transport still resolves separately after DNS validation and does not offer Node's socket pinning; the flag does not establish new protection against DNS rebinding. Monitoring Uptime's own origin still requires an independent private runner, avoiding recursive self-fetches and self-reported health.

## Evidence and later proof

The existing hosted probe identification journey now uses a workers.dev-shaped target and a sibling hostname under the fixture app's zone. The emitted Worker follows same-origin and cross-origin redirects through the fake DNS/HTTP edge, records a 404 with an Error 1042 page, retains bounded redacted details, retries, and recovers without rewriting history. The edge returns declared responses; it does not simulate Cloudflare's internal routing or prove same-account live behavior. Loopback/metadata admission, localhost and mixed private DNS resolution, and a redirect to loopback are refused through ordinary APIs and the scheduled handler.

The later authorized live round must compare a test Uptime against (1) a separate workers.dev Worker in its own account and (2) a hostname on a zone in that account, each against the identical external request. [OPERATIONS.md](../OPERATIONS.md#public-routing-for-checks-in-the-same-cloudflare-account) names the required successful and failing response receipts. Neither live case was run in this round.

No contract clause claimed; this is the same-account check fix.

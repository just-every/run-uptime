# Changelog

## 0.4.1 — 2026-10-19

Patch release from `main`; previous version 0.4.0. Back up the console archive and database first. Six additive import-door migrations preserve existing monitors, history, incidents, destinations and private settings. No new required settings.

- Deployment automatically moves legacy `production-secrets.json` and `environments/<environment>/secrets.json` settings into `.rer/deploy/<environment>.secrets.env` on the next deploy. It preserves saved owner and mail inputs and every environment's keys, including production's, without manual conversion or rotation. A differing value already kept by rer stops the move with the key name and paths, never secret values. Old JSON files are removed only after verification and are never recreated; fresh installs use only the environment settings files.
- Include the shared import door for moving monitor definitions. Migrations `0050_business_import_door`, `0051_import_custody_replace`, `0052_import_door_apply_failure`, `0053_import_door_scopes`, `0054_business_import_undos` and `0055_business_import_writes` are additive; retain all prior migration files and history.
- Fix archive export and restore on Platform-managed installations by explicitly keeping the Platform migration ledger local. Restore preserves the receiving installation's own permanent migration history; unknown tables still refuse export.
- Generate API and mail test credentials at runtime so Platform's hosted source scan accepts the source without scanner exceptions. Authentication, cleanup and secret-redaction assertions remain enforced.
- Include the release installer journey's corrected label and the runner restart snapshot race fix.
- Keep the recovery journey's keyboard-focus assertion on the same history entry while new scheduled checks arrive. Wait for editor styles and fonts before checking accessibility during client navigation.
- Pin `@runeditrun/rer` to exactly 0.2.66.
- Product screenshot: [scheduled check and recovered incidents at 1440 pixels](.github/assets/release/uptime-0.4.0-monitor-1440.png).

## 0.4.0 — 2026-10-19

Minor release from `main`: many new check types, routing and reporting features, and thirteen additive migrations. `@runeditrun/rer` is pinned to exactly 0.2.65. Monitors, history, incidents, destinations and private settings are kept on upgrade.

### Back up first

Before upgrading a hosted installation, export the product archive from **Runner / archive** in the console and back up its database with `npx wrangler d1 export <database> --remote --output exports/<database>.sql`. Keep `.rer/deploy` and your private settings. For a local installation, stop dev and run `rer export --output exports/uptime.rer`.

### What you get

- **More check types.** TCP ports, DNS records (with an authoritative-server resolver), TLS certificates and domain registration expiry run in the hosted Worker or a private runner. UDP request/response, ICMP ping (IPv4 and IPv6), SMTP/POP3/IMAP mail checks and multi-step API transactions need a private runner.
- **Fuller HTTP checks.** Complete status, body, regular-expression, header, JSON and response-time assertions; monitor-bound request credentials kept on the runner; explicit TLS trust exceptions (pinned fingerprint, private CA, or acknowledged ignore) for legacy targets.
- **Slow-response alerts** separate from outages, with their own notices and report time.
- **Heartbeat jobs.** Start, success and failure receipts with exit codes and a masked output excerpt, run durations and late runs, cron-style schedules, and a separately issued scheduler URL. The console shows each key once with ready-to-run curl, wget, Bash, crontab, systemd, Kubernetes, GitHub Actions and Windows examples.
- **Alert routing.** Route confirmed incidents by monitor, service and group, with per-contact delays, outage reminders and recoveries sent to the same recipients as the trigger.
- **Custom webhooks.** Request templates, methods, form or query delivery, local header values and optional HMAC signing, with a request preview.
- **Incident work.** Owner-only notes and comments with visible edit history, root-cause categories and a timeline beside the monitoring evidence; incident notices in the owner's saved time zone.
- **Failure evidence.** Redacted HTTP failure snapshots, bounded connection diagnostics and optional redacted failure-page screenshots, with scoped evidence sharing.
- **Reports and reads.** Period reports with US time zones, SLA targets and PDF/CSV export; incident CSV; a versioned read API (`/api/v1`) for monitors, uptime, response times and incidents; scoped Prometheus metrics and a Grafana dashboard.
- **Catalog operations.** Search and filter by project, environment, service, group, tag and owner; bulk add, label, pause, resume, clone and plan maintenance; recurring maintenance windows.
- **Private locations.** Scoped buyer-network runner grants for private HTTP, TCP and browser checks.
- **Browser flows** (runner only): isolated Chromium, Firefox and WebKit journeys with desktop and phone profiles and redacted failure artifacts. See [Browser flows](docs/browser-flows.md) for what is supported.
- **Moving in.** Definitions previews read UptimeRobot v3 monitor lists and logs, Pingdom HTTP check details and Better Stack heartbeat pages. New monitors arrive paused.
- **Fixed before release** (found by the release gate on a hosted installation upgraded from 0.3.0): the console archive export refused with "Invalid auxiliary archive attempt" because `0049` copied the console's check-start lease into the delivery history; `0050` removes it. Restoring an archive into a fresh hosted installation refused with "Restore requires empty installation" because the receiving owner's own sign-in email counted as data; it no longer does.
- The catalogue line is now one plain sentence: "Monitor your sites and scheduled jobs, track outages and notify your team."
- Product screenshot: [a recovered incident on a scheduled local check at 1440 pixels](.github/assets/release/uptime-0.4.0-monitor-1440.png).

### Upgrading from 0.3.0

Migrations `0038_cron_runs`, `0039_incident_work`, `0040_alert_routes`, `0041_heartbeat_jobs`, `0042_webhook_templates`, `0043_notification_preferences`, `0044_contact_schedules`, `0045_slow_acknowledgements`, `0046_heartbeat_url`, `0047_failure_snapshots`, `0048_failure_page_policy`, `0049_auxiliary_attempts` and `0050_auxiliary_kick_lease` are applied. All are additive; existing rows are kept, except that `0050` removes the console's check-start lease, which `0049` had copied into the delivery history.

A hosted installation deployed with 0.3.0 may still have `.rer/deploy/production-secrets.json` and `.rer/deploy/environments/<environment>/secrets.json`. The Unreleased deployment update moves their saved owner, mail and environment settings into `.rer/deploy/<environment>.secrets.env` automatically, preserving existing keys. Keep these files and the deployment records when upgrading; follow the [current upgrade guidance](docs/deploy.md#update-an-existing-deployment). No manual secret-copy step or rotation is needed with that update.

### Not in this release

- No SMS, voice, phone push, Microsoft Teams, Discord, Telegram, Zapier or Make delivery; no on-call paging or Lamp status-page handoff; no Terraform provider; no page-speed or real-user monitoring; no third-party status catalog; no Site24x7 or Checkly-style migrations; no SSO, SCIM or multi-factor sign-in.
- Several target clauses are partial: see the Status table in [CONTRACT.md](CONTRACT.md).
- The homepage's "Pinned connections" applies to private-runner checks; hosted Worker checks validate every DNS answer and redirect but cannot pin the connection ([Security](docs/security.md)).
- The homepage's heartbeat line needs a private runner on a hosted installation: the Worker alone does not evaluate heartbeats.
- The homepage still says there are no ping or browser checks; this release adds both for private runners.

### Known issues

- Slack delivery is covered by local tests with a fake Slack edge; this release's gate did not post to a real Slack workspace.
- A hosted Worker cannot reach another Worker's `workers.dev` address on the same Cloudflare account: monitors and webhooks aimed at one return HTTP 404 there.
- Hosted scale beyond the documented [Limits](docs/limits.md) is not load-tested.

## 0.3.0 — 2026-10-16

Minor release: adds the Managed mail provider. No migrations since 0.2.0; existing data and private settings are preserved.

- Hosted public checks start during authenticated console activity while a new Cron schedule activates. Discovery and heartbeat screens explain their private runner requirement.
- JSON assertion failures show bounded diagnostics, with values redacted for sensitive paths and credentialed requests.
- Relay rate limits respect Retry-After; ambiguous sends remain uncertain and are never automatically resent.
- Local sign-in uses rer dev’s private owner handoff; captured-mail pages are removed.
- Product screenshot: [scheduled check and recovered incident at 1440 pixels](.github/assets/release/uptime-0.3.0-monitor-1440.png).

- Mark credential fixtures and examples explicitly synthetic so hosted source checks accept them.

- Managed hosting sends sign-in links and email notifications through the RER mail relay, with no provider account or API key to enter. Configure fills and hides `MAIL_PROVIDER`, `MAIL_FROM`, `MAIL_RELAY_URL` and private `MAIL_API_KEY`; Assisted and Free keep their existing SendGrid, Resend and Cloudflare Email Sending options.
- Pin `@runeditrun/rer` to exactly 0.2.24 and adopt its Base mail adapter: Managed mail sends from Workers, refuses relay redirects and supports relay-stamped automatic-mail headers.
- RER Open app links to `/signin?login_hint=<email>` prefill the email field through Base's shared sign-in page.

## 0.2.0 — 2026-10-15

`@runeditrun/rer` is pinned to exactly 0.2.20.

### Hosted installs need no runner for public checks or alerts

- Hosted public HTTP and keyword checks run in the Cloudflare Worker every minute, with the same immutable claims, retries, external check and evidence acceptance as a private runner. A private runner is optional; add one for private networks, heartbeats or runner-local credentials.
- The hosted Worker sends signed JSON webhook and Slack incoming-webhook alerts itself, as it already did email. It uses the payloads a private runner sends and the same custody: one attempt per event and destination, never resent after an uncertain result, and whichever of the Worker or a private runner claims a delivery first is the only one that sends it. Before, a hosted install without a runner queued these alerts forever.
- The runner contact indicator (Notifications and Runner / archive) reflects only an authenticated private runner's requests. The Worker's own checks no longer mark it Fresh. Notifications says when the installation sends queued notifications itself.
- Each scheduled run stays within the Workers Free plan's 50 outbound requests: at most 35 go to public checks and the rest to notifications and the watch. A check that does not fit waits, still due, for the next minute's run; a check that runs out partway through is Unknown with a "Not checked" reason, never a target failure. Retries and shared external checks reuse one DNS answer per run. See [Limits](docs/limits.md).
- A target whose hostname does not resolve (NXDOMAIN, or no A or AAAA records) is a failed check with that cause, so a lapsed domain or deleted DNS record opens an incident. This applies to hosted checks and private runners. A resolver error or a private-address answer stays a runner problem (Unknown).
- A monitor or external check on the app's own address is refused at save with a pointer to a private runner, and an existing one or a redirect back to the app records Unknown instead of a false failure: a Worker cannot fetch its own workers.dev address.
- Worker checks identify themselves as `uptime-worker/0.2.0` in their User-Agent.

### Owner access, onboarding and incidents

- `rer signin [--environment NAME]` prints a one-time owner sign-in link from the deploying checkout's Cloudflare credentials, with no email needed (additive migration `0037_owner_signin`).
- `/login` no longer offers the first-owner claim once an owner exists.
- The console issues a heartbeat monitor's one-time key with its ready-to-run curl command.
- Each monitor shows its incident history (start, end, duration and evidence), also at `GET /api/monitors/:id/incidents`.
- A signed-in member who is not the owner lands on an access-denied page instead of the console.
- First-run setup starts `example.com` in one step, shows an editable external-check field when a proposal is refused, and no longer mentions browser checks. The healthy digest waits until monitors exist.
- The monitor reason shows confirmation and recovery progress capped at their thresholds (`1/1`, not `8/1`).
- Browser flows are no longer part of the documented feature set ([Limits](docs/limits.md)).

### Deployment

- rer 0.2.20 checks before building that production sign-in can send email, using its shared names. Set `MAIL_PROVIDER` (also for SendGrid), `MAIL_FROM` and `MAIL_API_KEY` on every `rer deploy`, including updates; Uptime stores `MAIL_API_KEY` under the selected provider's own setting, so saved settings and Worker secrets are unchanged.
- rer 0.2.20 retires the separate `rer outbox` command; run `rer dev` again to print its `RER_OPEN` link. The `outbox` package script is removed.
- `pnpm run health -- --environment NAME` accepts the forwarded `--`, and `rer deploy --dry-run` prints the actual resource plan.
- A named environment deployed again after `rer deploy --environment NAME --remove --yes` gets fresh `SESSION_SECRET`, `SETUP_TOKEN` and `UPTIME_RUNNER_KEY` instead of the values left in its settings file, which for an environment deployed before per-environment secrets were production's.
- Each named deploy environment now also has its own `SESSION_SECRET` and `UPTIME_RUNNER_KEY` in `.rer/deploy/environments/<environment>/secrets.json`, so a session or runner key from one environment is refused by another; environments deployed earlier keep their values. First-run setup names the environment's settings file, and `node scripts/runner-start.mjs --environment NAME` starts that environment's runner.
- Each named deploy environment now has its own one-time setup token, kept in `.rer/deploy/environments/<environment>/secrets.json`; the deploy hook returns the token it deployed so rer can claim the owner, and environments deployed earlier keep their token.

### Upgrading from 0.1.3

Only migration `0037_owner_signin` is applied; monitors, definitions, history, incidents, destinations and private settings are kept. There are no new required Worker settings.

## 0.1.3

- Runner handoffs no longer reset incident confirmation or recovery while older undelivered checks await a skip decision; skipped checks still show missing coverage.
- Console controls added while an action is finishing stay disabled until its latest read completes, and an unexpected concurrent action asks the operator to wait rather than silently dropping the click.
- Browser flows remove their private profile folder even if the runner is killed while the browser is launching.
- The Verify job limit increases from 30 to 40 minutes because the complete suite can take 29.7 minutes.

- Browser flows also remove a credential the site echoes with its case changed and percent-encoded (an accented sign-in address in a lowercased path) or encoded twice (`%2540`); a check that a lagging vantage skipped no longer resets confirmation or recovery, so an incident both vantages see is confirmed while one of them lags steadily by more than an interval.
- Browser flows remove credential values before cutting a URL to 300 characters, so a value across the cut is no longer stored nearly whole, and match each character as typed or percent-encoded, so a sub-addressed sign-in echoed with only its '@' escaped is removed too; a vantage that falls behind skips the checks it missed rather than running two of its own checks back to back, and each skipped check keeps that vantage's part as missing evidence.
- Browser flows replace every named credential value in their trace, final URL and reason with `[credential]`, keep profiles in a runner-owned 0700 folder that a hard stop cannot leave behind, label a recovery after a type change as a changed definition, and hold the flow limit under concurrent saves; an email whose claim release fails returns to the queue when its claim expires and is sent once, and each vantage keeps a full interval between its own scheduled checks.

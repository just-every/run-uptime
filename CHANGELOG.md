# Changelog

## Unreleased

- Retry signed webhook incident deliveries with a stable ID, bounded stored backoff, Retry-After and owner-set limits; retain portable attempt metadata and erase it with its destination.
- **Fallback contacts (DELIVERY-002).** A selected route can name up to three ordered fallback contacts and an uncertain deadline (default 2 minutes). A failed trigger escalates at once, an uncertain one after the deadline; the console shows both outcomes and an ended chain. Email attempts are recorded too, and archives carry delivery records without request bodies. Adds migration `0060_notification_fallback.sql`.

Adds four migrations (`0057_location_names.sql`, who named each location; `0058_cleanup_debt_and_effect_grants.sql`, retained cleanup debt and live-effect grants; `0062_external_check_follow.sql`, monitors following the External check URL in Settings; `0063_location_join_keys.sql`, one-time location join keys); no new required settings.

- **Locations and pass/fail, done properly.** A monitor's **Check from** is a tick list of your locations (up to three a monitor; two for a browser flow), with the rule for Down written beside it; new monitors start from every live location. When a location joins, **Check all monitors from here too** (on by default) adds it to every monitor with room, in one step. **Add location** gives one command that works from any machine with Node 22 and network access to this Uptime, with no checkout: it downloads the runner from `/uptime-runner.mjs` and joins with a one-time key, which the panel stops showing once the location joins. The External check URL lives in Settings and reaches every monitor's next check without saving the monitor; a monitor's own URL sits under **Advanced**. Monitors that copied the installation's URL before this follow Settings; other URLs stay their own.

- **Safe setup and teardown (API-004).** API transactions and browser flows run bounded setup and cleanup fixtures (up to 3 attempts each); cleanup still runs after a failure or a cancellation, and a cancelled run reads Unknown. A cleanup that cannot finish becomes cleanup debt the owner resolves with a note on the monitor page; at 3 open debts setup stops. Stripe live-mode keys, `livemode: true` responses, refunds and steps marked `effect` need an exact, expiring grant with a spend limit.

- **Reviewed provider components (DEPENDENCY-001).** Linked Statuspage-compatible sources now propose their overall status and a bounded set of separate component monitors, initially unticked and keyed by component ID. Adoption retains the provider name, `dependency` tag and a line identifying the status as the provider's own claim. Review another component before adoption, or change it later through an ordinary monitor revision. Provider failure has its own monitor state and ordinary incident policy; the claim is contextual evidence and does not change application state, evidence, routes or thresholds. Missing, renamed or removed components and unavailable sources are Unknown, never Healthy. DEPENDENCY-002's catalog and no-incident dependency notices and FOLLOWUP-001 correlation remain open. No migration or new setting is required for this change.

- **The console follows the owner's three jobs: monitors, locations, and each monitor's pass/fail rules.** The sidebar reads Monitors · Locations · Notifications · Archive · Settings. Setup asks only for the website, and that is optional; the External check URL (https://example.org/ by default) moved to Settings. With no monitors, setup and `/app` open the form for the first monitor. **Locations** lists where checks run from, and **Add location** shows the runner command, watches the new location join, and renames or removes locations. A location is named after the place its runner connects from (Cloudflare's `request.cf` city, region or country), or a short generated name, and `PATCH /api/runners/:id` renames it. An existing `owner-network` location takes a generated name on upgrade and its place's name on its runner's next contact. Each monitor's **Up or down** card lists what one check must see, when it is down, when it is back up and where it is checked from. The editor shows the same rules as a list with **Add rule**; JSON value and response time replaced the raw "Additional checks (JSON)" box. **Archive** holds the backup and the monitor files (import, export, past imports) that were "Definitions"; **Settings** holds the External check URL, metrics keys, operators and Business imports. A runner's own `UPTIME_NETWORK_LABEL` is now ignored rather than checked, so a renamed location keeps working with its old command.

## 0.4.3 — 2026-10-20

Patch release from `main`; previous version 0.4.2. One additive migration, `0056_import_door_archive.sql` (the import door's archives); keep every earlier migration file and history. No new required settings. Back up the console archive and database first, as for any upgrade; monitors, history, incidents, destinations and private settings are kept, and a native or Platform-managed archive made by 0.4.2 restores into 0.4.3.

- **Cutover status for Run Edit Run.** `POST /api/rer/cutover-status` answers a signed `cutover-status` grant and a `{since}` time with each alert destination's host and its deliveries sent and accepted since then, and the monitors and incidents created since. Counts, ids and hosts only; it writes nothing.
- **The Business import door is Base's, byte for byte.** Every recorded Base copy moves to rer 0.2.71 and `@runeditrun/rer` is pinned to exactly 0.2.71. The door's reversal-policy divergence is gone: Uptime's undo keeps and reports a monitor edited or enabled since through Base's `reversalPolicy` option at job creation. The door gains Base's `archive` and `restore-check` actions.
- **Run Edit Run's UptimeRobot exports import.** A Business upload is refused only when a request field Uptime withholds holds a live credential by the import door's own rule. An export from rer, which removes credentials and marks them (`[removed]`, `removed@`, `?api_key=removed`) but keeps user names, other headers and request bodies, now imports; Uptime withholds every request field from the monitors, plans and records it keeps, and a monitor whose URL carried credentials is refused alone with its reason.
- **Erasure reaches every archive naming the monitor.** Erasing a monitor now also withdraws the bytes of a Business archive outside the source it retires when that archive names the monitor, including one that is the only copy left; the archive's header stays and `restore-check` answers 410.
- **`?keyword=` and `?author=` URLs import.** The import kit now reads a query parameter as a credential only by its whole name parts, so a monitor URL such as `https://example.com/status?keyword=up` previews and imports like any other. A real credential parameter (`?api_key=`, `?access_token=`) still refuses its entry alone, with its reason.
- **The console refreshes in place.** The console still reads new results every few seconds, but each view now updates only what changed instead of rebuilding itself. Open sections stay open, typed form values stay, and the page no longer flashes its loading placeholders or jumps its scroll position.
- **Homepage and docs tidy-up.** The run site's hero drops its second free-and-open-source line (the alternative line keeps its place), and the docs menu no longer draws a marker over the current page's name.
- Product screenshot: [scheduled check and recovered incidents at 1440 pixels](.github/assets/release/uptime-0.4.0-monitor-1440.png).

### Known issues

- A response body larger than 64 KiB fails the check as a target failure (`body-limit`), even when the status is correct. Point a monitor at a smaller page, such as a health endpoint, until a later release reads large pages.
- The limits listed under 0.4.0 still apply: hosted heartbeat evaluation needs a private runner, and hosted Worker checks cannot pin connections.

## 0.4.2 — 2026-10-19

Patch release from `main`; previous version 0.4.1. No new migrations and no new required settings. Back up the console archive and database first, as for any upgrade; monitors, history, incidents, destinations and private settings are kept.

- **Business-provisioned installs.** When Run Edit Run installs Uptime for an approved Business plan (`RER_IMPORT_DOOR=on` with its owner-claim trust), the owner's first claim opens the Business import door. A later claim changes nothing, the owner can still switch it off and on in **Runner / archive → Business imports**, and a self-hosted `rer deploy` keeps it off.
- **Runner status for Run Edit Run.** `POST /api/rer/runner-status` answers a signed `runner-status` grant with the private runner's contact state (`fresh`, `stale` or `never`) and time, never the runner key. Without a valid grant it refuses.
- **Steadier pages on slow connections.** Moving between the monitor list and the monitor editor no longer drops the console theme while the editor loads, so navigation keeps full-size targets. The slow-response guide link on a monitor's page is a full-size target even before its panel styles arrive.
- **Upgrading a 0.4.0 installation keeps its keys without a manual step.** Uptime 0.4.0 deployed its own saved session and runner keys over the ones rer generated beside them. The one-time move of those settings into `.rer/deploy/<environment>.secrets.env` now keeps the keys the installation actually uses, so signed-in owners, the private runner and saved owner and mail settings carry on after the upgrade. The deploy names the keys it kept, never their values. A differing owner input, such as the owner email, still stops the move without overwriting anything.
- Every recorded Base copy moves to rer 0.2.66. `@runeditrun/rer` stays pinned to exactly 0.2.66.
- Product screenshot: [scheduled check and recovered incidents at 1440 pixels](.github/assets/release/uptime-0.4.0-monitor-1440.png).

### Known issues

- The Business import door keeps its recorded reversal-policy divergence from Base until Uptime adopts the rer release carrying Base #298 (rer 0.2.67).
- The rer 0.2.67 deploy fixes (a declared `MAIL_PROVIDER_API_KEY` and a provider budget scaled to pending migrations) are not in this release; it stays on rer 0.2.66.
- A response body larger than 64 KiB fails the check as a target failure (`body-limit`), even when the status is correct. Point a monitor at a smaller page, such as a health endpoint, until a later release reads large pages.
- The limits listed under 0.4.0 still apply: hosted heartbeat evaluation needs a private runner, and hosted Worker checks cannot pin connections.

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

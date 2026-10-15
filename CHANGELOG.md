# Changelog

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

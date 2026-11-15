## 0.5.12 — 2026-11-15

Patch release from `main`; previous version 0.5.11. Mail and API checks have dedicated editors, monitoring-only accounts can read the console without write controls, and Pingdom imports preserve more check settings. Monitor details, erasure receipts and installed PDF reports are easier to use. The checkout keeps its current `@runeditrun/rer` pin at 0.2.113. No migration or new required settings; monitors, history, incidents, destinations and private settings are kept on upgrade.

Product screenshot: [scheduled check and recovered incidents at 1440 pixels](.github/assets/release/uptime-0.4.0-monitor-1440.png), taken on 0.4.0, before the console changes of 0.5.0 through 0.5.12.

### Check editors and monitoring access

- **Configure mail checks with named fields.** Choose SMTP, POP3 or IMAP, the server, port, connection security and runner-local credential reference. An SMTP delivery check can also name a dedicated receiving mailbox and its receipt timeout. Credentials remain on the private runner.
- **Build API transactions step by step.** Add, remove and reorder setup, request and cleanup steps, with request headers and bodies, response assertions, variables and captured values. Live actions still require the owner's grant, and authentication stays on the runner.
- **Read the console with monitoring-only access.** Read-only accounts can open monitor lists, check history, incidents and reports. Monitoring-only views hide write controls and avoid requesting configuration and private grant details; existing permission checks still apply.
- **Read saved checks and erasure results more easily.** Full check details present the saved criteria and current status in readable form, including heartbeat timing. Monitor erasure receipts group removed records by purpose. The original receipt and exact per-table counts remain in the downloadable receipt.

### Imports, protocol checks and reports

- **Keep more Pingdom check settings during reviewed import.** Supported SMTP and ping checks map to native mail and ICMP checks. DNS imports retain the exact named server and expected address, queried over DNS/TCP port 53. Unsupported credentials or request/response semantics are reported rather than silently reduced to a simpler check.
- **Preserve certificate and response-time rules.** A Pingdom certificate-expiry failure window becomes a separate TLS monitor; pause or resume it together with its HTTP monitor. Imported response-time thresholds become slow-response rules. The DNS named server and TLS expiry failure window are visible and editable in the monitor form. Private-runner requirements and unsupported cases remain explicit.
- **Keep the independent health probe separate.** A private runner's external health check no longer inherits the monitored site's slow-response rule.
- **Download PDF reports from an installed app.** Report font requests now use the installation's origin instead of an unrelated host. The monitor guide derives its check choices and admission limit from the current editor and policy.
- Dependency updates on main include Vite 8.2.4, undici 7.30.1 and transitive Zod 4.6.6.

### Local sign-in and commands

- **Open the local app from the terminal.** The sign-in gate explains that the app runs on your computer and points to the private link printed by `rer dev`, or to `rer dev --as owner` from the project folder. It shows the `rer dev --as <email>` guidance when an invited or active person is available beyond the owner and built-in personas. Keep the printed link private because it gives access to the local installation; an enrolled second factor is still required.
- **A refused local sign-in link explains what to do.** A browser that follows an unavailable local one-click link gets a plain explanation to open the link from the app or run `rer dev --as` with the person's email from the project folder. Cross-site one-click requests without the explicit local key are refused.
- **Run a downloaded JavaScript tool with rer's runtime.** The local command guide now documents `"$HOME/.local/bin/rer" run --script ./tool.mjs` and its arguments, so the tool needs no separate Node or pnpm on PATH. For later terminals, the run instructions explain adding `$HOME/.local/bin` to PATH for bare `rer` commands.

### Upgrading from 0.5.11

Update an existing checkout with `pnpm install --frozen-lockfile`, then deploy as usual. This installs the checkout's pinned `@runeditrun/rer` 0.2.113, replacing 0.2.108 from 0.5.11. No migration is added and no new setting is required. A backup is still good practice before an upgrade (see the 0.5.4 notes below for the steps).

### Known issues

- Heartbeat output stored by 0.5.6 or earlier is not rewritten. If earlier job output may have contained a key, rotate it; pattern-based redaction can still miss a secret with no recognizable shape or label that you have not listed under **Output text to mask**.
- A monitor CSV exported from UptimeRobot still cannot be imported: only the v3 JSON, an event-log CSV and Uptime's own `url` CSV are read.
- Restoring an installation archive does not bring back the list of erased people. If, after a restore, your Business pairs again and its team list still names a person you had erased, that person could be invited again.
- A company that has signed an agent policy but has never sent any company settings is treated as running: its decision feed answers with an empty page instead of a refusal. No company token is accepted and no decision is shared in that state.
- A response body larger than 64 KiB fails the check as a target failure (`body-limit`), even when the status is correct. Point a monitor at a smaller page, such as a health endpoint, until a later release reads large pages.
- The limits listed under 0.4.0 to 0.5.8 still apply: hosted heartbeat evaluation needs a private runner, hosted Worker checks cannot pin connections, a member who is not the owner and has enrolled a second factor still verifies each new sign-in with the command line, and many features are partial; see the Status table in [CONTRACT.md](CONTRACT.md).
- Completely bounded-memory archive transfer and restore, operation at 500 monitors with 90 days of history, time-range selection and console controls for chunk transfers remain unestablished or unavailable as described in 0.5.10.

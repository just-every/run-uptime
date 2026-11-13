## 0.5.10 — 2026-11-13

Patch release from `main`; previous version 0.5.9. Archive transfers can resume after interruption, the installation admits up to 500 monitors, and agents can edit internal incident notes. Redirect failure snapshots and API manual-check approval accounting are corrected. The owner API also offers an explicitly reviewed Auth0 source check; Auth0 monitoring remains unavailable. No migration, no new required settings, and the pinned `@runeditrun/rer` stays at 0.2.108. Monitors, history, incidents, destinations and private settings are kept on upgrade.

Product screenshot: [scheduled check and recovered incidents at 1440 pixels](.github/assets/release/uptime-0.4.0-monitor-1440.png), taken on 0.4.0, before the console changes of 0.5.0 through 0.5.8.

### Archives and monitor admission

- **Resume an interrupted archive transfer.** `rer export` and `rer import` now use digest-checked chunks and keep a private checkpoint after an interrupted job. Repeat the same command with the same absolute archive path after verifying a second factor and supplying a current `UPTIME_ACCESS_COOKIE`. A changed input file or a different installation or owner is refused. Large individual records and the erasure journal travel in chunks too. Restored monitors stay paused, delivery stays quarantined, and receiving-owner settings stay local. See [the transfer guide](docs/data.md#resumable-chunk-transfers) for the native API and bounds.
- **Admit up to 500 monitors.** Native creation, definition imports, reviewed catalog batches and archive restore now share this admission limit. It is a limit on accepted definitions, not a claim of measured monitoring capacity. Chunk transfers accept up to 64 MiB of encoded payload and one million rows per table; the ordinary console JSON archive route retains its 2 MiB and 10,000-row limits.

### Incident notes, checks and provider review

- **Edit an internal incident note through an agent.** The incident-note tool accepts an explicit edit with the comment's current version. It retains edit history, checks the author's or administrator's native permission and sends no mentions. A stale comment version is refused.
- **Account for every cleanup step before approving an API manual check.** Approval now considers all saved cleanup steps that could add cleanup debt, rather than qualifying only a sequence with exactly one cleanup step.
- **Keep redirect failures distinct from HTTP responses.** A private-runner redirect refusal now records a statusless failure snapshot instead of carrying the previous hop's HTTP status.
- **Review an Auth0 tenant disclosure before a diagnostic source check.** Through the owner API, review and explicitly confirm sending one named tenant domain to Auth0's fixed official RSS endpoint. Changing the tenant requires a new review. This checks the source only: Auth0's status interpretation remains unqualified, its status stays Unknown, and it cannot be followed as a monitored provider.

### Upgrading from 0.5.9

No migration is added and nothing in your settings changes. Update an existing checkout with `pnpm install --frozen-lockfile`, then deploy as usual; a backup is still good practice before any upgrade (see the 0.5.4 notes below for the steps). Older JSON archive payloads remain readable with their original size bound. Completely bounded-memory transfer and restore, and operation at 500 monitors with 90 days of history, have not been established; archive validation still materializes the complete graph in memory. Time-range selection and console controls for chunk transfers remain unavailable.

### Known issues

- Heartbeat output stored by 0.5.6 or earlier is not rewritten. If earlier job output may have contained a key, rotate it; pattern-based redaction can still miss a secret with no recognizable shape or label that you have not listed under **Output text to mask**.
- A monitor CSV exported from UptimeRobot still cannot be imported: only the v3 JSON, an event-log CSV and Uptime's own `url` CSV are read.
- Restoring an installation archive does not bring back the list of erased people. If, after a restore, your Business pairs again and its team list still names a person you had erased, that person could be invited again.
- A company that has signed an agent policy but has never sent any company settings is treated as running: its decision feed answers with an empty page instead of a refusal. No company token is accepted and no decision is shared in that state.
- A response body larger than 64 KiB fails the check as a target failure (`body-limit`), even when the status is correct. Point a monitor at a smaller page, such as a health endpoint, until a later release reads large pages.
- The limits listed under 0.4.0 to 0.5.8 still apply: hosted heartbeat evaluation needs a private runner, hosted Worker checks cannot pin connections, a member who is not the owner and has enrolled a second factor still verifies each new sign-in with the command line, and many features are partial; see the Status table in [CONTRACT.md](CONTRACT.md).

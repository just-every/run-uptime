A definition file lists your monitors as reviewed text, so you can keep them in version control, review a change before it happens, and move monitors between installations. Uptime always shows you what a file would do before it changes anything, and it applies exactly what you saw.

## The file

The default name is `uptime.monitors.json`. Version 2 adds the [browser flow](/docs/monitors#browser-flow) type; a version 1 file is still read and cannot hold a flow, and an export always writes version 2:

```json
{
  "format": "uptime.monitors",
  "version": 2,
  "monitors": [
    {
      "name": "Shop home",
      "type": "http",
      "url": "https://shop.example.com/",
      "method": "GET",
      "assertions": { "status": 200 },
      "intervalMs": 60000,
      "timeoutMs": 5000,
      "retries": 1,
      "probes": ["local-a"],
      "failureQuorum": 1,
      "confirmSlots": 2,
      "recoverSlots": 2,
      "freshnessMs": 180000
    },
    {
      "name": "Nightly backup",
      "type": "heartbeat",
      "heartbeat": { "maxAgeMs": 86400000 },
      "intervalMs": 3600000
    }
  ]
}
```

Each entry uses the same fields as the monitor editor, and the same validation checks them: `name`, `type` (`http`, `keyword`, `heartbeat` or `flow`), `url`, `method`, `assertions`, `intervalMs`, `timeoutMs`, `retries`, `probes`, `failureQuorum`, `confirmSlots`, `recoverSlots`, `freshnessMs`, `heartbeat` (`maxAgeMs`, at most one day), `flow`, `enabled` and `maintenanceUntil`. A header assertion takes only `name` and `equals`, and a JSON assertion only `path` and `equals`. Fields you leave out take the editor's defaults. Monitors are matched to your installation by name.

A flow entry carries its `flow` (intent, steps, required outcomes) and no HTTP assertions:

```json
{"name": "Sign in", "type": "flow", "url": "https://app.example.com/login", "intervalMs": 300000,
 "flow": {"intent": "A person can sign in and reach their dashboard",
  "steps": [{"kind": "goto", "url": "https://app.example.com/login"},
            {"kind": "fill", "target": {"label": "Password"}, "credentialRef": "app-login-password"},
            {"kind": "click", "target": {"role": "button", "name": "Sign in"}}],
  "outcomes": [{"id": "dashboard", "what": "url", "value": "/dashboard"}]}}
```

A flow is refused, with the entry named, for an unknown step kind or field, a `fill` that carries a value instead of a `credentialRef`, a script, expression or selector engine other than plain CSS, an interval under 5 minutes, more than 20 steps or 8 outcomes, a version 1 file, or an installation already holding 5 flows. A secret never belongs in the file: a credential is a file on the runner (see [The runner](/docs/runner#browser-flows)). An edit that removes a required outcome previews as a change, saves a new revision, and shows in the monitor's revision history as a reduction.

Some things never go in the file:

- **Secrets.** Request headers, bodies and passwords are refused. A check that needs them names an installation-local credential instead, with `"request": { "credentialRef": "partner-api" }`. The preview lists that entry as needing a local credential.
- **Installation authority.** Runner assignments, canary URLs, heartbeat tokens and notification destinations stay with the installation.
- **On and off.** `enabled` and `maintenanceUntil` are written when you export, so you can read them, but a file never changes them. New monitors always arrive paused, and an existing monitor keeps its current state.

A file may be at most 2 MiB and list at most 500 monitors, and it must be UTF-8 JSON. An unknown field, including one inside a header or JSON assertion, or a duplicate name refuses that entry, and the reason names it. An installation still holds at most 100 monitors.

## Preview, then apply

In the console, open **Definitions**, choose or paste a file and select **Preview**. A preview writes nothing. It shows the counts first, then one row per entry:

- **Create**: a new monitor, which arrives paused.
- **Unchanged**: it matches the monitor of the same name.
- **Change**: the fields that differ. Applying it saves a new immutable revision, like an edit in the editor, and keeps the monitor's enabled and maintenance state and its runner assignments. A heartbeat keeps its token, so your jobs keep calling the same URL. A change that turns a heartbeat into another type retires its token, and the preview says so.
- **Refused**: the entry is invalid; the reason says why.
- **Unsupported**: an imported entry Uptime cannot run.

The preview ends with a plan digest. **Apply** sends that digest back. If anything changed since the preview, such as a monitor edited in another tab, the apply is refused and nothing is written; preview again. Otherwise every create and change commits together, or none do. A file never enables a monitor, issues a heartbeat token, sends a notification or changes a destination.

A new revision's first check is due no sooner than the shorter of its old and new intervals after the monitor's previous check started, so an applied change never makes checks run closer together than either cadence.

## Undo

Each apply is recorded as a batch. **Undo this batch** pauses the monitors it created and restores the monitors it changed to their earlier settings, as a new revision. A restored heartbeat keeps its token. A monitor edited or enabled after the import is left alone, and the undo says so. Undo never removes checks, results or incidents. To remove a monitor completely, erase it from its page.

Batches travel in a private archive as history. In the installation that restores the archive they are marked as coming from an archive and cannot be undone there.

## Export

**Export current definitions** downloads your monitors as this file. Previewing that file against the same installation shows every entry as unchanged.

## From the command line

With `rer dev` and `rer preview` stopped, the same engine runs from a terminal:

```sh
node scripts/definitions.mjs preview --input uptime.monitors.json
node scripts/definitions.mjs apply --input uptime.monitors.json --digest PLAN_DIGEST
node scripts/definitions.mjs export --output uptime.monitors.json
node scripts/definitions.mjs batches
node scripts/definitions.mjs undo --batch BATCH_ID
```

`validate` is `preview` that exits with status 1 when any entry is refused or unsupported, which suits a review check. Add `--json` for machine output. Changes from the command line are recorded as made by the local command.

Moving from UptimeRobot uses the same preview and apply. See [Moving from UptimeRobot](/docs/moving-from-uptimerobot).

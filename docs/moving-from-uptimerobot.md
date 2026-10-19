You can bring your UptimeRobot monitors into Uptime without risking either service. Uptime reads a saved copy of your monitor list, shows you what it would create and what it cannot reproduce, and creates nothing until you apply. Every imported monitor arrives paused, so your UptimeRobot checks keep running until you have checked the Uptime ones and turned them on.

## Save your monitor list

Uptime does not sign in to UptimeRobot or call it. You save the list yourself from UptimeRobot's API v3 `GET /monitors` endpoint, using a read-only API key:

```sh
curl -s -H "Authorization: Bearer $UPTIMEROBOT_READ_ONLY_KEY" "https://api.uptimerobot.com/v3/monitors?limit=200" > uptimerobot-monitors.json
```

The response is one page, `{"data": [...], "nextLink": ...}`. If `nextLink` is not null, fetch that link too and append the next page to the same file. Uptime reads pages written one after another, or a JSON array of pages. Keep the file private: it can contain your heartbeat URLs and request settings.

## Preview and apply

Open **Definitions** in the console, choose the file and select **Preview**. Uptime detects the UptimeRobot format; you can also choose it under **Source**. The preview counts entries that are importable, importable with listed differences, and unsupported, then shows each monitor with its notes. Apply creates the importable monitors, paused. You can undo the whole import from the batch list. From a terminal, `node scripts/definitions.mjs preview --input uptimerobot-monitors.json` does the same.

## What moves

- **HTTP(S) monitors** become HTTP(S) monitors with the same URL and method. UptimeRobot's default method is HEAD; a QUERY method is unsupported.
- **Keyword monitors** keep their condition: alert-when-missing requires the text (`bodyIncludes`), and alert-when-present requires its absence (`bodyExcludes`). Uptime matches the text exactly, so a case-insensitive keyword is listed as a difference for either condition. An unspecified or unrecognised case setting is also named for review before enabling.
- **Expected status codes.** Exact codes, sets and inclusive ranges move without narrowing the accepted responses. For example, `200, 201, 204`, `200-299` and UptimeRobot's default `2xx, 3xx` keep every accepted status. An unrecognised code or range makes the entry unsupported; the importer never replaces it with 200.
- **Timeouts** move in seconds, within Uptime's range of 0.05 to 10 seconds. A longer timeout becomes 10 seconds, and the preview says so.
- **Intervals** move unchanged from seconds to milliseconds. An interval under 5 seconds or over one day is shown with its number and not imported. If an interval ever had to change, the preview would state it as a cadence change.
- **Heartbeat monitors** become Uptime heartbeats that expect a call within the interval plus UptimeRobot's grace period, up to one day in all. When the interval plus grace is longer than one day, such as a daily heartbeat with a grace period, Uptime keeps the interval and shortens the grace so the total is one day; the preview names the original and the shortened numbers. Their old heartbeat URL stops working for Uptime: issue a new token on the monitor's page and repoint your jobs to it. The preview lists the old URL so you know which jobs to change.

Every imported monitor checks from probe `local-a` on your own runner, and its evidence counts as fresh for at least three intervals. Uptime needs two independent vantages before it calls a target down. With one runner network, enabling a monitor takes the installation's External check URL (change it on Runner / archive), or add a second runner network or give that monitor its own external check URL in its settings.

## What does not move

The preview lists each of these on the monitor it affects. Nothing is dropped without a note.

- **Ping, port, DNS, UDP, API-assertion, visual comparison and dependency monitors** are unsupported by this importer. It maps HTTP(S), keyword and heartbeat monitors. Browser checks are outside the supported public feature set.
- **Authentication, custom request headers and POST bodies** are not imported, because they can hold secrets. The monitor is created with a local credential reference such as `uptimerobot-123456`, which you set up on your own runner before enabling it.
- **Locations and regions.** UptimeRobot's own vantage points are not reproduced. Uptime checks from your runners.
- **Alert contacts and notification settings.** Reconnect destinations in Uptime under **Notifications**. Importing sends nothing to anyone.
- **Status pages** are a different product. Lamp is the public status page product.
- **Maintenance windows.** Set maintenance on the monitor in Uptime.
- **Tags and groups**, and certificate or domain expiry reminders.
- **Ignored certificate errors and turned-off redirects.** Uptime fails a check on a certificate error and follows redirects, validating each hop. The preview notes monitors where UptimeRobot did otherwise.

## Your history stays in UptimeRobot

UptimeRobot's log export is a CSV of past events. Uptime recognises it and counts its rows in a preview, for example "120 rows, provenance: UptimeRobot log export, not stored as evidence". Nothing applies from it, and the preview is cancelled as soon as it is shown, so neither the file nor its plan is stored. No row becomes an Uptime check, incident or state, so old history can never confirm a failure, close an incident or change the 24-hour and 7-day figures. Your Uptime history starts with your first Uptime check.

## What has been tested

The mapping follows the field names in UptimeRobot's published v3 API description. The synthetic-file journey covers preview, paused apply, reading the saved definitions, export and undo, including status sets/ranges and both keyword conditions. Live account extraction, alert-contact mapping and status-page handoff are not implemented by this importer. It has not been tested with an export from a real UptimeRobot account. UptimeRobot does not publish its log export columns; Uptime looks for a date or time column and an event column.

## Owner-approved moves through Business

Business can drive this same saved-monitors mapping through Base's optional import door. It starts off. In **Runner / archive → Business imports**, enable **Allow owner-approved imports from Business** and save. The installation must already have its owner-claim issuer, installation ID, app origin and public signing-key ring configured. Open Runner / archive first to establish its local runner. No UptimeRobot credential is sent to Uptime.

The door accepts saved v3 pages as NDJSON (one `{data: [...], nextLink: ...}` page per line), up to 2 MiB and 500 source records; a source monitor's `id` keeps its identity across moves, and one without an `id` is identified by its position. Grants name the `uptimerobot` namespace; Uptime's server-side source list, the same one the move-in screen uses (`uptimerobot`, `pingdom`, `betterstack-heartbeats`, `uptimerobot-log` and one `uptime.monitors:<id>` namespace per reviewed definition file), refuses any other namespace with 403 `unknown_import_source` before writing anything. Saved pages must not carry request secrets: an upload whose monitors still hold `httpUsername`, `httpPassword`, `customHttpHeaders` or `postValueData` values, Pingdom header values, user names, passwords or post data, a credential-named field such as `apiKey`, or a URL with a user name and password is refused with 400 `source_secrets_withheld` and discarded. Replace each such value with `"[withheld]"`, as the move-in screen does; the entry is then mapped to a local credential reference or refused exactly as the move-in screen does. It uses the existing importer’s supported types, differences, credential references and validation. A record matches the monitor its earlier move created, otherwise the monitor with its name, which it changes in place and leaves running or paused as it was. Imported monitors count toward the installation’s ordinary monitor limit and arrive paused. Catch-ups retain source IDs; Base refuses native edit conflicts and reports missing source records without deleting them.

The signed-grant protocol is documented in [the vendored Base door](https://github.com/runeditrun/base/blob/3478fc15bb18c2f74def8e8906bd308320c7953b/modules/import-kit/src/door/README.md) (rer 0.2.61). The same pipeline is the owner's own import path: **Definitions** and `node scripts/definitions.mjs apply` call `POST /api/operator/import/{uploads,plan,apply,status,reconcile,undo}` with the owner's session, the exact app `Origin` and an `X-Import-Source` header naming the source, whether or not Business imports are on. There is no other import route. Each request needs a fresh short-lived ES256 grant. Upload checks every chunk and the complete bundle hash. Plan writes no native monitor or evidence; apply requires the retained plan’s exact reviewed fingerprint and signed owner approval. Reconcile reads the actual monitors and import provenance. Original bytes, plans and grants stay in this installation and are excluded from portable archives; native definitions and revisions use Uptime’s existing archive.

Business imports appear in **Definitions → Applied batches** with “Approved via Business by” the owner, the approval time and fingerprint; the owner's own door imports read “Approved by”. An apply that fails shows as **Apply failed** with its reason code, never as applied: that plan cannot be applied again, so plan the export again for a fresh approval. If the failed apply had already written some monitors, **Undo this batch** rolls it back first. **Undo this batch** remains available even after Business is switched off or its signing key is revoked. Undo releases the monitors a move created: they stay in Uptime, paused, with their revisions and evidence. Undo leaves a monitor the owner edited or enabled since the move as the owner left it and reports it in the batch; it releases the rest, and the batch reads as undone with its time. Undo snapshots newest first. Each source keeps one lineage, so a later move of the same source is a catch-up of the last applied snapshot, or a new baseline once every snapshot is undone. A new baseline never takes back a released monitor: its plan explains each such record ("Imported before and released by undo or erasure; it stays in Uptime as its own monitor. Erase that monitor to import it again.") instead of offering it as an addition, and an unchanged released record reads as unchanged. Reconcile and catch-up planning read the imported set in a number of queries that does not grow with the set or the chain: in a chain of 15 catch-ups at the 100-monitor limit, every catch-up from the second on plans with the same statement count (the first reads no earlier catch-up's history, so it needs three fewer), and every reconcile after the base import reads the same count.

Erasing a monitor also withdraws the indivisible source exports of its source's lineage and retires that lineage's retained uploads, plans, approvals, failure facts and undo authority, in the same database transaction. The next move of that source starts a new baseline, in which the erased monitor's record can be imported again. Other monitors from that export remain in Uptime with their own revisions and evidence; they are released, so that baseline explains them instead of re-creating them.

To revoke access, switch Business imports off or expand **Grant signing keys**, select the key ID and save. Revoking a key is permanent for that ID, including after re-enabling imports; configure a new signing-key ID to grant access again. A synthetic public-door journey covers off-by-default 404, upload, zero-write native plan, fingerprint-checked apply, reconciliation, history, undo and persistent revocation, and runs Base's public conformance check through both the Business and owner doors. No real customer export was used.

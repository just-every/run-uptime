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
- **Keyword monitors** set to alert when the keyword is missing become keyword monitors that require the text. Uptime matches the text exactly, so a case-insensitive keyword is listed as a difference.
- **Expected status codes.** Uptime checks one exact status. A single code moves as it is. A list or range, such as UptimeRobot's default `2xx, 3xx`, becomes exactly 200 and is listed as a difference.
- **Timeouts** move in seconds, within Uptime's range of 0.05 to 10 seconds. A longer timeout becomes 10 seconds, and the preview says so.
- **Intervals** move unchanged from seconds to milliseconds. An interval under 5 seconds or over one day is shown with its number and not imported. If an interval ever had to change, the preview would state it as a cadence change.
- **Heartbeat monitors** become Uptime heartbeats that expect a call within the interval plus UptimeRobot's grace period, up to one day in all. When the interval plus grace is longer than one day, such as a daily heartbeat with a grace period, Uptime keeps the interval and shortens the grace so the total is one day; the preview names the original and the shortened numbers. Their old heartbeat URL stops working for Uptime: issue a new token on the monitor's page and repoint your jobs to it. The preview lists the old URL so you know which jobs to change.

Every imported monitor checks from probe `local-a` on your own runner, and its evidence counts as fresh for at least three intervals. Uptime needs two independent vantages before it calls a target down. With one runner network, enabling a monitor takes the installation's External check URL (change it on Runner / archive), or add a second runner network or give that monitor its own external check URL in its settings.

## What does not move

The preview lists each of these on the monitor it affects. Nothing is dropped without a note.

- **Ping, port, DNS, UDP, API-assertion, visual comparison and dependency monitors** are unsupported. Uptime runs HTTP(S), keyword and heartbeat checks.
- **Keyword monitors that alert when the keyword is present** are unsupported. Uptime has no "must not contain" check.
- **Authentication, custom request headers and POST bodies** are not imported, because they can hold secrets. The monitor is created with a local credential reference such as `uptimerobot-123456`, which you set up on your own runner before enabling it.
- **Locations and regions.** UptimeRobot's own vantage points are not reproduced. Uptime checks from your runners.
- **Alert contacts and notification settings.** Reconnect destinations in Uptime under **Notifications**. Importing sends nothing to anyone.
- **Status pages** are a different product. Lamp is the public status page product.
- **Maintenance windows.** Set maintenance on the monitor in Uptime.
- **Tags and groups**, and certificate or domain expiry reminders.
- **Ignored certificate errors and turned-off redirects.** Uptime fails a check on a certificate error and follows redirects, validating each hop. The preview notes monitors where UptimeRobot did otherwise.

## Your history stays in UptimeRobot

UptimeRobot's log export is a CSV of past events. Uptime recognises it and counts its rows in a preview, for example "120 rows, provenance: UptimeRobot log export, not stored as evidence". It does not store the file. No row becomes an Uptime check, incident or state, so old history can never confirm a failure, close an incident or change the 24-hour and 7-day figures. Your Uptime history starts with your first Uptime check.

## What has been tested

The mapping follows the field names in UptimeRobot's published v3 API description. It has been tested with hand-written sample files, not with an export from a real UptimeRobot account. UptimeRobot does not publish its log export columns; Uptime looks for a date or time column and an event column.

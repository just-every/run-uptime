Use the versioned `/api/v1` reads to inspect the same immutable monitoring figures shown in the console. A live Base session uses the edition role and monitor scope. A `monitoring:read` key gives a separate script read access within its saved monitor or tag selection. Owner/admin and explicitly assigned editor, responder and read-only members may use permitted reads; service/team scopes restrict individual monitor reads and refuse unfiltered workspace lists. Incident reads use the same monitor permission. Keep session cookies and keys in a server-side environment variable.

The OpenAPI description at `/api/v1/openapi.json` is public and contains no installation data. Private reads send `Cache-Control: no-store`. Signed-out or revoked sessions, expired or revoked keys and keys whose issuing operator no longer holds the saved authority cannot read monitoring records.

## Monitors and current coverage

`GET /api/v1/monitors?limit=50&tag=production` returns `items`, `nextCursor`, `limit` and `generatedAt`. Each item includes its ID, name, kind, revision, enabled setting and tags, plus current textual state, last scheduled check time and fixed selected-location coverage. Missing or stale evidence stays Unknown. Monitor summaries contain no request credentials or target URL.

The maximum page size is 100. Monitors are ordered by ID; pass the returned `nextCursor` as `cursor` for the next page. `GET /api/v1/monitors/{id}` reads one summary and returns 404 when it does not exist. Reads do not create observations or advance scheduled confirmation.

## Uptime across monitors

`GET /api/v1/uptime?period=7d&timeZone=America/Chicago` reads availability for the installation. Add `monitor=id1,id2` to select up to 500 distinct monitor IDs, or `tag=production` to select a current tag. A missing requested monitor refuses the whole selection with 404; it never returns a silently shortened success.

The response includes each monitor's exact report availability, SLA target/result when requested, incident count and downtime, Slow time and denominator policy. Its `seconds` fields include observed, up, down, Unknown, paused, maintenance and Slow time. Uptime means Healthy time divided by observed scheduled time. Unknown, paused and maintenance time are visible outside that denominator. Slow time is separate from outage time.

Use `Accept: text/csv` or `format=csv` for the same bulk figures as CSV. Monitor names beginning with spreadsheet formula characters are escaped in CSV. JSON retains the original values.

## Calendar periods and time zones

Uptime and per-monitor reports accept `24h`, `7d`, `30d`, `90d`, `mtd` (month to date), `qtd` (quarter to date), `ytd` (year to date) and `last-month`, or a custom `from` and `to`. The default is the owner-selected notification time zone. Set an IANA `timeZone`, such as `America/Chicago` or `America/New_York`. The console's **Period report** offers the same periods.

Calendar periods begin at the first instant of the selected local calendar date. A daylight-saving change affects the elapsed seconds: a local fall-back day can contain 25 hours. To-date periods end at the generated snapshot's clock; last month ends at the start of the current local month. Custom ranges are inclusive at `from` and exclusive at `to`. An ambiguous or nonexistent custom wall time requires an explicit UTC offset.

`GET /api/v1/monitors/{id}/uptime` and `/report` share the console's calculations and CSV/JSON/PDF exports. Request a larger response-time `bucket`, such as `1d`, when generating a long calendar report. More than 10,000 response-time points is an explicit error, never truncation. `/response-times` supports raw, `1m`, `5m`, `1h` and `1d` resolutions, optional location selection and ranges of at most 90 days. Missing samples are never zero-filled.

## Incidents as JSON or CSV

`GET /api/v1/incidents` supports monitor, current tag, `from`, `to`, response `state` (`open`, `acknowledged`, `resolved`) and `rootCause` category filters. Pages use stable confirmation order and a maximum `limit` of 100. Follow `nextCursor` in JSON or the `Link: <...>; rel="next"` and `X-Next-Cursor` headers. `Accept: text/csv` or `format=csv` exports exactly that page with the same filters and cursor; continue paging to get the entire selection.

Each row includes confirmation/recovery times, duration in seconds, the original machine cause, failed locations, owner, root cause and source. `/api/v1/incidents/{id}` adds private comments, edit history, activity and next-due contact follow-up. Comments and root causes never change monitoring evidence or availability.

## Moving a monitoring script

UptimeRobot uptime-ratio reads map to `/api/v1/monitors/{id}/uptime` for one monitor or `/api/v1/uptime` for a selection; response-time reads map to `/response-times`; incident/log reads map to `/api/v1/incidents` and its detail route. First map source monitor IDs to their new Uptime IDs and choose matching periods and time zones. Source incident-history segments and blended cross-cutover figures remain unavailable. Use a scoped read key in the trusted service that supplies a dashboard, with the smallest monitor or tag selection it needs.

### Role and scope limits

Live Base owners/admins and assigned member roles use the same central permission function. Base deactivation, revocation or role/version changes take effect on the next request. Service scopes match monitor services; team scopes match existing group labels. An unassigned, stale or unknown member role is denied. Scoped members use individual monitor summary, uptime, report and response-time reads; workspace lists, exports and other unfiltered workspace doors refuse. Incident detail follows the same monitor scope. Responders and editors can add comments, change their own comments and set root causes; owners/admins can also change other authors' comments. Follow-up and category administration remain owner-only, and incident snapshots are withheld from nonowners. This replaces the interim admin-summary exception. Read keys cannot perform incident mutations or manage members, credentials or installation archives.

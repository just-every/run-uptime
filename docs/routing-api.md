# Team recipients and route filters

These API and CLI operations require a live Base session and the ACCESS-001
permission. `node scripts/routing.mjs COMMAND --origin APP_ORIGIN` reads
`UPTIME_ACCESS_COOKIE` from the environment. It never creates credentials.
Use `--input FILE.json` for writes and `--monitor ID` for route operations.
The console editor for these additional fields is pending.

`teams` reads `/api/routing/teams`. `save-team` posts
`{name,enabled,memberIds,expectedRevision}` there; omit `id` and use revision 0
to create, or include the returned `id` and revision to replace membership.
Only a workspace owner/admin can manage teams, with a fresh second factor.
Membership grants no product access and opts nobody in. ACCESS team scope
continues to mean the monitor group label; it never creates recipient membership.

Every member can use `self` to read `/api/routing/recipient`, then `consent`
to post `{destinationId,enabled}`. Only an existing email destination matching
the member's Base-verified account email is admitted. Administrators cannot
consent on someone else's behalf. No address, webhook or signing credential
can be created through this door. Consent binds the destination credential,
Base version and product assignment revision. Rotation or role/scope changes
require renewed consent. A member can pause with `enabled:false`. Disabled
teams, removed/inactive members, paused consent and out-of-scope monitors never
count as team coverage. These live facts are checked when jobs are created,
when claimed and again at the transport boundary. A send already handed to a
provider cannot be recalled. Direct administrator-selected contacts remain
separate from membership selection.

`route`, `preview`, and `apply` use the existing monitor alert-route endpoints.
The preview/apply body still requires `scope`, `mode`, `destinationIds` and
`expectedRevision`. Additional fields are:

- `teamIds`: explicit team IDs for selected mode. Omitted means no teams;
  `destinationIds:[],teamIds:[]` selects nobody.
- `filters`: optional `environments`, `severities`, `regions`, `origins` arrays.
  An omitted dimension allows all; an empty array matches nothing. Dimensions
  intersect and values within a dimension are alternatives. Omitted `filters`
  on an edit preserves the saved filters; `{}` explicitly clears them.
- `quietHours`: `{timeZone,start,end}`, daily IANA-zone HH:mm window, overnight
  and DST aware. Omission preserves it; null clears it. This holds every
  selected contact and fallback, in addition to any contact's own quiet window.

Apply requires the exact preview `digest`. Membership, consent, Base identity,
role/scopes, monitor, credentials and route changes invalidate a stale preview.
Inheritance remains monitor → service → group → installation. Filters belong
to the effective route, and a mismatch selects nobody; it never falls through
to a broader route. Slow's explicit contact override retains the effective
route's filters and quiet hours. Recovery goes only to the original accepted
recipient with the same credential, subject to live team consent; route changes
never add recovery recipients. Reminders preserve that original selection.

Filter semantics are deliberately exact:

- Environment is the monitor's saved `definition.environment` at confirmation.
- Severity is derived from alert class: outage `critical`, Slow `warning`,
  dependency notice `info`. Configurable per-incident severity is pending.
- Origin is `monitor`, `slow`, or `dependency`, derived from the event kind.
  It is never the console URL or the provider's URL.
- Region values are configured probe identifiers (for example `local-a`),
  matched against the alert's non-pass probes. They are not geographic claims.
  A geographic region taxonomy and provider-to-geography mapping are pending.

`sample` posts `{kind:"trigger"|"slow"|"dependency",regions:["local-a"],at:TIMESTAMP_MS}`
to `/api/monitors/ID/alert-route/sample`. It returns selected and excluded
contacts, team membership exclusions and `ready`, `excluded`, `held_quiet` or
`fallback_only` outcomes. It does not send or assert recipient receipt. Actual
confirmed alerts enter the same filter predicates and their ordinary delivery
history records the outcome. Existing direct destination drills test a contact,
not route coverage; route-aware sending drills remain pending.

Teams, membership, consent, route settings, detailed route history, quiet
schedules and dispatch bindings remain installation-local. Archives preserve
notification histories and opaque audit entries; imported deliveries stay
inactive. Operator erasure removes membership/consent and anonymizes original
team dispatch bindings so they stay denied. Monitor/destination erasure removes
dependent bindings. Business-hour calendars, expiry/renewal routing, portable
route settings and history, basic geographic routing and UI acceptance remain
ROUTING-001 gaps. Environment, severity and origin filters and current provenance
are described above; richer unlanded routing-branch evidence does not establish
accepted-main behavior.

## Assign a named route to an existing selection

An owner with a live session and a second-factor proof from the last five
minutes can name an already reviewed, explicit monitor route. Names hold
immutable policy copies; changing the source monitor later does not change a
saved name. No command below creates, confirms or messages a recipient.
Existing team membership, consent, filters, quiet hours and recipient proof
continue to govern delivery.

Use `node scripts/routing.mjs COMMAND --origin ORIGIN --input FILE` with the
existing `UPTIME_ACCESS_COOKIE` session. Keep session authority out of input
files and command arguments.

| Command | JSON input | Result |
| --- | --- | --- |
| `name-route` | `{"name":"Payments","monitorId":"MONITOR_ID"}` | Saves the existing explicit selected-recipient policy under a distinct name. |
| `named` | No input file | Lists saved route IDs, names and policies. |
| `preview-batch` | `{"routeId":"ROUTE_ID","monitorIds":["MONITOR_ID"]}` | Read-only counts, each monitor's before/after, refusals and a warning that assignment establishes no confirmed recipient. |
| `apply-batch` | The same selection plus its reviewed `digest` | Applies every selected change in one transaction and returns a `batchId`. A refused row, changed review or concurrent write applies nothing. |
| `undo-batch` | `{"batchId":"BATCH_ID"}` | Restores the prior explicit overrides, including absence/inheritance, while keeping monitor definitions and history. |

The corresponding doors are `GET/POST /api/routing/named-routes` and
`POST /api/catalog/routes/preview`, `/apply` and `/undo`. Admins, members,
monitoring credentials and an email-only session cannot use the owner batch
mutation doors. Manual route edits detach the saved-name association. If an
assigned route was edited or a selected monitor was erased, undo refuses the
whole batch rather than overwriting later work. Enabling a monitor and its
subsequent checks do not prevent routing undo.

Named configuration and batch undo authority stay installation-local. Export
keeps only their opaque audit events. Monitor erasure removes its batch entries;
operator erasure anonymizes retained batch ownership. The console batch control,
editing/removing saved names, and route defaults during URL/CSV bulk creation
remain unavailable. This slice assigns existing monitors and does not claim
MONITOR-001 complete.

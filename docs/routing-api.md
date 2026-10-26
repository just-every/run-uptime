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
- `businessHours`: `{timeZone,weekdays,start,end,selection}`. Weekdays are distinct
  integers 0 (Sunday) through 6 (Saturday), with HH:mm start/end and selection
  `inside`, `outside` or `always`. An overnight window belongs to its starting
  weekday. IANA local time handles US daylight-saving changes, including both
  copies of a repeated hour. Omission preserves the saved field; null clears it.
  This selection uses the alert's confirmation time, alongside the independent
  quiet hold. It never adds public holidays.

Apply requires the exact preview `digest`. Membership, consent, Base identity,
role/scopes, monitor, credentials and route changes invalidate a stale preview.
Inheritance remains monitor → service → group → installation. Filters belong
to the effective route, and a mismatch selects nobody; it never falls through
to a broader route. Slow's explicit contact override retains the effective
route's filters, business selection and quiet hours. Recovery goes only to the original accepted
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
not route coverage. Use the named-route sending drill below to exercise the saved route.

Teams, membership, consent, route settings, detailed route history, quiet
schedules and dispatch bindings remain installation-local. Archives preserve
notification histories and opaque audit entries; imported deliveries stay
inactive. Operator erasure removes membership/consent and anonymizes original
team dispatch bindings so they stay denied. Monitor/destination erasure removes
dependent bindings. The route read returns portability reason
`route_policy_installation_local`: route policies, business windows, detailed
receipts and dispatch authority are deliberately excluded, and the receiving
owner configures them again. Expiry/renewal notices still use installation-wide
destinations. Their effective-route integration remains unimplemented.

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


## Send a named-route drill

An owner or a role admitted by the existing route-write API can use `drill`
with `--monitor ID --input FILE.json`. The file contains the named `routeId`,
the effective route's current `expectedRevision`, `kind` (`trigger`, `slow` or `dependency`) and
`regions` (configured probe IDs). Read `route` first to obtain the effective policy and revision. Name and assign a reviewed route using the commands above.

The CLI posts the explicit `{action:"drill",...}` operation to
`/api/monitors/ID/alert-route/apply`, under the same route-write permission.
It uses current time, the effective named policy (an assigned route or an identical inherited policy), inheritance, team
membership and consent, class filters, business selection, disabled/custody
exclusions and quiet holds. The reviewed route and all eligible recipients
are committed together; a concurrent policy or recipient change refuses the
operation. Direct destination drills keep their existing explicit-test policy.

Read `drills` on the route response for every selected or excluded recipient,
its reason, delivery ID, outcome, quiet end and recipient confirmation. The
ordinary notification destination's `latestDrill` also names its route drill.
Quiet policy and recipient outcomes survive a Worker restart. A paused team
consent or disabled destination cannot send queued route work; rotating a team
recipient's credential requires renewed consent. Drills use one attempt and
never open an incident, change a monitor, create a real alert or start fallback
escalation. Links retain DRILL-001's one-use confirmation and 24-hour expiry.
Custom webhook templates without an acknowledgement-link field retain the
existing named refusal rather than receiving an unusable confirmation link.

Business-hour selection and its confirmation anchor/result are retained on
fallback work. Changing the route later cannot change that snapshot. A rejected
business selection has code `filter_business_hours`, no transport attempt and
no fallback send. Notification reads expose `businessHours` with that saved
policy, timestamp and selected result. Public `sample` timestamps can preview
future DST boundaries; they are not real future alert sends.

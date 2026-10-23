# Member permissions

Base owns sign-in, operator IDs, owner/admin/member roles, invitation acceptance,
status and sessions. Uptime assigns product permissions to those live IDs.
Owners and admins retain their Base ceilings; an active Base member needs an
explicit editor, responder or read-only assignment. A missing, stale or unknown
assignment grants no ordinary product access. Client role claims are ignored.

| Product role | Product permissions |
| --- | --- |
| Owner | All existing owner operations and member administration |
| Admin | Checks, destinations and secrets, routes, maintenance, discovery, archive/definition export and restore; invite and administer member narrowings |
| Editor | Monitor summaries and reports, ordinary public check definitions, non-secret check configuration, alert routes and maintenance, manual run and Slow acknowledgement |
| Responder | Monitor summaries and reports, manual run, Slow acknowledgement and maintenance |
| Read-only | Monitor summaries, reports, uptime, incident lists and heartbeat-run reads |

Imports through the operator import door, metrics-key administration, erasure,
incident comments/root causes/actions, setup, the private management editor and
identity changes still require owner authority. A member role never grants
private-runner, synthetic or credential creation authority. The existing metrics
key is separate and only grants `metrics:read`; `monitoring:read` and CI tokens
are not implemented.

## Service and team scope

A scope is `{ "kind": "service" | "team", "value": "label" }`.
Service matches the monitor's `service`; team matches its existing `group` label.
Alternatives of one kind form a union; service and team kinds intersect. No
scope rows means the role's whole workspace. Owners cannot be scoped.

Scoped members can read individual versioned monitor summaries/reports and
per-monitor history, incidents and heartbeat runs; editors can update an
in-scope public check while preserving its scope; responders and editors can
run or acknowledge it and preview/apply/cancel maintenance on an entirely
in-scope selection. Referenced dependencies must also be in scope. A scope
change is effective on the next request and on every later mutation batch.

Workspace lists, overview, documents, exports, archives, imports, secrets,
destinations, discovery, catalog bulk edits and alert routes are refused to
scoped members. Route policies can affect other monitors and their previews
list recipients; they are therefore workspace operations. This edition does
not substitute an unfiltered list for a scoped list. Scoped console navigation
and member-management UI are not yet built; use the bounded APIs.

## Public operator doors

All calls require a native authenticated Base session and the normal same-origin
request policy. These doors never accept caller-supplied actor identity.

| Method/path | Purpose |
| --- | --- |
| `GET /api/access/self` | Effective role, scopes and assignment revision |
| `GET /api/access/members` | Base operators with product assignment metadata |
| `POST /api/access/invitations` | `{email, displayName, role, scopes?}`; sends a Base invitation |
| `POST /api/access/members/:id` | `{role, scopes?}`; Base ceiling change where necessary plus product assignment |
| `DELETE /api/access/members/:id` | Deactivate through Base; existing sessions stop working |
| `POST /auth/invite/cancel` | Cancel an unaccepted Base invitation |
| `POST /auth/operator/status` | Base activation/deactivation |
| `POST /auth/operator/role` | Change the Base ceiling; member narrowings need explicit reassignment |

Invitation permission rows commit with Base's invitation transaction before
mail is sent. Accepting the invitation binds the assignment to the accepted
Base version. Base deactivation/reactivation does not resurrect an old member
narrowing: grant it again. Base protects the last owner. Only another
administrator can change your product assignment. Base's fresh email proof
still applies to changes involving owner authority; it is not second-factor MFA.

With `UPTIME_ACCESS_COOKIE` holding your live Base session cookie, the same
operations are available through `pnpm access -- --origin https://your-app.example
list`. Commands are `self`, `list`, `invite --email EMAIL --name NAME --role ROLE`,
`role --id ID --role ROLE`, `remove --id ID`, `cancel --id ID`, and `activate --id
ID`. Repeat `--scope service:LABEL` or `--scope team:LABEL` for an invitation or
role change. Omitting scopes on a role change preserves them; `scopes: []` or
CLI `--workspace true` clears them. An identical current assignment is a no-op:
its revision and audit remain unchanged. The command reads the credential from its environment and prints
only bounded operator metadata. It does not mint authority or print credentials.

## Custody and audit

Assignments and scopes are installation-local authority, excluded from product
archives. A restore cannot create receiving members or permissions. Operator
erasure removes both tables' dependent rows and retains anonymized audit.
The additive migration preserves existing owner/admin access on a populated
installation and grants nothing to pre-existing Base members.

The shared permission function gates each ordinary API/document and operator
import. Every permitted mutation transaction repeats live session, Base version,
product revision and selected monitor scope, and records an opaque actor/action
receipt without request values. Exports record an authority receipt before
reading their data; this records authorization, not later download receipt.
Existing domain audit and conflict guards remain in place. Erasure retains its
own owner/version transaction guard and domain receipt. Runner, heartbeat,
recipient-drill and signed Run Edit Run capabilities remain separate.

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
key is separate and only grants `metrics:read`. Native API credentials also
support `monitoring:read` and bounded `definitions:preview` / `definitions:apply`.
Their issuing operator, installation, expiry, version and selected-monitor,
tag or environment fences remain authoritative. They do not grant staff roles
or private failure-evidence access.

The shared `/mcp` door accepts a live selected-monitor `monitoring:read`
credential for the corresponding monitor reads, and a bounded
`definitions:preview` credential for definition recognition. This adapter does
not grant definition apply or other operator writes. Business agent credentials
bind through the signed settings person's durable Business ID to a current
native operator ID; a matching token email supplies no authority. Current native
roles and service/team scopes still apply, and company policy decides each call.
Resource refusals expose their machine code in JSON-RPC `error.data.code`;
missing and restricted records use the same refusal.

Agent-originated runner checks, discovery jobs and notification work retain the
door's original operation, consent, sponsor, scopes and public idempotency key.
Each native handoff or delivery has its own continuation identity. At the final
native admission, the door rechecks current authority, policy, Pause and
revocation; a preparation approval does not authorize unrelated queued effects.
Older agent queue records without the originating admission require fresh
preparation. A notification transport admission records permission to attempt
that delivery, not provider acceptance or receipt by a person.

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
still applies to changes involving owner authority. In addition, member changes
require Uptime second-factor verification within five minutes. The API/CLI
workflow is described in the repository's `docs/mfa.md`.

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

## Discovery job cancellation and revocation

Explicit `POST /api/discoveries` jobs retain the initiating operator ID and authority revision. A live owner/admin can cancel queued or running work with `DELETE /api/discoveries/:id`. Reads include `initiatingOwnerId`, `stoppedAt` and `stopReason`; cancellation is a retained failed job, not deletion. A claiming runner cannot submit a result after cancellation or after the initiating member's identity/role authority is revoked. The next claim or result boundary records the stop. Outcomes completed while authorized remain unchanged. Initiator erasure stops active work before anonymizing its owner.

Setup, catalog and source discovery creation still use their preceding installation-owned lifecycle. CI definition imports recheck token authority at each batch; revoked tokens cannot resume a later batch. Their general durable revoked-job stop presentation and member/job console controls remain open work.


The agent door currently declares the mandatory CORE capabilities: tools,
company policy, Pause, audit and idempotency. It retains all 37 native tools.
Events, resource reads, specialist prompts and subscriptions are not public
capabilities in this declaration; calls return `capability_not_declared` and
listings omit them. Internal native events and visibility adapters remain in
place. The full Agent surface contract remains a target. ct's 2026-10-29T14:12Z
ruling aligns the contract with native names while retaining every unfinished
outcome and class obligation. agent-surface.json declares the same CORE set and
is measured by rer verify; declaration alone establishes no passing claim.
The three worker dispatch admissions remain exposed registry facts until Base
0.2.91 gr-base-0290-invokeonly-1 can hide them from MCP; they are outside the
CORE contract. Spend caps remain unenforced.

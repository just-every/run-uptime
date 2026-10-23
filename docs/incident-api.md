# Incident collaboration API and CLI

This is the 23 October 2026 bounded INCIDENT-001 API/CLI slice. The original contract and receiving duties remain in CONTRACT.md and ACCEPTANCE.md. The public console upgrade is held; this document is source-only.

Use a live native Base session with the edition's required second factor. The CLI reads `UPTIME_ACCESS_COOKIE` from its environment; keep it private. It neither accepts session credentials in arguments nor creates authority. Local development persona cookies are not native sessions; use the access/MFA session flow in docs/mfa.md.

`GET /api/incidents/{incidentId}` and `GET /api/v1/incidents/{incidentId}` return the incident account, root-cause categories, comments with version history and per-mention outcomes. Each incident first resolves to its monitor, then ACCESS-001 enforces the member's current service/team scope. Related dependency notices and grouped incidents are filtered to readable monitors. Failure snapshots remain owner-only in incident detail pending an evidence-authority presentation; this conservative restriction is a gap, not a grant.

Responders, editors, admins and owners may add comments and set root causes. Authors may edit/delete their comments; admins and owners may edit/delete any. Read-only members, read-only metrics keys and signed-out callers cannot write. Actor/version/scope checks run again in every write transaction. Follow-up assignment/actions, grouped acknowledgment and category administration remain owner-only; their broader FOLLOWUP-001 role duties remain gaps.

| Operation | Request |
| --- | --- |
| Eligible mention suggestions | `GET /api/incidents/{id}/mention-members?q=display-name` |
| Add comment | `POST /api/incidents/{id}/comments` with `{"text":"restarted php-fpm","mentions":["member-id"]}` |
| Edit comment | `PATCH /api/incidents/{id}/comments/{commentId}` with `{"version":1,"text":"Revised account","mentions":[]}` |
| Delete comment | `DELETE /api/incidents/{id}/comments/{commentId}?version=2` |
| Set root cause | `PATCH /api/incidents/{id}/root-cause` with `{"version":0,"categoryId":"hosting-provider","text":"Disk full"}` |

Suggestions return at most 20 current active workspace members eligible to read that monitor, with only `id` and `displayName`. Query text is bounded to 80 characters. Comments allow 5,000 characters and at most ten distinct explicit recipient IDs. Text containing `@name` alone sends nothing. Root-cause text allows 2,000 characters. Version conflicts return 409 without overwriting newer work. Deleted comment text/history is removed and its timeline tombstone remains.

Mentions use Base mail with a 500-character excerpt, the incident's monitor and an authenticated link to the existing incident JSON route. The held console has no new mention autocomplete, outcomes display or incident deep-link UI. The comment response in incident detail records one outcome for each explicit recipient and comment version. Email provider acceptance does not establish inbox delivery. Delivery reserves once and rechecks the live recipient Base role/version, current product role/scope, monitor, current comment version and deletion state immediately at submission. No submitted/uncertain reservation is retried. A reservation interrupted before its result is persisted is shown as uncertain. A committed pending mention interrupted before reservation can remain pending; this slice has no background recovery or resend door. Explicit mentions on a later edit are new notices; omitting mentions does not resend earlier ones.

Outcomes are `accepted`, `development`, `rejected`, `rate_limited`, `uncertain`, `cancelled` or `unavailable`, with `pending` before reservation. Historical outcomes travel in archives; pending work restores as `imported-inactive`, while submitted unresolved work restores as `uncertain`. Installation-local recipient admission never travels, so restore never requeues mail. Operator erasure retains authored comments as Former member and removes mentions of that operator. Monitor erasure removes comments, history, timeline and mention rows and counts them. The audit holds opaque IDs and action names, never comment text or addresses.

Run `node scripts/incidents.mjs --origin "$UPTIME_ORIGIN" read --id INCIDENT_ID`, or use `members` with optional `--query`. `comment`, `edit` and `root-cause` read their exact request JSON from standard input; `edit` also needs `--comment COMMENT_ID`. `delete` needs `--comment COMMENT_ID --version N`. Every command uses the same authenticated HTTP doors. For example, a private file containing `{"text":"restarted php-fpm","mentions":["MEMBER_ID"]}` can be supplied with `node scripts/incidents.mjs --origin "$UPTIME_ORIGIN" comment --id INCIDENT_ID < comment.json`. Output is private incident data; handle it as such.

Remaining INCIDENT-001 gaps: held `public/incident-work.js` console workflows and visible mention outcomes; MOBILE-001 push; LAMP-001 preview/publication/corrections; sourced incumbent incident/comment/root-cause imports. Publication is unavailable, so comments reach only explicitly mentioned members and authorized incident reads/exports. This slice does not establish production mail acceptance or any provider consent.

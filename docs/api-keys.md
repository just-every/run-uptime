# Monitoring API keys

This source-only guide describes the bounded READAPI-001 API/CLI slice of 23 October 2026. It does not add a console page. The original contract and receiving duties remain unchanged.

Only a live native Base owner session may create, list or revoke these keys. Creation requires a genuine second-factor proof from the preceding five minutes, an explicit future expiry within 366 days and exactly `monitoring:read`. The issuance limit is conservative: delegated admin/editor issuance remains a gap. Existing `metrics:read` credentials keep their separate namespace and authorize only the metrics endpoint.

| Door | Input or result |
| --- | --- |
| `POST /api/credentials` | `{name,scopes:["monitoring:read"],expiresAt,resources}`; returns `{token,credential}` once |
| `GET /api/credentials` | Safe metadata including resources, expiry, revocation, issuer and last allowed use; no token or hash |
| `DELETE /api/credentials/{id}` | Immediately revokes the grant's token |

`expiresAt` is epoch milliseconds. A name contains 1–100 printable characters. Resources are immutable and always specify all three fields:

```json
{"mode":"selection","monitorIds":["MONITOR_ID"],"tags":["customer"]}
```

A selection with IDs only admits those IDs. Tags only admit monitors with any listed tag. When both lists are nonempty, the monitor must match an ID **and** a tag. An explicit selection with two empty lists admits no monitors. `{"mode":"workspace","monitorIds":[],"tags":[]}` explicitly requests the installation workspace. At most 500 distinct monitor IDs and 30 distinct tags may be selected; each value is at most 100 printable characters. No selector can enlarge the issuer's live service/team scope. Deleted monitor IDs do not turn into workspace authority; tags continue to select matching current monitors. Changing selection requires a new key and revoking the old one.

Send the token as `Authorization: Bearer TOKEN` over HTTPS. A key admits GET and HEAD on the existing `/api/v1/monitors`, monitor detail, per-monitor uptime/report/response-times, bulk `/api/v1/uptime`, incident list/detail and `/api/v1/metrics` doors. CSV and PDF report reads use the same monitor fence. Monitor lists, incident lists and aggregate selections apply SQL authority before pagination and counting. Outside-scope resources and nonexistent resources return the same 404. Unknown, expired, revoked or stale-issuer tokens return 401 and never fall back to a browser cookie. Secret, archive, definitions-export and member doors are unavailable; every mutating method returns 403 before token-usage or product writes. The OpenAPI document remains public.

Every allowed request rechecks the installation workspace, grant revision, token expiry/revocation and issuer's active Base identity/version and current edition assignment. Role/scope revisions invalidate the original grant. A bearer is a separate credential principal, never a manufactured Base session or the issuer's owner privilege. Incident detail excludes owner-only failure snapshots and filters related dependency context to readable monitors.

A key has 60 admitted requests per fixed UTC minute. `RateLimit` and `RateLimit-Policy` report the limit/window. Exhaustion returns 429 and `Retry-After`; other keys retain their own budgets. Last-use metadata and opaque usage receipts record allowed admissions. Refused write capabilities do not record use. Acceptance does not imply that a subsequent invalid query succeeds. No `source` value is accepted yet: `source=not-a-source` and `source=UptimeRobot` remain 400 `Unexpected query parameter`, with no substituted history result.

The CLI uses the same HTTP doors:

```sh
node scripts/api-keys.mjs --origin "$UPTIME_ORIGIN" list
node scripts/api-keys.mjs --origin "$UPTIME_ORIGIN" create < key-specification.json
node scripts/api-keys.mjs --origin "$UPTIME_ORIGIN" revoke --id CREDENTIAL_ID
```

Creation's private JSON file contains the exact POST body. `UPTIME_ACCESS_COOKIE` must contain a live native Base session; complete its second-factor proof through the existing MFA flow first. Development persona cookies are not native authority. The CLI never accepts session/token credentials in arguments. Creation prints the random token once, so redirect its output to a private destination and retain it securely. Later metadata cannot retrieve it. Do not put credential output into logs.

Base TokenService generates and hashes the token. Edition tables hold the immutable installation-bound grant, issuer snapshot and rate counters. These tables and Base token/usage records are installation-local and excluded from archives; restore creates no sending or API authority. Erasing an issuer removes their grants, tokens and usage. The shared `CredentialAuthority`, `credentialFence`, `credentialMonitorFilter` and `credentialPermission` helpers are in `src/domain/credentials/`; `accessFence` and `authorizedDatabase` accept that separate authority for subsequent scoped CI integration. No definitions/CI scope is issuable in this slice.

READAPI-001 remains partial: key-management console, HISTORY-001 source segments, hosted 500-monitor capacity evidence and escalation/handoff next-due policy remain gaps. CODE-001 CI issuance, environment/tag deployment fences and hosted CI acceptance remain the next slice's duties. Production credential use/provider acceptance has not been established by local fixtures.

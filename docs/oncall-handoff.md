# Hand an Uptime incident to Oncall

Uptime owns checks, retained evidence, alert routing, repeat reminders and
monitoring reports. An owner can feed confirmed incidents to
[Oncall](https://github.com/just-every/run-oncall) for responder coordination.
Oncall's current release records coordination beside an existing pager; paging
stays off. This connector makes no capability claim for PagerDuty, Splunk
On-Call, Lamp or Atlassian Statuspage.

## Configure the private owner API

In Oncall, create a **Native Events API** routed key with **Bearer token**
authentication, an explicit allowed service and a published catch-all to that
service. Use its internal service ID and exact environment. Keep that credential
in a private secret store. The key grants intake only.

Create a destination through `POST /api/notifications/destinations`:

```json
{
  "name": "Oncall incident intake",
  "kind": "webhook",
  "url": "https://oncall.example.com/api/ingress/intake:KEY_ID",
  "webhookSigning": true,
  "webhookTemplate": {
    "version": 1,
    "method": "POST",
    "mode": "oncall",
    "template": {
      "source": "intake:KEY_ID",
      "service": "SERVICE_ID",
      "environment": "production",
      "severity": "critical"
    },
    "headerNames": ["authorization"]
  },
  "webhookHeaders": {
    "authorization": "Bearer REPLACE_WITH_PRIVATE_SCOPED_TOKEN"
  }
}
```

Replace the uppercase placeholders. The URL's source and the configured source
must agree. The route selected by Oncall must select the configured service;
an unrouted receipt cannot acknowledge this handoff. Severity accepts
`critical`, `warning` or `info` and defaults to `critical`. The endpoint and
bearer header remain encrypted installation-local credential material. Portable
configuration contains header names, never their values. The ordinary Uptime
webhook signatures remain enabled; Oncall authenticates this profile with its
scoped bearer token, independently of those signatures.

Review and apply the destination selection through the existing
`POST /api/monitors/:id/alert-route/preview` and
`POST /api/monitors/:id/alert-route/apply` doors. These require the current
owner session and fresh second-factor proof. The latter uses the preview digest.
Contact repeats, recovery and fallback settings retain their existing semantics.

This profile sends confirmed failures, their configured reminders and matched
recoveries. Generic test sends, drills, reports and unrelated warning types
cannot manufacture an incident handoff. They fail preparation for this profile.

## The native event and the three facts

Only Oncall's native event fields are sent: `source`, `eventId`, `service`,
`environment`, `key`, `generation`, `intent`, `severity`, `title`,
`observedAt` and `evidence`. The title identifies the Uptime monitor and its
distinct failing network labels. Multiple checks with the same label contribute
one label, never independent locations. The evidence URL opens the authenticated
Uptime incident. Oversized native fields refuse preparation.

The monitor's key stays stable. Each confirmed incident supplies a new
generation, shared by its trigger, reminders and recovery. Each observation has
its own event ID; retries preserve that ID and the exact original bytes.
Recovery uses `intent: "recover"`. Source recovery never resolves an Oncall
human incident.

Read `handoff` in `GET /api/notifications`, or the incident's deliveries and
`sibling_handoff` timeline entry in `GET /api/incidents/:id`.

| Fact | Evidence and time |
| --- | --- |
| acknowledged | A 2xx native response with a matching event ID, service and observation time, receiver receipt UUID and canonical acceptance time. The fact includes the local response time, receiver time and original attempt reference. |
| received | Unknown, with no invented source or time. The native intake credential has no scoped native alert receipt read door. |
| responded | Unknown, with no invented source or time. No scoped native door attributes a human response to this source, key and generation. |

Acknowledgment is not receipt, and receipt is not response. A repeated request,
reminder or recovery retains the first evidenced acknowledgment for that
destination credential and incident generation. It does not add another
acknowledgment fact. The raw response body is not retained as handoff evidence;
only the bounded receipt identity and timestamp survive.

Oncall's `GET /api/v1/incidents` uses a separately provisioned service account
and describes declared coordination incidents. Its documented machine
acknowledgment is explicitly not proof that a person responded. Uptime does not
borrow a human session or promote that machine action into responder evidence.

## Loss and uncertainty

Connection loss, timeout, 5xx, 429 and a 2xx missing a valid matching receipt
remain uncertain while the existing bounded retry policy permits another
attempt. Exhaustion is failed, never delivered. Retries reuse the original key,
generation, event ID and bytes so a returning Oncall can deduplicate an alert
already stored before a lost response.

Missing or stale probes stay Unknown or insufficient. They cannot confirm an
outage, prove availability or produce a recovery. This handoff supplies neither
an availability guarantee nor evidence of human delivery.

The console has no handoff-specific rendering yet; these facts are available
through the existing private reads.

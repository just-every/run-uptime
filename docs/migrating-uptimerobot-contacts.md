# Preview saved UptimeRobot contacts and seats

The existing authenticated `POST /api/notifications/webhook-import-preview` door
accepts a read-only envelope with `type: "AlertContacts"` and `data` containing the
saved `/user/alert-contacts` response array. Use `type: "AllAlertContacts"` for a
saved `/user/all-alert-contacts` array. The existing `type: "Webhook"` create-payload
preview is unchanged. The [published schema](https://cdn.uptimerobot.com/api/openapi.yaml)
was read on 23 October 2026. This slice is API-only; console file routing remains a gap.

The result reconciles every contact by source kind as needing local review or
refused, with counts per kind. Email proposes an address for local review; webhook
proposes only its kind because the saved contact response's opaque values do not
define template semantics. Supply the saved official webhook create payload to
review that template. Source status and notification settings are never consent.
No destination, credential, confirmation, invitation or send is created, and an
`apply` request is refused. Source phone, chat, push and connector values are not
returned as local destinations.

Telegram, Slack and Teams require CHAT-001; SMS/voice require PHONE-001; push requires
MOBILE-001. Legacy Teams connector URLs are flagged: create a replacement incoming
webhook in Teams Workflows, review its owner and recipient, then configure and test
a separate local destination. The old connector capability is not copied.

Seat rows retain names and the documented `notifyOnly` flag. Both login and
notify-only seats are refused under ACCESS-001 until their local role, invitation,
destination and consent are reviewed. This response supplies no login role.

Incident comments and root cause are absent from these contact lists. The current
published API exposes `/incidents/{id}/comments` and `IncidentDetailDto.rootCause`
separately; importing them as labelled source history remains a HISTORY-001 and
INCIDENT-005 gap. Live extraction, full contact apply, sibling handoffs and account
cutover remain unimplemented. Nothing here uses a provider account or grants send authority.

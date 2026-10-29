Version 1 templates describe a request's method, format, public template text and custom header **names**. The endpoint, header values and signing keys stay in the installation's credential store. Archives carry the template and names; restoring an archive does not authorize a receiver or send old alerts.

Uptime validates the destination, pins public DNS answers and verifies TLS before sending the rendered request. A sample preview is not evidence of a send or recipient acknowledgement.

## Configure a receiver

1. In **Notifications**, add a **Webhook** destination and choose **Custom request template**.
2. Enter the receiver's public HTTPS URL, method, delivery mode and template. Choose the owner's time zone. Keep the destination disabled while reviewing it.
3. Enter custom header values locally as a JSON object. Saved values are masked; editing the header names requires re-entering their values.
4. Select **Preview sample requests**. Review the exact URL, payload, encoding and named variable differences for trigger, recovery, expiry and slow examples.
5. Save the destination and its one-time signing secret, if signing is enabled. Use **Send test**, then inspect its status and bounded response excerpt. Tests do not change monitor health. Enable the destination when its receiver is ready.

Changing the URL, template or local headers replaces that credential version and cancels queued sends using the old version. A custom template can send tests; recipient-acknowledgement drills require the default signed JSON envelope.

## Configuration

```json
{
  "version": 1,
  "method": "POST",
  "mode": "json",
  "template": "{\"monitor\":\"*monitorFriendlyName*\",\"code\":\"*alertType*\",\"details\":\"*alertDetails*\",\"event_id\":\"{{event.id}}\"}",
  "headerNames": ["x-api-key"],
  "timeZone": "America/Chicago"
}
```

Methods are `GET`, `POST`, `PUT` and `PATCH`. Modes are `json`, `form` and `query`. GET requires query mode and has no body. Query mode has no body with any method. JSON uses `application/json`; form uses `application/x-www-form-urlencoded`. The renderer sets that content type.

JSON templates are strings containing JSON. A variable can occupy a complete JSON value, such as `"type": *alertType*`, or appear inside a quoted string for combined text. Whole numeric variables become numbers; whole tag/location variables become arrays. Strings are JSON-escaped, and a missing fact becomes the explicit string `"Unavailable"`. Inside a quoted string, arrays become escaped JSON text. There are no executable expressions, loops or conditional blocks. Recognized variables without a Uptime equivalent are named in the save/import warning.

Values receive JSON string escaping, including quotes, backslashes and control characters; substituted `<`, `>` and `&` become `\u003c`, `\u003e` and `\u0026`. The completed JSON must parse for the trigger, recovery, expiry and slow examples before a template can be saved.

For form and query modes, `template` is a dictionary of field names and string values:

```json
{
  "version": 1,
  "method": "GET",
  "mode": "query",
  "template": {"monitor": "{{monitor.name}}", "status": "{{alert.type}}"},
  "headerNames": []
}
```

Names are literal; values expand once and are encoded with `URLSearchParams` (including `+` for spaces). Query parameters append to existing endpoint parameters, preserving their existing encoding, including when a name already exists. A value cannot change the destination origin or inject another parameter.

The template is limited to 32 KiB and parameter dictionaries to 100 fields. A rendered body is limited to 64 KiB and the complete URL to 8 KiB. Over-bound requests refuse instead of truncating.

## Send the saved native preview

The owner API can send one exact preview sample without changing monitor health. POST an empty JSON object to `/api/notifications/destinations/{id}/preview` after saving the custom template. Each sample contains its masked `request` and a `test` object. Explicitly POST that sample's complete `test` object to `/api/notifications/destinations/{id}/test` within five minutes. Ordinary empty test requests still send the separate generic Test event.

The sealed sample context fixes its version, synthetic event identity, sample selection and signing timestamp. The sender uses the current saved credential version and the ordinary durable notification service. Repeating the same sample request returns the same delivery, including after acceptance; previewing never queues or sends. Rotating credentials, changing the saved template or erasing the destination invalidates the context. A preview of unsaved edits offers no sample-send context. The native sample-send control is not yet wired into the console.

Sample requests carry a `test:` event identity and a versioned `uptime.notification.sample.v1` event header. Their trigger, recovery, expiry and slow values are synthetic examples, never monitor evidence or incident transitions. Compare the preview with the receiver's complete request target, application headers and raw UTF-8 body, allowing only its explicit header-secret and signature masks. The receiver's status and bounded, redacted response excerpt appear in notification history. Transport framing headers such as Host and Content-Length are supplied by the transport.

## Variables

Use a canonical variable such as `{{monitor.name}}` or a compatible alias such as `*monitorFriendlyName*`. Names are case-sensitive. Unknown names are refused and identified. Known values absent from the immutable event render the literal string **`Unavailable`**, never an empty string, zero, a current monitor value or an invented measurement. Empty arrays are available values and render as `[]`.

| Canonical variables | Meaning |
| --- | --- |
| `monitor.id`, `monitor.name`, `monitor.url`, `monitor.type` | Monitor identity and type from the event snapshot. |
| `monitor.tags`, `monitor.group` | Snapshot metadata; tags become JSON text. |
| `alert.type`, `alert.code`, `alert.name` | Type, compatible numeric code and friendly name. Down is `down`/`1`/`Down`; recovery is `up`/`2`/`Up`; expiry is `expiry`/`3`/`Expiry warning`. Test, slow and renewal use their named types; their numeric code is `Unavailable` because UptimeRobot publishes no corresponding numeric code. |
| `alert.details` | Original incident reason when retained, otherwise the event's explanation. |
| `alert.timestamp` | Event observation time as Unix seconds. |
| `alert.startedAtUtc`, `alert.startedAtLocal`, `alert.timeZone` | Confirmed incident start, or the event's explicit start/observation time for another alert. UTC uses ISO 8601. Local time includes the offset and IANA zone. |
| `alert.durationSeconds`, `alert.durationHuman` | Confirmed recovered duration. An ongoing or unknown duration is `Unavailable`. |
| `incident.key`, `event.id`, `console.url` | Correlation key, stable event identity and authenticated incident/monitor console link. |
| `incident.startedAtUtc`, `incident.endedAtUtc` | Retained confirmed incident boundaries in ISO 8601 UTC. |
| `locations.failed`, `locations.outcomes` | Retained failed-location detail and each recorded probe outcome, serialized as JSON text. |
| `http.status`, `response.timeMs`, `assertion.failed` | Recorded HTTP code, response milliseconds and failed assertion. |
| `ssl.expiryDate`, `ssl.daysLeft` | Recorded certificate expiry date and days remaining. |
| `domain.expiryDate`, `domain.daysLeft` | Recorded registration expiry date and days remaining. |
| `heartbeat.lastReceiptAtUtc` | Last authenticated receipt recorded in the event, in ISO 8601 UTC. |
| `alert.contacts`, `monitor.customFields` | Recognized migration variables without an immutable Uptime event equivalent. The save/import warning names them; they render `Unavailable`. |

The configured time zone defaults to `America/Chicago`, matching reports. Set the owner's IANA zone explicitly, such as `America/New_York` or `America/Los_Angeles`; daylight saving is applied for the event's timestamp. UTC is also accepted.

The complete alias mapping follows UptimeRobot's [published webhook variable list](https://help.uptimerobot.com/en/articles/14498593-webhook-integration):

| Alias between `*` characters | Canonical variable |
| --- | --- |
| `monitorID`, `monitorURL`, `monitorFriendlyName` | `monitor.id`, `monitor.url`, `monitor.name` |
| `alertType`, `alertTypeFriendlyName`, `alertDetails` | `alert.code`, `alert.name`, `alert.details` |
| `alertDuration`, `alertDateTime` | `alert.durationSeconds`, `alert.timestamp` |
| `monitorAlertContacts`, `customFields` | `alert.contacts`, `monitor.customFields`; explicit unavailable warnings |
| `sslExpiryDate`, `sslExpiryDaysLeft` | `ssl.expiryDate`, `ssl.daysLeft` |
| `domainExpireDate` | `domain.expiryDate` |
| `dashboardUrl` | `console.url` |
| `incidentStartTime`, `incidentEndTime` | `incident.startedAtUtc`, `incident.endedAtUtc` |
| `monitoringRegions`, `monitorType` | `locations.failed`, `monitor.type` |
| `httpStatusCode`, `responseTime` | `http.status`, `response.timeMs` |
| `monitorTags`, `monitorGroup` | `monitor.tags`, `monitor.group` |

The published domain alias is `domainExpireDate`. `domainExpiryDate` is not an alias and is refused.

## Headers, signing and previews

Custom header values may use the documented variables; `Idempotency-Key: {{event.id}}` sends the stable event identity. Header values and their templates remain local secrets and are not exported. CR/LF and oversized rendered headers refuse the request before sending.

At most 10 custom names are allowed, with case-insensitive duplicate detection. Delivery receives a separate dictionary of local values matching those names. Combined UTF-8 bytes of custom names and values must not exceed 4,096. CR, LF and invalid HTTP field characters are refused. Values expand documented variables once; errors never include their contents.

The transport owns content type, Host, length/framing, connection/proxy headers, cookies, `Sec-*`, `webhook-*` and Uptime/Lamp timestamp/signature headers; custom names cannot override them. Default signed JSON remains a separate choice. Optional HMAC-SHA256 uses the signing secret as literal UTF-8 text. Read the ISO UTC `x-lamp-timestamp`, a dot, then the exact request body bytes for JSON/form; for query mode use the raw percent-encoded query string after `?`, including static receiver parameters. Compare the unpadded base64url digest with `x-lamp-signature` in constant time and reject timestamps outside five minutes. `x-uptime-signature-input` identifies `body` or `query`. GET sends no body; signing its query protects the substituted parameters. The default signed JSON envelope keeps its existing verification scheme.

The renderer returns the exact method, URL, headers and body; Query previews show an empty `body`; the transport sends no request body in query mode. Preview samples cover trigger, recovery, certificate expiry and slow events. The explicit owner preview shows the exact receiver URL and sample payload. It masks custom header values and signatures; ordinary destination lists and archives omit the receiver URL and credentials. A test send uses the delivery service and does not alter monitor state.

## Recorded event facts

Each event keeps its measured status, timing, failed assertion, location outcomes, monitor type/tags/group and available certificate/domain expiry or heartbeat receipt facts. Historical requests use those immutable facts rather than today's monitor settings. A fact absent from that event renders **Unavailable**; a named variable without a Uptime equivalent is also shown as a warning at save and in the import preview.

## Preview a saved UptimeRobot webhook

In the request form, open **Import a saved UptimeRobot webhook definition**, paste one saved create request and select **Read source definition**. The owner API is `POST /api/notifications/webhook-import-preview`; it accepts UptimeRobot's documented `CreateWebhookIntegrationDto` shape. The API's [published OpenAPI schema](https://cdn.uptimerobot.com/api/openapi.yaml) defines this request for `POST /v3/integrations`; its [webhook guide](https://help.uptimerobot.com/en/articles/14498593-webhook-integration) supplies an example. Supply the existing saved payload; preview makes no source-account requests.

```json
{
  "type": "Webhook",
  "data": {
    "friendlyName": "Commerce receiver",
    "urlToNotify": "https://receiver.example.com/alerts",
    "postValue": "{\"monitor\":\"*monitorFriendlyName*\",\"status\":\"*alertType*\",\"details\":\"*alertDetails*\"}",
    "sendAsJSON": true,
    "sendAsQueryString": false,
    "sendAsPostParameters": false,
    "customHeaders": {"X-Api-Key": "REENTER-LOCALLY"},
    "enableNotificationsFor": "UpAndDown",
    "sslExpirationReminder": true
  }
}
```

The result is `{name, url, webhookTemplate, headerNames, warnings, differences}`. The receiver URL is a proposed local credential and must remain private to its owner preview, outside logs, evidence and archives. Only custom header names survive; **no source header values or signing material are returned**, even if supplied. Re-enter those values locally. Preview does not create or enable a destination.

All three delivery booleans must be explicit. Supported custom conversions are:

- A nonempty custom POST value with JSON selected and both default-variable switches off becomes POST JSON. Its template text, field names and alias spelling are retained.
- With JSON and both default-variable switches off, a nonempty custom POST value containing a flat JSON object of strings becomes POST form fields. This representation follows UptimeRobot's [documented custom POST format](https://uptimerobot.com/blog/post-support-for-web-hook-alert-contacts-now-available/). Nested or typed values require manual conversion.
- With all switches off and no POST value, the receiver remains a GET. Variable-bearing query values become the query template; static query values stay in the local receiver URL. Repeated names involving variables, placeholders outside query values, or a custom query combined with a body require manual conversion.

The API exposes no independent webhook-method field. The preview therefore names its GET/POST proposal and requires receiver comparison before cutover; it does not invent source PUT/PATCH settings.

The current guide describes `sendAsQueryString` and `sendAsPostParameters` as switches for adding **default variables**, and allows combining them with a custom body. The public schema does not specify the exact emitted default-key/type set. This adapter refuses those combinations instead of guessing fields or dropping part of a request. Configure an explicit Uptime template from reviewed receiver evidence for those cases.

`GET /v3/integrations/{id}` returns `IntegrationDto`, whose generic `value` and `customValue` through `customValue4` strings have no published per-webhook mapping in the schema. Those opaque detail responses, list pages, legacy v2 contacts and partial PATCH requests are refused. Supply a saved explicit create payload or configure the request manually. No automatic live extraction or complete account migration is claimed.

Unknown variables are identified before apply. Recognized aliases lacking an equivalent appear in the warnings. Source event filters, monitor/contact assignments, notification timing, account settings and activation are named as unmapped; review the receiving route and deliberately enable it after local authorization.

Receiver response custody: new attempt excerpts redact every request-body match longer than eight UTF-16 code units, including partial echoes and the JSON-escaped body used in the signed canonical envelope. Bodies of eight units or fewer are removed in full. Credential redaction still applies. Redaction runs before persistence against the immutable sent body; if a safe excerpt cannot be retained (including a redaction-marker collision), the excerpt is empty. Drill excerpts are omitted because their send-time confirmation link may already be retired. HTTP status, outcome code and Retry-After remain available. Previously stored attempts and older archives retain their historical values on restore; this is not a retroactive cleanup.

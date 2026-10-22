Notifications are how Uptime tells you a failure has been confirmed, and when it has recovered. You can send them to email, a signed JSON webhook or a Slack incoming webhook. This page covers adding a destination, testing it, and what a delivery result does and does not mean.

## Add a destination

Open **Notifications** in the console and add one or more destinations.

- **Hosted email** uses the same sender setup as sign-in: `MAIL_FROM` and the mail provider you chose with `MAIL_PROVIDER`, which is `resend`, `sendgrid` (the existing-install default) or `cloudflare`. Each has its own credential: `MAIL_PROVIDER_API_KEY`, `SENDGRID_API_KEY`, or `CLOUDFLARE_MAIL_API_KEY` with `MAIL_ACCOUNT_ID`. See [Deploy to Cloudflare](/docs/deploy). Development and demo runs report successful sends without sending email. On a hosted installation, an unconfigured sender shows a warning and a **Set up email** step.
- **Signed JSON webhook** posts a signed JSON event to a public HTTPS URL. Copy the signing secret when it is shown, because Uptime shows it only at creation or rotation.
- **Slack incoming webhook** posts to an exact incoming-webhook URL on `hooks.slack.com`. Slack has no Uptime signing secret.

Destinations are installation-wide. By default, enabled destinations apply to every monitor. A monitor’s alert route can select its contacts and fallbacks.

## How delivery works

Only scheduled incident changes produce notifications: a trigger when a failure is confirmed, and a recovery when it clears. Maintenance suppresses these events, and manual checks never create them.

On a hosted installation the Cloudflare Worker sends queued email, signed JSON and Slack requests itself, with no private runner needed. Owner-console requests prompt due checks and sends while you use it. The one-minute Cron schedule continues work afterwards, but Cloudflare can take up to about two hours to activate it after deployment; queued does not promise delivery within a minute. A [private runner](/docs/runner), if you keep one, also sends them when it polls; whichever claims a delivery first sends it, under the same claim and attempt rules. On your own computer the local runner sends signed JSON and Slack requests; development email completes without sending.

Email, Slack, unsigned webhooks, tests and drills get one attempt per destination. Signed-webhook incident deliveries can retry with their stable ID, and a route can name [fallback contacts](#fallback-contacts) for a failed or uncertain send. When the RER Managed relay returns 429 with Retry-After, the unaccepted email stays queued until that delay expires. For single-attempt destinations, a request that ends without a clear answer is Uncertain and is never sent again automatically.

## Send a test

Use **Send test** on a destination to queue a separate test event. A test does not change monitor evidence, open an incident or recover one.

For hosted sends, "Accepted" means the provider or your endpoint acknowledged the request. It does not prove that a person read it or was woken up.

## Run an alert drill

For hosted sends, an alert drill asks the person at the other end to confirm receipt. Use **Send test** on a destination. Uptime sends one test event marked as a drill. It says who started the drill and when, and carries a one-time confirmation link. Ask whoever reads that inbox or channel to open the link and press **Confirm I received this drill**. They do not need to sign in. The page shows only the kind of destination and the drill time.

The destination then shows the latest drill as three separate lines, because each proves something different:

- **Submitted**: Uptime started sending it, at this time. It does not show the provider took it.
- **Acknowledged**: the provider or your endpoint answered, at this time, with its result. It does not show the message reached an inbox. If there was no clear answer, the line says **Uncertain**; if the request was refused, **Failed**. Either way it is not sent again.
- **Recipient confirmed**: someone used the link, at this time. This is what the recipient reported. It is not a check Uptime made itself.

Whether anyone acted on the alert is not measured, so there is no line for it.

A drill that nobody confirms stays "not confirmed yet" until its link expires after 24 hours. It then reads "not confirmed within 24 hours", and nothing is sent again.

Each destination shows **Receipt confirmed** with the time of its latest confirmed drill, **No recent receipt confirmation**, or **No receipt confirmed yet**. A proven destination says one message reached a person once. It says nothing about whether monitoring works, whether a later alert will arrive or whether anyone will respond. Changing an email address or webhook URL, or rotating a secret, makes the destination **No receipt confirmed yet** again. So does restoring it from an archive, because drill history stays with the installation that ran it.

The link holds a random one-time capability. Uptime keeps only a hash of it, plus a sealed copy that is deleted once the single send is over. Opening the link only shows the page; the button on it is what confirms. Mail scanners and link previews that open links therefore cannot confirm a drill. A link that was already used, has expired or is not a real drill link gets the ordinary "Page not found".

A signed JSON webhook drill carries the link as an extra `drill` object (`startedBy`, `startedAt`, `expiresAt`, `confirmUrl`). Incident events never have this field, and their payload and signature are unchanged.

## Uncertain results

Email, Slack, unsigned webhooks, test sends and drills get one automatic attempt. A server error, timeout, lost connection or unrecognized response stays Uncertain and is not resent automatically. Signed-webhook incident deliveries retry within their saved attempt and time limits, using the same stable ID. Look at the receiver before taking manual action.

## Keep secrets safe

- Webhook and Slack URLs are never listed again after you save them, and email addresses are visible only to the signed-in owner.
- **Rotating** a webhook secret takes effect immediately and the old secret stops working. Copy the new secret from the dialog and update your receiver. Closing the dialog clears the secret from the browser, and it cannot be shown again.
- **Deleting** a destination cancels its queued sends and makes its stored URL credentials unrecoverable.
- If a destination says its credentials are unavailable, edit its email address or add a replacement webhook or Slack destination with the URL. A signed webhook gets a new one-time secret.

Stored credentials are encrypted using a key derived from your installation's `SESSION_SECRET`. Keep that secret across upgrades and restarts, and back up your private settings separately from the database.

## Use it with Lamp

Lamp can receive Uptime's signed JSON as a native alert source. Create an HMAC-SHA256 alert source in Lamp's **Alerts**, use the endpoint it displays, and set:

- timestamp header `x-lamp-timestamp`,
- signature header `x-lamp-signature`,
- deduplication path `$.incidentKey`,
- title path `$.title`,
- state path `$.state`, and
- recovered value `recovered`.

Use the destination's signing secret as literal UTF-8 bytes. A test event is not a valid Lamp incident, so verify the mapping with a real trigger and recovery. The full detail, including how the signature is built, is in the "Get told when a check fails" section of the Uptime README at https://github.com/just-every/run-uptime#get-told-when-a-check-fails.

## What notifications do not cover

There is no Teams, Discord, SMS, on-call paging, escalation or public status communication. See [What Uptime does not do](/docs/limits).

## Route an incident to the right contacts

Open a monitor and choose **Edit alert route** under **Alert recipients**. The first selected policy supplies the complete recipient list: monitor, then service, then group, then installation. Narrower scopes explicitly inherit until selected; the installation default selects all enabled destinations. An empty selected list deliberately leaves no recipient. New monitors with a service or group label inherit that label’s route. Catalog batch requests for a separately named route are not supported.

Choose the scope and contacts, then **Preview route**. Review every selected/excluded contact, unavailable credential or mail sender, and every affected monitor before **Apply reviewed route**. A narrower monitor route remains visible when editing a broader scope. Any recipient, credential, monitor or policy change invalidates the preview. Changes are audited, and the panel retains recent before/after selections. Tests in the preview are labelled direct sends to the named contact, including disabled contacts; they neither activate the route nor change monitoring state.

A confirmed incident binds its trigger’s recipients and credential versions. Recovery waits for provider acceptance of that trigger and goes only to the same still-enabled contact and credential. An unsuccessful or uncertain trigger, deleted/disabled contact or rotated credential cannot receive an orphan recovery; a newly selected contact cannot receive recovery for an incident it missed. Acceptance remains separate from human receipt. Pausing or changing the monitor never erases its observations.

Owner APIs are `GET /api/monitors/{id}/alert-route` and POST `.../preview` and `.../apply`. Preview accepts `scope` (monitor/service/group/installation), `mode` (inherit or selected; all replaces inherit for installation), `destinationIds`, an optional `fallback` (`{"destinationIds":[…],"deadlineSeconds":120}`) and the current `expectedRevision`. Apply adds the reviewed `digest`. Route configuration, detailed history and trigger/recovery matching remain installation-local; opaque action audit is portable, and restored monitoring stays inactive. Team, environment/severity/region/origin/time rules and expiry/renewal routing remain unimplemented.

## Alert time zone

In Notifications, choose **Change alert time zone** and enter an IANA zone. New installations start with your browser's zone. New incident email, Slack and signed JSON context carry the confirmed start in that zone with its UTC offset. Recovery preserves the original reason, failed locations, start and zone, and adds the confirmed recovery time and exact downtime. Changing the setting affects new incidents. Old saved messages retain their original rendering. Custom webhook templates can select their own display zone and use the same immutable incident values; see [Webhook requests](/docs/webhooks).

## Contact delays and reminders

On a monitor, choose **Edit alert route**, select destinations at monitor, service,
group or installation scope, and set each contact's delay and repeat in minutes.
Delay ranges from 0 to 1,440 minutes. Repeats are off at 0, or run every 1 to
1,440 minutes, with an optional maximum repeat count. Choose whether to send
recovery and whether acknowledgement stops repeats. Preview shows each contact's
schedule before **Apply reviewed route** saves it. Changes apply to new incidents;
open incidents keep their confirmation-time policy and credential.

Delays start at confirmed failure. Recovery before a delay expires cancels that
contact's trigger and recovery. Recovery goes only to the original accepted
trigger's contact, with recovery enabled. Every reminder is a new event with the
same incident key and its own delivery. Signed webhooks can retry that delivery
with the same stable ID; single-attempt destinations never replay an uncertain send. Worker restarts preserve schedules. Missed reminder windows produce one
due reminder after restart, then resume the confirmation-anchored cadence rather
than flooding contacts with every missed reminder. The incident shows the next
contact follow-up; stop, manual resolution, recovery, or the selected
acknowledgement policy ends reminders. Provider acknowledgement is not human
receipt.

**Import a saved contact schedule** accepts one saved UptimeRobot monitor (or a
single-monitor v3 page), using `assignedAlertContacts` entries with
`alertContactId`, `threshold` and `recurrence`. Map every source contact to a local
destination; no source credential is imported. Pingdom accepts a saved `check`
with `integrationids`, `resolution`, `sendnotificationwhendown`, `notifyagainevery`
and `notifywhenbackup`. Pingdom result counts multiply its resolution to become
minutes; Uptime starts that converted delay at confirmation, rather than at the
first failed check. Preview this difference before applying. Unsupported ranges
and unmapped contacts refuse the import.

Routes and active schedules stay installation-local. Archives carry reminder
events and delivery history as inactive records; they never resume reminders on
restore. Monitor and destination erasure remove their schedules.

Signed webhook incident deliveries retry with the same stable webhook ID. The default is six attempts within ten minutes, with exponential backoff and at most 20% jitter. Retry-After is a minimum; a delay beyond the remaining window fails with `retry_window_exhausted`. Other 4xx responses stop immediately and retain their HTTP code. Email, Slack, unsigned webhook, test and drill sends keep one attempt; proven-unaccepted relay mail 429 requeue is unchanged. An owner can PATCH `/api/notifications/preferences` with `{"retryPolicy":{"maxAttempts":6,"windowMs":600000}}` (1–10 attempts; 1000–86400000 ms). Changes apply to newly prepared deliveries. Retry times and attempt metadata survive restart, are included in inactive archives, and are erased with their destination or monitor.

## Fallback contacts

A route that selects its contacts can also name up to three fallback contacts, in order, and an uncertain deadline (5 to 3600 seconds; 120 by default). Set them under **Fallback contacts** in **Edit alert route**, or send `fallback` to the route API.

When a selected contact's trigger fails, or is still uncertain at the deadline (a signed webhook that is still retrying counts), the first fallback gets the same incident with a line naming that contact and its outcome. If that fallback also fails or stays uncertain, the next one gets it. Each fallback keeps its own delay, quiet hours and recovery setting. Uptime messages only contacts the route names.

Open **Quiet hours** under a fallback contact to hold its alerts during a daily window. Choose start and end times and an IANA time zone, such as `Australia/Brisbane`. An end earlier than the start means overnight; equal times are refused. Quiet hours are off by default. The API accepts `contactSettings[contactId].quietHours` as `{"timeZone":"Australia/Brisbane","start":"22:00","end":"07:00"}`. Omit it to turn quiet hours off.

Quiet hours hold triggers, reminders and recoveries without changing the original delay or repeat cadence. Notification history shows the saved hold end. A restart retains that time, and a prepared send checks the quiet rule again immediately before handoff. Test sends and drills bypass contact schedules.

Notification history shows both sides: the earlier contact lists the fallback it started, and the fallback names the contact it followed. A later acceptance of the earlier contact does not recall a fallback; both stay visible. When the last fallback also fails, the history says the chain ended and follow-up is yours.

A followed provider's dependency notice starts the route's chain as a trigger does. Reminders, slow notices, tests and drills never start a chain. Email and Slack are still never resent. Every attempt, including email and fallback attempts, is kept with its scheduled and start times, outcome, code and any Retry-After, but never a request body or credential. Archives carry these records and webhook deliveries without webhook request bodies; restore rebuilds webhook bodies from their archived events and never sends anything. Other historical message data is preserved. Erasing a destination also erases fallback alerts that name it.

## Dependency notices

A provider you follow from the service catalog sends dependency notices, not incidents: one when its stated issue is confirmed and one when it states it is operational again. They use the followed service's alert route and reach every contact the route selects, under each contact's quiet hours, with the route's fallback contacts. Dependency notices do not repeat. Fallback contacts keep their saved delay from confirmation and their quiet hours; a recovery or primary acceptance before the fallback starts cancels it. Notification history labels them **Provider issue (dependency notice)** and **Provider recovered (dependency notice)**. A signed webhook receives `eventType` `uptime.dependency.firing` or `uptime.dependency.recovered` and a `dependency` object with the provider, component, stated status, status source, catalog entry and catalog version. The provider's statement is its own claim, never proof that your application is up or down. See [Following a third-party provider](/docs/monitors#following-a-third-party-provider).

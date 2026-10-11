Notifications are how Uptime tells you a failure has been confirmed, and when it has recovered. You can send them to email, a signed JSON webhook or a Slack incoming webhook. This page covers adding a destination, testing it, and what a delivery result does and does not mean.

## Add a destination

Open **Notifications** in the console and add one or more destinations.

- **Email** uses the same sender setup as sign-in: `MAIL_FROM` and `SENDGRID_API_KEY`. Until that sender is configured, the destination shows a warning and a **Set up email** step.
- **Signed JSON webhook** posts a signed JSON event to a public HTTPS URL. Copy the signing secret when it is shown, because Uptime shows it only at creation or rotation.
- **Slack incoming webhook** posts to an exact incoming-webhook URL on `hooks.slack.com`. Slack has no Uptime signing secret.

Destinations are installation-wide. An enabled destination applies to every monitor, and there are no per-monitor filters.

## How delivery works

Only scheduled incident changes produce notifications: a trigger when a failure is confirmed, and a recovery when it clears. Maintenance suppresses these events, and manual checks never create them.

Delivery depends on the [private runner](/docs/runner). The Worker submits queued email through SendGrid and the runner sends signed JSON and Slack requests, both when the runner polls. Keep the runner running so queued notifications go out.

## Send a test

Use **Send test** on a destination to queue a separate test event. A test does not change monitor evidence, open an incident or recover one.

"Accepted" means the provider or your endpoint acknowledged the request. It does not prove that a person read it or was woken up.

## Uncertain results are not resent

Each event gets one automatic send attempt per destination. A server error, a timeout, a lost connection or an unrecognized response is marked uncertain, and Uptime never sends it again by itself. Look at the receiver before you decide what to do.

## Keep secrets safe

- Webhook and Slack URLs are never listed again after you save them, and email addresses are visible only to the signed-in owner.
- **Rotating** a webhook secret takes effect immediately and the old secret stops working. Copy the new secret from the dialog and update your receiver. Closing the dialog clears the secret from the browser, and it cannot be shown again.
- **Deleting** a destination cancels its queued sends and makes its stored URL credentials unrecoverable.
- If a destination says its credentials are unavailable, edit it and enter the address or URL again. A signed webhook gets a new one-time secret.

Stored credentials are encrypted using a key derived from your installation's `SESSION_SECRET`. Keep that secret across upgrades and restarts, and back up your private settings separately from the database.

## Use it with Lamp

Lamp can receive Uptime's signed JSON as a native alert source. Create an HMAC-SHA256 alert source in Lamp's **Alerts**, use the endpoint it displays, and set:

- timestamp header `x-lamp-timestamp`,
- signature header `x-lamp-signature`,
- deduplication path `$.incidentKey`,
- title path `$.title`,
- state path `$.state`, and
- recovered value `recovered`.

Use the destination's signing secret as literal UTF-8 bytes. A test event is not a valid Lamp incident, so verify the mapping with a real trigger and recovery. The full detail, including how the signature is built, is in the "Get told when a check fails" section of the Uptime README at https://github.com/just-every/uptime-monitor#get-told-when-a-check-fails.

## What notifications do not cover

There is no Teams, Discord, SMS, on-call paging, escalation or public status communication. See [What Uptime does not do](/docs/limits).

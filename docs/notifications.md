Notifications are how Uptime tells you a failure has been confirmed, and when it has recovered. You can send them to email, a signed JSON webhook or a Slack incoming webhook. This page covers adding a destination, testing it, and what a delivery result does and does not mean.

## Add a destination

Open **Notifications** in the console and add one or more destinations.

- **Email** uses the same sender setup as sign-in: `MAIL_FROM` and the mail provider you chose with `MAIL_PROVIDER`, which is `resend`, `sendgrid` (the existing-install default) or `cloudflare`. Each has its own credential: `MAIL_PROVIDER_API_KEY`, `SENDGRID_API_KEY`, or `CLOUDFLARE_MAIL_API_KEY` with `MAIL_ACCOUNT_ID`. See [Deploy to Cloudflare](/docs/deploy). On your own computer, email also uses the configured sender; there is no captured-mail page. Until the sender is configured, the destination shows a warning and a **Set up email** step.
- **Signed JSON webhook** posts a signed JSON event to a public HTTPS URL. Copy the signing secret when it is shown, because Uptime shows it only at creation or rotation.
- **Slack incoming webhook** posts to an exact incoming-webhook URL on `hooks.slack.com`. Slack has no Uptime signing secret.

Destinations are installation-wide. An enabled destination applies to every monitor, and there are no per-monitor filters.

## How delivery works

Only scheduled incident changes produce notifications: a trigger when a failure is confirmed, and a recovery when it clears. Maintenance suppresses these events, and manual checks never create them.

On a hosted installation the Cloudflare Worker sends queued email, signed JSON and Slack requests itself, with no private runner needed. Owner-console requests prompt due checks and sends while you use it. The one-minute Cron schedule continues work afterwards, but Cloudflare can take up to about two hours to activate it after deployment; queued does not promise delivery within a minute. A [private runner](/docs/runner), if you keep one, also sends them when it polls; whichever claims a delivery first sends it, under the same claim and attempt rules. On your own computer the local runner sends signed JSON and Slack requests, and the Worker submits email through your configured mail sender.

Each event gets one attempt per destination. When the RER Managed relay returns 429 with Retry-After, the unaccepted email stays queued until that delay expires. A request that ends without a clear answer is Uncertain and is never sent again automatically.

## Send a test

Use **Send test** on a destination to queue a separate test event. A test does not change monitor evidence, open an incident or recover one.

"Accepted" means the provider or your endpoint acknowledged the request. It does not prove that a person read it or was woken up.

## Run an alert drill

A test shows the provider answered. An alert drill also asks the person at the other end to say they got it. Use **Run alert drill** on a destination. Uptime sends one test event marked as a drill. It says who started the drill and when, and carries a one-time confirmation link. Ask whoever reads that inbox or channel to open the link and press **Confirm I received this drill**. They do not need to sign in. The page shows only the kind of destination and the drill time.

The destination then shows the latest drill as three separate lines, because each proves something different:

- **Submitted**: Uptime started sending it, at this time. It does not show the provider took it.
- **Acknowledged**: the provider or your endpoint answered, at this time, with this code. It does not show the message reached an inbox. If there was no clear answer, the line says **Uncertain**; if the request was refused, **Failed**. Either way it is not sent again.
- **Recipient confirmed**: someone used the link, at this time. This is what the recipient reported. It is not a check Uptime made itself.

Whether anyone acted on the alert is not measured, so there is no line for it.

A drill that nobody confirms stays "not confirmed yet" until its link expires after 24 hours. It then reads "not confirmed within 24 hours", and nothing is sent again.

Each destination shows **Last proven** with the time of its latest confirmed drill, **Not proven in 30 days**, or **Never proven**. A proven destination says one message reached a person once. It says nothing about whether monitoring works, whether a later alert will arrive or whether anyone will respond. Changing an email address or webhook URL, or rotating a secret, makes the destination **Never proven** again. So does restoring it from an archive, because drill history stays with the installation that ran it.

The link holds a random one-time capability. Uptime keeps only a hash of it, plus a sealed copy that is deleted once the single send is over. Opening the link only shows the page; the button on it is what confirms. Mail scanners and link previews that open links therefore cannot confirm a drill. A link that was already used, has expired or is not a real drill link gets the ordinary "Page not found".

A signed JSON webhook drill carries the link as an extra `drill` object (`startedBy`, `startedAt`, `expiresAt`, `confirmUrl`). Incident events never have this field, and their payload and signature are unchanged.

## Uncertain results are not resent

Each event gets one automatic send attempt per destination. A server error, a timeout, a lost connection or an unrecognized response is marked uncertain, and Uptime never sends it again by itself. Look at the receiver before you decide what to do.

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

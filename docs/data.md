Your monitoring history is yours to take with you. Uptime can export an archive of your installation and restore it into a new installation with empty product data and an established receiving owner. This page covers the commands, what travels, and what you have to do after a restore or erasure.

## Export and restore

On the source installation, stop dev and export the archive:

```sh
rer export --output exports/uptime.rer
```

On the receiving checkout, run setup first to establish its owner and private settings, then import:

```sh
rer setup --owner-email EMAIL --non-interactive
rer import --input exports/uptime.rer --yes
```

Archives from 0.1.2 or earlier must be re-exported from the upgraded installation first: `rer import` refuses them with a plain message and exit code 4 and writes nothing.

The receiving installation's product data must be empty. Setup creates its local receiving owner and settings before import; restore preserves that installation-local identity and settings.

On a hosted installation, use the archive export and restore actions in the console.

Exports refuse to run, and name the reason, when an installation exceeds the archive limits, rather than silently cutting data off.

## What an archive includes

- Monitor definitions and their immutable evidence.
- Outbox events, the record of incident changes.
- Notification destination definitions and delivery history that remain in the source after erasure: kind, name, enabled setting and, for email, the address.
- Erasure receipts with per-table affected-row counts and completion time.
- The permanent action audit, with opaque subject references and anonymised actor references.
- The source erasure journal used to prevent later restores from reviving erased source rows.

## What an archive leaves out

- Sign-in sessions.
- Runner grants and heartbeat keys.
- Request credential references.
- Local development sign-in captures. They remain in the installation's guarded outbox until their associated operator is erased or the local installation is reset.
- Webhook and Slack URLs and signing keys.
- Every other installation credential.

Your private settings file is not part of the archive either. See below.

## Restore rules

Restore is deliberately cautious, so that importing history can never wake anyone or start checking by surprise.

1. **Product data must be empty.** Restore does not merge into existing product or history records. Before local CLI import, set up the receiving checkout with its owner and private settings; restore preserves them.
2. **Monitors start paused.** Nothing runs until you deliberately resume monitoring.
3. **Destinations start disabled.** Re-enter each webhook or Slack URL, and any email address missing from the archive, then enable the destination yourself.
4. **Unfinished work is interrupted.** Checks that were mid-flight are marked interrupted, not completed.
5. **Imported alerts are quarantined.** Imported notifications never send automatically.

Imported evidence stays as history. It cannot make a restored monitor look healthy now.

An archive carries a digest, which detects changed bytes. It does not tell you who made the archive, so only restore archives you trust.

## Erase a record

An owner can erase a monitor, notification destination, or operator while at least one active owner remains. Monitor erasure removes its revisions, scheduled evidence, heartbeat authority, incidents, related notification work and archive-history copies. Destination erasure removes the destination and all its credential versions, dependent notification jobs, delivery attempts and outcomes, replay entries, and matching archive-history copies. Operator erasure removes that operator's sessions, sign-in tokens, invitations and local development sign-in messages. The original owner can also be erased while another active owner remains: its setup claim stays closed, with its operator reference replaced by an unrelated anonymous identifier. The receipt counts that bootstrap row as anonymised. The console returns a receipt with the entity kind, per-table affected-row counts and completion time. Its count record is stored with the permanent product data and travels in later archives.

The monitor action asks you to type its current name. Deleting a notification destination is an erasure. Audit entries remain; their subject references do not contain the erased monitor name, address or URL. When an operator is erased, earlier audit entries retain the action and time while that operator's actor reference is anonymised. The audit travels in later archives.

Erasing an operator does not change `OWNER_EMAIL` in saved settings or the hosted Worker binding. If it named the erased operator, a surviving owner can still sign in with their own email and export from the console. Before using local `rer` commands again, stop dev and change only `OWNER_EMAIL` in `data/local-secrets.json` to an existing surviving active owner. Preserve every generated key and all other settings, then run `rer setup --owner-email EMAIL --non-interactive` with that same email. Supplying the new email to setup without first updating the saved setting is refused. This selects an existing owner; it does not create or transfer an identity. On hosted installations, the deployment owner must update the `OWNER_EMAIL` binding separately; D1 erasure does not change provider configuration.

The last active owner cannot be erased. For a local installation, use `rer reset --yes` to remove the installation and set it up again. For a hosted installation, redeploy a replacement installation and establish its owner.

Uptime has no R2 storage or upload feature, so there are no uploaded attachments associated with an entity. Local erasure cannot remove an archive that someone already downloaded, recall an email, webhook or Slack message already sent outside the installation, or stop a request already in progress from reaching its provider.

The restore fence uses the source's later erasure journal. After an erasure, open **Runner / Archive** in the source installation and choose **Export erasure journal**. If you need to restore an older offline archive, provide that later journal with it. For local import, use the absolute journal path in `UPTIME_LATER_JOURNAL`:

```sh
UPTIME_LATER_JOURNAL=/absolute/path/to/uptime-erasure-journal.json rer import --input exports/older-uptime.rer --yes
```

The console restore accepts the same JSON file under **Later erasure journal**. An old archive by itself cannot reveal a later erasure when restored into a brand-new installation that has never received the journal. This is a limit of Base's offline transfer model. Keep the current post-erasure archive or journal available with any older offline copy.

## Keep your settings separately

Your private settings are installation credentials, and they are not portable archive data. Keep them in their own backup, apart from the archive.

- Local installation: `data/local-secrets.json`.
- Hosted installation: `.rer/deploy/production-secrets.json`.

Notification credentials are encrypted with a key derived from the installation's `SESSION_SECRET`. If that secret is lost, destinations need their addresses entered again. See [Notifications](/docs/notifications).

## Storage growth

Observation metadata and local development sign-in captures are not deleted by age or count. Erasing an operator removes captures tied to that operator; `rer reset --yes` clears local captures with the installation. Operator erasure is explicit and separate from retention. Limits on views and archives are not a retention policy. Plan to watch storage over time.

Your monitoring history is yours to take with you. Uptime can export an archive of your installation and restore it into a new, empty one. This page covers the commands, what travels, and what you have to do after a restore.

## Export and restore

On a local installation, stop dev first, then use the two commands:

```sh
node scripts/rer.mjs export --output exports/uptime.rer
node scripts/rer.mjs import --input exports/uptime.rer --yes
```

Import needs an empty installation. Run setup afterwards to establish the receiving owner.

On a hosted installation, use the archive export and restore actions in the console.

Exports refuse to run, and name the reason, when an installation exceeds the archive limits, rather than silently cutting data off.

## What an archive includes

- Monitor definitions and their immutable evidence.
- Outbox events, the record of incident changes.
- Notification destination definitions: kind, name, enabled setting and, for email, the address.
- Delivery history.

## What an archive leaves out

- Sign-in sessions.
- Runner grants and heartbeat keys.
- Request credential references.
- Webhook and Slack URLs and signing keys.
- Every other installation credential.

Your private settings file is not part of the archive either. See below.

## Restore rules

Restore is deliberately cautious, so that importing history can never wake anyone or start checking by surprise.

1. **The installation must be empty.** Restore does not merge into existing data.
2. **Monitors start paused.** Nothing runs until you deliberately resume monitoring.
3. **Destinations start disabled.** Re-enter each webhook or Slack URL, then enable the destination yourself.
4. **Unfinished work is interrupted.** Checks that were mid-flight are marked interrupted, not completed.
5. **Imported alerts are quarantined.** Imported notifications never send automatically.

Imported evidence stays as history. It cannot make a restored monitor look healthy now.

An archive carries a digest, which detects changed bytes. It does not tell you who made the archive, so only restore archives you trust.

## Keep your settings separately

Your private settings are installation credentials, and they are not portable archive data. Keep them in their own backup, apart from the archive.

- Local installation: `data/local-secrets.json`.
- Hosted installation: `.rer/deploy/production-secrets.json`.

Notification credentials are encrypted with a key derived from the installation's `SESSION_SECRET`. If that secret is lost, destinations need their addresses entered again. See [Notifications](/docs/notifications).

## Storage growth

Observation metadata is never deleted automatically, and the limits on views and archives are not a retention policy. Plan to watch storage over time.

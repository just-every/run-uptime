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

## Export selected monitors

The authenticated archive endpoint accepts repeated `monitor` parameters, for example `GET /api/archive?monitor=MONITOR_ID&monitor=OTHER_MONITOR_ID`. Use an existing workspace owner or administrator session with a second factor verified within the last five minutes. Scoped accounts cannot export workspace archives. Omitting every query parameter keeps the ordinary whole-installation export. Empty, duplicate, unavailable or more than 500 selected IDs are refused; unsupported query parameters, including a time range, are refused too.

A selected archive contains exactly those monitor IDs, every retained revision and slot for them, their observations, unexpired failure snapshots, heartbeat runs, source history, cleanup debt, incident collaboration, outbox events, scheduled reports and associated notification jobs, deliveries and attempts. Flat original-history copies follow the same selection. No selected history is clipped to a date or to the console's history page limit. Credential exclusions and inactive restore rules are the same as for an ordinary archive.

Some history belongs to the installation as a whole. Every selected archive preserves all permanent audit entries, erasure receipts and the complete source erasure journal, migration records, destination definitions and their original-history copies, incident category settings, definition-batch headers, auxiliary attempt journals and discovery sources with their finished run snapshots. Rejected discovery decisions and notification test jobs also remain shared history. Adopted discovery decisions and definition-batch entries follow their monitor. Batch header counts describe the original source batch, including entries outside the selection; they are not a claim about the number of selected entries. Shared destination definitions may include email addresses even when that destination has no selected monitor history. Review this shared content before giving an archive to anyone else.

Replay records with a JSON event body follow that body's monitor identity; unscoped test replays remain shared. An opaque or unidentifiable replay refuses a selected export because it cannot be scoped safely. Use a whole-installation export for that history. A monitor dependency in any retained revision, a service report naming an unselected member or another unresolved cross-selection relationship also refuses the export. Explicitly select every referenced monitor, within the existing bounds. Uptime never adds a monitor implicitly or drops a referenced record to make the export pass.

The archive digest covers a `selection` object containing the sorted requested IDs and the shared-record policy `installation-history-v1`. Restore verifies that those IDs exactly match the archive's monitors and validates the complete portable relationships before writing. After restore, a new ordinary export describes the receiving installation; request a selection again to record new selection metadata.

Limits still apply to the projected archive, including shared history: 500 monitors, 10,000 rows per table and 2 MiB for the entire JSON document. An over-bound request returns an error without a partial archive or product changes. Successful selected exports record an authorization audit receipt after taking their snapshot; refusals add no export receipt. Larger resumable transfers use the separate chunk transport below. Time-range selection, hosted-scale qualification and console selection and bound controls remain pending.

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
- Legacy local sign-in records. They are installation-local, have no viewer, and remain until their associated operator is erased or the local installation is reset.
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

An owner can erase a monitor, notification destination, or operator while at least one active owner remains. Monitor erasure removes its revisions, scheduled evidence, heartbeat authority, incidents, related notification work and archive-history copies. Destination erasure removes the destination and all its credential versions, dependent notification jobs, delivery attempts and outcomes, replay entries, and matching archive-history copies. Operator erasure removes that operator's sessions, sign-in tokens, invitations and legacy development sign-in records. The original owner can also be erased while another active owner remains: its setup claim stays closed, with its operator reference replaced by an unrelated anonymous identifier. The receipt counts that bootstrap row as anonymised. The console returns a receipt with the entity kind, per-table affected-row counts and completion time. Its count record is stored with the permanent product data and travels in later archives.

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
- Hosted installation: `.rer/deploy/production-secrets.json`, and `.rer/deploy/environments/<environment>/secrets.json` for each separate environment.

Notification credentials are encrypted with a key derived from the installation's `SESSION_SECRET`. If that secret is lost, destinations need their addresses entered again. See [Notifications](/docs/notifications).

## Storage growth

Observation metadata and legacy development sign-in records are not deleted by age or count. Erasing an operator removes captures tied to that operator; `rer reset --yes` clears local captures with the installation. Operator erasure is explicit and separate from retention. Limits on views and archives are not a retention policy. Plan to watch storage over time.

## Resumable chunk transfers

The installation now admits up to 500 monitors through native creation, definition imports, reviewed catalog batches and archive restore. This admission limit does not certify hosted cadence or storage capacity.

`rer export` writes a Base installation archive containing a chunked Uptime payload. The payload begins with a manifest of table counts and chunk descriptors. Each descriptor names its table, row count, UTF-8 byte count and SHA-256 digest of the following chunk's JSON bytes. Each JSON chunk is at most 128 KiB. Base additionally verifies each transport part and the complete archive. No chunk becomes product data until the complete graph passes the same schema, references, original-history, owner and erasure checks as an ordinary restore.

If the command is interrupted after its job is created, repeat the same command with the same absolute archive location. A private checkpoint beside the archive binds its job to the installation, owner, direction and file. Import also binds the complete input file digest. Reverify a second factor and supply a current `UPTIME_ACCESS_COOKIE` before retrying. A fresh session of the same owner can resume; the checkpoint itself grants no access. Changed files, foreign handles and source captures invalidated by erasure refuse. Failed transfers keep their job and partial file; successful export releases its source job and removes its checkpoint. The final destination archive must still be a new file.

Native clients use `/api/archive-transfer/exports` and `/api/archive-transfer/imports`. Every request needs a live workspace archive session with a factor verified in the last five minutes; writes also require the installation's exact `Origin`. Read `GET /api/archive-transfer/exports` for current table counts and transfer bounds before creating a job. Create an export with `POST {}` or `POST {"monitors":["MONITOR_ID"]}`. Advance it with `POST /ID/advance` and `{"expectedPart":0,"maxParts":16}`; read `GET /ID` after interruption and continue from its `completed` count. Once complete, `GET /ID/download` streams the manifest, verified parts and closing receipt. Keep the job ID privately, download and verify the archive, then `POST /ID/abort` to release its saved capture.

To restore, `POST {"confirmed":true,"manifest":MANIFEST}` to the imports collection in an empty receiving installation. Upload each transport part with `PUT /ID/parts/INDEX`. Read `GET /ID` after interruption; previously accepted identical parts are idempotent and conflicting parts refuse. Finish with `POST /ID/finalize` and the closing `contentHash` and `archiveHash`, plus `laterJournal` when required. Restored definitions remain paused, unfinished leases become interrupted, delivery stays quarantined, original history remains immutable and the receiving owner and local settings remain local. A revoked session or stale factor cannot advance, upload, finalize or download.

The new transport currently retains an encoded payload bound of 64 MiB, one million rows per table, 500 monitors and a 128 KiB manifest. A single row over 128 KiB refuses too. These are explicit refusal bounds, never truncation or storage measurements; validation still materializes the graph and needs memory beyond the encoded size. The ordinary console JSON route still has its legacy 2 MiB document and 10,000-row limits; use the chunk transfer for larger history. Completely bounded-memory snapshot construction and restore, the full 500-monitor and 90-day proof, OPS-001 qualification at that scale, time-range integration through its existing landing owner, hosted measurements and console selection and bound controls remain outstanding. Synthetic revision-load tests are engineering fixtures, never substitutes for that monitoring history.

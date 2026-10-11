Uptime is built to fail closed: if something is not configured or not authorized, it refuses rather than guesses. This page explains who can reach what, how requests are checked, and where your credentials are kept.

## Who can reach what

The console and every API behind it are owner-only. Each private page, read, change and export is checked on the server for either an operator session or a scoped runner credential, on every request. Hiding a button in the browser is never the protection.

- If required configuration is missing, requests are refused.
- Running on a loopback address is not authentication.
- Sign-in uses shared operator sign-in with email links, and Uptime does not grant extra roles on its own.

## How requests are checked

- **Host guard.** The Worker answers only requests whose address and Host header match its configured origin. Anything else gets a 403.
- **Same-origin checks.** Changes made from a browser must come from the configured origin, and cross-site requests are rejected.
- **Runner key and signed results.** Every runner request, including claims and notification work, must present the scoped runner key. Results are also timestamped and signed with that key. The Worker accepts results only for an exact check it handed out, and rejects expired, foreign, duplicate or contradictory ones.
- **Heartbeat tokens.** Tokens are issued by the owner, stored only as hashes, scoped to one monitor revision, and used with strictly increasing sequence numbers.
- **Pinned connections.** The runner validates every DNS answer and redirect hop, then pins the connection. See [Monitors and evidence](/docs/monitors).

A signature identifies the holder of the runner key. It does not prove the runner was uncompromised, so protect the key.

## Where your credentials live

- **Request secrets** for your targets stay in owner-only files on the runner's machine. They never enter evidence, alerts or archives.
- **Private settings** stay in `data/local-secrets.json` for a local installation, or `.rer/deploy/production-secrets.json` for a hosted one. Neither is included in archives, and you should back them up separately.
- **Notification credentials**, meaning email addresses, webhook and Slack URLs and signing keys, are encrypted at rest using a key derived from your `SESSION_SECRET`. Lists never show stored URLs or signing keys.
- **Webhook signing secrets** are shown only when created or rotated.

## What travels in an archive

Archives carry monitor definitions, evidence, outbox events, destination definitions (including an email address) and delivery history. They never carry sessions, runner grants, request-credential references, webhook or Slack URLs, signing keys or other credentials. See [Move your data](/docs/data).

## Rotating the session secret

Rotating `SESSION_SECRET` signs everyone out and makes stored notification credentials unreadable. Sign in again, open **Notifications**, and re-enter each affected destination. Monitoring stays available in the meantime. Do not restore a compromised old key.

## Report a problem

If you find a security problem or anything that looks wrong, open an issue on GitHub at https://github.com/just-every/uptime-monitor. Please leave out secrets, tokens and private URLs when you describe it.

## Related

[What Uptime does not do](/docs/limits) lists what the security claims here do not cover.

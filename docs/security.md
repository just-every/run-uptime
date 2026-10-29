Uptime is built to fail closed: if something is not configured or not authorized, it refuses rather than guesses. This page explains who can reach what, how requests are checked, and where your credentials are kept.

## Who can reach what

Private product documents, reads, mutations and exports require the live edition permission derived from Base identity and narrowed scopes. Owner/admin ceilings and explicit editor, responder and read-only member assignments follow the product role assignment; sensitive services still require the owner, and scoped workspace doors refuse rather than return unfiltered data. Evidence retains its explicit monitor grants. Runner and heartbeat APIs use separate scoped credentials. Every private operation checks server-side authority on each request and repeats it in later mutation batches. Authentication routes and public information are listed separately in `seed.json`; a public route declaration never grants private product access. Hiding a button in the browser is never the protection.

- Required configuration is checked before the Worker handles a request or scheduled run. Setup checks generated or saved settings before opening its temporary runtime; the local app, preview, deployment and runner check their configuration before serving or starting operational work. Missing or malformed configuration stops that entry point and names the variable; the Worker returns 503, including at `/health`, without returning a configured value.
- Running on a loopback address is not authentication.
- Sign-in uses shared operator sign-in with email links, and Uptime does not grant extra roles on its own.

## How requests are checked

- **Host guard.** The Worker answers only requests whose address and Host header match its configured origin. Anything else gets a 403.
- **Same-origin checks.** Changes made from a browser must come from the configured origin, and cross-site requests are rejected.
- **Runner key and signed results.** Every runner request, including claims and notification work, must present the scoped runner key. Results are also timestamped and signed with that key. The Worker accepts results only for an exact check it handed out, and refuses expired, foreign or contradictory attempts; the first accepted copy wins when an attempt is repeated.
- **Heartbeat tokens.** Tokens are issued by the owner, stored only as hashes, scoped to one monitor revision, and used with strictly increasing sequence numbers.
- **Validated, pinned connections.** A private runner validates every DNS answer and redirect hop, then pins the connection. Hosted Worker checks and notifications validate every DNS answer the same way but cannot pin; they rely on Cloudflare's outbound network. See [Monitors and evidence](/docs/monitors).
- **Declared public routes.** Every route that can be reached without a session is listed in `seed.json` with its purpose, authentication rule and rate-limit class. Limits use a fixed 60-second window per public path class and client IP; an excess request returns 429 with `Retry-After`, and unavailable counter storage returns 503. A public declaration does not grant route authority. Hosted client identity comes from Cloudflare's `CF-Connecting-IP`; a missing or malformed value shares an unknown-client bucket. Local requests share a loopback bucket, and forwarding headers do not change it. Only keyed hashes of client identities are stored, and expired counters are removed after their window.

A signature identifies the holder of the runner key. It does not prove the runner was uncompromised, so protect the key.

## Where your credentials live

- **Request secrets** for your targets stay in owner-only files on the runner's machine. Each file binds one monitor ID and an exact target origin; a same-named reference on another monitor grants no access. The first setup after an upgrade binds valid unbound files referenced by exactly one existing monitor, including paused monitors, once. Shared and unused files, and any file a monitor names later, require explicit owner binding; dev and preview starts never bind; see [Runner credentials](/docs/runner#bind-existing-files-after-upgrading). They never enter evidence, alerts or archives.
- **Private settings** stay in `data/local-secrets.json` for a local installation, or `.rer/deploy/<environment>.secrets.env` for each hosted environment (production: `.rer/deploy/production.secrets.env`), with mode 0600. They are excluded from archives; back them up separately. The next deploy automatically migrates legacy JSON settings, preserving owner and mail inputs and all environment keys without regenerating production keys. The installation's own legacy keys replace unused copies rer generated beside them. Any other conflicting value already kept by rer stops the move with the key name and paths, never values. Legacy files are removed only after verification, then are never read or recreated; fresh installs use only the environment settings files. See [upgrading a deployment](/docs/deploy#update-an-existing-deployment).
- **Notification credentials**, meaning email addresses, webhook and Slack URLs and signing keys, are encrypted at rest using a key derived from your `SESSION_SECRET`. Lists never show stored URLs or signing keys.
- **Webhook signing secrets** are shown only when created or rotated.

## What travels in an archive

Archives carry monitor definitions, evidence, product outbox events, destination definitions (including an email address), delivery history for records still in the source, erasure receipts and the permanent action audit. Current destination erasure removes its dependent delivery, replay and archive-history records before a later export. Legacy development sign-in records are installation-local and excluded from archives; they have no viewer and remain subject to operator erasure or local reset. Audit subject references are opaque; they do not store monitor names, email addresses, target URLs or destination URLs. Archives never carry sessions, runner grants, request credential values, webhook or Slack URLs, signing keys or other credentials. Non-secret credential reference names and monitor identities are portable; restored monitors remain paused and local files still require the matching monitor ID. The source erasure journal is carried so later restores can apply erasure fences.

An older offline archive by itself cannot disclose an erasure that happened after it was made. Export the later journal from **Runner / Archive** and provide it with the old archive when restoring; a local CLI import accepts it through the absolute-path `UPTIME_LATER_JOURNAL` setting. Restoring the old archive without the journal into a fresh installation cannot detect the later erasure. This is a limit of Base's offline transfer model. An archive someone downloaded before erasure remains outside the installation's control, as do messages already sent to email, webhook or Slack services; a request already in progress may still reach its provider after erasure.

## Erasure and audit

Owner-directed erasure removes a monitor and its dependent evidence, a destination and its credential copies, or an operator while at least one active owner remains. Monitor erasure requires typing the current monitor name. The last active owner is protected; use local reset or replace the hosted installation to establish a new owner. Uptime has no R2 upload store, so its product records have no uploaded attachments to erase.

Destructive actions and automated notification attempts, including test sends, are recorded with an actor or feature, time, action, subject kind and opaque reference. Operator authentication-mail provider attempts are audited before attempting the provider request. Legacy capture audit entries remain as history. Audit entries remain after subject erasure. When an operator is erased, prior actor references are anonymised, and a later journal makes restore refuse old audit actor references for an erased operator. See [Data and archives](/docs/data) for erasure receipts, restore limits and what an installation cannot recall.

## Rotating the session secret

`SESSION_SECRET` protects sessions, notification credentials and second-factor state. Keep it with the installation backup. Rotating it signs everyone out, makes stored notification credentials and factors unreadable, and invalidates recovery-code hashes. A member whose factors are unreadable cannot complete MFA. Recovery after losing that key is not implemented in this slice: restore the correct key from the installation backup or replace the installation, then enroll fresh factors and re-enter destination credentials. Monitoring keeps its separate runner authority. Do not restore a compromised old key.

## Report a problem

If you find a security problem or anything that looks wrong, open an issue on GitHub at https://github.com/just-every/run-uptime. Please leave out secrets, tokens and private URLs when you describe it.

## Related

[What Uptime does not do](/docs/limits) lists what the security claims here do not cover.

## Product roles and scopes

Base authenticates every request and owns invitation acceptance, operator identity, role/status changes and session revocation. Edition assignments narrow active Base members to editor, responder or read-only permissions. Owners and admins keep their Base ceiling. Unknown or stale assignments refuse access; request-supplied role claims grant nothing. Changing the Base identity or edition assignment blocks the next operation, while already-authorized results remain historical output.

Service scopes match a monitor's service and team scopes match its group label. Alternatives within a scope kind form a union; different kinds intersect. No scope rows means workspace authority. Scoped reads and permitted mutations operate on those monitors only; workspace documents, lists, exports and other unfiltered workspace services refuse. Transaction fences repeat live identity, role, scope and revision checks before writes. Authorized mutations and exports record an opaque actor without secret values.

ACCESS-001 remains partial. Member controls and scoped read keys are available through the API and CLI. Responders and editors can comment and set incident root causes within their monitor scope. CI definition credentials narrow authority to a named environment and tag selection; they cannot read secrets, export definitions or change roles. Settings includes member invitations, role/scope controls and owner monitoring/CI key management. Broader background-action accountability and initial narrowed-role console navigation remain gaps. Sensitive services named in the permission table remain owner-only. Key creation requires the Base owner and a second-factor check within the previous five minutes. The role lifecycle replaces the interim admin-summary exception; Base continues to authenticate operators.

Background accountability is also incomplete. Contact reminders retain due/repeat/stop state and an incident owner, but incidents may be unassigned. Retries and fallback chains retain due times and terminal outcomes, but lack a responsible assignee and individual stop/resolution. Discovery retains source authorization and visible outcomes; website Cancel only stops polling, not server work, and individual runs do not retain their initiating owner. Cleanup debt is visible and manually resolvable but has no assignee or remediation due date. Authentication-mail and monitoring-watch attempts retain durable outcomes without a console job view or per-attempt control. Archive export/restore are synchronous operations, not durable jobs; exports record their authorized actor but lack durable completion history. Definitions apply/undo retain approval identity, failure and undo history, but do not expose reloadable checkpoint progress and a general stop control.

## Settings security and keys

Open **Settings › People** to enroll an authenticator or passkey, confirm enrollment, save the ten recovery codes shown once, remove a factor, or change the require-all policy. Sensitive actions prompt for a fresh second factor after five minutes. Recovery codes and key tokens disappear when you confirm you saved them and cannot be read back from lists or APIs. Keep them in private storage.

The owner creates monitoring-read or CI keys with an expiry and explicit resource selection. CI keys additionally require one environment and selected tags. The list shows scope, restrictions, expiry, last use and revocation. Revocation applies to the next real read or operation. A key's definition jobs show its initiating owner, authorized checkpoint, refused next operation and revoked stop state, retained across restart; the native engine's earlier checkpoint remains history. Delegated issuance remains unavailable.

Enrollment and step-up work in an already-open Settings document with live member authority. The initial console sign-in challenge and narrowed-role shell entry remain incomplete. Recovery after total loss of every factor/code or the sealing key still requires installation authority.

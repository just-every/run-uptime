# Second factors through the API and CLI

Native email-link sign-in remains Base's authentication method. Uptime binds
TOTP and WebAuthn verification to that live Base session ID and operator version.
A revoked, expired or inactive Base identity cannot use an old factor proof.
This first slice provides API and CLI operations; the console enrollment and
step-up screens are pending. Provider MFA assertions await ACCESS-002 SSO.

## Enroll and sign in

Put your live native Base session cookie in `UPTIME_ACCESS_COOKIE` in your private
terminal environment. Keep it out of command arguments, shell history, logs and
shared files. All commands below use the exact application origin:

```sh
node scripts/mfa.mjs status --origin https://your-app.example
node scripts/mfa.mjs totp-enroll --origin https://your-app.example
```

For a local checkout, start `rer dev`, then run `node scripts/mfa.mjs
local-session --origin http://127.0.0.1:PORT` with the saved app origin. This uses
Base's existing local installation-authority endpoint and shows its new native
session cookie once. Keep that cookie privately in `UPTIME_ACCESS_COOKIE`, then
enroll or verify a second factor through the commands above. A dev-persona
cookie cannot be used by stopped-app archive/definitions commands: Base admits
it only behind the running dev key gate. Local session issuance never counts
as a second-factor proof.

Enrollment returns a challenge ID, a base32 seed and an `otpauth:` URI once.
Add the seed or URI to an RFC 6238 authenticator (SHA-1, six digits, 30 seconds).
Supply the challenge as JSON on standard input and the authenticator's current
code in `UPTIME_MFA_CODE`, then run `totp-confirm` with the same `--origin`.
After a later email-link sign-in, use `totp-verify` with the current code in
`UPTIME_MFA_CODE`. A consumed time step cannot be used again; use a subsequent
code or one unused recovery code for another session.

The first confirmed factor returns ten single-use recovery codes once. Store
them in your password manager. `recovery-use` accepts one in `UPTIME_MFA_CODE`;
`recovery-rotate` requires fresh verification and replaces all remaining codes
with ten new codes. Rotation and initial confirmation display the new set only
in the command's response. Status never returns a seed or recovery code.

Passkeys and security keys use standard browser WebAuthn on HTTPS or localhost.
`passkey-enroll` returns registration options and a challenge ID;
`passkey-confirm` accepts `{challengeId, credential}` on standard input, where
`credential` is the browser's registration response in WebAuthn JSON form.
For an existing key, `passkey-options` returns authentication options and
`passkey-verify` accepts the equivalent signed response. The browser must use
the exact application origin. A terminal cannot manufacture that response:
use a WebAuthn-capable browser client with the API below. Challenges expire
after five minutes, are single-use and bind the initiating Base session.
User verification is required. This does not replace email-link sign-in.

## Policy and sensitive actions

An owner with a fresh proof can run:

```sh
node scripts/mfa.mjs require --origin https://your-app.example --required true
```

Enforcement revokes existing sessions without a valid factor proof. A later
email-only session is refused at private documents and APIs; the factor door
remains available for enrollment and verification. Even with require-all off,
an account that enrolled a factor must verify it on each new session.
Enrollment does not grant a product role or widen an existing role.

Erasure, archive export/import, destination credential creation/rotation,
private-runner and synthetic/effects grants, token creation, member role changes
and MFA policy changes require a factor proof from the previous five minutes.
Base's separate fresh email proof for owner authority also continues to apply.
API and CI credential kinds that are not yet implemented are not enabled by MFA.

Local `rer export` and `rer import` also require `UPTIME_ACCESS_COOKIE` with a
fresh proof. Obtain a native local session and verify while dev is running, retain its cookie privately, stop dev,
then run the transfer within five minutes. For a receiving installation, run
setup first, start dev, sign in and enroll/verify its receiving owner, then stop
dev before import. Transfers recheck live authority at each progress boundary;
restore writes also fence authority in their database transaction. An expired
or revoked session stops further progress rather than producing a successful
transfer. Restart verification and the command if the proof becomes too old.

`remove --id FACTOR_ID` removes your own factor after fresh verification.
Removing your last factor clears proofs, challenges and recovery codes and
requires new enrollment for protected operations. An owner may use
`reset --id OTHER_OPERATOR_ID` to revoke another member's sessions and erase
that member's factors. An owner cannot reset their own factors this way.
The last owner can use an unused recovery code. If all factors and recovery
codes are lost, the API cannot recover them; installation replacement/recovery
remains the local owner's responsibility.

## API reference and custody

Every route is under `/api/access/mfa`, accepts a live Base session cookie and
returns `Cache-Control: no-store, private`. POST requires the exact application
Origin and `Content-Type: application/json`. Unknown fields and queries refuse.

| Method/path | Body |
| --- | --- |
| `GET /status` | None; safe factors, policy and proof freshness |
| `POST /totp/enroll` | `{}` |
| `POST /totp/confirm` | `{challengeId, code}` |
| `POST /totp/verify` | `{code}` |
| `POST /webauthn/enroll` | `{}` |
| `POST /webauthn/confirm` | `{challengeId, credential}` |
| `POST /webauthn/options` | `{}` |
| `POST /webauthn/verify` | `{challengeId, credential}` |
| `POST /recovery/verify` | `{code}` |
| `POST /recovery/rotate` | `{}` |
| `DELETE /factors/:id` | None |
| `POST /policy` | `{required: boolean}`; owner only |
| `POST /reset` | `{operatorId}`; another active member, owner only |

Mutations share a durable limit of 30 attempts per operator per ten minutes;
429 includes `Retry-After`. Factor and challenge material is sealed with a
purpose-specific key derived from `SESSION_SECRET`. Recovery codes are
stored only as keyed hashes. All factor authority is installation-local and
excluded from product archives; operator erasure removes it. Keep the
installation secret when recovering the database. Rotating or losing it makes sealed factors unreadable and invalidates the recovery-code hashes; recovery from that key loss is not implemented. Product archives restore into the receiving installation without importing factor authority.

Successful enrollment, verification, recovery, removal, reset and policy
operations record opaque audit and send a separate member security notice.
Notices contain no seed, recovery code, cookie or authenticator response.
A notice's provider outcome is retained; uncertain submissions do not replay.
A successful factor operation does not claim that its email was delivered.

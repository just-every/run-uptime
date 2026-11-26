Native email-link sign-in remains Base's authentication method. Uptime binds
TOTP and WebAuthn verification to that live Base session ID and operator version.
A revoked, expired or inactive Base identity cannot use an old factor proof.
The console enrolls and verifies factors; the same operations are available
through the API and CLI below.

## Enroll in the console

Saving an alert destination asks you to confirm your identity to protect where your alerts go; enrollment continues the saved request without retyping. Recovery codes let you complete verification after signing in when your authenticator or passkey is unavailable. Use **Copy all** or **Download** to keep the codes somewhere safe before choosing **I saved this**; each works once. Removing a member asks you to confirm their name before verification, and the only owner must add another owner first. (Run Edit Run fleet, 17 November 2026.)

Open **Settings › People**, then **Security and keys** › **Manage second
factors**. **Enroll authenticator** shows a QR code, an `otpauth:` link and a
manual secret once. Scan the QR code or open the link in an RFC 6238
authenticator app (SHA-1, six digits, 30 seconds), or enter the secret manually.
Enter the app's current code
and choose **Confirm authenticator**. **Enroll passkey** uses the browser's
standard WebAuthn prompt on HTTPS or `http://localhost`. A passkey needs a
website name, so the default address `http://127.0.0.1:PORT` offers an
authenticator app. To use passkeys on an existing local installation, stop it with `rer dev --stop`,
run `rer setup --host localhost` once in its checkout (it keeps your data), then
run `rer dev` and open its private `RER_OPEN` link. Return to
**Manage second factors** to enroll. To start a new installation with passkeys
instead, run `rer dev just-every/run-uptime --host localhost` from a folder that
does not contain an Uptime checkout. If you want to stay on `127.0.0.1`, choose
**Enroll authenticator** there. The first factor shows ten
single-use recovery codes once: store them in your password manager, then choose
**I saved this**. **Replace recovery codes** issues a new set after a fresh
verification.

## Sign in after enrolling

Once your account has a factor, each new sign-in asks for it. After the email
link (or, on your own computer, the `RER_OPEN` link from `rer dev`), an owner
sees **Verify your second factor** at the address they opened, such as `/setup`,
a console page or an alert drill link; opening `/login` again while signed in
goes to the same step. Enter the six-digit code your authenticator app shows
now, or one unused recovery code, and choose **Verify and continue**; with a
passkey enrolled on HTTPS or localhost, choose **Use a passkey**. The page you
opened then appears at that same address. A code that does not match, or a time
step already used, is refused: enter the app's next code. **Sign out** leaves
this step. Until the session is verified, every private page and API refuses it.
This step is the owner's: another member who enrolled a factor verifies each new
session with the command line below.

## Sensitive actions

A verification counts as fresh for five minutes. A sensitive action asks for a
code or passkey in place when verification is due. If you have no factor, choose
**Add an authenticator** to enroll with a QR code, app link or manual secret, or
choose **Enroll passkey**. Save the recovery codes when prompted. The pending
action then finishes without retyping. Cancelling keeps your entries so you can
try again. Settings › People also opens **Verify a second factor** whenever a
new verification is needed, separately from **Manage second factors**.

An email alert destination for the owner's own sign-in address is not a sensitive
action: alerts to it give nobody new access, so it saves without a second factor.
Any other address or URL still asks for one.

## Command line (alternative)

Put your live native Base session cookie in `UPTIME_ACCESS_COOKIE` in your private
terminal environment. Keep it out of command arguments, shell history, logs and
shared files. All commands below use the exact application origin:

```sh
rer run --script scripts/mfa.mjs status --origin https://your-app.example
rer run --script scripts/mfa.mjs totp-enroll --origin https://your-app.example
```

For a local checkout, start `rer dev`. In the checkout, run the following with
the app address printed as `RER_READY` in place of the example address:

```sh
rer run --script scripts/mfa.mjs local-session --origin http://127.0.0.1:8787
```
This issues a new native Base session and shows its cookie once. The new
session still needs factor verification, even if your browser session is fresh.
Keep the issued cookie in `UPTIME_ACCESS_COOKIE` and verify that session while
dev is running. Stopped-app archive and definitions commands require this
native session and its own factor proof.

Enrollment returns a challenge ID, a base32 seed and an `otpauth:` URI once.
Add the seed or URI to an RFC 6238 authenticator (SHA-1, six digits, 30 seconds).
Supply the challenge as JSON on standard input and the authenticator's current
code in `UPTIME_MFA_CODE`, then run `totp-confirm` with the same `--origin`.
For an enrolled authenticator, use the current code in the private terminal to
verify the native CLI session. In Bash or Zsh:

```sh
read -rs UPTIME_MFA_CODE
UPTIME_MFA_CODE="$UPTIME_MFA_CODE" rer run --script scripts/mfa.mjs totp-verify --origin "$UPTIME_ORIGIN"
unset UPTIME_MFA_CODE
```

Set `UPTIME_ORIGIN` to the same app address you used for sign-in. After
`read` starts, type the current code and press Enter. A
consumed time step cannot be used again; use a subsequent code or one unused
recovery code for another session.

The first confirmed factor returns ten single-use recovery codes once. Store
them in your password manager. `recovery-use` accepts one in `UPTIME_MFA_CODE`;
`recovery-rotate` requires fresh verification and replaces all remaining codes
with ten new codes. Rotation and initial confirmation display the new set only
in the command's response. Status never returns a seed or recovery code.

### Verify a local CLI session with a passkey

1. Keep dev running at the `http://localhost:PORT` address where you enrolled
   the passkey. Run `local-session` as shown above with that exact `RER_READY`
   origin. Keep the issued `cookie` value in your private terminal as
   `UPTIME_ACCESS_COOKIE`.
2. In a browser profile that can use your passkey, open the plain `RER_READY`
   address. In the browser's developer tools, open the cookie table for that
   origin (in Chrome, **Application › Storage › Cookies**). Add a cookie using
   the part before the first `=` as its name and the part after it as its value.
   Use `localhost` as the domain, `/` as the path, **HttpOnly** and
   **SameSite Lax**. Replace any cookie with the same name and path.
3. Open `/app` at that same origin and choose **Use a passkey**. Use the plain
   address throughout this handoff so the browser verifies the CLI-issued
   session. In the terminal, run
   `rer run --script scripts/mfa.mjs status --origin "$UPTIME_ORIGIN"` and
   check that it reports `"fresh": true`. For a backup, [stop dev and export
   within five minutes](/docs/data#transfer-from-the-command-line).

### Passkey operations for browser clients

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
rer run --script scripts/mfa.mjs require --origin https://your-app.example --required true
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

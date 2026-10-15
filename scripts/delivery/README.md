# Assisted delivery policy

`base/packaging.json` is Uptime's single packaging policy. The runtime is exported
from Base `d6080a22a66794d7b817f7eccb72ca077ffd9ecf`, without donor tests.
`base/setup-manifest.mjs` has only the exporter's documented schema import-path
relocation; every other runtime file is recorded as a verbatim Base copy.

Build with `pnpm exec rer build`, then run `node scripts/build-delivery-artifact.mjs`
into a fresh `delivery-artifact` directory. The producer emits schema-2 raw
payloads and exact migration bytes. It makes no provider request. The managed
workflow is a manual caller of trusted-build at
`6d77ec14e366eb9f4acc0eac41fac40b61e2e10a`; publishing, installing and deploying
require the owner's separate release work.

The committed descriptor and workflow are generated from this policy. Its
`setup.manifestFile` selects canonical `rer-setup.json` for hosted setup;
the descriptor digest covers those exact bytes. Local setup uses the generated
`rer-local-setup.json`, which also offers the development outbox. Full verification remains the
project profile. Existing owner-account deployment and inert deploy-kit CI
artifacts retain their separate controller contract.

After `rer build`, run `pnpm spec:generate` to refresh
`management/integration/deployment-spec.json`, the setup digest and local setup
manifest. The specification comes from Base's artifact spec reader with this
packaging policy. `rer verify` runs `pnpm spec:check` after building and refuses
drift. Hosted setup assigns `UPTIME_ORIGIN`, prefills the owner email and
generates the hidden owner-claim token; select a mail provider and supply its
verified sender and credentials before deployment.

`setup-build.sh` prepares the seed's pinned Node 22.20.0, pnpm 10.12.4 and
browser dependencies in local ignored build tools. Descriptor build/verify/artifact commands select those tools. This
source preparation creates no application owner; ordinary `rer setup` remains
the owner-facing application installation command.

The signed owner-claim manifest names `OWNER_EMAIL` and hidden generated
`SETUP_TOKEN`. RER's trusted plan supplies `RER_OWNER_CLAIM_ISSUER`,
`RER_OWNER_CLAIM_INSTALLATION_ID`, `RER_OWNER_CLAIM_APP_ORIGIN` and the public
P-256 signing key ring `RER_OWNER_CLAIM_PUBLIC_KEYS`. Its application origin must
equal `UPTIME_ORIGIN`. Owner email, setup token and session secret map directly
to native operator-auth. These values never come from a claim request.
`0016_owner_claim.sql` follows all existing migrations. Keep the claim and
bootstrap ledgers permanently; existing `/auth/bootstrap` remains supported.

The editor uses trusted `RER_MANAGEMENT_ORIGIN` and `RER_INSTALLATION_ID`.
`GET /api/editor/config` checks the real native owner before reading config,
returns private no-store grants bounded by native session expiry, and refuses
anonymous/member sessions. Both settings must be present and valid to enable
the editor. Documents restrict `frame-src` and `frame-ancestors` to the exact
management origin (plus same-origin ancestors). Native logout and authority loss
revoke the mount; focus and grant renewal recheck the session. No secrets enter
the config response or browser bundle.

`pnpm run test:admission` verifies signed native admission and second-claim
refusal, and the emitted app/editor at 1440 and 390.
The browser management peer is a labeled test-only network edge. Those checks
prove local wiring and CSP enforcement, not stage installation or live RER and
Cloudflare acceptance.

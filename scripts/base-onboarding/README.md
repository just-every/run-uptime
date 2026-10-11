# Shared local setup lifecycle

First-party seeds expose public operations through the RER dispatcher. From a
runnable seed checkout, the supported local sequence begins with
`node scripts/rer.mjs install`, `node scripts/rer.mjs setup` and
`node scripts/rer.mjs dev`; owner sign-in uses the printed local outbox. The
command contract and flags are documented in the runnable checkout's root
`RUN-LOCALLY.md`.

This directory contains the shared lifecycle and adapter helpers used by a
seed's RER setup and runtime commands. It centralizes manifest validation,
private settings, captured child commands, owner bootstrap, sign-in, local
state safety, readiness and cleanup. A seed declares its actual product inputs
and effects; the shared lifecycle does not create a product fallback or
provider behavior.

## Adapter contract

A first-party adapter in `scripts/installer/local.mjs` exports `commandAdapter`
and its setup hooks. The command adapter selects one root `rer-setup.json`
manifest and declares real targets and policy for dependencies, build,
migrations, development, preview, verification, deployment and portability.
Package scripts for public verbs dispatch to `node scripts/rer.mjs VERB`;
internal targets use different names so the CLI cannot call its own alias
recursively.

The shared setup lifecycle supports these hooks: `node`, `tools`, `prepare`,
`dependencies`, `origin`, `secrets`, `build`, `migrate`, `start`, `health`,
`owner`, `signIn`, `hosting`, `guard`, `failure` and `features`. A hook can
declare an argv command or use its provided context and command store. The
adapter owns real migrations, resource names, auth hooks, settings names, data
policy and deployment effects. The CLI owns parsing, public flags, pins,
containment, locking, capture, cancellation, output, exit mapping and
sequencing.

`rer-setup.json` is the only setup schema. Its fields, groups, defaults,
conditional requirements and ordered steps define which answers are accepted.
Secrets are read privately from declared inputs, generated only where the
manifest specifies a generation method, and never accepted as CLI values.
`--owner-email` maps to the manifest's owner-claim field. A non-interactive
setup must supply every required answer; it never silently adopts the git
identity. Conflicting flag and answer-file values fail before effects.

## Setup behavior and custody

Setup validates answers before effects, then uses the declared lifecycle to
prepare local state, private settings, build and migrations, start the real
application briefly, prepare the first owner and verify ordinary sign-in via
the loopback development outbox. It stops the temporary app before returning.
Reruns preserve an existing owner, data and exact settings bytes; setup does
not create a second owner or rotate secrets. Dev and preview use the saved
owner and canonical durable state. A normal sign-in uses the same local
outbox; no external email is sent by local commands.

Adapters use the shared captured command store for child work. It redacts
registered credential values from terminal output and private logs, records
child outcomes, and stops owned descendants on failure or cancellation.
Readiness checks the application's real health endpoint and obeys cancellation
and deadlines. Builds temporarily remove declared private files from the build
environment and restore their exact bytes and permissions afterward. Do not
pass secrets in argv, print credentials, or substitute mocks for app behavior.

Canonical local durable data is `.wrangler/state`; CLI bookkeeping is
`.rer/local`; setup drafts and logs are under `.seed/installer`. Private
settings use mode 0600 and secret-bearing directories use mode 0700. State
selection rejects unsafe symlinks, traversal and overlap with source, exports,
dependencies or build outputs. Ambiguous existing state is preserved for
explicit recovery rather than adopted, moved or deleted silently. Reset uses
the adapter's declared removal inventory and preserves source, dependencies,
exports and deployment receipts.

## Data, deployment and verification

Each first-party adapter declares which resources local export/import supports.
Every first-party seed verifies a complete local export/import/export round
trip across those resources. Archives are private and integrity-checked;
owner/auth, outbox, private settings and transient runtime state remain
excluded. Import validates and restores atomically into an empty destination.
Remote transfer is supported only when every required resource has a complete
adapter implementation; unsupported targets fail visibly.

Deployment uses each seed's actual owner-account declaration, resource policy,
migrations and health check. Dry run validates and builds locally without
provider requests. Local tests and structural checks do not establish hosted
acceptance or external mail delivery.

Keep server authorization in every private handler, including direct server
function transports, and keep server-only code and secrets out of browser
bundles. Preserve applied migration history and use verified forward
migrations for schema changes. Keep files focused and choose shared source
placement for maintainability; a seed may adapt its stack and integration to
its real product requirements.

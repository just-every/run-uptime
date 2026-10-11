# Operations manifests and command inspection

First-party seeds expose inspection through their portable RER command. From the
seed root:

```sh
node scripts/rer.mjs describe --json
node scripts/rer.mjs check --profile first-party --json
```

`describe` returns the command contract: profile, declared Node and pnpm pins,
exposed verbs and supported flags, effects, matching package aliases, and local
state/settings locations. It reads `OPERATIONS.json` and the declared command
adapter; it does not return the operations manifest itself or test environment
values.

`check` validates declared command input files and required enabled loops.
The first-party profile also enforces the manifest's `seedContract` marker,
adapter hooks and flags, command targets, package aliases, tool pins, complete
portable source inventory and copied source hashes. An explicit
`--profile first-party` rejects a missing marker. With `--json`, it emits a
result event containing `ok`, `exitCode` and individual clauses on stdout;
without it, failed clauses are printed for the owner. Exit 0 means the structural
checks passed; failures exit nonzero. Read the seed's `OPERATIONS.md` to resolve
manifest or source problems.

These commands require Node but no installed packages. They do not run setup,
deployment, verification, configuration validators, environment readiness checks
or network requests. Structural success does not establish installed tool
versions, configured local inputs, provider access, remote health or product
acceptance. `node scripts/rer.mjs doctor --json` separately diagnoses installed
tools and local inputs through the manifest inspector.

## Internal manifest tooling

The shared `operations.mjs` and `project-operations.mjs` modules implement
`readOperations`, `describeOperations` and `inspectOperations` for RER and other
local consumers. They ship together under the portable source tree. Manifest
reading validates fields, referenced documents and configuration modules, and
resolves declared command inputs. `describeOperations` returns the operations
manifest after checking command availability; it is distinct from RER's public
command descriptor.
Run directly in a project that has `scripts/rer.mjs`, `operations.mjs describe`
and `check` forward to `node scripts/rer.mjs describe` and `check`. In an
independent project without RER they print the inspector's own JSON and advice,
naming the script by the path it was run from.

`inspectOperations` checks required environment names, selected loop inputs and
an optional pure `validateConfiguration(env)` module. It reports input names
and suppresses validator details and values because parser exceptions may contain
credentials. Consumers can pair the reported input names with
`environmentSources` and operating documentation to guide setup. Missing inputs
need configuration before readiness can pass; malformed supplied values are
reported without exposing them. Inspection never executes the declared
setup, deployment or verification commands. Generated deployment caches and build
artifacts, provider identity and permissions, credential validity, delivery,
deployed health and acceptance remain unchecked.

An optional `environmentSources` map explains where declared inputs come from.
Keys must name declared inputs; values must be short, plain source guidance
without URLs or credentials. Add safe sources so owners can find inputs without
putting values in the descriptor.

Version 1 manifests require edition identity, `OPERATIONS.md`, `ACCEPTANCE.md`,
`scripts/operations-config.mjs` and valid package command declarations for setup,
deploy and verify. The adapter validates local configuration only. Version 2
supports project-owned commands and documents as described below.

Run `node --test operations/*.test.mjs` in Base. Composition copies the shared
modules from its pinned Base commit. Configuration adapters stay project-owned;
these modules do not create a shared deployment engine or change authentication.

## Independent projects (version 2)

The manifest inspector is optional tooling, not the RER management admission
contract.
Software can keep its own language, framework, package manager, source layout and
operating procedures. A project choosing this inspector can use `OPERATIONS.json`
version 2 without `edition.json`, `seed.json`, `package.json`, `pnpm`, or a fixed
acceptance filename. Copy both `operations.mjs` and `project-operations.mjs` together.
Version 1 uses the edition-specific requirements listed above.

```json
{
  "version": 2,
  "project": "publisher/project",
  "runtime": { "requirements": [{ "name": "python", "version": ">=3.11" }] },
  "requiredEnvironment": [],
  "commands": {
    "verify": {
      "argv": ["python3", "tools/verify.py"],
      "inputs": ["tools/verify.py"],
      "effects": "Runs local checks; no remote writes."
    }
  }
}
```

Command names and argument arrays are project-owned; consumers should invoke
them directly without an implicit shell. Manifest inspection never invokes them.
`inputs` lists checkout files required to invoke the command, including its
script or build manifest. Missing inputs make that
command unavailable. Absolute paths, traversal and symlinks outside the checkout
are rejected. Declare accurate effects, including provider writes, migrations
and destructive actions; a description is not execution authorization.

Optional `documentation.document` and `acceptance.document` reference project-owned
local documents. For a version 2 project, a declared `documentation.document`
pointer is the setup guidance named by the internal inspector summary; without
that pointer, it names the project setup documentation generally. If no setup command is declared, the
summary reports that and directs the owner to the available setup guidance.
Optional `configuration.module` references a local ES module
exporting `validateConfiguration(env)`. It must only validate local configuration;
`inspectOperations` imports and calls it, so inspect untrusted source before
running a diagnostic that uses it, including RER doctor.
Without a module, configuration checking covers required environment names only.
Runtime requirements are descriptive: neither command availability in PATH nor
installed versions are checked. All command inputs must be declared accurately;
the inspector does not infer arbitrary language or build-system dependencies.

An optional per-input source map can guide setup without putting values in the
descriptor or diagnostic output:

```json
{
  "requiredEnvironment": ["RESEND_API_KEY"],
  "environmentSources": {
    "RESEND_API_KEY": "1Password production vault, mail integration item"
  }
}
```

For v2, source keys may also name inputs selected by declared mail loops. Source
text is limited to 8–180 characters and rejects URLs, equals assignments,
credential labels containing values, and token-like values. Use a document pointer
such as `OPERATIONS.md` or plain guidance such as `Team vault: production mail item`;
never paste an environment assignment or credential into this metadata.
`inspectOperations` still reports local inputs only; remote deployment,
provider access, and acceptance remain unchecked.

Agents can adapt any software and author operating knowledge in its repository.
Provider targets must separately support and verify the actual declared effects,
resources, migrations and recovery. This local descriptor does not admit a project
to hosted execution, provision resources, or prove provider/runtime compatibility.

## Required loops (version 2)

A v2 descriptor may add a declarative `loops` array:

```json
"loops": [
  { "id": "ticket-replies", "type": "mail", "required": true, "enabled": true, "provider": "resend" },
  { "id": "nightly-summary", "type": "worker", "required": false, "enabled": false }
]
```

`inspectOperations` fails for required disabled loops, missing/blank selected
mail inputs or a conflicting `MAIL_PROVIDER`. SendGrid requires `SENDGRID_API_KEY`; Resend requires
`RESEND_API_KEY`; Cloudflare Sending requires `CLOUDFLARE_EMAIL_API_TOKEN` and a
32-hex `CLOUDFLARE_EMAIL_ACCOUNT_ID`. Other providers' keys cannot satisfy the
selection. Disabled optional features stay optional. This is a local input check,
not credential validity, DNS verification, delivery or remote runtime health.

A mail loop can instead declare `binding` to follow a runtime-selected provider
and project-owned environment names. `provider` and `binding` are mutually
exclusive. For example:

```json
{
  "id": "sign-in-mail",
  "type": "mail",
  "required": true,
  "enabled": true,
  "binding": {
    "providerEnvironment": "MAIL_PROVIDER",
    "providers": {
      "sendgrid": { "apiKeyEnvironment": "MAIL_API_KEY", "requiredEnvironment": ["MAIL_FROM"] },
      "resend": { "apiKeyEnvironment": "MAIL_API_KEY", "requiredEnvironment": ["MAIL_FROM"] },
      "development": {
        "requiredEnvironment": ["MAIL_FROM"],
        "development": { "modeEnvironment": "ENVIRONMENT", "originEnvironment": "APP_URL" }
      }
    },
    "whenUnset": {
      "provider": "resend",
      "apiKeyEnvironment": "RESEND_API_KEY",
      "requiredEnvironment": ["RESEND_FROM_EMAIL"]
    }
  }
}
```

Every environment name must match `[A-Z][A-Z0-9_]*`. A nonempty `providers` map
supports `sendgrid`, `resend`, `cloudflare` and `development` only. Every provider
entry declares `requiredEnvironment` (an empty array is allowed). Hosted entries
also require `apiKeyEnvironment`; Cloudflare additionally requires
`accountIdEnvironment`, checked as 32 hex characters. Those account declarations
are exclusive to Cloudflare. Only the selected entry's inputs can satisfy its
readiness check. The inspector checks presence and the declared guard; a project's
configuration module remains responsible for its native sender and credential
validation. A required mail loop still fails when foundation-only configuration
is valid but mail has not been configured.

Optional `whenUnset` declares a hosted provider and its inputs with the same
shape. It applies only if the selector is absent (`undefined`), never for blank,
unknown or non-string selectors. It cannot select development. Without
`whenUnset`, an absent selector blocks readiness and names the selector input.

Development entries require `development.modeEnvironment` and
`development.originEnvironment` and cannot declare a credential. The mode must
be exactly `development`. The origin must be a canonical HTTP(S) loopback origin
(host exactly `localhost`, `127.0.0.1` or `[::1]`, with optional port and trailing
slash), without user information, path, query or fragment. Alternate numeric
hosts and normalization-dependent spellings are rejected. Preview, production
and remote origins cannot satisfy this guard. No host lookup occurs. This only
checks a declared development guard; it does not create or send to an outbox.

Malformed loop or binding fields, unknown properties and unsupported providers
are rejected even for disabled loops. Valid optional disabled loops continue to
pass; required disabled loops continue to block readiness. `environmentSources`
may name the selector and any input declared by any provider or `whenUnset`.
Missing-input guidance uses the actual selected names and their declared source;
Inspector results and summaries never include environment values. Both modules
ship together; no additional runtime adapter is needed.

The [deploy kit](../modules/deploy-kit/README.md) creates new v2 inspector and
edition-authoring templates without overwriting an existing edition. Both inspector
modules ship together.

## First-party command profile

OPERATIONS v2 may declare:

```json
"seedContract": {
  "version": 1,
  "profile": "first-party",
  "adapter": "scripts/installer/local.mjs"
}
```

The adapter exports `commandAdapter` and `install`. First-party adopters use the
shared RER commands and contract described above. The manifest inspector retains
its environment, configuration and loop diagnostics for RER doctor; RER check
performs structural validation before dependency installation. Independent
projects retain their own supported argument arrays and stack.

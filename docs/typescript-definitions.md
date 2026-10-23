# TypeScript monitor definitions

The definitions CLI can load a buyer-selected `.ts` or `.mts` file on the buyer's
machine. Export one native version-8 monitor document as the default export:

```ts
import type {NativeDefinitions, HttpMonitorDefinition} from './src/domain/definitions/types.ts';

function health(name: string): HttpMonitorDefinition {
 return {
  name: `${name} health`, type: 'http', url: `https://example.com/${name}/health`,
  environment: 'staging', tags: ['api'], intervalMs: 60 * 1000,
  assertions: {status: [200, 204]},
 };
}

export default {
 format: 'uptime.monitors', version: 8,
 monitors: ['checkout', 'accounts'].map(health),
} satisfies NativeDefinitions;
```

Save this example at the checkout root, or adjust the type-only import relative
to the selected file. Helpers may live in other files and use ordinary relative
imports with explicit extensions, such as `import {health} from './checks.mts'`.
Functions, computed values and top-level `await` are allowed. The CLI does not
restrict definitions to object-literal syntax.

The public type-only module exports `NativeDefinitions` (`DefinitionFile` is an
alias), `MonitorDefinition`, and input types for HTTP, keyword, heartbeat,
browser flow, page-speed, API transaction, mail, TCP, UDP, ping, DNS, TLS and domain
checks. It also exports their assertion, fixture, metadata, maintenance and
credential-reference shapes. These describe portable input. Installation-local
runner assignments, session authority and credential values are absent. Use
`credentialRef` for an existing local credential; never place a secret in source,
API variables, headers, bodies or the evaluated document. Native validation also
refuses unsupported fields and literal authentication values.

Preview the explicitly selected environment and tags, then apply its reviewed
digest using the same file and selection:

```sh
node scripts/definitions.mjs preview --input uptime.monitors.mts --environment staging --tag api --json
node scripts/definitions.mjs apply --input uptime.monitors.mts --environment staging --tag api --digest REVIEWED_DIGEST --json
```

The CLI evaluates the module before sending its JSON through the ordinary
native definition parser, semantic validation and reviewed import door. The
Worker never evaluates TypeScript. New monitors remain paused, and existing
activation and maintenance remain installation-controlled. JSON export remains
the portable representation; it does not reconstruct the TypeScript program.

Only execute your own trusted source and dependencies. Loading a module executes
normal local Node code with the buyer process's operating-system permissions;
the child process is not a security sandbox. It may read files or the environment
and perform side effects. Review its imports as well as the entry file.

The entry file uses the CLI's regular-file, `O_NOFOLLOW`, UTF-8 and 2 MiB bounds.
Evaluation uses those already-opened bytes rather than reopening that path;
relative imports use normal Node resolution. Helper dependencies are trusted
local code, not an independently bounded source archive. Evaluation is limited
to ten seconds and the resulting JSON to 2 MiB. The native document permits at
most 500 monitors. Child stdout/stderr and raw evaluation errors are discarded,
so buyer logging, source excerpts and exception values do not become CLI output.

Use the checkout's pinned Node 22.20.0 runtime. Its native type stripping is
enabled by default. It strips erasable types and `satisfies`; it does not
typecheck. Use the existing TypeScript compiler or an editor for authoring
checks. Native Node loading ignores `tsconfig` transformations and path aliases;
JSX, decorators and syntax requiring transformations such as enums or parameter
properties are unsupported by this loader. The CLI does not enable experimental
TypeScript transformations. Explicit `import type` prevents type-only imports
from being resolved at runtime. `.mts` is the clearest ESM spelling; both selected
`.ts` and `.mts` entries are loaded as ESM.

Preview and apply evaluate source independently. The reviewed digest binds the
evaluated native definitions and the receiving installation's reviewed state.
A changed helper or environment-dependent computation that changes the selected
definitions changes that plan and refuses the old digest. This is not a digest
of the full TypeScript source or dependency tree: source-only changes producing
identical native definitions have the same semantic plan. Keep reviewed source
and dependency locks in version control, and use the same checkout and explicit
selection for both commands.

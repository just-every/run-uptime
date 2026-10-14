# Published RER demo adoption

This checkout pins the published `@runeditrun/rer` package exactly to `0.2.4`.
That release includes demo mode and hosted demo preparation. Its registry
SHA-512 is recorded in `pnpm-lock.yaml`; a frozen install applies the narrow
committed patch through Base's documented `pnpm patch` route (Package mode).
No external Base checkout is needed at runtime.

The patch changes exactly three published package files:

- `modules/container/boundary.mjs` and `modules/container/README.md` are
  byte-for-byte from immutable Base revision
  `e83eb9f13ae3282b81347ac4b482196606f2a9e9`. They sanction the canonical exported
  demo guard at `src/modules/demo/index.mjs`, with only its unaliased
  `import { env } from 'cloudflare:workers'`.
- `cli/package-mode.mjs` retains the local integrity correction: recognize pnpm's
  `(patch_hash=...)` importer resolution while checking the pinned base package,
  patch declaration and path, snapshot, and actual SHA-256 patch digest.
  Missing, altered or mismatched patches still fail the contract check.

All other package files are the published 0.2.4 artifact, including its new
secret-readiness and recovery behavior. This is not a whole-package e83 source
adoption. The obsolete broad 0.2.2 source patch has been removed. Replace the
remaining patch when an exact published release carries these corrections.
Do not replace the CLI with a seed command wrapper.

`modules/demo` requires operator-auth's shared CSP helper. The app's
operator-auth runtime copy remains at immutable Base revision
`a6afad9f4d007bf1b97a75bd67880d1850683e5d`, as the SC-05 source contract
requires; historical SQL migration bytes remain intact. The old foundation
comparison baseline is retained in the edition source lock.

The app-side demo module retains the a6 source at `src/modules/demo`, with an
explicit `edition.json` mapping to Base's `modules/demo` comparison baseline.
Its `index.mjs` adapts only the two relative operator-auth imports to
`../../base/modules/operator-auth/http.mjs` and
`../../base/modules/operator-auth/csp.mjs`. The guard behavior is unchanged.
The five other files have individual byte-equality records in `base-copies.json`;
the adapted index is covered by the edition mapping and source lock, not claimed
as a verbatim copy. Operator-auth remains unchanged at its a6 runtime pin.

The credential-free `rer deploy --demo --dry-run` now prepares the front Worker,
configuration and workerd image locally. This clears container admission only;
Docker execution and hosted acceptance remain unproven. The separate Base
owner-deploy exact-repeat provider-write and receipt-preservation regression
remains a release blocker.

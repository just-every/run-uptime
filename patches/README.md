# Base demo source adoption

The registry release `@runeditrun/rer` 0.2.2 does not contain demo mode. This
checkout retains its exact package pin and uses Base's documented `pnpm patch`
route (`global/README.md`, Package mode). A frozen install applies the committed
patch, so `pnpm exec rer demo` and the run-demo workflow use the same CLI.

The patch adopts the changed portable package sources from immutable Base
revision `a6afad9f4d007bf1b97a75bd67880d1850683e5d` (the 0.2.4 source), produced
from its `scripts/rer-package.mjs` package inventory. The package identity stays
0.2.2; this is a source adoption, not a claim that npm has released 0.2.4.
Only `modules/container/boundary.mjs` and `modules/container/README.md` are
additionally adopted byte-for-byte from immutable Base revision
`e83eb9f13ae3282b81347ac4b482196606f2a9e9`. They sanction the canonical exported
demo guard at `src/modules/demo/index.mjs`, with only its unaliased
`import { env } from 'cloudflare:workers'`. All other previously adopted package
sources remain at the a6 revision above; this is not a whole-package e83 update.

One local CLI correction is carried in `cli/package-mode.mjs`: recognize pnpm's
`(patch_hash=...)` importer resolution, while checking the pinned base package,
patch declaration, snapshot, and actual patch digest. Previously `rer check`
rejected any valid `pnpm patch` installation even though Base recommends it.
Missing, altered or mismatched patches still fail the contract check.

Replace this patch with an exact published package update when Base publishes
these capabilities and that checker correction. Do not replace the CLI with a
seed command wrapper or require another checkout at runtime.

`modules/demo` requires operator-auth's shared CSP helper. The app's
operator-auth runtime copy moves as one unit to the same Base revision, as the
SC-05 source contract requires; historical SQL migration bytes remain intact.
The old foundation comparison baseline is retained in the edition source lock.

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

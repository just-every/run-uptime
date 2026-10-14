# Base demo source adoption

The registry release `@runeditrun/rer` 0.2.2 does not contain demo mode. This
checkout retains its exact package pin and uses Base's documented `pnpm patch`
route (`global/README.md`, Package mode). A frozen install applies the committed
patch, so `pnpm exec rer demo` and the run-demo workflow use the same CLI.

The patch adopts the changed portable package sources from immutable Base
revision `a6afad9f4d007bf1b97a75bd67880d1850683e5d` (the 0.2.4 source), produced
from its `scripts/rer-package.mjs` package inventory. The package identity stays
0.2.2; this is a source adoption, not a claim that npm has released 0.2.4.
The app-side demo module is copied separately and recorded in `base-copies.json`.

One local CLI correction is carried in `cli/package-mode.mjs`: recognize pnpm's
`(patch_hash=...)` importer resolution, while checking the pinned base package,
patch declaration, snapshot, and actual patch digest. Previously `rer check`
rejected any valid `pnpm patch` installation even though Base recommends it.
Missing, altered or mismatched patches still fail the contract check.

Replace this patch with an exact published package update when Base publishes
these capabilities and that checker correction. Do not replace the CLI with a
seed command wrapper or require another checkout at runtime.

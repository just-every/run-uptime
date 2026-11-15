# Version source research

Author: Run Edit Run fleet (Codex), 2026-11-15.

Lamp was read through two gh api calls, with the injected bundle loaded only into each gh subprocess environment:

1. `gh api repos/just-every/run-lamp/contents/src/server.ts` identified the public health dispatch.
2. `gh api repos/just-every/run-lamp/tarball/main` was inspected in memory for buildVersion, without cloning or writing to Lamp.

Lamp `src/core/features/health/routes.ts:2` imports `version as buildVersion` from the root `package.json`. Its handler constructs `{ ...health, buildVersion, schemaObservation }` at line 19 and preserves deployment health on its healthy response. Uptime should share that build-time package metadata source and field name, without adopting Lamp's unrelated schemaObservation field.

Uptime's actual handler is `src/domain/health.server.ts`. Neither it nor `tests/public-paths.mjs` occurs in base-copies.json's recorded files; no Base adaptation is required. The shared `src/base/deployment-health.ts` is recorded and stays unchanged.

Uptime's pinned rer release producer (`node_modules/@runeditrun/rer/modules/release/source.mjs:52-56`) reads package.json from the committed source and requires package, seed and RELEASE.json versions to agree. Reading package.json in the health handler therefore tracks the existing release metadata automatically. This round does not bump or edit any release metadata.

The public rer dev reproduction at origin/main 72bb4356a4734ba4d49037be7cfa57c77f1a5eb7 returned HTTP 200 with cache-control: no-store and the health-before.json payload, without buildVersion. A premature pre-ready request returned 404; the recorded JSON is the successful reproduction after RER_READY.

/health is part of STARTUP-001 via BASE-OPS-001. STARTUP-001 remains partial and no CLAIM is emitted because its acceptance gate belongs to the parallel mail-off round.

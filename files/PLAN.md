# Plan for gr-mt-uptime-dep-3

Repository scope: just-every/run-uptime. Product branch: cloud/gr-mt-uptime-dep-3.

1. Initialize the fleet launcher, credential helper, Git identity and commit hooks. Clone full commit/tree history and read the repository rules and current manifests.
2. Establish both reported dependency paths and their currently locked Undici versions. Pin the first patched version, 7.30.1, with root and mail-module pnpm overrides; regenerate both lockfiles using pnpm 10.12.4. Preserve unrelated dependency versions and platform metadata.
3. Install both frozen dependency trees with Node 22.20.0. Run non-interactive RER owner setup, the product build, descriptor generation and TypeScript checks. Run existing HTTP probe and notification delivery journeys, plus a nested mail-module Miniflare runtime smoke check.
4. Acknowledge the two intentional Base mail copy adaptations using the edition authoring CLI. Regenerate the source lock last and check its freshness. Do not modify contract clauses or generated acceptance views.
5. Commit only product manifests, lockfiles and required provenance records using the fleet identity and active hooks. Fetch main and reconcile any drift without rewriting published history.
6. Scan the exact candidate with Base's publication scanner, inspect all candidate commit identities/messages, and publish only the named product branch through the cloud push guard when its gates pass. Poll its exact-SHA Verify through REST within the ten-call budget and 300-second interval.
7. Write result.json, a full report and actual receipts. Publish explicitly selected non-secret evidence only to evidence/gr-mt-uptime-dep-3. Return product custody and evidence custody separately. Preserve a verified bundle outside the clone if publication is blocked.

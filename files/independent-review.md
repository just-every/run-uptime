# Independent dependency investigation and patch review

Author: Run Edit Run fleet, 2026-11-15.

Two fresh read-only agents performed the pre-patch investigation and the post-patch review required by the security fix skill. Neither edited the checkout or used GitHub APIs.

Investigation facts: root pnpm-lock.yaml resolved seroval 1.6.7 through router-core, start-client-core, start-plugin-core, start-server-core and seroval-plugins. All four TanStack manifests permit ^1.6.7; the plugin peer permits ^1.0. Nested mail lockfile has no seroval. The app delegates SSR through start.fetch. Framework server-function request processing can call fromJSON; no direct application seroval import was found. An application-specific remotely exploitable path was not established.

Candidate review: no concrete surviving affected resolution, compatibility regression, unrelated upgrade or source-lock inconsistency found. Only seroval resolution and matching source-lock digest changed. The root graph has seroval 1.6.11 on all five edges. The nested mail lockfile has none. Contract files and tests are unchanged. Read-only source-lock check, diff whitespace check, checksum consistency and a representative structured-data round trip passed.

Limits: independent review did not run advisory-specific exploit reproductions or the full suite. Existing browser journey, package probes, build and typecheck are recorded separately in the actual check receipt.

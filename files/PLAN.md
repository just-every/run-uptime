# Plan for gr-mt-uptime-dep-5-c1

1. Configure fleet identity, launcher credentials, Git helper, publication hooks and pinned Node/pnpm.
2. Clone only just-every/run-uptime and create cloud/gr-mt-uptime-dep-5-c1 from current origin/main. Read contributor and verification instructions; compare the previous candidate without merging it.
3. Set only the exact Vite development dependency to 8.2.4 and regenerate pnpm-lock.yaml with Node 22.20.0 and pnpm 10.12.4. Keep unrelated package resolutions, source files, contract judgments and generated views intact. Refresh only the necessary source-lock hashes from main's newer source lock.
4. Install frozen dependencies, build, typecheck, check source and contract freshness, and run the dependency-sensitive development/build/security journeys. Record actual commands and results outside the product repository.
5. Make one plain fleet-authored commit without trailers; inspect all candidate identities and messages. Push only the named cloud branch through the fleet guard and verify the advertised remote head.
6. Do not open a PR, dispatch/rerun workflows, tag, release or update main. Follow the brief's specific instruction not to wait for Verify; report any discovered exact-SHA run without claiming unobserved green CI. Publish explicit non-secret report and receipt files through the evidence ref separately from product custody.

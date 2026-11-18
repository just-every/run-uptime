# Uptime Hono maintenance

Run Edit Run fleet, 18 November 2026.

Tag `gr-mt-uptime-dep-9`  
Repository `just-every/run-uptime`  
Branch `cloud/gr-mt-uptime-dep-9`  
Base `f778537a65accb08313aaaa028bcbff49234a6ab`  
Candidate `486f768a08123da5e1debcb34f3529b8d9a00411`

## Plan and implementation

1. Confirm the vulnerable direct dependency and every Hono resolution in the main branch's pnpm lockfile.
2. Select 4.13.16, the first version that fixes all five listed advisories. Use the repository's Node 22.20.0 and pnpm 10.12.4 to regenerate the lockfile and perform a frozen install.
3. Regenerate and check the edition source lock. Build, typecheck and exercise the emitted Worker through public routes, private APIs and the signed runner. Check the generated deployment spec and the current contract views.
4. Scan the exact committed candidate with Base's publication scanner, verify outbound commit identities and trailers, then push the named branch through the fleet guard. Record Verify against the exact pushed SHA and return the packet on the separate evidence ref.

The package descriptor and root pnpm lockfile advance Hono from 4.13.11 to 4.13.16. The lockfile contains one Hono resolution before and after. The edition source lock changes the checksums for those two files. The five listed advisories cover ten Dependabot alerts. The candidate resolves one vulnerable Hono version to zero for those advisory ranges. Alert closure is evaluated by Dependabot after landing.

| Advisory | Alerts |
| --- | --- |
| GHSA-46wx-v44x-9hh2 | 88, 83 |
| GHSA-4h7h-rv7c-7m2v | 87, 82 |
| GHSA-4m76-xfj5-7975 | 86, 81 |
| GHSA-h7mg-cq63-vhpq | 85, 80 |
| GHSA-3gg2-335m-rxc6 | 84, 79 |

## Contract counts

| Tier | Before, Done / Partial / Missing | After, Done / Partial / Missing |
| --- | --- | --- |
| Core | 37 / 47 / 11 | 37 / 47 / 11 |
| Agent surface | 0 / 11 / 8 | 0 / 11 / 8 |
| Later | 0 / 0 / 1 | 0 / 0 / 1 |
| Full target | 37 / 58 / 20 | 37 / 58 / 20 |

This maintenance task changes zero clauses and adds or removes zero tests.

## Verification results

- `pnpm add --save-exact --lockfile-only hono@4.13.16` passed.
- `pnpm install --frozen-lockfile` passed.
- `pnpm exec rer install` passed.
- `pnpm list hono --depth Infinity` passed.
- `node scripts/edition-authoring/cli.mjs lock` passed.
- `node scripts/edition-authoring/cli.mjs check` passed.
- `pnpm build` passed.
- `pnpm typecheck` passed.
- `pnpm spec:check` passed.
- `node src/base/contract-docs.mjs check` passed.
- `nice -n 15 node tests/public-paths.mjs` passed.
- `nice -n 15 node tests/control-runtime.mjs` passed.
- `git diff origin/main..HEAD --check` passed.
- Base publication scanner 0.2.121 with Gitleaks 8.30.1 returned Complete / Pass with zero findings on the exact candidate commit and tree. It inspected 1,117 commits.
- The fleet guard published `cloud/gr-mt-uptime-dep-9` at `486f768a08123da5e1debcb34f3529b8d9a00411` after the author, committer and trailer check passed.
- Exact-SHA Verify run 44412668192 reported `completed` with conclusion `success`. https://github.com/just-every/run-uptime/actions/runs/44412668192

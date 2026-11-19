# Uptime 0.5.18 release metadata

Prepared by Run Edit Run fleet on 2026-11-19 UTC.

## Plan and execution

1. Start the named branch from fresh main, check whether the target tag or release exists, and inspect the tree diff from the published 0.5.17 tag. Recheck main and the target tag before pushing.
2. Carry only verified buyer-facing changes into the changelog and public release notes. Preserve the previous release's backup, upgrade and known-limit guidance. Compare the full migration trees and check the previous screenshot path before carrying the screenshot forward.
3. Update the existing version fields, retain the locked toolchain dependency, and regenerate the edition source lock last. Check the exact commit with the frozen install, typecheck, release-metadata assertions, source-lock and contract checks. Audit all candidate commit identities and trailers.
4. Push the linear candidate to the named branch, read back the exact branch head, compare the committed project file declarations with their committed files, and wait for the exact-SHA push Verify. Publish this packet on the evidence ref.

## Release result

| Reference | Value |
| --- | --- |
| Repository | just-every/run-uptime |
| Branch | cloud/sd-uptime-release-0-5-18 |
| Fresh main | 373dfff5fbbefd13d13d6c0598401393938118da |
| Product SHA | 393492e8eb0f86341a97690429b3d795d548d175 |
| Previous tag commit | 359b1bb93606ccfe5dc0120d2cdce78e8df67f6a |

- The v0.5.18 tag was absent in Git and the release-by-tag API returned HTTP 404. The final pre-push fetch confirmed the same main.
- One commit updates CHANGELOG.md, RELEASE.json, RELEASE.md, package.json, seed.json, and sources.lock.json. The checkout has no package-lock.json, and pnpm-lock.yaml has no root release-version field to bump. The exact rer pin remains 0.2.121. The prior screenshot exists byte-for-byte and is attributed to 0.4.0.
- The release notes reflect the owner setup, installation name in General and across the app, self-service profile controls and confirmation guidance in People, and matching alert destination guidance in Alerts. The dry-run resource summary and full JSON option are documented. The monitor definition guide lists 13 supported types. Hono 4.13.16 and the picomatch backtracking patch are in the real release diff.
- Zero migration files added, changed or removed. All 91 SQL migrations and 3 runner migration files match the 0.5.17 blob addresses exactly. No new required setting.
- The committed rer-project.json declares one file digest. setup.sha256 matches rer-setup.json at 81aef96872569eb67d3dbaa2f2f561dca54aca2c32ded8021b153d3b818d6181. The receipt records both values.
- Contract counts before and after are 37 done, 58 partial and 20 missing across 115 clauses. Core is 37/47/11, Agent surface is 0/11/8, and Later is 0/0/1. Zero status changes.

No contract clause claimed; this is release metadata.

## Checks and custody

The frozen install and both typechecks passed on Node 22.20.0 and pnpm 10.12.4. The edition source-lock check, offline Base copy verification, contract generator check, whitespace check, and release metadata and scope assertions also passed. The candidate contains a single linear commit over fresh main with the required fleet identities and no trailers. The product branch was pushed through the guarded entrypoint at 12:36 UTC and read back at the exact SHA. The open-pull query returned no PR. The fleet owns the publication scan, main landing and subsequent release.

Main advanced to 73e94712bb02c557ad067fc8df75b0cd2b1838c4 after the candidate was pushed. The published candidate remains the SHA named above. The fleet handles updated-main integration and exact-head gates at landing.

GitHub reported push Verify run 44525456770 completed successfully on the exact product SHA at the 2026-11-19T12:52:59Z check. [Verify run 44525456770](https://github.com/just-every/run-uptime/actions/runs/44525456770)

# Uptime 0.5.19 release metadata

Run Edit Run fleet, 2026-11-20 UTC.

## Plan and results

1. **Confirm the release base and version.** Fresh main was `6d0951f0024bbf7f9df055cc70e68a2c76c3d38c`, one commit ahead of the commit behind v0.5.18 (`52f77a94a0a675ba5e1be122dfe0c720087144fb`). Checked the remote, which advertised no v0.5.19 tag. GitHub returned HTTP 404 for the v0.5.19 Release lookup. This round prepares the patch metadata. It creates neither a tag nor a Release.
2. **Review the buyer-facing delta.** The release notes describe local archive transfer and the replay of owner migrations in the order recorded in the archive. They also describe the selected-account link from `rer dev --as PERSONA`, its 15-minute validity and use in a fresh browser, and how to reach account switching or start signed out. These details come from the release delta in the transfer adapter, operator-auth and RUN-LOCALLY.md.
3. **Check migrations and preserve upgrade instructions.** Compared v0.5.18 and the pushed candidate using `git ls-tree -r`. Both trees contain 91 SQL migration files. Added migration paths are empty (`[]`), and all 91 prior paths have identical blob IDs. The metadata keeps the buyer backup and upgrade steps and Known limits from 0.5.18. The existing screenshot at `.github/assets/release/uptime-0.4.0-monitor-1440.png` still exists and is identified as a 0.4.0 screenshot.
4. **Update scoped metadata.** Set version 0.5.19 in package.json, seed.json, RELEASE.json and RELEASE.md. Set RELEASE.json's previousVersion to 0.5.18 and update the public notes and dated CHANGELOG entry. The exact rer 0.2.125 dependency and pnpm lockfile carry forward from main. No npm lockfile is present. The repository, package, deployment, and project identities carry forward. Regenerated sources.lock.json last with the seed's edition-authoring CLI.
5. **Check and publish the candidate branch.** The frozen dependency install, typecheck on Node 22.20.0, structural rer check, edition source-lock check, offline recorded Base check, contract generator check and Git diff checks passed. The fresh-main rebase had no changes. Inspected every commit in the candidate range, verified the fleet author and committer and confirmed absence of trailers. The fleet push guard published the branch on its first attempt at 22:21 UTC. A Git remote read-back matched `b9bff679ec99b702de753d63ad385d232e6b6d1e`. The fleet lander owns the publication scan and landing.
6. **Check declared hashes at the advertised candidate.** The sole declared SHA-256 was `setup.sha256` for `rer-setup.json`. Both the declared and calculated SHA-256 were `81aef96872569eb67d3dbaa2f2f561dca54aca2c32ded8021b153d3b818d6181` (match). No correction was needed.

## Contract counts

| Tier | Done | Partial | Missing | Total |
| --- | ---: | ---: | ---: | ---: |
| Core | 37 | 47 | 11 | 95 |
| Agent surface | 0 | 11 | 8 | 19 |
| Later | 0 | 0 | 1 | 1 |
| Full target | 37 | 58 | 20 | 115 |

These counts apply before and after the candidate. Clause status changes are empty.

No contract clause claimed; this is release metadata.

## Exact candidate

- Branch `cloud/sd-uptime-release-0-5-19`
- Full SHA `b9bff679ec99b702de753d63ad385d232e6b6d1e`
- Open PR lookup returned no PR for this branch.

## Exact-SHA Verify

Push Verify 44828229576 completed successfully for the advertised candidate. GitHub reported success at the 2026-11-20T22:36:50Z UTC check. https://github.com/just-every/run-uptime/actions/runs/44828229576

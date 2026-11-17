# Uptime 0.5.16 release metadata results

Author: Run Edit Run fleet, 2026-11-17 UTC.

Product repository: just-every/run-uptime. Branch: cloud/sd-uptime-release-0-5-16. Product head: 6fd9399cf9ce9acf4e009999581cc20f32c9e129. Main reviewed and rebased before push: 1156542ef11fd14e1fd9cbc23a13e0e9ab8077e0. Previous release tag v0.5.15 resolves to 40a6a6d8104a7e4bc15ea89e47406f455a734fe9. This prepares release metadata; it does not tag, publish a GitHub Release, deploy or land main. No PR was created by this task.

## Plan and execution

The complete plan is in PLAN.md. Initialized the launcher and required fleet Git helpers, then made a dedicated shallow blobless product clone and configured its fleet identity and forwarding hooks. Read launcher/seed AGENTS.md, the seed acceptance sources and the supplied builder/release rules. Compared all eleven commits from v0.5.15 to fresh main, checked the next tag and Releases, and selected the unused version 0.5.16. Frozen-installed dependencies and preserved main's exact rer pin. Changed only leased release metadata, staged the intended files, regenerated the source lock last, checked it, committed with fleet author/committer and active hooks, fetched/rebased onto fresh main and audited every candidate identity, trailer and full message. The first real commit was pushed once through the cloud push guard and succeeded on its first attempt. Exact-SHA Verify was then discovered through REST. Full local Verify was left to branch CI as instructed; no product or UI work was authorized.

The first attempted pre-commit rebase refused the unstaged metadata edits and changed nothing. After committing, the required pre-push rebase succeeded and reported the branch already up to date. There are no merge commits.

## User-visible release content

The new changelog and RELEASE.json describe the existing-install mail switch, public MAIL_PROVIDER default none, exact SendGrid enable/unset commands, retained ownership/database/installation keys, mail-off limits, provider delivery verification and local diagnostic defaults. They cover hosted public-edge checks, failed HTTP status/Cloudflare error-code details and the existing bounded redacted response snapshot. They also name the deployment token's account-scoped Workers Scripts: Edit and D1: Edit groups and --environment naming. These are documentation of main's implemented changes; no new hosted provider proof was run by this metadata round. No new live recipient-delivery claim is made.

The backup instructions retain Settings > Backup and files > Download backup with recent second-factor verification, separate private settings and .rer/deploy custody, hosted database backup and guarded local CLI export. Upgrade instructions retain pnpm install --frozen-lockfile and add the legacy SendGrid explicit-selector warning and the mail-off switch commands. Earlier known issues remain, except the now-addressed mail switching limitation. The existing 0.4.0 screenshot is identified truthfully as an older capture. Historical changelog sections and the release production/signing procedure are preserved.

## Changes and counts

- Release package/seed/version: 0.5.15 -> 0.5.16; RELEASE.json previousVersion: 0.5.13 -> 0.5.15.
- Main's rer package/lock specifier/resolution: 0.2.121 -> 0.2.121. The v0.5.15 release used 0.2.119. No pin edits or Base refresh.
- SQL migrations: 91 -> 91. No migration added, changed or removed since v0.5.15.
- Contract counts: done 37 -> 37, partial 58 -> 58, missing 20 -> 20, total 115 -> 115. No clause claimed or status/gap/evidence edited. No CLAIM line applies.
- Six product files changed: CHANGELOG.md, RELEASE.json, RELEASE.md, package.json, seed.json and sources.lock.json. The lock changes exactly the five metadata file identities. pnpm-lock.yaml remains byte-for-byte unchanged.
- Tests added/deleted/modified: 0/0/0. No application, homepage, README, documentation outside release metadata or contract files changed.

## Validation and custody

Frozen install, both TypeScript projects, release version/pin/migration/scope inspection, whitespace checks and source-lock generation/check all passed. Typecheck used the VM's Node v24.19.0 and pnpm 10.12.4; the supplied toolchain retains a newer Node, while the checkout and CI pin Node 22.20.0. Source-lock write/check logs and the complete product diff, identity audit, push receipt and metadata receipt are included. The clone's clean exact head and candidate audit were checked before its sole product push. The product commit has no co-author trailers and no CI skip marker.

Verify run: [44019218313](https://github.com/just-every/run-uptime/actions/runs/44019218313) on exact SHA 6fd9399cf9ce9acf4e009999581cc20f32c9e129; completed with conclusion **success**. CI discovery and each five-minute poll are retained in ci-discovery.json and ci-poll-1.json through ci-poll-3.json. Six GitHub API calls were used in total: Release collision list, exact-SHA workflow discovery, three spaced polls and PR discovery. PR discovery returned no PR. The product checkout is clean.

The publication scan is reserved for the fleet Mac by the cloud adaptation and was not run here. Main, tags, releases and PRs were not written. No self-submission was made. Product custody and evidence transfer are separate; the evidence manifest binds this packet to the product head. No credentials, environment dumps, private gate inputs or symlinks are selected for evidence.

## Terminal result

Product branch is READY at 6fd9399cf9ce9acf4e009999581cc20f32c9e129. No product blockers remain. The independent fleet retains publication scanning and landing custody. The complete relevant packet will be published only to refs/heads/evidence/sd-uptime-release-0-5-16 using the provided report-only entrypoint, followed by clone cleanup. This READY result is based on completed successful exact-SHA Verify, not the evidence transfer.

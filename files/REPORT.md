# Uptime v0.5.12 release metadata refresh

Author: Run Edit Run fleet. Date: 2026-11-15T10:05:27Z.

## Product custody

Repository: just-every/run-uptime.
Branch: cloud/sd-uptime-release-0-5-12-refresh-1.
Product head: 2045014b15f76380b5d7493c0c42b2caa430f88b.
Base main: fef01b15e0205f1c53c4e362a3729afc66a0b20b.
Push: succeeded on the first guarded attempt. Exactly one product commit and one product push. No PR was created; the repository's documented release preparation uses guarded fleet landing.
Prior candidate cloud/sd-uptime-release-0-5-12 remains at 7364b5f3dd7fcf29b533d3139315ad1701d0653e and was not rewritten or pushed. This refresh supersedes that candidate by the signed brief, without creating another release version.

## Preconditions and source review

The latest published non-draft Release remains v0.5.11: https://github.com/just-every/run-uptime/releases/tag/v0.5.11. Its annotated tag resolves to 04016399e1e879e7be3b8e891baf02d975bb3901. v0.5.12 has no published tag at the pre-edit read. Main is the brief's green fef01b15e0205f1c53c4e362a3729afc66a0b20b, 22 commits ahead of v0.5.11. The main snapshot was fetched again and the candidate rebased before its first publication. Main had not moved. No competing release PR or newer release branch was found beyond the explicitly superseded candidate. Historical release branches remain intact.

Read and followed the supplied builder rules and release rules, launcher AGENTS.md, seed AGENTS.md, CONTRACT.md, ACCEPTANCE.md and RELEASE.md. Reviewed the actual v0.5.11..main history, diff summary, product changes and migrations; reused accurate local sign-in notes from the old candidate, extending them for the subsequent main changes. No CI was dispatched or retried.

## Metadata paths and before/after counts

- package.json: 0.5.11 -> 0.5.12. The source pin read directly from devDependencies is @runeditrun/rer 0.2.113 -> 0.2.113. All other package content is identical to main.
- seed.json: 0.5.11 -> 0.5.12.
- README.md: existing release-record references updated from 0.5.11 / previous 0.5.10 to 0.5.12 / previous 0.5.11.
- RELEASE.json: version 0.5.12, previousVersion 0.5.11, current honest public notes and retained historical screenshot reference.
- CHANGELOG.md: new dated 0.5.12 section; all older sections preserved whole.
- sources.lock.json: regenerated last; five metadata content hashes updated and freshness check passed.

Six files changed, 52 insertions and 11 deletions. No package-lock.json exists, so none was created. pnpm-lock.yaml and the dependency graph are unchanged. Against v0.5.11, main already upgraded rer from 0.2.108 to 0.2.113; these metadata changes preserve main's pin. rer 0.2.118 was not adopted.

Migrations: 91 -> 91; zero changes since v0.5.11, zero added in this candidate. New required settings: zero. Tests added/deleted/changed: 0/0/0. Clause status counts: done 37 -> 37, partial 58 -> 58, missing 20 -> 20 (115 total). Clause Status/Gap/Evidence changes: none. CONTRACT.md, ACCEPTANCE.md and docs/CLAIMS.md are byte-for-byte unchanged from base main. No acceptance claim or promotion is made.

## Release notes

Notes describe dedicated mail fields and the API transaction builder; monitoring-only access with write controls hidden; readable check details and grouped erasure receipts; supported Pingdom SMTP/ping/DNS imports and certificate failure windows; named DNS/TCP server and TLS expiry form settings; independent health checks no longer inheriting slow-response policy; installed PDF report fonts using the app origin; documentation derived from editor choices; local sign-in and runtime guidance; Vite 8.2.4, undici 7.30.1 and transitive Zod 4.6.6 already on main. The notes explicitly retain private-runner requirements, unsupported imports and other release limits.

The existing screenshot is from 0.4.0 and is labelled as such. It was not represented as proof of the newer console. No new screenshot was required or produced for this metadata-only assignment.

## Local validation and identity

PASS: pnpm install --frozen-lockfile.
PASS: pnpm typecheck, covering both application and runner tsconfigs, with Node 22.20.0 and pnpm 10.12.4. An earlier successful pass on the VM's Node 24.19.0 was replaced by the pinned-runtime receipt.
PASS: inline metadata validation: all three versions agree, previous version is correct, screenshot reference exists, no dependency/package content changes beyond version, no migration changes and no generated view changes.
PASS: node scripts/edition-authoring/cli.mjs lock, run last after final metadata staging and fresh-main reconciliation.
PASS: node scripts/edition-authoring/cli.mjs check.
PASS: git diff --cached --check and exact six-path scope check.
PASS: all candidate commit authors and committers are Run Edit Run fleet <fleet@runeditrun.com>, trailers absent, no OpenAI/Codex co-author lines, including side parents. The commit hook preserves repository hooks and stayed active. Commit-producing commands used the explicit fleet author/committer environment.

No full local suite, app build, browser journey, product edit, contract edit or new test was performed, as required for this metadata-only round. The cloud adaptation reserves the full-history publication scan and final landing gates for the fleet's Mac; no publication scan was bypassed or claimed complete here.

## Exact-SHA CI observation

{"conclusion": "success", "head_sha": "2045014b15f76380b5d7493c0c42b2caa430f88b", "html_url": "https://github.com/just-every/run-uptime/actions/runs/43700719951", "id": 43700719951, "name": "Verify", "status": "completed"}

GitHub calls used: 7 of ten. One watcher; observations for a run/discovery spaced at least 300 seconds. Every observed candidate workflow is checked against 2045014b15f76380b5d7493c0c42b2caa430f88b. Main's previous Verify43684879645 and Run site43683324611 success are supplied brief evidence, not candidate CI. Run site is a post-landing main workflow and was not requested here.

## Follow-up debts and release boundary

Known release limits remain in the changelog: earlier heartbeat output may require key rotation; UptimeRobot monitor CSV import remains unavailable; archive restore omits the erased-person list; a company policy without company settings can produce an empty decision feed; bodies over 64 KiB fail the check; bounded-memory archive restore, measured 500-monitor/90-day capacity, time-range selection and console chunk controls remain unestablished or unavailable. Private-runner, hosted pinning and other previous limitations remain explicit.

RELEASE.md still contains a pre-existing stale illustrative rer pin (0.2.65); actual package.json is authoritative and this candidate's notes correctly use 0.2.113. GitHub's product-push response also reports existing default-branch Dependabot alerts (5 high, 12 moderate, 2 low); this round changed no dependency and performed no vulnerability triage.

No tag, release bundle, signing, GitHub Release or deployment was created. This is a metadata landing candidate, not a RELEASED claim. The later authorized producer must use the actual pinned producer and fresh gated commit/bundle; release completion still requires non-draft GitHub Release readback and check-gh-release.sh exit 0. Independent landing and release gates remain responsible for their own proof.

## Plan and evidence return

The full plan is PLAN.md. Actual product/check receipts are RECEIPT.json, metadata-check.json, typecheck.log, source-lock-write.json, source-lock-check.json, candidate-identities.txt, product-push.txt and exact-SHA CI JSON observations. Source review receipts include latest-release.json, open-prs.json, release-heads.txt, release-tags.txt, main-changes.txt and main-diff-stat.txt. product-diff.patch, product-stat.txt and release-notes.md preserve the exact candidate metadata for review after scratch cleanup.

Explicitly selected non-secret packet files are published only under refs/heads/evidence/sd-uptime-release-0-5-12-refresh-1. Product checkout/head/index stay unchanged during evidence publication. Evidence publication is separate from READY/PUSHED custody and never proves acceptance or release completion. After verified evidence return, delete the successful scratch clone and its dependencies as required.

Blocking issues: none observed locally. Terminal CI custody: READY: exact-SHA Verify completed successfully.

Initial evidence transfer readback: the 27-file packet at a6229dae10c01fc57b2235ec096f1ffdec5b465d was fetched independently and every manifest/file hash matched. transfer-readback.json preserves that actual receipt. The final evidence publication adds this receipt and this report note; its exact head is carried in the terminal EVIDENCE line.

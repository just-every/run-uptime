# Release Uptime

Use the exact `@runeditrun/rer` version pinned in `package.json` (currently
0.2.24), Node 22.20.0, pnpm 10.12.4, Git, Python 3, Gitleaks 8.30.1 and the
Playwright Chromium browser required by the lockfile.

1. Review the changes since the previous release independently, including
   authentication, mail, archive restore and erasure. Walk the real signed-in
   application at desktop and mobile widths. A blocker or high finding stops
   the release.
2. Set the same next version in `package.json`, `seed.json` and `RELEASE.json`;
   move Unreleased changes into the dated CHANGELOG entry. Commit a current
   product screenshot and name its path in `RELEASE.json.publicReleaseNotes`.
   Refresh the edition source lock after staging the intended files.
3. Fetch and rebase onto the current remote main branch, retaining concurrent changes.
   Run Base's publication scanner against that exact commit with
   `--public-base https://github.com/just-every/run-uptime#main`. Read its result
   before a separate fast-forward push. Require Verify and Run site to pass
   on the exact pushed commit.
4. Stop local dev before production preparation. From a clean checkout, run
   the pinned producer, substituting the commit, next tag and a new absolute
   output directory outside the checkout:

   ```sh
   pnpm exec rer release --repo "$PWD" --ref COMMIT \
     --project "$(node -p "require('./rer-project.json').projectId")" \
     --repository https://github.com/just-every/run-uptime \
     --tag vVERSION --output /absolute/new-release-directory
   ```

   The producer frozen-installs and verifies a disposable exact-commit clone,
   runs release-only checks, scans source history and the final annotation,
   creates the local annotated tag, and emits the source archive and catalogue
   bundle. Inspect `release-receipt.json`; only `RELEASED` with `tag.created`
   true is publishable. Never move an existing tag or alter a blocked bundle.
5. With release authorization and a passing independent review, push the exact
   tag and read it back with `git ls-remote --tags origin refs/tags/vVERSION`.
   Sign the artifact with the enrolled publisher's private key through
   `rer release sign --artifact OUTPUT --key-file KEY_FILE`. Keep the key
   private and outside the repository. The signer writes `rer-release.dsse.json`.

Keep the complete bundle outside the source repository for catalogue import.
The 0.2.24 producer leaves its presentation gallery empty; catalogue integration
must pin the committed screenshot from the release tag. Release production and
signing do not deploy the application. If Base's producer fails, retain its
failure output and stop; do not bypass its verification or publication checks.

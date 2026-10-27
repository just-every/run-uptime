#!/usr/bin/env bash
set -euo pipefail

# Keep Playwright's bundled Chromium and current headless shell. Browser downloads
# and probes run as the job user, with its real HOME and Playwright defaults.
# The runner-flows shard explicitly requests Firefox and WebKit as extra engines.
for browser in "$@"; do
  case "$browser" in
    firefox|webkit) ;;
    *) echo "Unsupported extra browser: $browser" >&2; exit 2 ;;
  esac
done
timeout --signal=TERM --kill-after=10s 120s pnpm exec playwright install chromium "$@"

# Hosted Ubuntu normally has Chromium's libraries already. Only touch apt after
# a real page fails, and prove every requested engine again after installing libs.
if ! pnpm exec node scripts/chromium-probe.mjs "$@"; then
  sudo env "PATH=$PATH" \
    "APT_ARCHIVES=${APT_ARCHIVES:-${RUNNER_TEMP:-/tmp}/rer-apt/archives}" \
    python3 scripts/install-chromium-deps.py "$@"
  pnpm exec node scripts/chromium-probe.mjs "$@"
fi

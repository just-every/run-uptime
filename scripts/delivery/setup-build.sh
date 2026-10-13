#!/usr/bin/env bash
set -euo pipefail
# Prepare pinned tools and browsers locally for managed source verification.
# This never creates an application owner.
uptime_build_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$uptime_build_root"
npm install --prefix "$uptime_build_root/.rer-tools" --no-save --package-lock=false \
  --no-audit --no-fund node@22.20.0 pnpm@10.12.4
export PATH="$uptime_build_root/.rer-tools/node_modules/.bin:$PATH"
pnpm install --frozen-lockfile && pnpm exec rer install
pnpm exec playwright install --with-deps --only-shell chromium

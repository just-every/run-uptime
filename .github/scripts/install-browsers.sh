#!/usr/bin/env bash
set -euo pipefail

# Main 39843677447: Azure apt took 568–726s (25.9 MB / 551s),
# versus 10s including apt on branch 39834052460. Protocol tests then
# progressed until the 12-minute job cap; their passing envelope is 276s.
# Use Ubuntu's signed archive directly, and fail visibly if installation
# cannot finish in its share of the unchanged job budget. No test is retried.
sudo python3 - <<'PY'
from pathlib import Path
sources = [Path('/etc/apt/sources.list'), *Path('/etc/apt/sources.list.d').glob('*.sources'), *Path('/etc/apt/sources.list.d').glob('*.list'), *Path('/etc/apt').glob('apt-mirrors*.txt')]
# Hosted Ubuntu selects its effective mirror through mirror+file entries.
rewritten = 0
for source in sources:
    if source.is_file():
        text = source.read_text()
        updated = text.replace('http://azure.archive.ubuntu.com/ubuntu', 'https://archive.ubuntu.com/ubuntu').replace('https://azure.archive.ubuntu.com/ubuntu', 'https://archive.ubuntu.com/ubuntu')
        if updated != text:
            source.write_text(updated)
            rewritten += 1
print(f'Prepared Ubuntu archive: {rewritten} source/mirror files rewritten')
Path('/etc/apt/apt.conf.d/99-uptime-verify').write_text('Acquire::Retries "2";\nAcquire::http::Timeout "15";\nAcquire::https::Timeout "15";\n')
PY

timeout --signal=TERM --kill-after=10s 180s pnpm exec playwright install-deps chromium "$@"
timeout --signal=TERM --kill-after=10s 120s pnpm exec playwright install --only-shell chromium "$@"

"""Install missing Playwright libraries within the browser job's apt budget."""

import json
import os
from pathlib import Path
import sys


def main():
    extra_engines = sys.argv[1:]
    if any(engine not in {"firefox", "webkit"} for engine in extra_engines):
        raise SystemExit("Only firefox and webkit may be requested as extra engines")

    # Main 39843677447 spent 568–726s on Azure apt. Keep Ubuntu's signed
    # archive and mirror+file workaround, without disabling signature checks.
    sources = [
        Path("/etc/apt/sources.list"),
        *Path("/etc/apt/sources.list.d").glob("*.sources"),
        *Path("/etc/apt/sources.list.d").glob("*.list"),
        *Path("/etc/apt").glob("apt-mirrors*.txt"),
    ]
    rewritten = 0
    for source in sources:
        if source.is_file():
            text = source.read_text()
            updated = text.replace(
                "http://azure.archive.ubuntu.com/ubuntu",
                "https://archive.ubuntu.com/ubuntu",
            ).replace(
                "https://azure.archive.ubuntu.com/ubuntu",
                "https://archive.ubuntu.com/ubuntu",
            )
            if updated != text:
                source.write_text(updated)
                rewritten += 1
    print(f"Prepared Ubuntu archive: {rewritten} source/mirror files rewritten", flush=True)

    config = [
        'Acquire::Retries "2";',
        'Acquire::http::Timeout "15";',
        'Acquire::https::Timeout "15";',
    ]
    archives = os.environ.get("APT_ARCHIVES")
    if archives:
        archive_path = Path(archives)
        if not archive_path.is_absolute() or any(ord(char) < 32 for char in archives):
            raise SystemExit("APT_ARCHIVES must be an absolute path without control characters")
        (archive_path / "partial").mkdir(parents=True, exist_ok=True)
        config.extend([
            f"Dir::Cache::archives {json.dumps(archives)};",
            'APT::Keep-Downloaded-Packages "true";',
            'Binary::apt::APT::Keep-Downloaded-Packages "true";',
        ])
    Path("/etc/apt/apt.conf.d/99-uptime-verify").write_text("\n".join(config) + "\n")

    # Bound both apt update and package installation in Playwright's command.
    os.execvp("timeout", [
        "timeout", "--signal=TERM", "--kill-after=10s", "180s",
        "pnpm", "exec", "playwright", "install-deps", "chromium", *extra_engines,
    ])


if __name__ == "__main__":
    main()

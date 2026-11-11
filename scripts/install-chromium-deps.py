"""Install missing Playwright libraries within the browser job's apt budget."""

import json
import os
from pathlib import Path
import re
import subprocess
import sys

# Hosted-runner apt can unpack slowly after fast downloads: Verify 42837474512
# (v0.5.2 tag, push-1) hit the old 180s cap twice while dpkg was still
# finishing; earlier successful runs of this step took 68-104s. 420s leaves
# margin and keeps the shard job under its 20-minute cap.
DEPS_TIMEOUT = "420s"

# Ubuntu archive mirrors in the order they are tried; the first that serves
# the release's InRelease file wins.
MIRRORS = ("https://archive.ubuntu.com/ubuntu", "http://azure.archive.ubuntu.com/ubuntu")
MIRROR_PATTERN = re.compile(r"https?://(?:azure\.)?archive\.ubuntu\.com/ubuntu")


def release_codename():
    for line in Path("/etc/os-release").read_text().splitlines():
        if line.startswith("VERSION_CODENAME="):
            return line.split("=", 1)[1].strip().strip('"')
    raise SystemExit("/etc/os-release has no VERSION_CODENAME")


def choose_mirror():
    codename = release_codename()
    for mirror in MIRRORS:
        url = f"{mirror}/dists/{codename}/InRelease"
        try:
            probe = subprocess.run(
                ["curl", "--fail", "--silent", "--show-error", "--output", os.devnull,
                 "--max-time", "10", url],
                capture_output=True, text=True, timeout=20,
            )
            ok, detail = probe.returncode == 0, probe.stderr.strip()
        except subprocess.TimeoutExpired:
            ok, detail = False, "timed out"
        print(f"Ubuntu mirror probe: {mirror} {'reachable' if ok else 'unreachable (' + detail + ')'}", flush=True)
        if ok:
            return mirror
    return None


def main():
    extra_engines = sys.argv[1:]
    if any(engine not in {"firefox", "webkit"} for engine in extra_engines):
        raise SystemExit("Only firefox and webkit may be requested as extra engines")

    # Main 39843677447 spent 568-726s on Azure apt, so Ubuntu's signed archive
    # is preferred, with signature checks left on. Verify 43055961329 (11 Nov
    # push-1) showed the other side: archive.ubuntu.com failed DNS while the
    # runner's own Azure mirror was the only name left to try, and the blind
    # rewrite spent the whole 420s on it. Probe both, rewrite to one that
    # answers, and fail loudly and early when none does and nothing is cached.
    mirror = choose_mirror()
    archives = os.environ.get("APT_ARCHIVES")
    cached = len(list(Path(archives).glob("*.deb"))) if archives and Path(archives).is_dir() else 0
    if mirror is None and not cached:
        raise SystemExit("Ubuntu mirror unreachable and no cached packages: cannot install browser libraries")
    sources = [
        Path("/etc/apt/sources.list"),
        *Path("/etc/apt/sources.list.d").glob("*.sources"),
        *Path("/etc/apt/sources.list.d").glob("*.list"),
        *Path("/etc/apt").glob("apt-mirrors*.txt"),
    ]
    rewritten = 0
    for source in sources if mirror else []:
        if source.is_file():
            text = source.read_text()
            updated = MIRROR_PATTERN.sub(mirror, text)
            if updated != text:
                source.write_text(updated)
                rewritten += 1
    print(f"Prepared Ubuntu archive: {rewritten} source/mirror files rewritten", flush=True)

    config = [
        'Acquire::Retries "1";',
        'Acquire::http::Timeout "15";',
        'Acquire::https::Timeout "15";',
    ]
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
        "timeout", "--signal=TERM", "--kill-after=10s", DEPS_TIMEOUT,
        "pnpm", "exec", "playwright", "install-deps", "chromium", *extra_engines,
    ])


if __name__ == "__main__":
    main()

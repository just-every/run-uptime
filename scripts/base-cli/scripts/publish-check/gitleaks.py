"""Pinned Gitleaks is the only secret detection engine."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from git_history import InspectionError

VERSION = '8.30.1'
CONFIG = Path(__file__).with_name('gitleaks.toml')


def executable():
    binary = shutil.which('gitleaks') or str(Path.home() / '.local/bin/gitleaks')
    try:
        version = subprocess.run([binary, 'version'], capture_output=True, timeout=10)
        if version.returncode or version.stdout.decode().strip() != VERSION:
            raise InspectionError('scan.gitleaks-version')
    except OSError:
        raise InspectionError('scan.gitleaks-unavailable') from None
    return binary


def inspect(binary, mode, repo=None, revisions=None, data=None, timeout=300, redact=True):
    with tempfile.TemporaryDirectory(prefix='publish-gitleaks-') as directory:
        report = Path(directory) / 'report.json'
        report.touch(mode=0o600)
        config = CONFIG
        if mode == 'dir':
            config = Path(directory) / 'directory.toml'
            # Extending a config and defining a global allowlist replaces its
            # global rules. Keep the maintained policy intact in both modes;
            # append only the directory exclusions already used here.
            config.write_text(CONFIG.read_text() + '\n[[allowlists]]\npaths = [\"(^|/)(\\\\.git|node_modules)(/|$)\"]\n')
        args = [binary, mode, '--config', str(config), '--redact=' + ('100' if redact else '0'), '--no-banner', '--no-color',
                '--ignore-gitleaks-allow', '--gitleaks-ignore-path', directory, '--report-format', 'json',
                '--report-path', str(report), '--timeout', str(max(1, int(timeout)))]
        if mode == 'git':
            args += ['--log-opts=' + ' '.join(['--full-history', '-m', '--no-ext-diff', '--no-textconv', *revisions])]
        if repo is not None:
            args.append(repo)
        env = {k: v for k, v in os.environ.items() if not k.startswith(('GITLEAKS_', 'GIT_'))}
        env.update(GIT_NO_REPLACE_OBJECTS='1', GIT_TERMINAL_PROMPT='0')
        try:
            result = subprocess.run(args, input=data, capture_output=True, env=env, timeout=timeout)
            if result.returncode not in (0, 1):
                raise InspectionError('scan.gitleaks-failed')
            # Native reports may contain raw matches for location-bound proof.
            # The enclosing temporary directory is private; values never enter
            # the caller-facing report or logs. Gitleaks replaces file mode.
            report.chmod(0o600)
            findings = json.loads(report.read_text())
            if not isinstance(findings, list):
                raise ValueError()
            return findings
        except subprocess.TimeoutExpired:
            raise InspectionError('scan.deadline-exceeded') from None
        except (OSError, ValueError):
            raise InspectionError('scan.gitleaks-failed') from None


def rule(identifier):
    if identifier in ('generic-api-key', 'hex-api-key'):
        return 'secret.assignment'
    if 'private-key' in identifier:
        return 'secret.private-key'
    if 'jwt' in identifier:
        return 'secret.jwt'
    if 'password' in identifier or 'connection-string' in identifier:
        return 'secret.url-credentials'
    return 'secret.provider-token'

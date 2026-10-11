"""A public base is a branch of an explicitly named remote, never a local ref.

The declared base decides which history counts as already public, so it must
come from the remote itself: `<url>#<branch>` is fetched into an isolated
namespace and local branches, HEAD, tags and commit IDs are refused.
"""
import os
import re
import subprocess

NAMESPACE = 'refs/publish-check/public/'
URL = re.compile(r'(?:(?:https|ssh|git|file)://[^\s/#]*/[^\s#]*|[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:[^\s#]+|/[^\s#]*)')


class PublicBaseError(Exception):
    """Carries a stable, value-free reason code."""

    def __init__(self, code):
        super().__init__(code)
        self.code = code


def parse(spec, repo):
    """Return (url, branch) or refuse."""
    url, separator, branch = spec.rpartition('#')
    if not separator or not url or not branch:
        raise PublicBaseError('public-base.not-remote-branch')
    if not URL.fullmatch(url) or url.startswith('-') or any(ord(c) < 32 for c in spec):
        raise PublicBaseError('public-base.not-remote-url')
    if branch.startswith(('-', 'refs/')) or branch == 'HEAD':
        raise PublicBaseError('public-base.not-branch-name')
    if not valid_ref('refs/heads/' + branch):
        raise PublicBaseError('public-base.not-branch-name')
    local = url[len('file://'):] if url.startswith('file://') else (url if url.startswith('/') else None)
    if local and same_repository(local, repo):
        raise PublicBaseError('public-base.is-candidate-repository')
    return url, branch


def valid_ref(name):
    try:
        return subprocess.run(['git', 'check-ref-format', name], capture_output=True, timeout=10).returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def common_dir(path, env):
    result = subprocess.run(['git', '-C', path, 'rev-parse', '--path-format=absolute', '--git-common-dir'],
                            env=env, capture_output=True, timeout=10)
    return os.path.realpath(os.fsdecode(result.stdout.strip())) if result.returncode == 0 else None


def same_repository(path, repo, env=None):
    env = env or {k: v for k, v in os.environ.items() if not k.startswith('GIT_')}
    try:
        remote = common_dir(path, env)
        return remote is not None and remote == common_dir(repo, env)
    except (OSError, subprocess.TimeoutExpired):
        raise PublicBaseError('public-base.fetch-failed') from None


def display(url):
    return re.sub(r'^([a-z]+://)[^/@]*@', r'\1', url)

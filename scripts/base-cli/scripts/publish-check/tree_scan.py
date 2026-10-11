"""Text hygiene and licence policy on immutable Git trees and present files."""
import hashlib
import os
from pathlib import Path
import re
import stat
from public_hygiene import inspect
from provenance import MANIFESTS, declared_keys
from project_identity import tree_identity
from licenses import license_rules
from git_history import InspectionError

DEPENDENCY_DIRS = {'.git', 'node_modules'}


def environment_match(data, hashes):
    # Known values are compared in memory. No value or digest enters a report.
    candidates = [data, *re.findall(rb'[A-Za-z0-9_./+\-]{8,}(?:={1,2})?', data)]
    return any(hashlib.sha256(value).digest() in hashes for value in candidates)


def context(history, commit, config):
    entries = history.entries(commit)
    local = set()
    for entry in entries:
        parts = entry['path'].split('/')
        local.update('/'.join(parts[:n]) for n in range(1, len(parts) + 1))
    declared = set()
    for entry in history.root_entries(commit):
        if entry['path'] in MANIFESTS and entry['kind'] == 'blob':
            declared.update(declared_keys(history.blob(entry['oid'])))
    identity, invalid = tree_identity(history, history.root_entries(commit))
    return {**config, 'localPaths': frozenset(local), 'declaredSources': frozenset(declared), 'projectIdentity': identity}, invalid


def text_rules(data, path, config, resolver, env_hashes):
    rules, provenance = inspect(data, path, config, resolver)
    path_rules, _ = inspect(path.encode('utf-8', 'surrogateescape'), '@path', config, resolver)
    rules.update(path_rules)
    if env_hashes and (environment_match(data, env_hashes) or environment_match(path.encode(), env_hashes)):
        rules.add('secret.env-match')
    if data.startswith(b'version https://git-lfs.github.com/spec/v1'):
        rules.add('scan.lfs-uninspected')
    return rules, provenance


def working_files(repo):
    for directory, children, files in os.walk(repo, followlinks=False):
        children[:] = [name for name in children if name not in DEPENDENCY_DIRS]
        for name in files:
            if name == '.git':
                continue
            target = Path(directory) / name
            path = target.relative_to(repo).as_posix()
            try:
                data = os.fsencode(os.readlink(target)) if target.is_symlink() else target.read_bytes()
            except OSError:
                raise InspectionError('scan.working-tree-unreadable') from None
            yield path, data


def working_regular(repo, path):
    # Anchor reads to opened directories and refuse links at every step.
    # The file descriptor's bytes and mode prove the same regular preimage.
    directory = None
    try:
        flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
        directory = os.open(repo, flags)
        parts = path.split('/')
        for part in parts[:-1]:
            child = os.open(part, flags, dir_fd=directory)
            os.close(directory)
            directory = child
        descriptor = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory)
        with os.fdopen(descriptor, 'rb') as file:
            status = os.fstat(file.fileno())
            if not stat.S_ISREG(status.st_mode):
                return None
            return file.read(), '100755' if status.st_mode & 0o111 else '100644'
    except OSError:
        return None
    finally:
        if directory is not None:
            os.close(directory)

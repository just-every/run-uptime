"""Repository plumbing delegated to the installed Git, never decoded in Python."""
import os
from pathlib import Path
import subprocess
from public_base import parse, display, PublicBaseError


class InspectionError(Exception):
    pass


def git_environment():
    env = {k: v for k, v in os.environ.items() if not k.startswith('GIT_')}
    env.update(GIT_TERMINAL_PROMPT='0', GIT_NO_REPLACE_OBJECTS='1')
    return env


class History:
    def __init__(self, repo, ref='HEAD', public_base=None):
        self.repo = str(Path(repo).resolve())
        self.env = git_environment()
        self.public_commit = self.public_label = None
        self.reader = None
        self.commit = self.run('rev-parse', '--verify', '--end-of-options', ref + '^{commit}').decode().strip()
        if self.run('rev-parse', '--is-shallow-repository').strip() != b'false':
            raise InspectionError('history.shallow')
        if public_base is not None:
            url, branch = parse(public_base, self.repo)
            try:
                self.run('fetch', '--quiet', '--no-tags', '--no-recurse-submodules', '--no-write-fetch-head', '--',
                         url, 'refs/heads/' + branch + ':refs/publish-check/public/base')
                self.public_commit = self.run('rev-parse', 'refs/publish-check/public/base^{commit}').decode().strip()
                self.public_label = display(url) + '#' + branch
            except InspectionError:
                raise PublicBaseError('public-base.fetch-failed') from None
        self.revisions = [self.commit, self.public_commit] if public_base else ['--all', self.commit]
        self.commits = self.run('rev-list', *self.revisions).decode().splitlines()
        self.public_commits = set(self.run('rev-list', self.public_commit).decode().splitlines()) if self.public_commit else set()
        self.trees = {}
        self.tree_ids = dict(line.split() for line in self.run('log', '--format=%H %T', *self.revisions).decode().splitlines())
        self.reader = subprocess.Popen(['git', '-C', self.repo, 'cat-file', '--batch'],
                                       env=self.env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)

    def run(self, *args):
        try:
            result = subprocess.run(['git', '-C', self.repo, '-c', 'core.quotePath=false', *args],
                                    env=self.env, capture_output=True, timeout=120)
            if result.returncode:
                raise InspectionError('history.git-failed')
            return result.stdout
        except (OSError, subprocess.TimeoutExpired):
            raise InspectionError('history.git-unavailable') from None

    def commit_tree(self, commit):
        known = getattr(self, 'tree_ids', {}).get(commit)
        return known.encode() if known else self.run('rev-parse', commit + '^{tree}').strip()

    def entries(self, commit, recursive=True):
        tree = self.commit_tree(commit).decode()
        key = (tree, recursive)
        if key not in self.trees:
            args = ['ls-tree', '-z', '-l'] + (['-r'] if recursive else []) + [tree]
            entries = []
            for record in self.run(*args).split(b'\0'):
                if not record:
                    continue
                metadata, path = record.split(b'\t', 1)
                mode, kind, oid, size = metadata.split()
                entries.append(dict(path=os.fsdecode(path), mode=mode.decode(), kind=kind.decode(),
                                    oid=oid.decode(), size=int(size) if size != b'-' else 0))
            self.trees[key] = entries
        return self.trees[key]

    def root_entries(self, commit):
        return self.entries(commit, False)

    def blob(self, oid):
        if not oid or any(c not in '0123456789abcdef' for c in oid):
            raise InspectionError('history.invalid-object')
        self.reader.stdin.write(oid.encode() + b'\n')
        self.reader.stdin.flush()
        header = self.reader.stdout.readline().split()
        if len(header) != 3 or header[1] != b'blob':
            raise InspectionError('history.missing-blob')
        size = int(header[2])
        data = self.reader.stdout.read(size)
        if len(data) != size or self.reader.stdout.read(1) != b'\n':
            raise InspectionError('history.missing-blob')
        return data

    def selected(self, path):
        entry = next((e for e in self.entries(self.commit) if e['path'] == path), None)
        return self.blob(entry['oid']) if entry and entry['kind'] == 'blob' else None

    def messages(self):
        records = self.run('log', '-z', '--format=%H%x00%B', *self.revisions).split(b'\0')
        for index in range(0, len(records) - 1, 2):
            if records[index]:
                yield '@commit-message', records[index].decode().strip(), records[index + 1]
        for record in self.run('for-each-ref', '--format=%(objecttype) %(objectname)', 'refs/tags').splitlines():
            kind, oid = record.decode().split()
            if kind == 'tag':
                raw = self.run('cat-file', 'tag', oid)
                yield '@tag-message', oid, raw.partition(b'\n\n')[2]

    def close(self):
        if self.reader:
            self.reader.stdin.close()
            self.reader.stdout.close()
            try:
                self.reader.wait(timeout=2)
            except subprocess.TimeoutExpired:
                self.reader.kill()
                self.reader.wait()
            self.reader = None

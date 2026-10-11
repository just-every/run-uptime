"""Classify file-name to SHA-256 maps whose every digest is a same-tree file's hash.

A map is a run of `name: "digest"` entries separated only by commas, semicolons,
whitespace and line comments. The native finding inside it is classified only
when every entry names a regular file in the scanned tree whose bytes hash to
that entry's digest. One unproved entry, or a hex value no entry keys to a file,
keeps the finding. No path, filename or repository is exempt.
"""
import hashlib
import re
from copy_identities import relative_path
from hit_location import match_spans

ENTRY = re.compile(
    rb'''(?<![\w./@+-])(?:(?P<q>["'`])(?P<quoted>[^"'`\\\r\n]{1,200})(?P=q)|(?P<bare>[\w./@+-]{1,200}))'''
    rb'''[ \t]*(?::|=>|=)[ \t]*(?P<v>["'`]?)(?P<digest>[a-f0-9]{64}|[a-f0-9]{40})(?P=v)(?![a-f0-9\w])''')
SEPARATOR = re.compile(rb'(?:[\s,;]|(?://|#)[^\n]*)*')


class ChecksumMaps:
    def __init__(self, paths, read_regular):
        self.paths, self.read_regular, self.hashes = sorted(paths), read_regular, {}

    def digest(self, path):
        if path not in self.hashes:
            value = self.read_regular(path)
            self.hashes[path] = hashlib.sha256(value[0]).hexdigest() if value else None
        return self.hashes[path]

    def names_file(self, name, digest):
        return (relative_path(name) and len(digest) == 64
                and any(self.digest(path) == digest for path in self.paths
                        if path == name or path.endswith('/' + name)))

    def matches(self, data, hit):
        if hit.get('RuleID') not in ('generic-api-key', 'hex-api-key'):
            return False
        entries = list(ENTRY.finditer(data))
        for left, right in match_spans(data, hit):
            keyed = [i for i, e in enumerate(entries)
                     if left <= e.start('digest') and e.end('digest') <= right
                     and e.group('digest').decode() == hit.get('Secret')]
            if len(keyed) != 1:
                continue
            first = last = keyed[0]
            while first > 0 and SEPARATOR.fullmatch(data, entries[first - 1].end(), entries[first].start()):
                first -= 1
            while last + 1 < len(entries) and SEPARATOR.fullmatch(data, entries[last].end(), entries[last + 1].start()):
                last += 1
            return all(self.names_file((e.group('quoted') or e.group('bare')).decode('utf-8', 'replace'),
                                       e.group('digest').decode()) for e in entries[first:last + 1])
        return False

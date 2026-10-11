"""Read dotenv values into in-memory digests; never retain or report plaintext."""
import hashlib
import re
from pathlib import Path


def digest(value):
    return hashlib.sha256(value).digest()


def load_hashes(path):
    if path is None:
        return set()
    return load_hashes_and_digest(path)[0]


def load_hashes_and_digest(path):
    if path is None:
        return frozenset(), None
    with Path(path).expanduser().open('rb') as stream:
        raw = stream.read(16 * 1024 * 1024 + 1)
    if len(raw) > 16 * 1024 * 1024:
        raise ValueError("environment file too large")
    # Digest exact bytes, including comments/line endings; mtime is irrelevant.
    text = raw.decode('utf-8').replace('\r\n', '\n').replace('\r', '\n')
    return frozenset(value_hashes(text)), hashlib.sha256(raw).hexdigest()


def value_hashes(text):
    text = text.lstrip('\ufeff')
    hashes = set()
    # No evaluation, expansion, subprocesses or diagnostics containing input.
    assignment = re.compile(r'(?:export[ \t]+)?[A-Za-z_][A-Za-z0-9_]*[ \t]*=[ \t]*')
    cursor = 0
    while cursor < len(text):
        if text[cursor].isspace():
            cursor += 1
            continue
        if text[cursor] == '#':
            end = text.find('\n', cursor)
            cursor = len(text) if end < 0 else end + 1
            continue
        match = assignment.match(text, cursor)
        if not match:
            raise ValueError('invalid environment file')
        cursor = match.end()
        if cursor < len(text) and text[cursor] in "\"'":
            quote = text[cursor]
            cursor += 1
            value = []
            while cursor < len(text) and text[cursor] != quote:
                char = text[cursor]
                if quote == '"' and char == '\\' and cursor + 1 < len(text):
                    cursor += 1
                    char = {'n': '\n', 'r': '\r', 't': '\t', '"': '"', '\\': '\\'}.get(text[cursor], '\\' + text[cursor])
                value.append(char)
                cursor += 1
            if cursor == len(text):
                raise ValueError('invalid environment file')
            cursor += 1
            end = text.find('\n', cursor)
            end = len(text) if end < 0 else end
            tail = text[cursor:end].strip()
            if tail and not tail.startswith('#'):
                raise ValueError('invalid environment file')
            value = ''.join(value)
        else:
            end = text.find('\n', cursor)
            end = len(text) if end < 0 else end
            value = re.split(r'\s+#', text[cursor:end], maxsplit=1)[0].strip()
        cursor = end + 1
        if value:
            hashes.add(digest(value.encode()))
    return hashes

"""Resolve a native Gitleaks hit to the exact byte spans of its match."""


def match_spans(data, hit):
    lines = data.splitlines(keepends=True)
    try:
        first, last = hit['StartLine'] - 1, hit['EndLine'] - 1
        if not (0 <= first <= last < len(lines)):
            return []
        start = sum(map(len, lines[:first])) + hit['StartColumn'] - 1
        end = sum(map(len, lines[:last])) + hit['EndColumn']
        # Gitleaks 8.30.1 includes the preceding newline in columns
        # after fragment line one; Git fragments may begin mid-file.
        # Resolve that one-byte difference only against the exact match.
        return [(start - shift, end - shift) for shift in (0, 1)
                if data[start - shift:end - shift] == hit['Match'].encode('utf-8')]
    except (KeyError, TypeError, IndexError, UnicodeError):
        return []

"""Strict JSON documents and exact native-match byte locations."""
import json
import re

HEX = re.compile(r'[a-f0-9]{64}\Z')
GIT_REVISION = re.compile(r'[a-f0-9]{40}\Z')


class Document:
    """Reject ambiguous/non-JSON input and retain exact byte spans of strings."""
    def __init__(self, data):
        self.data = data
        text = data.decode('utf-8')
        self.spans = {}
        def invalid_constant(_):
            raise ValueError('Non-JSON constant')

        decoder = json.JSONDecoder(parse_constant=invalid_constant)

        def whitespace(at):
            while at < len(text) and text[at] in ' \t\r\n':
                at += 1
            return at

        def parse(at, pointer):
            at = whitespace(at)
            if text[at] in '{[':
                mapping = text[at] == '{'
                end = '}' if mapping else ']'
                result = {} if mapping else []
                at = whitespace(at + 1)
                if text[at] == end:
                    return result, at + 1
                while True:
                    if mapping:
                        key, at = decoder.raw_decode(text, at)
                        if not isinstance(key, str) or key in result:
                            raise ValueError('Ambiguous JSON member')
                        at = whitespace(at)
                        if text[at] != ':':
                            raise ValueError('Invalid JSON member')
                        at += 1
                    else:
                        key = len(result)
                    value, at = parse(at, (*pointer, key))
                    if mapping:
                        result[key] = value
                    else:
                        result.append(value)
                    at = whitespace(at)
                    if text[at] == end:
                        return result, at + 1
                    if text[at] != ',':
                        raise ValueError('Invalid JSON separator')
                    at = whitespace(at + 1)
            value, end = decoder.raw_decode(text, at)
            if isinstance(value, str) and (HEX.fullmatch(value) or GIT_REVISION.fullmatch(value)):
                self.spans[pointer] = (len(text[:at].encode('utf-8')), len(text[:end].encode('utf-8')), value)
            return value, end

        self.value, end = parse(0, ())
        if whitespace(end) != len(text):
            raise ValueError('Trailing JSON data')

    def matches(self, hit, pointers):
        if hit.get('RuleID') not in ('generic-api-key', 'hex-api-key'):
            return False
        lines = self.data.splitlines(keepends=True)
        try:
            first, last = hit['StartLine'] - 1, hit['EndLine'] - 1
            if not (0 <= first <= last < len(lines)):
                return False
            start = sum(map(len, lines[:first])) + hit['StartColumn'] - 1
            end = sum(map(len, lines[:last])) + hit['EndColumn']
            # Gitleaks 8.30.1 includes the preceding newline in columns
            # after fragment line one; Git fragments may begin mid-file.
            # Resolve that one-byte difference only against the exact match.
            located = set()
            for shift in (0, 1):
                left, right = start - shift, end - shift
                if self.data[left:right] != hit['Match'].encode('utf-8'):
                    continue
                for pointer in pointers:
                    span = self.spans.get(pointer)
                    if span:
                        a, b, value = span
                        if (left <= a + 1 and b - 1 <= right and hit['Secret'] == value
                                and self.data[a + 1:b - 1] == value.encode('ascii')):
                            located.add((a, b))
            return len(located) == 1
        except (KeyError, TypeError, IndexError, UnicodeError):
            return False

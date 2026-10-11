"""Bound shell command arguments by their surrounding source/prose context."""
import re
from command_arguments import arguments
from command_source_quotes import SourceQuotes

COMMAND = re.compile(r'(?i)(?<![\w-])(?:git[ \t]+clone|gh[ \t]+repo[ \t]+(?:clone|view|fork))[ \t]+')
QUOTES = re.compile(r'`+|\"{3}|\'{3}|[\"\']')


def enclosing_quotes(text, stops):
    """Walk quote scopes once, yielding the innermost scope at each command."""
    delimiters, index = [], 0
    source_quotes = SourceQuotes(text)
    for stop in stops:
        while index < stop:
            if text[index] == '\\':
                index += 2
                continue
            delimiter, opened = delimiters[-1] if delimiters else (None, 0)
            if delimiter:
                if text[index] == '\n' and delimiter in ("'", '"'):
                    delimiters.pop()
                    index += 1
                    continue
                if text.startswith(delimiter, index):
                    index += len(delimiter)
                    delimiters.pop()
                    continue
                if not delimiter.startswith('`'):
                    index += 1
                    continue
                # Inline code can contain source strings. The innermost source
                # quote bounds its command before another argument or funding URL.
            match = QUOTES.match(text, index)
            # An already-open quote closes above, even when it follows a word.
            apostrophe = match and match[0] == "'" and index and text[index - 1].isalnum()
            if apostrophe:
                start = opened + len(delimiter) if delimiter else 0
                end = context_end(text, start, delimiter) if delimiter else len(text)
                apostrophe = not source_quotes.contains(index, start, end)
            if match and not apostrophe:
                delimiters.append((match[0], index))
                index = match.end()
            else:
                index += 1
        yield delimiters[-1][0] if delimiters else None


def context_end(text, start, delimiter, stop=None):
    stop = len(text) if stop is None else stop
    if delimiter:
        index = start
        while index < stop:
            if text[index] == '\\':
                index += 2
            elif text.startswith(delimiter, index):
                return index
            else:
                index += 1
    return stop


def commands(text):
    """Retain complete arguments even if later surrounding prose is malformed."""
    text = text.replace('\\\n', ' ')
    matches = list(COMMAND.finditer(text))
    scopes = enclosing_quotes(text, (match.start() for match in matches))
    for match, delimiter in zip(matches, scopes):
        line_end = text.find('\n', match.end())
        if line_end < 0:
            line_end = len(text)
        end = context_end(text, match.end(), delimiter, line_end)
        # Options may name reference repositories too. Shell separators
        # and the outer text delimiter bound their repository intent.
        yield ' '.join(arguments(text[match.end():end]))

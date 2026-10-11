"""Bound literal arguments in documentary shell output commands."""
import re
import shlex

OUTPUT = re.compile(r'(?m)^[ \t]*(?:(?:command|builtin)[ \t]+)?(?:echo|printf)[ \t]+')


def output_quotes(source):
    """Recognize explicit echo/printf statements without running a shell.

    Arbitrary prose is often valid shell syntax, so shell tokenization alone
    cannot establish a source context. These output statements explicitly
    present their arguments as text. Custom executable names make no such
    assertion about a document's prose.
    """
    found = set()
    for match in OUTPUT.finditer(source):
        quotes, delimiter = set(), None
        index = match.end()
        while index < len(source):
            char = source[index]
            if char == '\\' and delimiter != "'":
                index += 2
                continue
            if delimiter:
                if char == delimiter:
                    delimiter = None
            elif char in '\n;&|':
                break
            elif char == '#' and source[index - 1].isspace():
                break
            elif char in "'\"":
                delimiter = char
                quotes.add(index)
            index += 1
        try:
            shlex.split(source[match.start():index], comments=True, posix=True)
        except ValueError:
            continue
        found.update(quotes)
    return found

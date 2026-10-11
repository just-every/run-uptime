"""Retain completed shell words and quoted parts before malformed outer text."""
import shlex


def completed_parts(source):
    """Read completed components of the final, unfinished shell word.

    An unknown wrapper can leave its closing quote after a complete quoted
    command argument. shlex keeps that argument in its pending token and then
    raises. Keep its closed quote components and leading unquoted component;
    unquoted suffixes between later source quotes are not command arguments.
    """
    parts, leading, quoted = [], '', False
    delimiter, opened, index = None, 0, 0
    while index < len(source):
        char = source[index]
        if char == '\\' and delimiter != "'":
            if not delimiter and not quoted:
                leading += source[index:index + 2]
            index += 2
            continue
        if delimiter:
            if char == delimiter:
                parts.extend(shlex.split(source[opened:index + 1], posix=True))
                delimiter = None
        elif char in ' \t\r\n':
            parts, leading, quoted = [], '', False
        elif char in '#;&|':
            return []
        elif char in "'\"":
            if not quoted and leading:
                parts.extend(shlex.split(leading, posix=True))
            delimiter, opened, quoted = char, index, True
        elif not quoted:
            leading += char
        index += 1
    return parts


def arguments(source):
    shell = shlex.shlex(source, posix=True, punctuation_chars=';&|')
    shell.whitespace_split = True
    try:
        for word in shell:
            if word and all(char in ';&|' for char in word):
                return
            yield word
    except ValueError:
        # Completed words have already been yielded. A completed quoted part
        # of the pending word must not disappear with a later unmatched quote.
        yield from completed_parts(source)

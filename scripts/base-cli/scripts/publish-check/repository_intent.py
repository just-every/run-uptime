"""Repository declaration scopes independent of source language/extension."""
import re
from repository_commands import commands

FIELD = r'''["']?(?:repository|repo|github|sourceRepository)["']?'''
OBJECT = re.compile(r'(?i)(?<![\w$])' + FIELD + r'\s*[:=]\s*(?P<open>\{)')
TABLE = re.compile(r'''(?m)^\s*\[\[?\s*(?P<name>[^]\n]+)\]\]?[^\n]*''')
DECLARATION = re.compile(r'(?im)^(?P<indent>[ \t]*)(?:-\s*)?' + FIELD + r'[ \t]*:[ \t]*(?P<value>[^\n]*)')


def declarations(text):
    for match in OBJECT.finditer(text):
        start = match.start('open')
        nesting, quote, escaped = 0, None, False
        for end in range(start, len(text)):
            char = text[end]
            if quote:
                if escaped:
                    escaped = False
                elif char == '\\':
                    escaped = True
                elif char == quote:
                    quote = None
            elif char in ('"', "'", '`'):
                quote = char
            elif char == '{':
                nesting += 1
            elif char == '}':
                nesting -= 1
                if nesting == 0:
                    yield text[start:end + 1]
                    break
    tables = list(TABLE.finditer(text))
    for index, match in enumerate(tables):
        names = [part.strip(' \t\'"').lower() for part in match['name'].split('.')]
        if any(name in ('repository', 'repo', 'github', 'sourcerepository') for name in names):
            end = tables[index + 1].start() if index + 1 < len(tables) else len(text)
            yield text[match.end():end]
    for match in DECLARATION.finditer(text):
        if match['value'].lstrip().startswith('{'):
            # Inline object boundaries were handled above; a sibling on the
            # same line does not belong to the repository object.
            continue
        declaration = [match['value']]
        indent = len(match['indent'].expandtabs())
        for line in text[match.end():].splitlines()[1:]:
            if not line.strip():
                continue
            if len(line.expandtabs()) - len(line.expandtabs().lstrip()) <= indent:
                break
            declaration.append(line)
        yield '\n'.join(declaration)

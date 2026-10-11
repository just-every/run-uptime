"""Recognize Python literal openers by syntax, without evaluating source."""
import ast
import io
import re
import textwrap
import tokenize
import warnings
from command_shell_quotes import output_quotes

PREFIX = re.compile(r'''(?i)(?:br|rb|fr|rf|[bruf])(?=["'])''')
PREFIX_BEFORE = re.compile(r'(?i)(?<!\w)(?:br|rb|fr|rf|[bruf])$')
STRING_TOKENS = {tokenize.STRING, getattr(tokenize, 'FSTRING_START', tokenize.STRING)}


def parsed_quotes(source):
    """Return lexical quote offsets only when their containing source parses.

    Tokenization alone accepts a possessive as a string token even in invalid
    prose. Parsing alone accepts comments that contain possessives. Both are
    needed before an apostrophe may truncate a later shell command.
    """
    code = textwrap.dedent(source)
    try:
        # Inspected text must never be emitted through parser warnings.
        with warnings.catch_warnings():
            warnings.simplefilter('ignore')
            ast.parse(code)
        tokens = list(tokenize.generate_tokens(io.StringIO(code).readline))
    except (SyntaxError, ValueError, tokenize.TokenError, RecursionError):
        return None
    original_lines = source.splitlines(keepends=True)
    code_lines = code.splitlines(keepends=True)
    offsets, offset = [], 0
    for line in original_lines:
        offsets.append(offset)
        offset += len(line)
    quotes = set()
    for token in tokens:
        prefix = PREFIX.match(token.string) if token.type in STRING_TOKENS else None
        if prefix:
            row, column = token.start
            removed = len(original_lines[row - 1]) - len(code_lines[row - 1])
            quotes.add(offsets[row - 1] + removed + column + prefix.end())
    return quotes


def literal_quotes(source):
    quotes = parsed_quotes(source)
    complete = quotes is not None
    quotes = quotes if complete else set()
    quotes.update(output_quotes(source))
    # A complete statement still has its own grammar when neighboring prose
    # or a later statement is malformed. Split at Python token boundaries,
    # never at punctuation inside a string, comment or open expression.
    offsets = [0]
    for line in source.splitlines(keepends=True):
        offsets.append(offsets[-1] + len(line))
    start, depth = 0, 0
    try:
        for token in tokenize.generate_tokens(io.StringIO(source).readline):
            if token.type == tokenize.COMMENT:
                # Comments may document source code. Validate the entire
                # explicitly marked body, so prose possessives remain prose.
                body_quotes = parsed_quotes(token.string[1:])
                body_quotes = (body_quotes or set()) | output_quotes(token.string[1:])
                if body_quotes:
                    row, column = token.start
                    quotes.update(offsets[row - 1] + column + 1 + index for index in body_quotes)
            if token.type == tokenize.OP:
                if token.string in '([{':
                    depth += 1
                elif token.string in ')]}':
                    depth -= 1
            if not complete and (token.type == tokenize.NEWLINE or (token.string == ';' and depth == 0)):
                row, column = token.end
                end = min(len(source), offsets[row - 1] + column)
                statement_quotes = parsed_quotes(source[start:end])
                if statement_quotes is not None:
                    quotes.update(start + index for index in statement_quotes)
                start = end
    except (SyntaxError, ValueError, tokenize.TokenError, RecursionError):
        pass
    for comment in re.finditer(r'(?m)^[ \t]*(?://|/\*)([^\n]*)', source):
        body = comment[1]
        if comment[0].lstrip().startswith('/*'):
            close = body.find('*/')
            if close < 0:
                continue
            body = body[:close]
        body_quotes = parsed_quotes(body)
        body_quotes = (body_quotes or set()) | output_quotes(body)
        if body_quotes:
            quotes.update(comment.start(1) + index for index in body_quotes)
    return quotes


class SourceQuotes:
    def __init__(self, text):
        self.text = text
        self.regions = {}

    def region(self, start, end):
        key = (start, end)
        if key not in self.regions:
            self.regions[key] = literal_quotes(self.text[start:end])
        return self.regions[key]

    def contains(self, index, start=0, end=None):
        if not PREFIX_BEFORE.search(self.text, max(0, index - 2), index):
            return False
        end = len(self.text) if end is None else end
        quotes = self.region(start, end)
        if index - start in quotes:
            return True
        # An earlier malformed token can prevent document tokenization from
        # reaching a later source line. Only retry the whole physical line.
        start = max(start, self.text.rfind('\n', start, index) + 1)
        line_end = self.text.find('\n', index, end)
        end = end if line_end < 0 else line_end
        return index - start in self.region(start, end)

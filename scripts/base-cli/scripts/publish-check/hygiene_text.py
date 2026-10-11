"""Decode common textual representations without executing source."""
import html
import re
from urllib.parse import unquote


def decoded_text(data):
    text = data.replace(b'\0', b'').decode('utf-8', 'replace')
    text = html.unescape(unquote(text))
    return re.sub(r'\\(?:u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2}))',
                  lambda match: chr(int(match.group(1) or match.group(2), 16)), text).replace('\\/', '/')

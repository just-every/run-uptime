"""Base-owned defaults and explicit committed seed publication declarations."""
import json
import re
from publication_config import intended_public_repositories

# A home segment within a relative path is not an absolute home directory.
# Match the username itself so a bare home, including one with spaces, counts.
LOCAL_PATH = re.compile(r'''(?x)(?<![^\s("'`=:\[<>{|])(?:[*_]|~~)*(?:(?:(?i:(?a:file://)))?(?<!/[A-Z]:)/(?:Users|home)/|(?i:(?:(?a:file:///))?[A-Z]:[\\/]+Users[\\/]+))[^/\\\s"'<>`]+''')
CONFIG = '.publish-check/config.json'
EMAIL = re.compile(r"(?<![A-Za-z0-9_.+%-])[A-Za-z0-9_][A-Za-z0-9_.+%'-]{0,63}@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)*[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.[A-Za-z][A-Za-z0-9-]{1,62}(?![A-Za-z0-9.-])|(?<![A-Za-z0-9_.+%-])[A-Za-z0-9_][A-Za-z0-9_.+%'-]{0,63}@(?:example|test|invalid)(?![A-Za-z0-9.-])", re.I)
RULES = {'hygiene.local-path', 'hygiene.github-private', 'hygiene.github-missing',
         'hygiene.email', 'hygiene.internal-reference'}


def load_config(data=None):
    config = json.loads(data) if data is not None else {'schemaVersion': 1}
    if not isinstance(config, dict) or config.get('schemaVersion') != 1 or set(config) - {'schemaVersion', 'publicEmails', 'internalReferencePatterns'}:
        raise ValueError('invalid publication config')
    emails = config.get('publicEmails', [])
    extra_patterns = config.get('internalReferencePatterns', [])
    if not isinstance(extra_patterns, list):
        raise ValueError('invalid internal references')
    patterns = extra_patterns
    if not isinstance(emails, list) or any(not isinstance(e, str) or not EMAIL.fullmatch(e) or '*' in e for e in emails):
        raise ValueError('invalid public emails')
    if not isinstance(patterns, list) or any(not isinstance(p, str) or not p for p in patterns):
        raise ValueError('invalid internal references')
    try:
        compiled = [re.compile(p) for p in patterns]
    except re.error:
        raise ValueError('invalid internal reference regex') from None
    return {'publicEmails': {e.lower() for e in emails}, 'internalReferencePatterns': compiled,
            'intendedPublicRepositories': intended_public_repositories()}


def public_email(address, config):
    domain = address.lower().rsplit('@', 1)[1]
    # RFC 2606 reserved names; .localhost also holds local dev personas (<as>@dev.localhost).
    reserved = ('example', 'test', 'invalid', 'localhost', 'example.com', 'example.net', 'example.org')
    return address.lower() in config['publicEmails'] or any(domain == d or domain.endswith('.' + d) for d in reserved)

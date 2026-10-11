"""Exact committed finding identities; provider tokens and known environment values cannot be waived."""
import json
import re
from datetime import date, datetime, timezone
from hygiene_config import RULES

REVIEWED = '.publish-check/reviewed.json'
SECRET_RULES = {'secret.provider-token', 'secret.assignment', 'secret.private-key', 'secret.jwt',
                'secret.url-credentials', 'secret.authorization', 'secret.shaped-file'}
FORBIDDEN = {'secret.provider-token', 'secret.env-match', 'license.missing'}


def unique_fields(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('duplicate object field')
        result[key] = value
    return result


def load_reviewed(data):
    document = json.loads(data, object_pairs_hook=unique_fields)
    if not isinstance(document, dict) or document.get('schemaVersion') != 1 or not isinstance(document.get('findings'), list):
        raise ValueError('invalid reviewed document')
    result = {}
    for entry in document['findings']:
        fields = {'rule', 'path', 'blob', 'reason', 'reviewer', 'date'}
        if not isinstance(entry, dict) or set(entry) not in (fields, fields | {'fixtureValuesSha256'}, fields | {'containedFixtures'}) or entry['rule'] not in RULES | SECRET_RULES | FORBIDDEN | {'license.holder'}:
            raise ValueError('invalid reviewed entry')
        if not all(isinstance(entry[k], str) and entry[k].strip() for k in fields):
            raise ValueError('invalid reviewed entry')
        if not re.fullmatch(r'[0-9a-f]{40}|[0-9a-f]{64}', entry['blob']):
            raise ValueError('invalid reviewed identity')
        if date.fromisoformat(entry['date']) > datetime.now(timezone.utc).date():
            raise ValueError('invalid review date')
        key = (entry['rule'], entry['path'], entry['blob'])
        # Older exports may repeat the same blob identity for distinct contained
        # fixtures. Those fields no longer affect scanning; keep the review.
        result[key] = entry
    return result

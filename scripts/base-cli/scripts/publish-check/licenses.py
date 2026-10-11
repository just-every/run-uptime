"""Root licence holder checks and narrowly bound, dated exceptions."""
from datetime import date, datetime, timezone
import hashlib
import json
import re
from pathlib import Path

EXCEPTIONS = 'PUBLISH-EXCEPTIONS.json'
HOLDER = re.compile(r'^\s*Copyright\s*(?:\(c\)|©)?\s*(?:\d{4}(?:\s*[-–,]\s*\d{4})*\s+)?(.+?)\s*$', re.I | re.M)


def exceptions(data):
    if data is None:
        return []
    document = json.loads(data)
    if document.get('schemaVersion') != 1 or not isinstance(document.get('exceptions'), list):
        raise ValueError('invalid exceptions')
    for entry in document['exceptions']:
        if (entry.get('rule') != 'license.holder' or entry.get('path') != 'LICENSE'
                or not isinstance(entry.get('holder'), str) or not entry['holder'].strip()
                or not re.fullmatch(r'[0-9a-f]{64}', entry.get('sha256', ''))
                or not isinstance(entry.get('reason'), str) or not entry['reason'].strip()
                or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', entry.get('date', ''))
                or date.fromisoformat(entry['date']) > datetime.now(timezone.utc).date()):
            raise ValueError('invalid exception')
    return document['exceptions']


def license_rules(data, recorded):
    if data is None or not data.strip():
        return ['license.missing']
    try:
        text = data.decode('utf-8')
    except UnicodeError:
        return ['license.unreadable']
    holders = HOLDER.findall(text)
    if not holders:
        return ['license.holder-missing']
    digest = hashlib.sha256(data).hexdigest()
    if any(holder != 'Run Edit Run' and not any(e['holder'] == holder and e['sha256'] == digest for e in recorded)
           for holder in holders):
        return ['license.holder']
    return []


def registry():
    """Base-reviewed exceptions, bound to holder and complete LICENSE bytes."""
    path = Path(__file__).with_name('license-exceptions.json')
    return exceptions(path.read_bytes())

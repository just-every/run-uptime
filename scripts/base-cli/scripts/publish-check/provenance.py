"""Recognize source declarations, never ordinary repository mentions."""
import json
import re
from github_refs import URL, FULL, normalize

MANIFESTS = ('edition.json', 'sources.lock.json')


def source_key(value):
    if not isinstance(value, dict):
        return None
    repository = value.get('repository')
    revision = value.get('revision', value.get('commit'))
    if not isinstance(repository, str) or not isinstance(revision, str) or not re.fullmatch(r'[0-9a-f]{40}|[0-9a-f]{64}', revision):
        return None
    if '://' in repository and repository.split('://', 1)[0].lower() not in ('http', 'https', 'git', 'ssh', 'git+http', 'git+https', 'git+ssh'):
        return None
    match = URL.fullmatch(repository)
    repo = normalize(match.group(1)) if match else normalize(repository) if FULL.fullmatch(repository) else None
    return (repo, revision) if repo else None


def declarations(document):
    if not isinstance(document, dict):
        return
    pending = [document.get('parent')]
    components = document.get('components', [])
    if isinstance(components, list):
        pending.extend(c.get('source') for c in components if isinstance(c, dict))
    while pending:
        value = pending.pop()
        if not isinstance(value, dict):
            continue
        if source_key(value):
            yield value
        pending.append(value.get('origin'))


def declared_keys(data):
    try:
        return {source_key(value) for value in declarations(json.loads(data))}
    except (ValueError, TypeError):
        return set()


def copy_record(document, declared):
    """Canonical copy inventories bind the acquisition identity to declared pins."""
    copies = document.get('copies')
    if document.get('schemaVersion') != 1 or not isinstance(copies, list) or not copies:
        return False
    for copy in copies:
        if not isinstance(copy, dict) or source_key(dict(repository=document.get('repository'), revision=copy.get('revision'))) not in declared:
            return False
        path, origin = copy.get('path'), copy.get('originPath')
        if not all(isinstance(value, str) and value and not value.startswith('/') and '..' not in value.split('/') for value in (path, origin)):
            return False
        files, modes = copy.get('files'), copy.get('modes')
        if not isinstance(files, dict) or not files or not isinstance(modes, dict) or files.keys() != modes.keys():
            return False
        if any(not (name == path or name.startswith(path + '/')) or not isinstance(value, str) or not re.fullmatch(r'[0-9a-f]{64}', value) or modes[name] not in ('100644', '100755') for name, value in files.items()):
            return False
    return True


def provenance_text(text, path, declared=frozenset()):
    snapshot = re.fullmatch(r'\.edition/sources/[0-9a-f]{64}\.json', path)
    copied = path.rsplit('/', 1)[-1].lower() in ('provenance.json', 'origin.json')
    if path not in MANIFESTS and not snapshot and not copied and not path.endswith('.json'):
        return text, False
    try:
        document = json.loads(text)
    except ValueError:
        return text, False
    if not isinstance(document, dict):
        return text, False
    if copy_record(document, declared):
        document['repository'] = ''
        return json.dumps(document), True
    candidates = list(declarations(document)) if path in MANIFESTS else []
    if snapshot and isinstance(document.get('files'), dict) and source_key(document.get('origin')) in declared:
        candidates.append(document['origin'])
    hashes = document.get('files')
    copies = document.get('copies')
    mapped = isinstance(copies, dict) and copies and all(isinstance(k, str) and isinstance(v, str) and k and v for k, v in copies.items())
    hashed = isinstance(hashes, dict) and hashes and all(isinstance(h, str) and re.fullmatch(r'[0-9a-f]{64}', h) for h in hashes.values())
    selected = isinstance(document.get('path'), str) and bool(document['path'])
    if copied and source_key(document) in declared and (mapped or hashed or selected):
        candidates.append(document)
    for value in candidates:
        value['repository'] = ''
    return (json.dumps(document) if candidates else text), bool(candidates)

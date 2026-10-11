"""Classify module Git pins and prove Source keys at specific JSON locations.

This is classification, not Source authoring validation. A stale lock still
fails the authoring check. Missing original preimages remain ordinary findings.
"""
import base64
import hashlib
import re
import json
from pathlib import Path
import subprocess
from json_identity import Document, HEX
from provenance_pins import module_pins
from copy_identities import copy_pointers

ARCHIVE = re.compile(r'\.edition/sources/([a-f0-9]{64})\.json\Z')


def candidate(path):
    return path in ('edition.json', 'sources.lock.json', 'base-copies.json', 'base/PROVENANCE.json') or bool(ARCHIVE.fullmatch(path))


def safe_path(value):
    return (isinstance(value, str) and value and not re.search(r'[\\\x00-\x1f\x7f]', value)
            and all(part not in ('', '.', '..', '.git') for part in value.split('/')))


def valid_files(files):
    if not isinstance(files, dict) or not files:
        return False
    for name, file in files.items():
        if (not safe_path(name) or not isinstance(file, dict) or not isinstance(file.get('data'), str)
                or type(file.get('executable')) is not bool):
            return False
        try:
            if base64.b64encode(base64.b64decode(file['data'], validate=True)).decode() != file['data']:
                return False
        except ValueError:
            return False
    return True


def same_json(left, right):
    # Python equates booleans and numbers; Source JSON identities do not.
    return json.dumps(left, sort_keys=True) == json.dumps(right, sort_keys=True)


class ContentIdentities:
    def __init__(self, files, read_regular=None):
        self.documents, self.allowed, self.archives, self.hashes = {}, {}, {}, {}
        for path, data in files.items():
            if candidate(path):
                try:
                    self.documents[path] = Document(data)
                except (ValueError, TypeError, IndexError, RecursionError, UnicodeError):
                    pass
        if not self.documents:
            return
        for path, document in self.documents.items():
            for pointer in module_pins(path, document.value):
                self.allow(path, pointer)
            if path in ('base-copies.json', 'base/PROVENANCE.json') and read_regular is not None:
                for pointer in copy_pointers(document.value, read_regular):
                    self.allow(path, pointer)
        recipe = self.document('edition.json')
        origins = [self.origin(recipe.get('parent'), True)]
        components = recipe.get('components', [])
        if isinstance(components, list):
            for component in components:
                source = component.get('source') if isinstance(component, dict) else None
                if isinstance(source, dict):
                    origins.append(self.origin(source if source.get('kind') == 'git' else source.get('origin')))
        values = [recipe, *(v for v in origins if v is not None)]
        for path, document in self.documents.items():
            saved = document.value
            if ARCHIVE.fullmatch(path) and isinstance(saved, dict):
                values.extend([saved, saved.get('origin'), saved.get('files')])
        self.hashes = {}
        if values:
            try:
                result = subprocess.run(['node', str(Path(__file__).with_name('source_hashes.mjs'))],
                                        input=json.dumps(values).encode(), capture_output=True, timeout=60, check=True)
                hashes = json.loads(result.stdout)
                if len(hashes) != len(values) or not all(isinstance(h, str) and HEX.fullmatch(h) for h in hashes):
                    return
                self.hashes = {json.dumps(v): h for v, h in zip(values, hashes)}
            except (OSError, ValueError, subprocess.SubprocessError):
                return
        # Authoring pins hash(json(saved)); a raw-byte pin alone cannot prove a
        # differently encoded retained archive, even when its fields agree.
        for path, document in self.documents.items():
            saved, match = document.value, ARCHIVE.fullmatch(path)
            if (match and isinstance(saved, dict) and saved.get('key') == match[1]
                    and isinstance(saved.get('origin'), dict) and saved['origin']
                    and valid_files(saved.get('files'))
                    and isinstance(saved.get('dependencies', []), list)
                    and saved['key'] == self.digest(saved['origin'])
                    and saved.get('digest') == self.digest(saved['files'])
                    and hashlib.sha256(document.data).hexdigest() == self.digest(saved)):
                self.archives[saved['key']] = (saved, hashlib.sha256(document.data).hexdigest())
        self.references()

    def digest(self, value):
        return self.hashes.get(json.dumps(value))

    def allow(self, path, pointer):
        self.allowed.setdefault(path, set()).add(pointer)

    def document(self, path):
        doc = self.documents.get(path)
        return doc.value if doc and isinstance(doc.value, dict) else {}

    def pin(self, pin, key):
        if not isinstance(pin, dict) or not isinstance(key, str) or key not in self.archives:
            return False
        archive, raw_sha = self.archives[key]
        return (pin.get('key') == key and pin.get('digest') == archive['digest']
                and pin.get('sha256') == raw_sha)

    def reference(self, ref, parent=False):
        if not isinstance(ref, dict):
            return None
        if not self.valid_selection(ref):
            return None
        selection = dict(path=ref.get('path') or '.', paths=ref.get('paths') or None,
                         excludeSnapshots=True if parent else bool(ref.get('excludeSnapshots')))
        projection = ref.get('projection')
        if isinstance(projection, dict) and set(projection) == {'key', 'sha256'}:
            key = projection['key']
            if not isinstance(key, str) or key not in self.archives:
                return None
            saved, raw_sha = self.archives[key]
            if (projection['sha256'] == raw_sha and same_json(saved['origin'].get('selection'), selection)):
                return key
            return None
        origin = self.origin(ref, parent)
        key = self.digest(origin)
        if key in self.archives and same_json(self.archives[key][0]['origin'], origin):
            return key
        return None

    @staticmethod
    def valid_selection(ref):
        return (ref.get('path', '.') == '.' or safe_path(ref.get('path'))) and (
            ref.get('paths') is None or isinstance(ref['paths'], list) and bool(ref['paths'])
            and all(safe_path(p) for p in ref['paths'])) and (
            'excludeSnapshots' not in ref or type(ref['excludeSnapshots']) is bool)

    @staticmethod
    def origin(ref, parent=False):
        if not isinstance(ref, dict) or not ContentIdentities.valid_selection(ref):
            return None
        projection = ref.get('projection')
        if (not isinstance(ref.get('repository'), str) or not ref['repository']
                or ref['repository'].startswith('-')):
            return None
        if 'projection' in ref:
            if ('revision' in ref or not isinstance(projection, dict) or set(projection) != {'schemaVersion', 'originalSha256', 'recipeSha256'}
                    or type(projection['schemaVersion']) is not int or projection['schemaVersion'] != 1
                    or not all(isinstance(projection[k], str) and HEX.fullmatch(projection[k])
                               for k in ('originalSha256', 'recipeSha256'))):
                return None
            identity = dict(projection=projection)
        elif isinstance(ref.get('revision'), str) and re.fullmatch(r'[a-f0-9]{40}', ref['revision']):
            identity = dict(revision=ref['revision'])
        else:
            return None
        return dict(repository=ref['repository'], **identity, path=ref.get('path') or '.',
                    paths=ref.get('paths') or None,
                    excludeSnapshots=True if parent else bool(ref.get('excludeSnapshots')))

    def dependency_locations(self, key):
        # Stage the entire selected closure before granting any of its locations.
        # An unresolved later edge must not leave the root or earlier edges allowed.
        pending, visited, locations = [key], set(), []
        while pending:
            key = pending.pop()
            if key in visited:
                continue
            visited.add(key)
            saved, _ = self.archives[key]
            path = '.edition/sources/' + key + '.json'
            locations.append((path, ('key',)))
            for i, pin in enumerate(saved.get('dependencies', [])):
                if not isinstance(pin, dict) or not self.pin(pin, pin.get('key')):
                    return None
                locations.append((path, ('dependencies', i, 'key')))
                pending.append(pin['key'])
        return locations

    def references(self):
        recipe = self.document('edition.json')
        lock = self.document('sources.lock.json')
        if type(recipe.get('schemaVersion')) is not int or recipe['schemaVersion'] != 1 or not isinstance(recipe.get('components'), list):
            return
        components = lock.get('components')
        locked = (type(lock.get('schemaVersion')) is int and lock['schemaVersion'] == 1
                  and isinstance(recipe.get('id'), str) and lock.get('edition') == recipe['id']
                  and lock.get('manifest') == self.digest(recipe) and isinstance(components, list))
        if not locked:
            return
        def identifiers(entries):
            ids = [entry.get('id') for entry in entries if isinstance(entry, dict)]
            return (len(ids) == len(entries) and all(isinstance(i, str) and i for i in ids)
                    and len(set(ids)) == len(ids))
        if not identifiers(recipe['components']) or not identifiers(components):
            return
        by_id = {c['id']: c for c in components}
        if (len(components) != len(recipe['components']) or any(
                c['id'] not in by_id or not same_json(c.get('source'), by_id[c['id']].get('source'))
                for c in recipe['components'])):
            return
        selected = []
        key = self.reference(recipe.get('parent'), parent=True)
        if key and locked and self.pin(lock.get('parent'), key):
            selected.append((key, [
                ('edition.json', ('parent', 'projection', 'key')),
                ('sources.lock.json', ('parent', 'key')),
            ]))
        for index, component in enumerate(recipe['components']):
            if not isinstance(component, dict):
                continue
            source = component.get('source')
            if not isinstance(source, dict):
                continue
            suffix = () if source.get('kind') == 'git' else ('origin',) if source.get('kind') == 'local' else None
            if suffix is None:
                continue
            key = self.reference(source if not suffix else source.get('origin'))
            if not key:
                continue
            for i, entry in enumerate(components):
                if (isinstance(entry, dict) and entry.get('id') == component.get('id')
                        and same_json(entry.get('source'), source) and self.pin(entry.get('baseline'), key)):
                    selected.append((key, [
                        ('edition.json', ('components', index, 'source', *suffix, 'projection', 'key')),
                        ('sources.lock.json', ('components', i, 'baseline', 'key')),
                        ('sources.lock.json', ('components', i, 'source', *suffix, 'projection', 'key')),
                    ]))
        # Validate each selection independently: unselected archives and unrelated
        # coherent selections cannot invalidate this graph's proof.
        for key, locations in selected:
            dependencies = self.dependency_locations(key)
            if dependencies is not None:
                for path, pointer in locations + dependencies:
                    self.allow(path, pointer)

    def matches(self, path, hit):
        document = self.documents.get(path)
        return bool(document and document.matches(hit, self.allowed.get(path, ())))

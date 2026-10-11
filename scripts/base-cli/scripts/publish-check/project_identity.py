"""Same-tree, explicit project identities; never a repository-name allowlist."""
import json
from pathlib import Path
import re
import subprocess
from hygiene_text import decoded_text
from policy import READ_LIMIT
from reviewed import unique_fields

FIELDS = {'edition.json': 'id', 'sources.lock.json': 'edition', 'rer-project.json': 'projectId'}
TOOLCHAIN = {'id': 'runeditrun/edition-authoring', 'version': '1.1.0'}
VALIDATOR = Path(__file__).with_name('identity-recipe.mjs')


def document(data):
    def reject_constant(value):
        raise ValueError('non-JSON constant')
    value = json.loads(data, object_pairs_hook=unique_fields, parse_constant=reject_constant)
    if not isinstance(value, dict):
        raise ValueError('invalid identity document')
    return value


def schema_one(value):
    return not isinstance(value, bool) and value == 1


def same_toolchain(value):
    return isinstance(value, dict) and all(value.get(k) == v for k, v in TOOLCHAIN.items())


def ordinary_document(entry):
    return bool(entry and entry['kind'] == 'blob' and entry['mode'] in ('100644', '100755')
                and entry['size'] <= READ_LIMIT)


def tree_identity(history, root_entries):
    """Validate actual nonrecursive root entries, including empty Git trees."""
    roots = {e['path']: e for e in root_entries if e['path'] in FIELDS}
    entry = roots.get('edition.json')
    if entry is None:
        return None, frozenset()

    def read(entry):
        if not ordinary_document(entry):
            raise ValueError('unreadable identity document')
        return history.blob(entry['oid'])

    # An unreadable root cannot establish whether the edition opts in. It must
    # not silently become an absent/legacy edition, even when Git omits it from
    # the recursive file inventory. Ordinary legacy JSON keeps its old rules.
    try:
        data = read(entry)
    except (ValueError, TypeError):
        return None, frozenset({'edition.json'})
    try:
        recipe = document(data)
    except (ValueError, TypeError, UnicodeError):
        # Malformed opt-ins cannot become ordinary, permissive metadata. Other
        # legacy malformed documents keep the existing scanner behaviour.
        opted = re.search(r'\bidentityKind\b', decoded_text(data))
        return None, frozenset({'edition.json'} if opted else ())
    if 'identityKind' not in recipe:
        return None, frozenset()
    try:
        if recipe['identityKind'] != 'project':
            raise ValueError('unknown identity kind')
        result = subprocess.run(['node', str(VALIDATOR)], input=data, capture_output=True, timeout=15)
        canonical = result.stdout.decode('ascii')
        if result.returncode or not re.fullmatch(r'[0-9a-f]{64}', canonical):
            raise ValueError('invalid recipe')
    except (OSError, ValueError, UnicodeError, subprocess.TimeoutExpired):
        return None, frozenset({'edition.json'})
    invalid = set()
    for name in ('sources.lock.json', 'rer-project.json'):
        if name not in roots:
            continue
        try:
            value = document(read(roots[name]))
            if value.get(FIELDS[name]) != recipe['id']:
                raise ValueError('inconsistent project identity')
            if name == 'sources.lock.json':
                if not schema_one(value.get('schemaVersion')) or not same_toolchain(value.get('toolchain')) or value.get('manifest') != canonical:
                    raise ValueError('inconsistent source lock')
            elif not schema_one(value.get('schema')):
                raise ValueError('invalid project metadata')
        except (ValueError, TypeError, UnicodeError):
            invalid.add(name)
    return (None if invalid else recipe['id']), frozenset(invalid)

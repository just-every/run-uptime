"""Bind one pending public destination to explicit context and committed identities."""
import argparse
import json
import re
from github_refs import FULL
from project_identity import FIELDS, ordinary_document, tree_identity

RULE = 'pending-public-destination'
INVALID = 'destination.invalid'
MANIFESTS = ('edition.json', 'rer-project.json')
URL = re.compile(r'https://github\.com/([^/]+/[^/]+)', re.IGNORECASE | re.ASCII)


def identity(value, url=False):
    if not isinstance(value, str):
        raise ValueError('invalid destination identity')
    if url:
        match = URL.fullmatch(value)
        if not match:
            raise ValueError('invalid destination URL')
        value = match[1]
        if value.lower().endswith('.git'):
            value = value[:-4]
    if not FULL.fullmatch(value) or any(part.endswith('.') for part in value.split('/')):
        raise ValueError('invalid destination identity')
    return value.lower()


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('duplicate manifest key')
        result[key] = value
    return result


def reject_constant(value):
    raise ValueError('destination manifest contains a nonstandard JSON constant')


def repository_identity(value):
    # Bare declarations are supported only by the explicit logical-project path.
    # A .git suffix has transport meaning in a URL, not in a bare identity.
    if isinstance(value, str) and URL.fullmatch(value):
        return identity(value, url=True)
    if isinstance(value, str) and value.lower().endswith('.git'):
        raise ValueError('invalid bare destination identity')
    return identity(value)


def destination(history, project=None, repository=None):
    # Metadata alone never enables the pending-destination classification.
    if project is None and repository is None:
        return None
    # Logical projects use the recipe's canonical ID, not GitHub slug rules.
    project_value = project
    target = identity(repository, url=True)
    # A recursive blob inventory omits empty trees. Read the actual root entries
    # so every nonordinary declaration is present and rejected, including those trees.
    named = {e['path']: e for e in history.root_entries(history.commit) if e['path'] in FIELDS}
    present = any(name in named for name in MANIFESTS)
    if not present:
        identity(project)
        return None  # Legacy sources retain strict reference inspection.
    documents = []
    for name in MANIFESTS:
        entry = named.get(name)
        if not ordinary_document(entry):
            raise ValueError('destination manifest must be an ordinary committed file')
        document = json.loads(history.blob(entry['oid']), object_pairs_hook=unique_object,
                              parse_constant=reject_constant)
        if not isinstance(document, dict):
            raise ValueError('destination manifest must be an object')
        documents.append(document)
    edition, project_document = documents
    if 'identityKind' in edition:
        logical, invalid = tree_identity(history, named.values())
        if invalid or logical is None or project != logical:
            raise ValueError('invalid or inconsistent logical project identity')
        # Validate the maintained recipe and same-tree lock before allowing bare
        # repository declarations. Logical IDs and repository IDs bind separately.
        project_values = [logical]
        repository_value = repository_identity
    else:
        project_value = identity(project)
        project_values = [identity(edition.get('id')), identity(project_document.get('projectId'))]
        repository_value = lambda value: identity(value, url=True)
    repository_values = [repository_value(project_document.get('sourceRepository'))]
    if 'custody' in edition:
        custody = edition['custody']
        if not isinstance(custody, dict):
            raise ValueError('invalid custody metadata')
        if 'repository' in custody:
            repository_values.append(repository_value(custody['repository']))
    if (any(value != project_value for value in project_values) or
            any(value != target for value in repository_values)):
        raise ValueError('destination disagreement')
    return target


if __name__ == '__main__':
    # The producer uses this same validator before installs or output creation.
    from git_history import History, InspectionError
    parser = argparse.ArgumentParser()
    for name in ('repo', 'ref', 'project', 'repository'):
        parser.add_argument('--' + name, required=True)
    args = parser.parse_args()
    history = None
    try:
        history = History(args.repo, args.ref)
        destination(history, args.project, args.repository)
    except (ValueError, TypeError, UnicodeError, OSError, InspectionError):
        raise SystemExit(1) from None
    finally:
        if history:
            history.close()

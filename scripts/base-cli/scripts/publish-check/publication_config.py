"""Exact owner-declared future public identities, maintained by Base only."""
import json
from pathlib import Path
from github_refs import FULL


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('duplicate publication configuration key')
        result[key] = value
    return result


def intended_public_repositories():
    path = Path(__file__).with_name('publication-config.json')
    document = json.loads(path.read_bytes(), object_pairs_hook=unique_object)
    if (not isinstance(document, dict) or
            set(document) != {'schemaVersion', 'intendedPublicRepositories'} or
            document['schemaVersion'] != 1 or
            not isinstance(document['intendedPublicRepositories'], list)):
        raise ValueError('invalid Base publication configuration')
    repositories = set()
    for entry in document['intendedPublicRepositories']:
        if not isinstance(entry, dict) or set(entry) != {'repository', 'reason'}:
            raise ValueError('invalid intended public repository')
        repository, reason = entry['repository'], entry['reason']
        if (not isinstance(repository, str) or not FULL.fullmatch(repository) or
                repository != repository.lower() or repository in repositories or
                not isinstance(reason, str) or not reason.strip()):
            raise ValueError('invalid intended public repository')
        repositories.add(repository)
    return frozenset(repositories)

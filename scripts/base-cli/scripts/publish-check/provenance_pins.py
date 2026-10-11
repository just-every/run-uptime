"""Git object IDs at declared module-provenance locations, never whole files."""
from json_identity import GIT_REVISION


def module_pins(path, document):
    if not isinstance(document, dict):
        return
    if path == 'base/PROVENANCE.json':
        maps = [(('moduleCommits',), document.get('moduleCommits'))]
    elif path in ('edition.json', 'sources.lock.json'):
        if type(document.get('schemaVersion')) is not int or document['schemaVersion'] != 1:
            return
        components = document.get('components')
        if not isinstance(components, list):
            return
        maps = []
        for index, component in enumerate(components):
            source = component.get('source') if isinstance(component, dict) else None
            if not isinstance(source, dict):
                continue
            suffix = () if source.get('kind') == 'git' else ('origin',) if source.get('kind') == 'local' else None
            if suffix is None:
                continue
            origin = source if not suffix else source.get('origin')
            if isinstance(origin, dict):
                maps.append((('components', index, 'source', *suffix, 'moduleRevisions'), origin.get('moduleRevisions')))
    else:
        return
    for pointer, pins in maps:
        if isinstance(pins, dict):
            for module, revision in pins.items():
                if module and isinstance(revision, str) and GIT_REVISION.fullmatch(revision):
                    yield (*pointer, module)

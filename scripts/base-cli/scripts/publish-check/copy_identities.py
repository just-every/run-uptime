"""Prove copy-inventory digests against regular files in the scanned tree."""
import hashlib
import re
from json_identity import HEX, GIT_REVISION


def relative_path(value):
    return (isinstance(value, str) and value and not value.startswith('/')
            and not re.search(r'[\\\x00-\x1f\x7f]', value)
            and all(part not in ('', '.', '..', '.git') for part in value.split('/')))


def copy_pointers(document, read_regular):
    if (not isinstance(document, dict) or type(document.get('schemaVersion')) is not int
            or document['schemaVersion'] != 1 or not isinstance(document.get('copies'), list)):
        return set()
    allowed = set()
    for index, copy in enumerate(document['copies']):
        if (not isinstance(copy, dict) or not relative_path(copy.get('path'))
                or not relative_path(copy.get('originPath'))
                or not isinstance(copy.get('revision'), str)
                or not GIT_REVISION.fullmatch(copy['revision'])):
            continue
        files, modes = copy.get('files'), copy.get('modes')
        if (not isinstance(files, dict) or not files or not isinstance(modes, dict)
                or set(files) != set(modes)):
            continue
        pending = set()
        for name, digest in files.items():
            if (not relative_path(name) or not (name == copy['path'] or name.startswith(copy['path'] + '/'))
                    or not isinstance(digest, str) or not HEX.fullmatch(digest)
                    or modes[name] not in ('100644', '100755')):
                break
            value = read_regular(name)
            if (value is None or value[1] != modes[name]
                    or hashlib.sha256(value[0]).hexdigest() != digest):
                break
            pending.add(('copies', index, 'files', name))
        else:
            allowed.update(pending)
    return allowed

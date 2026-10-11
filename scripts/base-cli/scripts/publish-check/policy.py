"""Report redaction, separate from the Gitleaks secret detector."""
import hashlib
import re
from hygiene_config import EMAIL, LOCAL_PATH
from hygiene_text import decoded_text

READ_LIMIT = 64 * 1024 * 1024
TOKEN_PATH = re.compile(r'(?:gh[pousr]_|github_pat_|sk-|glpat-|npm_|whsec_|rk_live_|sk_live_|hf_|xapp-|xox[baprs]-|SG\.|re_|AIza|AKIA|ASIA)[A-Za-z0-9_./+\-]{16,}')


def safe_path(path, env_hashes=frozenset(), internal_patterns=()):
    raw = path.encode('utf-8', 'surrogateescape')
    text = decoded_text(raw)
    private = EMAIL.search(text) or LOCAL_PATH.search(text) or TOKEN_PATH.search(text)
    if (private or hashlib.sha256(raw).digest() in env_hashes or any(re.search(p, text) for p in internal_patterns)
            or any(ord(c) < 32 or 0xD800 <= ord(c) <= 0xDFFF for c in path) or len(path) > 500):
        return '[redacted-path-sha256:' + hashlib.sha256(raw).hexdigest() + ']'
    return path

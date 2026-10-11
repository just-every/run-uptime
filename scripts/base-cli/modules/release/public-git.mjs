import { execFileSync } from 'node:child_process';

// Public construction never inherits alternate object stores, templates, filters,
// replacement ancestry, hooks, signing, credential URL rewrites or global config.
export function publicGit(repo, args, input) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1', GIT_GRAFT_FILE: '/dev/null', GIT_TERMINAL_PROMPT: '0' });
  try {
    return execFileSync('git', ['--no-replace-objects', '-C', repo,
      '-c', 'core.hooksPath=/dev/null', '-c', 'core.useReplaceRefs=false',
      '-c', 'core.attributesFile=/dev/null', '-c', 'core.autocrlf=false',
      '-c', 'commit.gpgSign=false', '-c', 'tag.gpgSign=false',
      '-c', 'user.name=Run Edit Run', '-c', 'user.email=releases@runeditrun.invalid',
      '-c', 'protocol.ext.allow=never', '-c', 'protocol.fd.allow=never',
      '-c', 'gc.auto=0', '-c', 'maintenance.auto=false', ...args],
    { env, input, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 128 * 1024 * 1024 });
  } catch { throw Error('Public Git operation failed'); }
}

export const publicOid = (repo, ...args) => publicGit(repo, args).toString().trim();

import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { shared } from '../../cli/shared.mjs';
import { execFileSync, spawn } from 'node:child_process';
import { realpathSync, existsSync, lstatSync, mkdirSync } from 'node:fs';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { testSummary } from './test-summary.mjs';

export function git(repo, ...args) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  Object.assign(env, { GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_GRAFT_FILE: '/dev/null' });
  try {
    return execFileSync('git', ['--no-replace-objects', '-c', 'core.useReplaceRefs=false', '-c', 'core.hooksPath=/dev/null', '-C', repo, ...args],
      { env, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 128 * 1024 * 1024 });
  } catch { throw Error('Git source operation failed'); }
}

export function inspectSource(repo, ref) {
  repo = realpathSync(repo);
  if (git(repo, 'status', '--porcelain', '--untracked-files=all').length) throw Error('Release requires a clean source checkout');
  const commit = git(repo, 'rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`).toString().trim();
  const tree = git(repo, 'rev-parse', `${commit}^{tree}`).toString().trim();
  const records = git(repo, 'ls-tree', '-r', '-z', commit).toString().split('\0').filter(Boolean);
  const entries = new Map(records.map(record => {
    const separator = record.indexOf('\t');
    const header = record.slice(0, separator), path = record.slice(separator + 1);
    const [mode, type, oid] = header.split(' ');
    if (!path || path.split('/').some(part => ['', '.', '..', '.git'].includes(part)) || path.includes('\\')) throw Error('Unsafe Git tree path');
    return [path, { mode, type, oid }];
  }));
  const bytes = path => {
    const entry = entries.get(path);
    if (!entry || entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode)) throw Error('Release input must be a committed ordinary file');
    return git(repo, 'cat-file', 'blob', entry.oid);
  };
  const seed = JSON.parse(bytes('seed.json'));
  const pkg = JSON.parse(bytes('package.json'));
  const release = JSON.parse(bytes('RELEASE.json'));
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/.test(seed.version) ||
      pkg.version !== seed.version || release.version !== seed.version || !pkg.scripts?.verify) throw Error('Seed, package and release versions must agree, and verify must exist');
  const timestamp = git(repo, 'log', '-1', '--format=%cI', commit).toString().trim();
  return { repo, commit, tree, entries, bytes, seed, release, timestamp, tag: `v${seed.version}` };
}

export function newOutput(repo, output) {
  output = resolve(output);
  for (let ancestor = output; ; ancestor = dirname(ancestor)) {
    if (existsSync(ancestor) && lstatSync(ancestor).isSymbolicLink()) throw Error('Output cannot traverse symlinks');
    if (ancestor === dirname(ancestor)) break;
  }
  if (existsSync(output)) throw Error('Output must be a new directory');
  const rel = relative(repo, output);
  if (!rel || (!isAbsolute(rel) && !rel.startsWith('..' + '/'))) throw Error('Output must be outside the source checkout');
  mkdirSync(output, { recursive: true });
  return output;
}

// Keep child diagnostics private: arbitrary verify scripts can print credential
// values. Only exit status and numeric test summaries leave this boundary.
export async function command(command, args, cwd) {
 const {createCommands}=await shared('commands.mjs');
 const directory=await mkdtemp(resolve(tmpdir(),'rer-release-'));
 const store=await createCommands(directory,{logs:[]},{terminal:()=>{},queue:{verb:'release'}});
 const summary=testSummary(),env={...process.env,FORCE_COLOR:'0'};delete env.NODE_TEST_CONTEXT;
 try {
  await store.run('Release verification',command,args,{cwd,env,onChild:child=>child.stdout.on('data',bytes=>summary.write(bytes))});
  return {status:'PASS',exitCode:0,...summary.finish()};
 }catch(error){return {status:'FAIL',exitCode:error.childExitCode??null,...summary.finish()};}
 finally{await store.closeCommands();await rm(directory,{recursive:true,force:true});}
}

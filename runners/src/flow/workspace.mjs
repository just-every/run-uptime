// Where a runner keeps its flow runs: one owner-only (0700) folder per runner, named by a digest of its key, under UPTIME_FLOW_DIR
// or the system temporary folder. Each run gets its own subfolder holding the browser profile and home. The runner empties its
// folder when it starts, after ending any browser that still names it, so a profile left by a hard stop (SIGKILL of the runner,
// a container stop timeout, power loss) never outlives the next start.
import {createHash} from 'node:crypto';
import {lstat, mkdir, chmod, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {killFolderHolders} from './processes.mjs';

// A folder this runner owns: created 0700 if missing, never a link, and owned by this user, with its mode reset to 0700.
async function owned(path) {
  await mkdir(path, {mode: 0o700}).catch(error => { if (error.code !== 'EEXIST') throw error; });
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid()) throw Error('The flow folder is not owned by this runner');
  await chmod(path, 0o700);
  return path;
}

/** This runner's flow folder, emptied of every earlier run. Called once when the runner starts. */
export async function prepareFlowWorkspace(key, root = process.env.UPTIME_FLOW_DIR || join(tmpdir(), `uptime-flows-${process.getuid()}`)) {
  const folder = await owned(join(await owned(root), createHash('sha256').update(`uptime-flow-workspace.${key}`).digest('hex').slice(0, 16)));
  await killFolderHolders(folder);
  for (const entry of await readdir(folder)) await rm(join(folder, entry), {recursive: true, force: true});
  return folder;
}


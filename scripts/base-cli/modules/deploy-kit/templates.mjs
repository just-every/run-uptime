import { access, mkdir, readdir, copyFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert } from './validation.mjs';
const base = resolve(dirname(fileURLToPath(import.meta.url)),'../..');
/** Generate alongside an edition. The existing edition tree is never an output directory. */
export async function createTemplates({destination,project,sourcePaths,commands,loops=[]}) {
  assert(/^[a-z0-9-]+\/[a-z0-9-]+$/.test(project),'invalid-project');
  assert(Array.isArray(sourcePaths) && sourcePaths.length && sourcePaths.every(x => typeof x === 'string' && x.length),'missing-actual-source-paths');
  const root = resolve(destination);
  await mkdir(root,{recursive:false});
  // A new directory only: callers add actual edition sources then run the lock command.
  const scripts = join(root,'scripts'); await mkdir(scripts);
  await mkdir(join(scripts,'edition-authoring'));
  for (const name of ['operations.mjs','project-operations.mjs']) await copyFile(join(base,'operations',name),join(scripts,name),constants.COPYFILE_EXCL);
  for (const name of await readdir(join(base,'edition-authoring'))) if (name.endsWith('.mjs') && !name.endsWith('.test.mjs')) await copyFile(join(base,'edition-authoring',name),join(scripts,'edition-authoring',name),constants.COPYFILE_EXCL);
  await writeFile(join(root,'OPERATIONS.json'),JSON.stringify({version:2,project,runtime:{requirements:[{name:'node',version:'>=22.12.0'}]},requiredEnvironment:[],commands,loops},null,2)+'\n',{flag:'wx'});
  await writeFile(join(root,'edition.json'),JSON.stringify({schemaVersion:1,id:project,toolchain:{id:'runeditrun/edition-authoring',version:'1.1.0'},parent:null,components:[{id:project,role:'edition',source:{kind:'local',paths:sourcePaths}}]},null,2)+'\n',{flag:'wx'});
  return {root,lock:['node','scripts/edition-authoring/cli.mjs','lock'],check:['node','scripts/edition-authoring/cli.mjs','check']};
}
/** Actual authoring tool creates the lock and retained sources; no hand-forged lock template. */
export async function lockTemplates(root) {
  try { await access(join(root,'sources.lock.json')); throw new Error('existing-source-lock-refused'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const env = {PATH:process.env.PATH,HOME:process.env.HOME};
  for (const command of ['lock','check']) {
    try { execFileSync(process.execPath,[join(base,'edition-authoring/cli.mjs'),command],{cwd:root,env,stdio:'pipe',timeout:60000,maxBuffer:1024*1024}); }
    catch { throw new Error('edition-authoring-failed'); }
  }
}

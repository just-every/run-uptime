import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {copyFile,mkdir,mkdtemp,readdir,rm,stat,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {promisify} from 'node:util';

const root=fileURLToPath(new URL('../',import.meta.url));

test('notification runtime uses custom TMPDIR without a repository sibling tmp and removes its files',async()=>{
 const fixture=await mkdtemp(join(tmpdir(),'uptime-notify-temp-test-'));
 try{
  const checkout=join(fixture,'checkout'),configuredTemp=join(fixture,'configured-temp');
  await mkdir(join(checkout,'tests'),{recursive:true});
  await mkdir(join(checkout,'scripts'));
  await mkdir(configuredTemp);
  // Relocate the exact helper so the old repository-sibling dependency is
  // absent even on a developer machine that already has that directory.
  const helper=join(checkout,'tests/notify-acceptance-runtime.mjs');
  await copyFile(join(root,'tests/notify-acceptance-runtime.mjs'),helper);
  await symlink(join(root,'tests/auth-test-support.mjs'),join(checkout,'tests/auth-test-support.mjs'));
  await symlink(join(root,'scripts/local-worker.mjs'),join(checkout,'scripts/local-worker.mjs'));
  await symlink(join(root,'tests/migration-support.mjs'),join(checkout,'tests/migration-support.mjs'));
  const source=`
   import assert from 'node:assert/strict';
   import {stat,writeFile} from 'node:fs/promises';
   import {dirname,join,resolve} from 'node:path';
   import {runtimeDirectory,cleanupDirectory,root} from ${JSON.stringify(pathToFileURL(helper).href)};
   const sibling=resolve(root,'../tmp');
   await assert.rejects(stat(sibling),{code:'ENOENT'});
   const directories=[];
   try{
    for(let index=0;index<2;index++){
     const directory=await runtimeDirectory();directories.push(directory);
     assert.equal(dirname(directory),process.env.TMPDIR,'configured temporary parent is used');
     assert.ok((await stat(directory)).isDirectory(),'runtime scratch directory exists');
     await writeFile(join(directory,'fixture.txt'),'notification test fixture');
    }
    assert.notEqual(directories[0],directories[1],'parallel acceptance runtimes have distinct directories');
   }finally{for(const directory of directories)await cleanupDirectory(directory)}
   for(const directory of directories)await assert.rejects(stat(directory),{code:'ENOENT'});
   await assert.rejects(stat(sibling),{code:'ENOENT'});
  `;
  await promisify(execFile)(process.execPath,['--input-type=module','--eval',source],{
   cwd:checkout,env:{...process.env,TMPDIR:configuredTemp},timeout:30000,
  });
  assert.deepEqual(await readdir(configuredTemp),[],'cleanup leaves no runtime scratch files');
  await assert.rejects(stat(join(fixture,'tmp')),{code:'ENOENT'},'no repository sibling tmp is created');
 }finally{await rm(fixture,{recursive:true,force:true})}
});

import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,rm,stat,writeFile,symlink,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {readArchiveFile,writeArchiveFile,MAX_ARCHIVE_BYTES} from '../scripts/data-files.mjs';
const parent=new URL('../../tmp/',import.meta.url).pathname;
test('private archive files refuse overwrite, symlinks, malformed UTF8 and byte overflow',async()=>{
 await mkdir(parent,{recursive:true});const dir=await mkdtemp(join(parent,'archive-files-'));
 try{const path=join(dir,'backup.json');await writeArchiveFile(path,{private:'fixture'});assert.equal((await stat(path)).mode&0o777,0o600);assert.deepEqual(await readArchiveFile(path),{private:'fixture'});await assert.rejects(writeArchiveFile(path,{replaced:true}),{code:'EEXIST'});assert.deepEqual(await readArchiveFile(path),{private:'fixture'});const link=join(dir,'link');await symlink(path,link);await assert.rejects(readArchiveFile(link),/regular file/);await writeFile(join(dir,'bad'),Buffer.from([0xff]));await assert.rejects(readArchiveFile(join(dir,'bad')));await writeFile(join(dir,'large'),Buffer.alloc(MAX_ARCHIVE_BYTES+1));await assert.rejects(readArchiveFile(join(dir,'large')),/byte bound/)}finally{await rm(dir,{recursive:true,force:true})}
});

import {constants} from 'node:fs';
import {open,lstat,link,unlink} from 'node:fs/promises';
import {dirname,basename,join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {ARCHIVE_BYTES} from '../src/domain/archive-schema.ts';
export const MAX_ARCHIVE_BYTES=ARCHIVE_BYTES;
export async function readArchiveFile(path){
 const file=resolve(path),stat=await lstat(file);
 if(!stat.isFile()||stat.isSymbolicLink())throw Error('Archive input must be a regular file');
 if(stat.size>MAX_ARCHIVE_BYTES)throw Error('Archive byte bound exceeded: 2 MiB');
 const handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const current=await handle.stat();if(!current.isFile()||current.size>MAX_ARCHIVE_BYTES)throw Error('Archive input changed or exceeds 2 MiB');const bytes=await handle.readFile();if(bytes.length>MAX_ARCHIVE_BYTES)throw Error('Archive byte bound exceeded: 2 MiB');return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}finally{await handle.close()}
}
export async function writeArchiveFile(path,value){
 const target=resolve(path),temporary=join(dirname(target),`.${basename(target)}.${randomUUID()}.tmp`),text=JSON.stringify(value)+'\n';
 if(Buffer.byteLength(text)>MAX_ARCHIVE_BYTES)throw Error('Archive byte bound exceeded: 2 MiB');
 const handle=await open(temporary,'wx',0o600);
 try{await handle.writeFile(text);await handle.sync();await handle.close();await link(temporary,target)}finally{await handle.close().catch(()=>{});await unlink(temporary).catch(()=>{})}
 return target;
}

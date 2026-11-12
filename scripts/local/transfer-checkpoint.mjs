import {open,rename,unlink} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';

// Only job correlation and file identity; never a cookie, key or settings value.
export function transferCheckpoint(path,direction,identity){
 const archive=resolve(path),target=archive+'.'+direction+'.transfer.json';
 const binding={version:1,direction,path:archive,...identity};
 const mismatch=()=>{throw Error('Transfer checkpoint does not match this file, installation or owner')};
 return {
  path:target,
  async read(){
   let file;try{file=await open(target,constants.O_RDONLY|constants.O_NOFOLLOW)}catch(error){if(error.code==='ENOENT')return;throw error}
   try{
    const info=await file.stat();if(!info.isFile()||(info.mode&0o777)!==0o600||info.uid!==process.getuid()||info.size>16384)mismatch();
    const value=JSON.parse(await file.readFile('utf8'));
    for(const [key,expected]of Object.entries(binding))if(value[key]!==expected)mismatch();
    if(typeof value.id!=='string'||!/^[a-f0-9-]{36}$/.test(value.id))mismatch();
    return value;
   }finally{await file.close()}
  },
  async write(value){
   const temporary=target+'.'+crypto.randomUUID()+'.new';
   const file=await open(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
   try{await file.writeFile(JSON.stringify({...value,...binding})+'\n');await file.sync()}finally{await file.close()}
   try{await rename(temporary,target)}catch(error){await unlink(temporary).catch(()=>{});throw error}
   const parent=await open(resolve(target,'..'),constants.O_RDONLY);try{await parent.sync()}finally{await parent.close()}
  },
  async remove(){await unlink(target).catch(error=>{if(error.code!=='ENOENT')throw error})},
 };
}
export async function archiveFileIdentity(path){
 const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const info=await file.stat();if(!info.isFile())throw Error('Archive must be a regular file');
  const hash=createHash('sha256');for await(const bytes of file.createReadStream({autoClose:false}))hash.update(bytes);
  const after=await file.stat();if(after.ino!==info.ino||after.size!==info.size||after.mtimeMs!==info.mtimeMs)throw Error('Archive changed while verifying');
  return hash.digest('hex');
 }finally{await file.close()}
}

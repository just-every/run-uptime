import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';

const digest=value=>createHash('sha256').update(value).digest('hex');

export async function emittedArtifactReceipt(){
 const files=[];
 async function visit(directory){
  for(const entry of(await readdir(join('dist/server',directory),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
   const path=join(directory,entry.name);
   if(entry.isDirectory())await visit(path);
   else if(entry.isFile())files.push([path,digest(await readFile(join('dist/server',path)))]);
   else throw Error('Emitted Worker receipt requires regular files');
  }
 }
 await visit('');
 const sourceHead=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const sourceWorktreeDirty=execFileSync('git',['status','--porcelain'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).length>0;
 return {sourceHead,sourceWorktreeDirty,emittedWorkerTreeSha256:digest(JSON.stringify(files)),emittedWorkerFiles:files.length};
}

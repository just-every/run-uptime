import { readdir,lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// A read-only preflight prevents an empty resource directory from being treated
// as completed setup. Ordinary application sign-in then verifies the actual
// configured binding before readiness; no database or owner is created here.
export async function operatorPrerequisites(root,email){
 const migrations=(await readdir(join(root,'migrations/core'))).filter(name=>name.endsWith('.sql'));
 const directory=join(root,'.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
 let files;try{
  let path=root;for(const part of ['.wrangler','state','v3','d1','miniflare-D1DatabaseObject']){path=join(path,part);const info=await lstat(path);if(!info.isDirectory()||info.isSymbolicLink()||info.uid!==process.getuid())return false;}
  files=await readdir(directory,{withFileTypes:true});}catch{return false;}
 for(const file of files){
  if(!file.isFile()||!file.name.endsWith('.sqlite'))continue;
  let db;
  try{
   db=new DatabaseSync(join(directory,file.name),{readOnly:true});
   const applied=new Set(db.prepare('SELECT name FROM d1_migrations').all().map(row=>row.name));
   const claimed=db.prepare('SELECT COUNT(*) AS count FROM oa_bootstrap').get().count;
   const owner=db.prepare("SELECT COUNT(*) AS count FROM oa_operators WHERE email=? AND role='owner' AND status='active'").get(email).count;
   if(claimed===1&&owner===1&&migrations.every(name=>applied.has(name)))return true;
  }catch{/* A missing/corrupt/unrelated database cannot prove prior setup. */}
  finally{db?.close();}
 }
 return false;
}

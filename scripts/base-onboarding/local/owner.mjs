import {readdir,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';

// Read only the canonical local D1 files, before settings/build/migrations can
// mutate anything. An unrelated database does not establish an owner claim.
export async function localOwners(root){
 const found=[];
 let directory=root;
 for(const part of ['.wrangler','state','v3','d1','miniflare-D1DatabaseObject']){
  directory=join(directory,part);let status;try{status=await lstat(directory);}catch(error){if(error.code==='ENOENT')return []; throw error;}
  if(status.isSymbolicLink()||!status.isDirectory())throw Error('Canonical local state is unsafe. Preserve it and recover its placement before setup.');
 }
 for(const file of await readdir(directory,{withFileTypes:true})){
  if(!file.isFile()||!file.name.endsWith('.sqlite'))continue;
  let db,owners=[];
  try{db=new DatabaseSync(join(directory,file.name),{readOnly:true});
   const tables=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row=>row.name));
   if(tables.has('oa_operators'))owners=db.prepare("SELECT email FROM oa_operators WHERE role='owner' AND status='active'").all();
  }finally{db?.close();}
  found.push(...owners.map(owner=>owner.email).filter(email=>typeof email==='string'));
 }
 return [...new Set(found)];
}
export async function assertLocalOwner(root,email,failure=message=>Error(message),inspect,setting='private owner email setting'){
 const owners=inspect?await inspect(root):await localOwners(root);
 if(!Array.isArray(owners)||owners.some(owner=>typeof owner!=='string'))throw failure('The localOwner hook must return existing owner email addresses without changing state.');
 if(owners.length&&!owners.some(owner=>owner.toLowerCase()===email.toLowerCase())){
  const address=safeOwner(owners[0]);
  throw failure(`Local database already belongs to ${address}. Restore ${setting} to ${address}, then run rer setup --owner-email ${address}; or back up data and run rer reset --yes. Existing data and private settings were kept.`);
 }
 return owners;
}
export const safeOwner=email=>email.length<=254&&/^[a-zA-Z0-9.!+_%\-]+@[a-zA-Z0-9\-]+(?:\.[a-zA-Z0-9\-]+)+$/.test(email)?email:'<existing-owner-email>';

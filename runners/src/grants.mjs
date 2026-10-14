import {open} from 'node:fs/promises';
import {constants} from 'node:fs';
export async function readGrant(path,controlPort) {
 const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
 const info=await file.stat();if(!info.isFile()||info.isSymbolicLink()||info.uid!==process.getuid()||(info.mode&0o077))throw Error('Synthetic grant must be owner-only');
 if(info.size>4096)throw Error('Invalid synthetic grant size');
 const grant=JSON.parse(await file.readFile('utf8'));
 if(grant.schemaVersion!==1||grant.custody!=='local-uptime-synthetic'||grant.host!=='127.0.0.1'||!Number.isInteger(grant.port)||grant.port<1||grant.port>65535||grant.port===controlPort||!Number.isInteger(grant.pid)||grant.pid<1||typeof grant.identity!=='string'||!grant.identity.length||grant.identity.length>100||!Number.isInteger(grant.expiresAt)||(grant.expiresAt<=Date.now()||grant.expiresAt>Date.now()+12*60*60*1000)||!Array.isArray(grant.paths)||grant.paths.some(p=>!['/health','/api/status','/redirect','/large','/demo'].includes(p)))throw Error('Synthetic grant expired or invalid');
 try{process.kill(grant.pid,0);}catch{throw Error('Synthetic endpoint process absent');}
 return grant;
 }finally{await file.close()}
}

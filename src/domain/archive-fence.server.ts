import {PortabilityError} from '@runeditrun/rer/modules/portability'
// Reuse the maintained Base journal exports; custom payloads must explicitly
// participate because Base's automatic fence covers row parts only.
// @ts-expect-error Maintained Base journal exports are portable JavaScript.
import {fence,journal,mergeJournal,tombstone} from '@runeditrun/rer/modules/portability/journal'
// @ts-expect-error Maintained Base state initialization is portable JavaScript.
import {state} from '@runeditrun/rer/modules/portability/storage'
import {mutationGuard} from './audit.server.ts'
import type {Bindings} from './control.server.ts'
import type {Tables} from './archive-schema.ts'
export function validateJournal(value:any){
 if(!value||Object.keys(value).sort().join(',')!=='epoch,journal,sourceIdentity'||typeof value.sourceIdentity!=='string'||!/^[a-f0-9-]{36}$/.test(value.sourceIdentity)||!Number.isSafeInteger(value.epoch)||value.epoch<0||!Array.isArray(value.journal)||value.journal.length>100000||!value.journal.every((v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)))throw new PortabilityError('Invalid erasure journal');
 return value;
}
export async function exportJournal(env:Bindings){const s=await state(env.DB);return {sourceIdentity:s.source_identity,epoch:s.epoch,journal:await journal(env.DB,s.source_identity)}}
export async function productFence(env:Bindings,tables:Tables,metadata:any,later?:any){
 if(metadata)validateJournal(metadata);if(later)validateJournal(later);
 if(!metadata){if(later||(await env.DB.prepare('SELECT 1 FROM rer_portability_journal LIMIT 1').first()))throw new PortabilityError('Legacy archive lacks the erasure source journal');return []}
 const manifest={...metadata,tables:[]},checked=await fence(env.DB,manifest,{},later),hashes=new Set(checked.hashes),guards=[];
 for(const [name,rows] of Object.entries(tables)){
  const info=(await env.DB.prepare(`PRAGMA table_info(${name})`).all<any>()).results.filter(r=>r.pk).sort((a,b)=>a.pk-b.pk);
  for(let offset=0;offset<rows.length;offset+=99){const keys=await Promise.all(rows.slice(offset,offset+99).map(row=>tombstone(metadata.sourceIdentity,name,Object.fromEntries(info.map(c=>[c.name,row[c.name]])))));if(keys.some((hash:string)=>hashes.has(hash)))throw new PortabilityError(`Archive contains erased ${name} record`);guards.push(mutationGuard(env,`NOT EXISTS(SELECT 1 FROM rer_portability_journal WHERE source=? AND tombstone IN (${keys.map(()=>'?').join(',')}))`,[metadata.sourceIdentity,...keys]));}
 }
 // Operator authority stays installation-local, but old portable audit rows
 // must not restore an actor identifier after its account was erased.
 const actors=[...new Set((tables.uptime_audit??[]).filter(row=>row.actor_kind==='operator').map(row=>row.actor_ref as string))];
 for(let offset=0;offset<actors.length;offset+=99){const keys=await Promise.all(actors.slice(offset,offset+99).map(id=>tombstone(metadata.sourceIdentity,'oa_operators',{id})));if(keys.some((hash:string)=>hashes.has(hash)))throw new PortabilityError('Archive references erased operator');guards.push(mutationGuard(env,`NOT EXISTS(SELECT 1 FROM rer_portability_journal WHERE source=? AND tombstone IN (${keys.map(()=>'?').join(',')}))`,[metadata.sourceIdentity,...keys]));}
 return [mutationGuard(env,'NOT EXISTS(SELECT 1 FROM rer_portability_epochs WHERE source=? AND epoch>?) AND NOT EXISTS(SELECT 1 FROM rer_portability_state WHERE source_identity=? AND epoch>?)',[metadata.sourceIdentity,checked.epoch,metadata.sourceIdentity,checked.epoch]),...guards,...mergeJournal(env.DB,manifest,checked)];
}

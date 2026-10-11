import type {Bindings} from './control.server.ts'
/** Keep the restore atomic while bounding each statement's bind count. D1's
 * transport must not carry thousands of repeated SQL strings for a large table. */
export function archiveInserts(env:Bindings,groups:Map<string,any[]>){
 const statements:D1PreparedStatement[]=[];
 for(const [name,rows]of groups){
  for(let offset=0;offset<rows.length;){
   const keys=Object.keys(rows[offset]),shape=keys.join(','),limit=Math.min(30,Math.floor(100/keys.length)),chunk=[];
   while(offset<rows.length&&chunk.length<limit&&Object.keys(rows[offset]).join(',')===shape)chunk.push(rows[offset++]);
   const conflict=name==='migrations'?'OR REPLACE ':name==='uptime_erasure_receipts'?'OR IGNORE ':'';
   // Anonymous identities are monotonic across portable copies. Immutable
   // audit content is checked in the same restore batch before this merge.
   const merge=name==='uptime_audit'?` ON CONFLICT(id) DO UPDATE SET actor_kind=excluded.actor_kind,actor_ref=excluded.actor_ref WHERE uptime_audit.actor_kind='operator' AND excluded.actor_kind='anonymized'`:'';
   statements.push(env.DB.prepare(`INSERT ${conflict}INTO ${name}(${shape}) VALUES${chunk.map(()=>`(${keys.map(()=>'?').join(',')})`).join(',')}${merge}`).bind(...chunk.flatMap(row=>keys.map(key=>row[key]))));
  }
 }
 return statements;
}

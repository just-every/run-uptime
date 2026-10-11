import {digest,LEGACY_TABLES} from '../src/domain/archive-schema.ts';
import {validateDefinition} from '../src/domain/policy.mjs';

export async function legacyArchive({revisions=1,slots=1,status='accepted',enabled=true,state,receipt=null,fullDefinition=false}={}){
 const now=Date.now()-1000,value={name:'Legacy archive',url:'https://example.test/health',enabled,probes:['local-a'],retries:0};
 const definition=JSON.stringify(fullDefinition?validateDefinition(value,[]):value);
 const tables=Object.fromEntries(LEGACY_TABLES.map(name=>[name,[]]));
 tables.migrations=[1,2,3].map(version=>({version,applied_at:now}));
 tables.monitors=[{id:'monitor',revision:revisions,definition,next_due:now,state:state??JSON.stringify({state:'Failing',confirmedFailure:true,notificationOpen:true})}];
 tables.revisions=Array.from({length:revisions},(_,index)=>({monitor_id:'monitor',revision:index+1,definition,created_at:now}));
 tables.slots=Array.from({length:slots},(_,index)=>({id:`slot-${index}`,monitor_id:'monitor',revision:revisions,due_at:now,status:'running',definition,lease_owner:'legacy-local-lease',lease_until:now+60000,missed_count:0,manual:0}));
 if(slots)tables.outbox=[{id:'event',monitor_id:'monitor',slot_id:'slot-0',kind:'trigger',event:JSON.stringify({id:'event',kind:'trigger',monitorId:'monitor',monitorName:'Legacy archive',state:'Failing',slotId:'slot-0',observedAt:now,visibility:'private',effect:'slot-owned-handoff',peoplePaged:false}),status,lease_until:now+60000,receipt}];
 return rehashArchive({payload:{schemaVersion:2,target:'uptime-worker-d1',createdAt:now,tables}});
}
export async function rehashArchive(value){value.sha256=await digest(JSON.stringify(value.payload));return value}
export const archiveTables=value=>({...value.payload.tables,...value.payload.productTables});

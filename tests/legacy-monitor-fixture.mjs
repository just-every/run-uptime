import {randomUUID} from 'node:crypto';

// A populated pre-upgrade database is input data, not a running old application: a public website monitor as Uptime stored it
// before monitors followed the External check URL in Settings. Its revision has no externalCheck, and a check from one location
// carries its own copy of a URL (`canaryUrl` in each of `assignments`), as every revision did then.
export async function legacyMonitor(DB,input){
 const now=Date.now(),id=randomUUID(),probes=Object.keys(input.assignments);
 const definition={name:input.name,type:'http',network:'public',url:input.url,method:'GET',probes,assignments:input.assignments,assertions:{status:200},intervalMs:60000,timeoutMs:2000,retries:1,failureQuorum:probes.length,confirmSlots:2,recoverSlots:2,freshnessMs:180000,enabled:true,maintenanceUntil:0};
 const storedState={state:'Unknown',confirmedFailure:false,notificationOpen:false},data=JSON.stringify(definition);
 await DB.batch([DB.prepare('INSERT INTO monitors VALUES(?,?,?,?,?)').bind(id,1,data,now,JSON.stringify(storedState)),DB.prepare('INSERT INTO revisions VALUES(?,?,?,?)').bind(id,1,data,now),DB.prepare('INSERT INTO evidence_generation(monitor_id) VALUES(?)').bind(id)]);
 return {id,revision:1,definition};
}

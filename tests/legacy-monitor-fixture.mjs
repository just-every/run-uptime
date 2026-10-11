import {randomUUID} from 'node:crypto';

// A populated pre-upgrade database is input data, not a running old application.
// The current application starts only after all its additive migrations apply.
export async function legacyMonitor(DB,input){
 const now=Date.now(),id=randomUUID(),definition={name:input.name,url:input.url,method:'GET',assertions:{status:200},intervalMs:input.intervalMs??60000,timeoutMs:2000,retries:input.retries??1,probes:['local-a'],failureQuorum:1,confirmSlots:input.confirmSlots??2,recoverSlots:input.recoverSlots??2,freshnessMs:180000,enabled:true,maintenanceUntil:0};
 const storedState={state:'Unknown',confirmedFailure:false,notificationOpen:false},data=JSON.stringify(definition);
 await DB.batch([DB.prepare('INSERT INTO monitors VALUES(?,?,?,?,?)').bind(id,1,data,now,JSON.stringify(storedState)),DB.prepare('INSERT INTO revisions VALUES(?,?,?,?)').bind(id,1,data,now)]);
 return {id,revision:1,definition,nextDue:now,storedState};
}

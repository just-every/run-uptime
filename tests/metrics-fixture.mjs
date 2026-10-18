// Historical scheduled data at the persistence edge, shared by metrics journeys.
import {randomUUID} from 'node:crypto';
export async function metricsFixture(db,origin){
 const now=Date.now(),from=now-600000,to=now-60000,ids=[];
 const runner=randomUUID();await db.prepare('INSERT INTO runners(runner_id,registered_at,network_label,last_contact_at) VALUES(?,?,?,?)').bind(runner,from,'us-east-test',now-300000).run();
 for(const [name,state] of [['Checkout API','stale'],['Payment API','healthy'],['Search API','degraded']]){
  const id=randomUUID();ids.push(id);
  const definition={name,type:'http',network:'public',url:'https://shop.example.test/checkout',method:'GET',probes:['local-a','local-b'],assignments:{'local-a':{runnerId:runner,networkLabel:'us-east-test'},'local-b':{runnerId:runner,networkLabel:'us-east-test'}},assertions:{status:200},intervalMs:60000,timeoutMs:2000,retries:0,failureQuorum:2,confirmSlots:2,recoverSlots:1,freshnessMs:30000,enabled:true,maintenanceUntil:0};
  await db.batch([db.prepare('INSERT INTO monitors VALUES(?,?,?,?,?)').bind(id,1,JSON.stringify(definition),now+3600000,JSON.stringify({state:'Unknown'})),db.prepare('INSERT INTO evidence_generation(monitor_id) VALUES(?)').bind(id),db.prepare('INSERT INTO revisions VALUES(?,?,?,?)').bind(id,1,JSON.stringify(definition),from-60000)]);
  for(let index=0;index<6;index++){
   const due=index===5&&state!=='stale'?now-1000:from+index*60000,slot=randomUUID();
   await db.prepare('INSERT INTO slots(id,monitor_id,revision,due_at,status,definition,lease_owner,lease_until,missed_count,manual) VALUES(?,?,1,?,?,?,?,?,0,0)').bind(slot,id,due,'complete',JSON.stringify(definition),'fixture',due+10000).run();
   for(const [p,probe] of definition.probes.entries()){
    if(index===2&&p===1)continue;
    const failed=(index===1&&p===0)||(state==='degraded'&&index===5&&p===0),o={id:randomUUID(),probe,attempt:0,startedAt:due,completedAt:due+100+p*50,durationMs:100+p*50,outcome:failed?'target_failure':'pass',runnerVersion:'uptime-node/0.1.0',status:failed?503:200,bytes:2,checks:[{assertion:'status',pass:!failed,reason:'Controlled scheduled response'}]};
    await db.prepare('INSERT INTO observations VALUES(?,?,?,?,?)').bind(o.id,slot,probe,0,JSON.stringify(o)).run();
   }
   if(index===1){
    const key=randomUUID();for(const [kind,at] of [['trigger',due],['recovery',due+30000]]){const event={schemaVersion:2,id:randomUUID(),kind,incidentKey:key,eventType:kind==='trigger'?'uptime.incident.firing':'uptime.incident.recovered',monitorId:id,monitorRevision:1,observedAt:at,slotId:slot,monitorName:name,url:definition.url,title:'Checkout unavailable',explanation:'Controlled HTTP 503',probes:[],consoleUrl:origin};await db.prepare('INSERT INTO outbox(id,monitor_id,slot_id,kind,event) VALUES(?,?,?,?,?)').bind(event.id,id,slot,kind,JSON.stringify(event)).run();if(kind==='trigger')await db.prepare("INSERT INTO notification_jobs(id,event_id,destination_id,destination_name,kind,credential_id,event,created_at,state) VALUES(?,?,?,?,?,?,?,?,?)").bind(randomUUID(),event.id,'historical-contact','Operations','email','historical-credential',JSON.stringify(event),at,'uncertain').run()}
   }
  }
 }
 return {ids,from,to};
}

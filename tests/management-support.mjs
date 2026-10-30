import assert from 'node:assert/strict';

// Native management shares the emitted owner's routes with the console. Keep
// refused writes observable across every durable table, including custody.
export async function proveNativeManagement({origin,cookie,DB}){
 const request=async(path,method='GET',body,headers={})=>{
  const response=await fetch(origin+path,{method,headers:{origin,cookie,...(body===undefined?{}:{'content-type':'application/json'}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:response.status,body:await response.json()};
 };
 const ok=async(path,method,body,status=200)=>{
  const result=await request(path,method,body);assert.equal(result.status,status,JSON.stringify(result.body));return result.body;
 };
 const created=await ok('/api/monitors','POST',{name:'synthetic-uptime-31',url:'https://synthetic-uptime-31.example/health'},201);
 const path=`/api/monitors/${created.id}`,revisions=()=>ok(path+'/revisions');
 const [original]=await revisions();
 assert.equal(original.revision,1);assert.deepEqual(original.definition,created.definition);
 assert.equal(original.definition.name,'synthetic-uptime-31');assert.equal(original.definition.url,'https://synthetic-uptime-31.example/health');
 const edited=await ok(path,'PATCH',{...created.definition,name:'synthetic-uptime-32',url:'https://synthetic-uptime-32.example/ready',intervalMs:300000,timeoutMs:5000});
 let rows=await revisions();
 assert.deepEqual(rows.map(row=>row.revision),[2,1]);assert.deepEqual(rows[1],original,'direct edit retains the entire old revision');
 assert.deepEqual(rows[0].definition,edited.definition);assert.equal(rows[0].definition.url,'https://synthetic-uptime-32.example/ready');
 assert.equal(rows[0].definition.intervalMs,300000);assert.equal(rows[0].definition.timeoutMs,5000);
 const editRevision=rows[0],paused=await ok(path,'PATCH',{...edited.definition,enabled:false});
 rows=await revisions();assert.deepEqual(rows.map(row=>row.revision),[3,2,1]);
 assert.deepEqual(rows.slice(1),[editRevision,original],'pausing retains both immutable definitions');
 assert.deepEqual(rows[0].definition,paused.definition);assert.equal(rows[0].definition.enabled,false);
 const destinationInput={name:'synthetic-uptime-33',kind:'webhook',url:'https://synthetic-uptime-33.example/events',enabled:true};
 const destination=await ok('/api/notifications/destinations','POST',destinationInput,201),contactPath=`/api/notifications/destinations/${destination.id}`;
 // Establish an ordinary native edit before attempting the same body from a foreign site.
 const contactEdit={name:'synthetic-uptime-34',enabled:true,url:'https://synthetic-uptime-34.example/events'};
 await ok(contactPath,'PATCH',contactEdit);
 const snapshot=async()=>{
  const names=(await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'_cf_METADATA' ORDER BY name").all()).results.map(row=>row.name),tables=[];
  for(let offset=0;offset<names.length;offset+=32){
   const chunk=names.slice(offset,offset+32),results=await DB.batch(chunk.map(name=>DB.prepare(`SELECT * FROM "${name}" ORDER BY rowid`)));
   tables.push(...chunk.map((name,index)=>[name,results[index].results]));
  }
  return Object.fromEntries(tables);
 };
 const seeded=await snapshot();
 for(const table of ['monitors','revisions','notification_destinations','notification_credentials','uptime_audit','ik_jobs','ik_d1_custody_states'])assert.ok(seeded[table].length>0,`${table} is populated before refusals`);
 const refused=async(label,path,method,body,headers,status,error)=>{
  const before=await snapshot(),result=await request(path,method,body,headers);
  assert.equal(result.status,status,label);assert.match(result.body.error,error,label+' names the correction');
  assert.deepEqual(await snapshot(),before,label+' preserves every product, credential, revision, audit and custody row');
 };
 const mutations=[
  ['/api/monitors','POST',{...created.definition,name:'synthetic-uptime-35'}],
  [path,'PATCH',{...paused.definition,url:'https://synthetic-uptime-35.example/changed'}],
  [path,'PATCH',{...paused.definition,enabled:true}],
  ['/api/notifications/destinations','POST',{...destinationInput,name:'synthetic-uptime-35'}],
  [contactPath,'PATCH',{...contactEdit,url:'https://synthetic-uptime-35.example/events'}],
  [contactPath,'PATCH',{name:'synthetic-uptime-35',enabled:false}],
  [contactPath+'/rotate','POST',{}],
  [contactPath,'DELETE',undefined],
 ];
 for(const headers of [{origin:'https://synthetic-uptime-foreign.example'},{'sec-fetch-site':'cross-site'}]){
  for(const [target,method,body] of mutations)await refused(`${method} ${target} foreign site`,target,method,body,headers,403,/Same origin required/);
 }
 // JSON shape errors and native field validation both precede any durable effect.
 for(const [target,method,body,error] of [
  ['/api/monitors','POST',[],/object/i],
  ['/api/monitors','POST',{name:'synthetic-uptime-36',url:'https://synthetic-uptime-36.example/',intervalMs:-1},/interval/i],
  [path,'PATCH',{...paused.definition,url:'ftp://synthetic-uptime-36.example/'},/HTTP|HTTPS|URL/i],
  [path,'PATCH',{...paused.definition,enabled:'yes'},/enabled/i],
  ['/api/notifications/destinations','POST',[],/object/i],
  ['/api/notifications/destinations','POST',{...destinationInput,url:'http://synthetic-uptime-36.example/'},/HTTPS/i],
  [contactPath,'PATCH',{...contactEdit,enabled:'yes'},/enabled/i],
  [contactPath,'PATCH',{...contactEdit,url:'https://synthetic-uptime-36.example/#fragment'},/fragments/i],
 ])await refused(`${method} ${target} malformed native input`,target,method,body,{},400,error);
 assert.deepEqual(await revisions(),rows,'refusals leave every public revision exact');
 console.log('MANAGE-001 native management: direct create, edit and pause retain immutable public revisions; foreign-site and malformed monitor and contact writes preserve every durable table.');
}

import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const root=process.cwd(),require=createRequire(root+'/package.json'),{chromium}=require('playwright');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
 const log=await readFile('/tmp/uptime-dev.log','utf8'),open=log.match(/^RER_OPEN (\S+)/m)?.[1],origin=log.match(/^RER_READY (\S+)/m)?.[1];
 if(!open||!origin)throw Error('dev not ready');
 await page.goto(open);await page.waitForTimeout(3000);
 console.log('signed-in path',new URL(page.url()).pathname);
 if(new URL(page.url()).pathname==='/setup'){
  const button=page.getByRole('button',{name:/^(Continue|Skip)$/});
  console.log('setup buttons',await button.count());
  if(await button.count())await button.first().click();
 }
 const call=async(path,method='GET',data)=>{const r=await context.request.fetch(origin+path,{method,headers:{origin},...(data===undefined?{}:{data})});let body;try{body=await r.json()}catch{body={}};if(!r.ok())throw Error('API '+path+' HTTP '+r.status()+' '+JSON.stringify(body));return body;};
 const grant=JSON.parse(await readFile('.wrangler/state/synthetic-grant.json','utf8'));
 const monitors=[];
 for(const [name,intervalMs,enabled] of [['synthetic-uptime-6',6000,true],['synthetic-uptime-11',11000,true],['synthetic-uptime-paused',7000,false]]){
  const created=await call('/api/monitors','POST',{name,url:'http://127.0.0.1:'+grant.port+'/health',probes:['local-a'],intervalMs,retries:0,confirmSlots:1,recoverSlots:1,freshnessMs:30000,enabled});
  monitors.push({...created,name,intervalMs,enabled});
 }
 console.log('created',monitors);
 await writeFile('/tmp/uptime-probe-ids.json',JSON.stringify({origin,monitors},null,2));
 const begin=Date.now(),samples=[];
 for(let n=0;n<18;n++){
  await page.waitForTimeout(5000);
  const histories=[];
  for(const m of monitors){const h=await call('/api/monitors/'+m.id+'/history');histories.push({name:m.name,intervalMs:m.intervalMs,enabled:m.enabled,slots:h.map(s=>({id:s.id,dueAt:s.due_at,manual:s.manual,status:s.status,observations:s.observations.map(o=>({probe:o.probe,startedAt:o.startedAt,completedAt:o.completedAt,outcome:o.outcome,checks:o.checks}))}))});}
  samples.push({elapsedMs:Date.now()-begin,at:new Date().toISOString(),histories});
  await writeFile(process.env.RECEIPT,JSON.stringify({schema:1,host:'isolated Linux cloud VM',root,origin,startedAt:new Date(begin).toISOString(),durationMs:Date.now()-begin,monitors,samples},null,2)+'\n');
  console.log('sample',n+1,histories.map(h=>[h.name,h.slots.length,h.slots[0]?.observations[0]?.outcome]));
 }
}finally{await browser.close()}

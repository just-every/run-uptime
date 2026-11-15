import {readFile,writeFile} from 'node:fs/promises';import {createRequire} from 'node:module';
const root=process.cwd(),require=createRequire(root+'/package.json'),{chromium}=require('playwright');
const packet=process.env.PACKET,config=JSON.parse(await readFile('/tmp/uptime-probe-ids.json','utf8')),origin=config.origin,monitors=config.monitors;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
let requests=[];
page.on('request',r=>{const u=new URL(r.url());if(u.origin===origin)requests.push({at:Date.now(),method:r.method(),path:u.pathname})});
try{
 const {completeBrowserSecondFactor}=await import(root+'/tests/mfa-auth-support.mjs');
 const log=await readFile('/tmp/uptime-dev.log','utf8'),open=log.match(/^RER_OPEN (\S+)/m)[1];await page.goto(open);await page.waitForTimeout(1500);
 await completeBrowserSecondFactor(page,origin);
 await page.goto(origin+'/app/monitors/'+monitors[0].id);await page.waitForTimeout(10000);
 const call=async(path,method='GET',data)=>{const r=await context.request.fetch(origin+path,{method,headers:{origin},...(data===undefined?{}:{data})});if(!r.ok())throw Error('API '+path+' HTTP '+r.status());return r.json()};
 const begin=Date.now(),samples=[],actions=[];
 const snapshot=async()=>{const histories=[];for(const m of monitors){const h=await call('/api/monitors/'+m.id+'/history');histories.push({name:m.name,slots:h.map(s=>({id:s.id,revision:s.revision,dueAt:s.due_at,status:s.status,intervalMs:s.definition.intervalMs,enabled:s.definition.enabled,observations:s.observations.map(o=>({probe:o.probe,startedAt:o.startedAt,completedAt:o.completedAt,outcome:o.outcome}))}))})}return histories};
 const change=async(enabled,intervalMs)=>{const state=await call('/api/overview'),m=state.monitors.find(m=>m.id===monitors[0].id);const r=await call('/api/monitors/'+m.id,'PATCH',{...m.definition,enabled,intervalMs});actions.push({at:Date.now(),enabled,intervalMs,revision:r.revision});console.log('change',enabled,intervalMs,r.revision)};
 for(let n=0;n<36;n++){
  if(n===12)await change(false,6000);
  if(n===19)await change(true,15000);
  await page.waitForTimeout(5000);
  samples.push({at:Date.now(),elapsedMs:Date.now()-begin,histories:await snapshot()});
  await writeFile(packet+'/cadence-pause-runtime.json',JSON.stringify({schema:1,host:'isolated Linux cloud VM',startedAt:new Date(begin).toISOString(),origin,viewport:{width:1440,height:1000},actions,requests,samples},null,2)+'\n');
  console.log('console sample',n+1,'requests',requests.length,'slots',samples.at(-1).histories.map(h=>h.slots.length));
 }
}finally{await browser.close()}

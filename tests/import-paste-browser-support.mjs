import assert from 'node:assert/strict';

// Extends the existing New monitor bulk-add journey; every preview/apply uses the real public screen and owner routes.
export async function provePasteImport(page,origin,{shot=async()=>{},record=()=>{}}={}){
 const panel=page.locator('.way-panel[data-way=paste]'),text=panel.getByLabel('URLs or CSV',{exact:true});
 const overview=async()=>(await page.request.get(origin+'/api/overview')).json();
 const preview=async()=>{
  const pending=page.waitForResponse(r=>r.url()===origin+'/api/catalog/add/preview'&&r.request().method()==='POST');
  await panel.getByRole('button',{name:'Preview',exact:true}).click();const response=await pending;
  assert.equal(response.status(),200);const plan=await response.json();
  await panel.getByRole('heading',{name:'Review the plan',exact:true}).waitFor();return plan;
 };
 const cases=[
  {header:'url,name,interval',rows:['https://93.184.216.34/synthetic-uptime-blog,"Blog, status",60','https://93.184.216.34/synthetic-uptime-docs,Docs,60']},
  {header:'name,url,interval,tags',rows:['"Blog, status",https://93.184.216.34/synthetic-uptime-blog,60,website','Docs,https://93.184.216.34/synthetic-uptime-docs,60,website']},
 ];
 for(const {header,rows} of cases){
  const csv=[header,...rows].join('\n'),before=(await overview()).monitors;
  await text.fill(csv);const pasted=await preview();
  assert.equal(pasted.counts.create,2,'pasting CSV detects its header without changing shared settings');assert.equal(pasted.counts.refused,0);
  assert.deepEqual(pasted.entries.map(e=>({name:e.target.name,url:e.target.url,interval:e.target.intervalMs,tags:e.target.tags})),[
   {name:'Blog, status',url:'https://93.184.216.34/synthetic-uptime-blog',interval:60000,tags:header.includes('tags')?['website']:undefined},
   {name:'Docs',url:'https://93.184.216.34/synthetic-uptime-docs',interval:60000,tags:header.includes('tags')?['website']:undefined},
  ]);
  await shot('pasted-csv',panel);
  await panel.locator('input[type=file]').setInputFiles({name:'synthetic-uptime-monitors.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
  await page.waitForFunction(value=>document.querySelector('.catalog-add [name=text]').value===value,csv);
  const uploaded=await preview();assert.deepEqual(uploaded.entries,pasted.entries,'upload and paste have identical reviewed rows');assert.deepEqual(uploaded.counts,pasted.counts);
  assert.deepEqual((await overview()).monitors,before,'both previews leave monitors unchanged');
  // Apply each door in turn, read its durable definitions, and erase only this journey's new paused records between runs.
  const definitions=[];
  for(const way of ['uploaded','pasted']){
   if(way==='pasted'){await text.fill(csv);await preview()}
   const pending=page.waitForResponse(r=>r.url()===origin+'/api/catalog/add/apply');
   await panel.getByRole('button',{name:'Apply selected accepted rows',exact:true}).click();const applied=await pending;
   assert.equal(applied.status(),201);const result=await applied.json();assert.equal(result.created.length,2);
   const monitors=(await overview()).monitors.filter(m=>result.created.includes(m.id));assert.equal(monitors.length,2);
   const saved=monitors.map(m=>m.definition).sort((a,b)=>a.url.localeCompare(b.url));definitions.push(saved);
   assert.ok(saved.every(d=>d.intervalMs===60000&&d.enabled===false),'both doors create the reviewed minute cadence, paused');
   for(const m of monitors){const erased=await page.request.post(origin+`/api/monitors/${m.id}/erase`,{headers:{origin},data:{name:m.definition.name}});assert.equal(erased.status(),200)}
  }
  assert.deepEqual(definitions[0],definitions[1],'pasted and uploaded CSV apply exactly the same definitions');
  record({header,counts:pasted.counts,appliedEach:2,intervalMs:60000});
 }
 // A URL containing commas is still a URL, and file selection never leaves the next paste stuck in CSV mode.
 await text.fill('https://93.184.216.34/synthetic-uptime-plain,a\nhttps://93.184.216.34/synthetic-uptime-plain-b');
 const plain=await preview();assert.equal(plain.counts.create,2);assert.equal(plain.counts.refused,0);
 await page.getByRole('button',{name:'Import a file',exact:true}).click();
 const file=page.locator('.way-panel[data-way=file]');await file.waitFor();
 await file.locator('.definition-formats summary').click();await shot('import-formats',file);
 // Each published guide is navigable, and the samples the screen offers are recognized by the same real import door.
 const guides=await file.locator('.definition-formats a[href^="/docs/"]').evaluateAll(links=>[...new Set(links.map(a=>a.getAttribute('href')))]);
 for(const guide of guides){const response=await page.request.get(origin+guide);assert.equal(response.status(),200,guide+' is published')}
 for(const sample of await file.locator('.definition-formats code').allTextContents())if(sample.startsWith('{')){
  JSON.parse(sample);const response=await page.request.post(origin+'/api/definitions/recognise',{headers:{origin,'content-type':'application/json'},data:sample});
  assert.equal(response.status(),200,'the offered JSON sample is a recognized export');
 }
 const refused='Friendly Name,URL/IP,Type,Interval (min)\nSynthetic blog,https://93.184.216.34/,HTTP,1';
 await file.getByRole('button',{name:'Paste it instead',exact:true}).click();await file.locator('#definition-text').fill(refused);
 const before=(await overview()).monitors;
 const refusal=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/definitions/recognise');
 await file.getByRole('button',{name:'Preview',exact:true}).click();const response=await refusal;
 assert.equal(response.status(),400);const error=(await response.json()).error;
 assert.match(error,/UptimeRobot.*GET \/monitors/,'unsupported CSV names the monitor export to make');assert.match(error,/https:\/\/api\.uptimerobot\.com\/v3\/monitors/,'refusal names where to get it');
 await file.locator('[role=status]').filter({hasText:/GET \/monitors/}).waitFor();await shot('import-refusal',file);
 assert.deepEqual((await overview()).monitors,before,'an unreadable file creates nothing');
 record({unsupportedMonitorCsv:{status:400,error},guides,plainUrls:plain.counts});
 // Leave the original journey in its open Paste panel.
 await page.getByRole('button',{name:'Paste many URLs or a CSV',exact:true}).click();
}

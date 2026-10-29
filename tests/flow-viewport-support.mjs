// Instrument only the owned checkout at the network edge. The production runner
// still launches the browser, measures the page and signs its ordinary trace.
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {startFlowFixture} from './flow-fixture.mjs';

export const viewportText=device=>`CSS viewport: ${device==='mobile'?'390 × 844':'1280 × 800'}`;

export async function startViewportFlowFixture({port,grantPath}){
 const fixture=await startFlowFixture({grantPath}),measurements=new Map();
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,fixture.origin),profile=url.searchParams.get('profile');
  if(url.pathname==='/s/transport-policy/viewport'&&req.method==='POST'){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const measured=JSON.parse(Buffer.concat(chunks).toString());
   measurements.set(profile,[...(measurements.get(profile)??[]),measured]);
   res.writeHead(200,{'x-uptime-fixture':fixture.identity});res.end();return;
  }
  const upstream=http.request(url,{method:req.method,headers:req.headers},response=>{
   if(url.pathname==='/s/transport-policy/browser-checkout'){
    const chunks=[];response.on('data',chunk=>chunks.push(chunk));
    response.on('end',()=>{
     // Read CSS pixels inside the target page, never the configured profile or
     // the operator console. Wait for the edge receipt before exposing the text.
     const script=`<p id="viewport"></p><script>
      const measured={width:innerWidth,height:innerHeight};
      fetch('/s/transport-policy/viewport'+location.search,{method:'POST',body:JSON.stringify(measured)})
       .then(response=>{if(response.ok)document.getElementById('viewport').textContent='CSS viewport: '+measured.width+' × '+measured.height});
     </script>`;
     const body=Buffer.from(Buffer.concat(chunks).toString().replace('</body>',script+'</body>'));
     res.writeHead(response.statusCode,{...response.headers,'content-length':body.length});res.end(body);
    });
   }else{res.writeHead(response.statusCode,response.headers);response.pipe(res)}
  });
  upstream.on('error',()=>{res.writeHead(502);res.end()});req.pipe(upstream);
 });
 try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)});
  const grant=JSON.parse(await readFile(grantPath,'utf8'));
  const temporary=grantPath+'.viewport';
  await writeFile(temporary,JSON.stringify({...grant,port}),{mode:0o600});await rename(temporary,grantPath);
 }catch(error){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await fixture.close();throw error}
 return {...fixture,port,origin:`http://127.0.0.1:${port}`,measurements,async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await fixture.close()}};
}

export function assertFlowViewport({fixture,monitor,history,report}){
 const {browser,device}=monitor.definition.flow;
 const measured=fixture.measurements.get(`${browser}-${device}`)??[];
 assert.ok(measured.length>=2,'both assigned runners measured the owned checkout');
 for(const viewport of measured){
  assert.equal(viewport.width,device==='mobile'?390:1280,'the target measured its actual CSS width');
  assert.equal(viewport.height,device==='mobile'?844:800,'the target measured its actual CSS height');
  for(const result of history.flatMap(slot=>slot.observations)){
   assert.deepEqual(result.flow.profile.viewport,viewport,'signed history dimensions match the target measurement');
   assert.ok(result.flow.trace.some(entry=>entry.kind==='expect'&&entry.matched===true&&entry.outcome==='pass'&&entry.expect.includes(viewportText(device))),
    'the production runner observed the measured dimensions before the checkout outcome');
  }
  assert.ok(report.flowProfiles.length>0,'the report retains a populated profile segment');
  for(const segment of report.flowProfiles){
   assert.equal(segment.profile.browser,browser);assert.equal(segment.profile.device,device);
   assert.deepEqual(segment.profile.viewport,viewport,'report dimensions match the target measurement');
  }
 }
}

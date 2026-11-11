import {fixture} from './resilience/support.mjs';
import {browserSignIn} from './auth-test-support.mjs';
import {chromium} from 'playwright';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const out='/home/agent/rer-consolidation/work/main-uptime-plain-monitor-text-1/packet';
const f=await fixture();let browser;
try{
 f.modes.headers={'content-type':'text/html'};f.modes.body='<h1>Service temporarily unavailable</h1><p>The checkout service returned HTTP 503.</p>';
 const monitor=await f.monitor({name:'Synthetic checkout',runners:[f.first],canary:true,intervalMs:86400000,assertions:{status:['200-299']}});
 const task=await f.claim(f.first),observation=await f.evidence(task);await f.submit(f.first,task,[observation]);
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();
 await browserSignIn(page,f.origin,{bindings:f.bindings});
 await page.goto(f.origin+'/app/monitors/'+monitor.id+'#incidents');
 const incident=page.locator('#monitor-incidents');await incident.getByText('Incident evidence',{exact:true}).click();
 await incident.getByRole('button',{name:'Load incident failure snapshots'}).click();await incident.locator('.failure-snapshot > summary').click();
 const proof=[];
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});await incident.screenshot({path:join(out,`after-snapshot-${width}.png`)});
  proof.push({width,text:await incident.innerText(),extent:await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}))});
 }
 await writeFile(join(out,'SNAPSHOT-PROOF.json'),JSON.stringify({head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),proof},null,2)+'\n');
 console.log('Real signed HTTP snapshot proof captured at 1440 and 390.');
 await context.close();
}finally{await browser?.close();await f.close()}

import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
export async function inspectAgentPages({origin,cookie,phase,approvalId}){
 const directory=process.env.UPTIME_AGENT_BROWSER_PROOF;
 if(!directory)throw Error('Browser evidence destination is required');
 await mkdir(directory,{recursive:true});
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const context=await browser.newContext();await context.addCookies(cookie.split('; ').map(v=>{const i=v.indexOf('=');return {name:v.slice(0,i),value:v.slice(i+1),url:origin}}));
  const page=await context.newPage();const axe=await readFile(new URL('../node_modules/axe-core/axe.min.js',import.meta.url),'utf8');
  for(const width of [1440,390])for(const [name,path] of [['agents','/agents'],['approval','/agents/approvals/'+approvalId],...(phase==='executed'?[['docs','/docs/agents']]:[])]){
   await page.setViewportSize({width,height:1000});await page.goto(origin+path);await page.screenshot({path:join(directory,`${phase}-${name}-${width}.png`),fullPage:true});
   if(width===1440){
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal overflow');
    await page.evaluate(axe);const result=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa']}}));assert.deepEqual(result.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>({id:v.id,nodes:v.nodes.length})),[]);
    const small=name==='docs'?[]:await page.locator('button,input,select,a').evaluateAll(nodes=>nodes.filter(n=>{const r=n.getBoundingClientRect();return r.width&&r.height&&r.height<44}).map(n=>n.tagName+':'+n.textContent));assert.deepEqual(small,[],'visible controls meet 44px height');
   }
  }
  await context.close();
 }finally{await browser.close()}
}

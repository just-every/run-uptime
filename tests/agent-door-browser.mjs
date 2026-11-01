import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
const require=createRequire(import.meta.url);
export async function nativeDoorBrowser({origin,cookie,directory}){
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}),args:['--no-sandbox']});
 const context=await browser.newContext();const [name,...value]=cookie.split('=');await context.addCookies([{name,value:value.join('='),url:origin}]);
 const page=await context.newPage(),axe=await readFile(require.resolve('axe-core/axe.min.js'),'utf8'),issues=[];
 const output=process.env.UPTIME_AGENT_PROOF_DIR??join(directory,'browser-proof');await mkdir(output,{recursive:true});
 return {async capture(label,path){
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});await page.goto(origin+path,{waitUntil:'networkidle'});
   await page.screenshot({path:join(output,label+'-'+width+'.png'),fullPage:true});
   if(width===1440){const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);if(overflow)issues.push(label+': horizontal overflow');await page.evaluate(axe);const result=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));for(const v of result.violations.filter(v=>['serious','critical'].includes(v.impact)))issues.push(label+': '+v.id)}
  }
 },async close(){await context.close();await browser.close();assert.deepEqual(issues,[],'native Agents/approval/monitor accessibility at 1440')},async dispose(){await context.close();await browser.close()}};
}

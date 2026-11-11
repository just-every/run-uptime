import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
const helper=`
import {mkdir as proofMkdir,appendFile as proofAppend} from 'node:fs/promises';
const proofRoot='/home/agent/rer-consolidation/work/main-uptime-plain-monitor-text-1-c1/packet/proof';
const proofSeen=new Set();
async function proofCapture(region,label){
 if(!label)label=await region.evaluate(e=>e.id||e.className||e.tagName);
 label=String(label).replace(/[^a-z0-9-]+/gi,'-').slice(0,80);
 if(proofSeen.has(label))return;proofSeen.add(label);
 const page=region.page(),original=page.viewportSize();await proofMkdir(proofRoot,{recursive:true});
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:width===390?844:1000});
  await page.screenshot({path:proofRoot+'/'+label+'-'+width+'.png',fullPage:true});
  const text=await region.innerText();
  const leaks=text.match(/\\blocal-[a-z]\\b|\\bself-[0-9a-f-]{36}\\b|\\b[A-Z][A-Z0-9]*(?:-[A-Z]+)*-\\d{3}\\b|\\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\\b|[{}]/g)||[];
  await proofAppend(proofRoot+'/screens.jsonl',JSON.stringify({screen:label,width,leakCount:leaks.length,documentWidth:await page.evaluate(()=>document.documentElement.scrollWidth),screenshot:label+'-'+width+'.png'})+'\\n');
 }
 await page.setViewportSize(original);
}
async function proofDuplicate(region,page,options){
 const original=page.viewportSize();
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:width===390?844:1000});
  await region.screenshot({...options,path:options.path.replace('-1440.png','-'+width+'.png')});
 }
 await page.setViewportSize(original);
}
`;
registerHooks({load(url,context,nextLoad){
 const result=nextLoad(url,context);
 if(!url.includes('/tests/'))return result;
 let source=result.source?String(result.source):'';
 if(url.endsWith('/tests/browser-suites.mjs')){
  source=source.replace('[join(root, script)]',"[...(label==='operator'?['--import','/tmp/uptime-proof.mjs']:[]),join(root, script)]");
 }else if(url.endsWith('/tests/plain-monitor-text-support.mjs')){
  source=helper+source;
  source=source.replace("'visible monitor text has no internal location/clause IDs or JSON payload');","'visible monitor text has no internal location/clause IDs or JSON payload');\n await proofCapture(region);");
 }else if(url.endsWith('/tests/operator-browser.mjs')){
  source=helper+source;
  source=source.replace('await audit(page,`healthy-${width}`',"await proofCapture(page.locator('#content-area'),'monitor');await audit(page,`healthy-${width}`");
 }else if(url.endsWith('/tests/failure-page-browser.mjs')){
  source=helper+source;
  for(const name of ['panel','incident','viewer'])source=source.replaceAll('await '+name+'.screenshot({','await proofDuplicate('+name+','+(name==='viewer'?'viewer':'page')+',{');
 }
 return {...result,source};
}});

// Loaded only by the nightly measurement runner; never by ordinary push Verify.
// Slow just this page with CDP, retaining focus identities without values, text or URLs.
import {appendFileSync} from 'node:fs';
import {chromium} from 'playwright';
const mode=process.env.UPTIME_MEASUREMENT_MODE,path=process.env.UPTIME_MEASUREMENT_FOCUS;
if(!['normal','cpu'].includes(mode)||!path)throw Error('Measurement browser requires an explicit mode and focus output');
const record=value=>appendFileSync(path,JSON.stringify({at:new Date().toISOString(),pid:process.pid,...value})+'\n',{mode:0o600});
const launch=chromium.launch.bind(chromium);
chromium.launch=async options=>{
 const browser=await launch(options),newContext=browser.newContext.bind(browser);
 browser.newContext=async options=>{
  const context=await newContext(options);
  await context.exposeBinding('__uptimeMeasurementFocus',({page},fact)=>record({event:'focus',page:pages.get(page),...fact}));
  await context.addInitScript(()=>{
   const send=event=>{const element=document.activeElement;window.__uptimeMeasurementFocus({eventType:event.type,tag:element?.tagName??null,id:element?.id??null,role:element?.getAttribute('role')??null,dialog:!!element?.closest('dialog[open]')}).catch(()=>{})};
   for(const event of ['focusin','focusout'])document.addEventListener(event,send,true);
  });
  const newPage=context.newPage.bind(context);
  context.newPage=async options=>{
   const page=await newPage(options),id=++sequence;pages.set(page,id);
   const cdp=await context.newCDPSession(page);
   if(mode==='cpu')await cdp.send('Emulation.setCPUThrottlingRate',{rate:5});
   record({event:'page',page:id,mode,cpuRate:mode==='cpu'?5:1});
   page.once('close',()=>record({event:'close',page:id}));
   page.on('crash',()=>record({event:'crash',page:id}));
   return page;
  };
  return context;
 };
 return browser;
};
const pages=new WeakMap();let sequence=0;

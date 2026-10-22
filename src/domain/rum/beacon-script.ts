// PERF-001: the first-party beacon script one enabled site loads. It does nothing until the site says its visitor consented
// (data-consent="granted" on the tag, or uptimeRum.consent() from the site's consent banner), and nothing at all when the browser
// sends Do Not Track or Global Privacy Control, when the visitor is an automated browser, on an excluded path, or outside the owner's
// sample. A sampled, consenting view sends one beacon when the page is hidden: the path, a device class, whether the page loaded,
// LCP, CLS, INP, TTFB and a count of script errors. It uses no cookie or storage and sends no credentials.
// @ts-ignore Shared beacon rules (edition JavaScript).
import {BOT_AGENTS} from './privacy.mjs'

export function beaconScript({site,endpoint,samplePercent,excludedPaths}:{site:string;endpoint:string;samplePercent:number;excludedPaths:string[]}){
 const config=JSON.stringify({site,endpoint,sample:samplePercent/100,excluded:excludedPaths})
 return `/* Uptime real-user beacon (PERF-001). */
(function(){
var c=${config},w=window,d=document,n=navigator,tag=d.currentScript;
if(n.globalPrivacyControl===true||n.doNotTrack==='1'||w.doNotTrack==='1'||${BOT_AGENTS}.test(n.userAgent))return;
var path=location.pathname;for(var i=0;i<c.excluded.length;i++)if(path.indexOf(c.excluded[i])===0)return;
if(Math.random()>=c.sample)return;
var consent=Boolean(tag&&tag.getAttribute('data-consent')==='granted'),sent=false,m={lcp:null,cls:0,inp:null,errors:0},win=0,first=0,last=0;
function watch(type,fn,extra){try{var o=new PerformanceObserver(function(l){l.getEntries().forEach(fn)});o.observe(Object.assign({type:type,buffered:true},extra||{}))}catch(e){}}
watch('largest-contentful-paint',function(e){m.lcp=Math.round(e.renderTime||e.loadTime||e.startTime)});
watch('layout-shift',function(e){if(e.hadRecentInput)return;if(win&&(e.startTime-last>1000||e.startTime-first>5000))win=0;if(!win)first=e.startTime;win+=e.value;last=e.startTime;m.cls=Math.max(m.cls,win)});
watch('event',function(e){if(e.interactionId)m.inp=Math.max(m.inp||0,Math.round(e.duration))},{durationThreshold:16});
w.addEventListener('error',function(){m.errors++});w.addEventListener('unhandledrejection',function(){m.errors++});
function send(){
 if(sent||!consent)return;sent=true;
 var nav=performance.getEntriesByType('navigation')[0],code=nav&&nav.responseStatus;
 var body=JSON.stringify({site:c.site,route:path,device:(w.matchMedia&&w.matchMedia('(max-width: 767px)').matches)||(n.userAgentData&&n.userAgentData.mobile)?'mobile':'desktop',
  status:code?(code>=400?'failed':'ok'):'unknown',lcpMs:m.lcp,cls:Math.round(m.cls*1000)/1000,inpMs:m.inp,ttfbMs:nav?Math.round(nav.responseStart):null,errors:Math.min(m.errors,100)});
 try{fetch(c.endpoint,{method:'POST',body:body,keepalive:true,credentials:'omit',mode:'cors',headers:{'content-type':'text/plain'}})}catch(e){}
}
d.addEventListener('visibilitychange',function(){if(d.visibilityState==='hidden')send()});w.addEventListener('pagehide',send);
w.uptimeRum={consent:function(){consent=true;if(d.visibilityState==='hidden')send()}};
})();
`
}

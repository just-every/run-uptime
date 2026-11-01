import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';

const execute=promisify(execFile),marketingOrigin='https://run-uptime.com';
const text=html=>html.replace(/<[^>]*>/g,' ').replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g,' ').replace(/\s+/g,' ').trim();
const element=(html,name)=>text(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`,'i').exec(html)?.[1]??'');
const links=html=>[...html.matchAll(/\bhref=["']([^"']+)["']/gi)].map(match=>match[1]);

async function marketingRead(path,directory){
 const url=marketingOrigin+path,file=join(directory,path==='/'?'marketing-landing.html':'marketing-run.html');
 // A separate credential-free client reads the published site, never the
 // Worker's outbound fixture. Disable curl configuration and forward only
 // transport settings; no session, provider key or Git credential can enter it.
 const env=Object.fromEntries(['PATH','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','http_proxy','https_proxy','all_proxy','no_proxy','CURL_CA_BUNDLE','SSL_CERT_FILE','SSL_CERT_DIR'].filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]]));
 try{
  let stdout;
  try{({stdout}=await execute('curl',['-q','--silent','--show-error','--location','--max-redirs','4','--proto','=https','--proto-redir','=https','--connect-timeout','10','--max-time','30','--max-filesize','1048576','--header','Cookie:','--header','Authorization:','--output',file,'--write-out','%{json}',url],{env,timeout:35_000,maxBuffer:2*1024*1024}))}
  catch(error){assert.fail(`Published marketing page ${url} unavailable: HTTPS read failed (exit ${error.code??'timeout'}). No substitute page was used.`)}
  const result=JSON.parse(stdout),final=new URL(result.url_effective);
  const receipt={requested:url,finalOrigin:final.origin,finalPath:final.pathname,status:result.http_code,redirects:result.num_redirects,contentType:result.content_type};
  console.log('PUBLIC_SURFACE '+JSON.stringify(receipt));
  assert.equal(receipt.status,200,`${url}: published page must be available`);
  assert.equal(final.origin,marketingOrigin,`${url}: final origin identifies the marketing site`);
  assert.ok(path==='/'?final.pathname==='/':/^\/run\/?$/.test(final.pathname),`${url}: redirects retain the requested public surface`);
  assert.match(result.content_type,/^text\/html\b/i,`${url}: a real HTML page is served`);
  const html=await readFile(file,'utf8'),title=element(html,'title'),heading=element(html,'h1');
  assert.match(title,/\bUptime\b/i,`${url}: page identifies Uptime`);
  assert.ok(heading&&/<main\b/i.test(html),`${url}: public page has its own main content`);
  assert.doesNotMatch(html,/\bdata-state=["'](?:claimed|unclaimed)["']/i,`${url}: marketing is not an installation Lobby`);
  return {...receipt,title,heading,html};
 }finally{await rm(file,{force:true})}
}

// Mounted once in the existing public-path journey. Every installation read
// goes through the emitted Worker; marketing reads use the actual public site.
export async function provePublicSurfaces({call,origin,directory}){
 const landing=await marketingRead('/',directory),run=await marketingRead('/run',directory);
 assert.ok(links(landing.html).some(href=>new URL(href,marketingOrigin).href===marketingOrigin+'/run'),'marketing landing offers its own run page');
 assert.match(element(run.html,'code'),/\b(?:rer|install\.sh)\b/,'marketing run page offers installation instructions');
 assert.notEqual(landing.heading,run.heading,'landing and installation instructions identify distinct pages');
 const app=[];
 for(const path of ['/','/docs']){
  let current=path,response,redirects=[];
  for(let count=0;count<4;count++){
   response=await call(current);
   if(![301,302,303,307,308].includes(response.status))break;
   const next=new URL(response.headers.get('location'),origin+current);
   assert.equal(next.origin,origin,'public installation documents cannot redirect to marketing');
   redirects.push({path:current,status:response.status,location:next.pathname});
   await response.arrayBuffer();current=next.pathname+next.search;
  }
  assert.equal(response.status,200,`signed-out installation ${path} is public`);
  assert.match(response.headers.get('content-type'),/^text\/html\b/i);
  assert.equal(response.headers.get('set-cookie'),null,'public installation reads set no session cookie');
  const html=await response.text(),title=element(html,'title'),heading=element(html,'h1');
  assert.ok(title&&heading,`${path}: public document identifies itself`);
  assert.notEqual(origin,landing.finalOrigin,'the app origin and marketing origin are distinct');
  assert.notEqual(html,landing.html,'the app document is not the marketing landing');
  assert.notEqual(html,run.html,'the app document is not the marketing run page');
  if(path==='/'){
   assert.equal(current,'/');
   assert.equal(response.headers.get('x-rer-document'),'lobby','app root serves the installation Lobby');
   assert.ok(links(html).some(href=>['/setup','/login'].includes(new URL(href,origin).pathname)),'Lobby leads to installation setup or sign-in');
  }else{
   assert.match(current,/^\/docs\/?$/,'docs stay on their own installation route');
   assert.match(heading,/\bdocs\b/i,'the public docs door renders documentation');
   assert.ok(links(html).some(href=>new URL(href,origin).pathname.startsWith('/docs/')),'documentation offers actual guide routes');
  }
  app.push({requested:origin+path,finalOrigin:origin,finalPath:current,status:response.status,title,heading,redirects});
 }
 for(const [path,location] of [['/setup','/login?returnTo=%2Fsetup'],['/app','/login'],['/app/monitor','/login']]){
  const response=await call(path);
  assert.equal(response.status,303,`${path}: unsigned visitor is sent to native sign-in`);
  assert.equal(response.headers.get('location'),location,`${path}: sign-in stays on the installation, preserving setup intent`);
  assert.equal(await response.text(),'','unsigned document refusal exposes no private document');
  app.push({requested:origin+path,finalOrigin:origin,status:response.status,location});
 }
 const absent=await call('/run');assert.equal(absent.status,404,'marketing run page is not an app-origin route');await absent.arrayBuffer();
 const receipt={marketing:[landing,run].map(({html,...row})=>row),app};
 console.log('PUBLIC_SURFACES_PASS '+JSON.stringify(receipt));
 return receipt;
}

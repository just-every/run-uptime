import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve,join,relative,dirname,parse} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import https from 'node:https';
import assert from 'node:assert/strict';

export async function emittedRunnerWorker(directory,bindings){
 const emitted=resolve('dist/server'),config=JSON.parse(await readFile(join(emitted,'wrangler.json'),'utf8'));
 const wrapper=join(directory,'runner-emitted-envelope.mjs');
 await writeFile(wrapper,`import app from ${JSON.stringify(relative(dirname(wrapper),join(emitted,config.main)))};
 export default {async fetch(request,env,ctx){const input=await request.json();return app.fetch(new Request(input.url,{method:input.method,headers:input.headers,...(input.body===undefined?{}:{body:input.body})}),env,ctx)}};`);
 const modules=[{type:'ESModule',path:wrapper},{type:'ESModule',path:join(emitted,config.main)},...(await readdir(join(emitted,'assets'))).filter(n=>n.endsWith('.js')).map(n=>({type:'ESModule',path:join(emitted,'assets',n)}))];
 const worker=new Miniflare(convertV4MiniflareOptions({scriptPath:wrapper,modules,modulesRoot:parse(emitted).root,compatibilityDate:config.compatibility_date,compatibilityFlags:config.compatibility_flags,host:'127.0.0.1',port:0,d1Databases:{DB:'signed-emitted-runner'},resourcePersistencePath:join(directory,'state'),bindings,outboundService:async request=>{if(new URL(request.url).hostname==='api.sendgrid.com'&&(await request.json()).subject==='Uptime second-factor security change')return new Response(null,{status:202});throw Error('Unexpected hosted network request in signed-runner fixture')},unsafeLocalExplorer:false,unsafeObservability:false}));
 try{await worker.ready;return worker}catch(error){await worker.dispose();throw error}
}

export async function certificate(directory){
 const key=join(directory,'key.pem'),cert=join(directory,'cert.pem');
 const child=spawn('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=runner-target.test','-addext','subjectAltName=DNS:runner-target.test,DNS:canary.runner-target.test,DNS:localhost'],{stdio:'ignore'});
 assert.equal((await once(child,'exit'))[0],0,'test CA creation');
 return {key:await readFile(key),cert:await readFile(cert),caPath:cert};
}

export function runChild({origin,key,caPath,targetPort}){
 const child=spawn(process.execPath,['--import',resolve('tests/signed-runner-routing.mjs'),resolve('tests/signed-runner-child.mjs')],{cwd:process.cwd(),env:{...process.env,UPTIME_CONTROL_ORIGIN:origin,UPTIME_RUNNER_KEY:key,NODE_EXTRA_CA_CERTS:caPath,SIGNED_RUNNER_TARGET_PORT:String(targetPort)},stdio:['ignore','pipe','pipe']});
 // Never dump private child output, including failures, into acceptance logs.
 let bytes=0;child.stdout.on('data',b=>bytes+=b.length);child.stderr.on('data',b=>bytes+=b.length);
 const result=once(child,'exit');
 return {child,async finish(){const timer=setTimeout(()=>child.kill('SIGKILL'),35000);try{assert.equal((await result)[0],0,`Node runner failed (${bytes} private diagnostic bytes)`)}finally{clearTimeout(timer)}},async stop(){if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await result}}};
}

export async function listen(server){server.listen(0,'127.0.0.1');await once(server,'listening');return server.address().port}
export async function close(server){if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}}
export function request(origin,ca,path,{method='POST',body,headers={}}={}){
 return new Promise((resolve,reject)=>{
  const req=https.request(origin+path,{method,ca,headers:{'content-type':'application/json',...headers}},res=>{let text='';res.on('data',b=>text+=b);res.on('end',()=>{let data;try{data=JSON.parse(text)}catch{data=text}resolve({status:res.statusCode,headers:res.headers,data})})});
  req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));
 });
}

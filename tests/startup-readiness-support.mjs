import assert from 'node:assert/strict';
import {cp,mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {dirname,join,parse,relative,resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {availablePorts,cleanupDirectory,runtimeDirectory} from './notify-acceptance-runtime.mjs';
import {splitSql} from './migration-support.mjs';

// Faults live at the emitted Worker's binding boundary. Neither its handlers,
// its timers nor its real D1 persistence are replaced. The envelope records
// response timing inside workerd separately from Node transport scheduling.
function dependencyEnvelope(){
 const operations=new Map();
 const snapshot=record=>record?{enteredAt:record.enteredAt,completedAt:record.completedAt??null,calls:record.calls,failed:record.failed??false}:null;
 return {async fetch(request,env,ctx){
  const input=await request.json();
  if(input.action==='inspect')return Response.json(snapshot(operations.get(input.fault)));
  const bindings={...env},started=performance.now();
  let record;
  if(input.fault==='absent-assets')delete bindings.ASSETS;
  else if(input.fault){
   record={calls:0};operations.set(input.fault,record);
   const admission=input.fault==='stalled-admission';
   const wrap=statement=>new Proxy(statement,{get(target,key){
    if(key==='bind')return (...args)=>wrap(target.bind(...args));
    const value=Reflect.get(target,key,target);
    if(key==='first')return async(...args)=>{
     record.calls++;record.enteredAt=performance.now();
     if(input.fault==='failed-readiness'){
      record.failed=true;throw Error('synthetic-uptime-1');
     }
     // Keep this simulated remote operation alive after the response, so the
     // test can observe its later real D1 effect. The dependency's own timer
     // resolves in its originating request, avoiding cross-request promises.
     // D1 exposes no cancellation API to the handler.
     record.done=(async()=>{await new Promise(resolve=>setTimeout(resolve,5000));const result=await target.first(...args);record.completedAt=performance.now();return result})();
     ctx.waitUntil(record.done);
     return record.done;
    };
    return typeof value==='function'?value.bind(target):value;
   }});
   bindings.DB=new Proxy(env.DB,{get(target,key){
    if(key==='prepare')return sql=>{
     const statement=target.prepare(sql);
     const selected=admission?/^INSERT INTO public_rate_limits\b/.test(sql):sql==='SELECT 1 FROM monitors LIMIT 1';
     return selected?wrap(statement):statement;
    };
    const value=Reflect.get(target,key,target);
    return typeof value==='function'?value.bind(target):value;
   }});
  }
  const response=await app.fetch(new Request(env.UPTIME_ORIGIN+'/health',{headers:{host:new URL(env.UPTIME_ORIGIN).host,'cf-connecting-ip':'192.0.2.40'}}),bindings,ctx);
  const returnedAt=performance.now();
  return Response.json({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text(),elapsedMs:returnedAt-started,startedAt:started,returnedAt,operation:snapshot(record)});
 }};
}

export async function proveReadinessFaults(bindings){
 const directory=await runtimeDirectory(),[port]=await availablePorts(1);
 let worker;
 try{
  const emitted=resolve('./dist/server'),config=JSON.parse(await readFile(join(emitted,'wrangler.json'),'utf8'));
  const assets=join(directory,'assets'),wrapper=join(directory,'readiness.mjs');
  await mkdir(assets,{recursive:true});
  await cp(resolve(emitted,config.assets.directory),assets,{recursive:true});
  await writeFile(wrapper,`import app from ${JSON.stringify(relative(dirname(wrapper),join(emitted,config.main)))};\nexport default (${dependencyEnvelope.toString()})();\n`);
  const modules=[{type:'ESModule',path:wrapper},{type:'ESModule',path:join(emitted,config.main)},...(await readdir(join(emitted,'assets'))).filter(name=>name.endsWith('.js')).map(name=>({type:'ESModule',path:join(emitted,'assets',name)}))];
  worker=new Miniflare(convertV4MiniflareOptions({scriptPath:wrapper,modules,modulesRoot:parse(emitted).root,compatibilityDate:config.compatibility_date,compatibilityFlags:config.compatibility_flags,host:'127.0.0.1',port,assets:{directory:assets,binding:'ASSETS',routerConfig:{has_user_worker:true},run_worker_first:true},d1Databases:{DB:'startup-readiness-test'},resourcePersistencePath:join(directory,'state'),bindings,unsafeLocalExplorer:false,unsafeObservability:false,outboundService:()=>{throw Error('Readiness must not contact an external service')}}));
  await worker.ready;
  console.log('STARTUP-001 readiness harness ready');
  const DB=await worker.getD1Database('DB');
  console.log('STARTUP-001 readiness D1 connected');
  for(const file of(await readdir('migrations')).filter(name=>name.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await DB.prepare(sql).run();
  console.log('STARTUP-001 readiness migrations applied');
  const request=async input=>{
   const started=performance.now();
   let timer;
   const response=await Promise.race([
    worker.dispatchFetch(`http://127.0.0.1:${port}/`,{method:'POST',body:JSON.stringify(input)}),
    new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Readiness request exceeded the harness watchdog')),8000)}),
   ]).finally(()=>clearTimeout(timer));
   assert.equal(response.status,200,'dependency envelope completed');
   return {...await response.json(),roundTripMs:performance.now()-started};
  };
  const healthy=async label=>{
   const result=await request({});
   assert.equal(result.status,200,label);
   assert.equal(JSON.parse(result.body).status,'ok',label);
   return result;
  };
  await healthy('independently migrated emitted Worker is ready');
  // 3000 ms is the application response deadline. A separate 250 ms allowance
  // covers workerd timer scheduling; 1000 ms covers the outer Node transport.
  // Neither allowance changes the deadline or the dependency's five-second stall.
  const deadlineMs=3000,workerSchedulingToleranceMs=250,transportToleranceMs=1000,rows=[];
  const safeUnavailable=(result,label)=>{
   assert.equal(result.status,503,label);
   assert.equal(result.headers['cache-control'],'no-store',label);
   assert.ok(Buffer.byteLength(result.body)<=256,`${label}: bounded diagnostic`);
   assert.match(JSON.parse(result.body).error,/unavailable/i,`${label}: actionable unavailable diagnostic`);
   for(const value of Object.values(bindings))if(typeof value==='string'&&value.length>5)assert.ok(!result.body.includes(value),`${label}: binding value withheld`);
   assert.doesNotMatch(result.body,/synthetic-uptime-1|SQL|SELECT|monitors|cancel/i,`${label}: no storage details or cancellation claim`);
   assert.ok(result.elapsedMs<=deadlineMs+workerSchedulingToleranceMs,`${label}: Worker response budget`);
   assert.ok(result.roundTripMs-result.elapsedMs<=transportToleranceMs,`${label}: separate transport tolerance`);
  };
  for(const fault of ['absent-assets','failed-readiness','stalled-readiness','stalled-admission']){
   await DB.prepare('DELETE FROM public_rate_limits').run();
   const result=await request({fault});safeUnavailable(result,fault);
   if(fault!=='absent-assets')assert.equal(result.operation.calls,1,`${fault}: fault reached the actual dependency operation`);
   if(fault.startsWith('stalled-')){
    // Workerd timers may round by one millisecond. A quick failure cannot
    // masquerade as exercising the deadline; D1 remains pending past it.
    assert.ok(result.elapsedMs>=deadlineMs-1,`${fault}: response waits for the readiness deadline`);
    assert.equal(result.operation.completedAt,null,`${fault}: D1 still pending at the 503`);
    const pending=await request({action:'inspect',fault});
    assert.equal(pending.completedAt,null,`${fault}: timeout has not completed or cancelled the dependency`);
    const countersBefore=(await DB.prepare('SELECT COALESCE(SUM(request_count),0) n FROM public_rate_limits').first()).n;
    assert.equal(countersBefore,fault==='stalled-admission'?0:1,`${fault}: public admission is inside the same response budget`);
    const until=performance.now()+4000;
    let completed=pending;
    while(completed.completedAt===null&&performance.now()<until){
     await new Promise(resolve=>setTimeout(resolve,100));
     completed=await request({action:'inspect',fault});
    }
    assert.ok(completed.completedAt>result.returnedAt,`${fault}: underlying operation completes after the 503`);
    assert.equal((await DB.prepare('SELECT SUM(request_count) n FROM public_rate_limits').first()).n,1,`${fault}: real D1 admission persists once, even after a timeout`);
   }else if(fault==='failed-readiness')assert.equal(result.operation.failed,true,'D1 readiness fault was thrown');
   await healthy(`${fault}: restoring the dependency recovers readiness`);
   rows.push({fault,status:result.status,workerElapsedMs:result.elapsedMs,roundTripMs:result.roundTripMs,recovered:200});
  }
  console.log('STARTUP-001 readiness faults PASS '+JSON.stringify({deadlineMs,workerSchedulingToleranceMs,transportToleranceMs,rows,underlyingD1CompletionAfterTimeout:true}));
 }finally{await worker?.dispose();await cleanupDirectory(directory)}
}

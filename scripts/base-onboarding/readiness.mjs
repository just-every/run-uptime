const defaultWait = (ms,signal) => new Promise(resolve => {
 const done = () => { clearTimeout(timer); signal?.removeEventListener('abort',done); resolve(); };
 const timer = setTimeout(done,ms); signal?.addEventListener('abort',done,{once:true}); if(signal?.aborted)done();
});

export async function waitForReadiness(label, child, health, options, capture, report, failure) {
 const {signal, timeoutMs=900000, intervalMs=1000, softAfterMs=30000, probeTimeoutMs=Math.max(5000,intervalMs*3), now=Date.now, wait=defaultWait}=options;
 if (!Number.isFinite(timeoutMs)||timeoutMs<=0||!Number.isFinite(intervalMs)||intervalMs<=0||!Number.isFinite(probeTimeoutMs)||probeTimeoutMs<=0)throw TypeError('Readiness intervals must be positive.');
 const start=now(), scope=new AbortController();
 let lastHealth='No healthy response yet', cancelled;
 const aborted = new Promise(resolve=>{cancelled=()=>resolve({kind:'cancel'});signal?.addEventListener('abort',cancelled,{once:true});if(signal?.aborted)cancelled();});
 const closed = capture.closed.then(result=>({kind:'closed',result}));
 const exited = capture.exited.then(result=>({kind:'exit',result}));
 const failed = capture.failed.then(result=>({kind:'error',result}));
 const deadline = wait(timeoutMs,scope.signal).then(()=>({kind:'deadline'}));
 const progress=(async()=>{
  await wait(Math.max(1,softAfterMs),scope.signal);
  while(!scope.signal.aborted){report(`${label}: Still starting (${Math.floor((now()-start)/1000)} s)`);await wait(Math.max(1000,intervalMs),scope.signal);}
 })();
 const stopped = () => child.exitCode!==null&&child.exitCode!==undefined || child.signalCode!==null&&child.signalCode!==undefined;
 const fail = (reason,result) => {throw failure(label,{...result,reason,lastHealth});};
 // Give ordinary final pipe bytes a bounded chance to arrive after exit. A
 // descendant holding stdio cannot keep an already-dead app in readiness.
 const drain = async () => {
  const result=await Promise.race([closed,failed,aborted,deadline,wait(50,scope.signal).then(()=>({kind:'exit',result:capture.exitResult}))]);
  return fail(result.kind,result.result);
 };
 try {
  for (;;) {
   if(signal?.aborted)return await fail('cancel');
   if(stopped())return await drain();
   if(now()-start>=timeoutMs)return await fail('deadline');
   const probeScope=new AbortController();
   const probeSignal=AbortSignal.any([scope.signal,probeScope.signal]);
   const probe=Promise.resolve().then(()=>health(probeSignal)).then(value=>({kind:'health',value}),()=>({kind:'health',value:{ready:false,message:'Health probe failed'}}));
   // Race independently of the callback: adapters that ignore abort must not
   // consume the entire startup window with one request.
   const probeDeadline=wait(probeTimeoutMs,probeScope.signal).then(()=>{
    if(!probeScope.signal.aborted)probeScope.abort();
    return {kind:'health',value:{ready:false,message:'Health probe timed out'}};
   });
   let result;
   try { result=await Promise.race([probe,probeDeadline,closed,exited,failed,aborted,deadline]); }
   finally { probeScope.abort(); }

   if(result.kind==='exit')return await drain();
   if(result.kind!=='health')return await fail(result.kind,result.result);
   if(stopped())return await drain();
   if(signal?.aborted)return await fail('cancel');
   if(now()-start>=timeoutMs)return await fail('deadline');
   if(result.value===true||result.value?.ready===true)return result.value;
   if(typeof result.value==='string')lastHealth=result.value;
   else if(typeof result.value?.message==='string')lastHealth=result.value.message;
   result=await Promise.race([wait(Math.min(intervalMs,timeoutMs-(now()-start)),scope.signal).then(()=>({kind:'tick'})),closed,exited,failed,aborted,deadline]);
   if(result.kind==='exit')return await drain();
   if(result.kind!=='tick')return await fail(result.kind,result.result);
  }
 } finally { scope.abort();signal?.removeEventListener('abort',cancelled);await progress; }
}

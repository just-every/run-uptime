import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Pause the emitted code with the runtime debugger, then dispose the real
// Worker. D1 and the application stay intact; no dispatch or database fake.
export async function mentionDebugger(worker){
 const address=await worker.getInspectorURL();
 const targets=await (await fetch(new URL('/json/list',address.href.replace(/^ws:/,'http:')))).json();
 const socket=new WebSocket(targets[0].webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})});
 let sequence=0;const requests=new Map(),events=new Map();
 socket.addEventListener('message',event=>{
  const message=JSON.parse(event.data);
  if(message.id){const pending=requests.get(message.id);requests.delete(message.id);message.error?pending?.reject(Error(message.error.message)):pending?.resolve(message.result)}
  else if(events.has(message.method)){const resolve=events.get(message.method);events.delete(message.method);resolve(message.params)}
 });
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;requests.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))});
 const next=method=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{events.delete(method);reject(Error(`Worker debugger did not reach ${method}`))},15000);
  events.set(method,value=>{clearTimeout(timer);resolve(value)});
 });
 await send('Debugger.enable');
 const source=await readFile('dist/server/index.js','utf8'),lines=source.split('\n');
 return {
  send,next,
  async boundary(reserved=false){
   const start=lines.findIndex(value=>value.includes('async function deliver(env, id, allowance)'));
   const line=reserved?lines.findIndex((value,index)=>index>start&&value.includes('if (!reserved) return')):lines.findIndex(value=>value.includes('SELECT id FROM incident_mentions WHERE comment_id=?'));
   assert.ok(line>=0,'the emitted request dispatch boundary exists');
   const breakpoint=await send('Debugger.setBreakpointByUrl',{urlRegex:'.*index\\.js$',lineNumber:line});
   assert.ok(breakpoint.locations.length,'the real Worker resolved the dispatch breakpoint');
   return breakpoint.breakpointId;
  },
  close(){socket.close()},
 };
}

export async function interruptMention(worker,restart,request,reserved=false){
 const inspector=await mentionDebugger(worker);let inFlight;
 try{
  await inspector.boundary(reserved);
  const boundary=inspector.next('Debugger.paused');
  inFlight=request().catch(()=>null);
  const paused=await boundary;
  assert.equal(paused.callFrames[0].functionName,reserved?'deliver':'deliverCommentMentions');
  await restart({inspectorPort:0});
  await inFlight;
 }finally{inspector.close()}
}

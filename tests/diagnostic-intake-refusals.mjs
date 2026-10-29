import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';

// The original runner completion is forwarded unchanged after both forged
// documents have been refused through the same signed public intake.
export async function rejectForgedDiagnostics({url,headers,body,key,dispatch,db,seen}){
 const input=JSON.parse(body),index=input.attempts?.findIndex(o=>o.failureSnapshot?.diagnostics);
 if(index===undefined||index<0)return;
 const kind=input.attempts[index].failureSnapshot.method;if(seen.has(kind))return;seen.add(kind);
 const state=async()=>JSON.stringify((await db.prepare('SELECT id,state FROM monitors ORDER BY id').all()).results);
 const before=await state();
 for(const change of [
  d=>{d.route.reason='synthetic-uptime-999'},
  d=>{d.route.hops=Array.from({length:6},(_,i)=>({hop:i+1,address:'93.184.216.34',lossPercent:0,rttMs:1}))},
 ]){
  const forged=structuredClone(input);change(forged.attempts[index].failureSnapshot.diagnostics);
  const text=JSON.stringify(forged),stamp=String(Date.now());
  const response=await dispatch({url,method:'POST',headers:{...headers,'x-sent-at':stamp,'x-runner-signature':createHmac('sha256',key).update(stamp+'.'+text).digest('hex')},body:text});
  assert.equal(response.status,400,kind+' refuses forged or oversized diagnostics at signed intake');
  assert.equal(await state(),before,'rejected diagnostics cannot change monitor verdicts or incidents');
 }
}

import net from 'node:net';
import assert from 'node:assert/strict';

// Force the OS-legal allocation that made workerd's startup flaky: after
// freePort releases its reservation, Miniflare's loopback server takes it.
// Only socket allocation changes; the emitted app, auth and D1 remain real.
export async function withStartupPortCollision(start){
 const close=net.Server.prototype.close,listen=net.Server.prototype.listen;
 let selected,stolen;
 net.Server.prototype.close=function(...args){
  if(selected===undefined&&this.listening)selected=this.address().port;
  return close.apply(this,args);
 };
 net.Server.prototype.listen=function(...args){
  if(selected!==undefined&&stolen===undefined&&args[0]===0){stolen=selected;args[0]=selected}
  return listen.apply(this,args);
 };
 try{
  const fixture=await start();
  try{
   assert.ok(stolen,'Miniflare loopback occupied the released candidate');
   assert.notEqual(Number(new URL(fixture.origin).port),stolen,'workerd owns a fresh port after the bind collision');
   assert.equal((await fixture.worker.getBindings()).UPTIME_ORIGIN,fixture.origin,'the fresh origin was set before sign-in and requests');
   return fixture;
  }catch(error){await fixture.close();throw error}
 }finally{net.Server.prototype.close=close;net.Server.prototype.listen=listen}
}

// Fake only DNS and the native process boundary. Native mode runs the real
// utility against loopback after asserting production's public numeric pin.
import './protocol-routing.mjs';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {Resolver} from 'node:dns/promises';

const v4=Resolver.prototype.resolve4,v6=Resolver.prototype.resolve6;
Resolver.prototype.resolve4=async function(host){
 if(host==='ping.protocol.test')return process.env.PING_PRIVATE_DNS==='1'?['93.184.216.34','10.0.0.1']:['93.184.216.34'];
 if(host==='ping-v6.protocol.test')return process.env.PING_PRIVATE_DNS==='1'?['10.0.0.1']:[];
 return v4.call(this,host);
};
Resolver.prototype.resolve6=async function(host){
 if(['ping.protocol.test','ping-v6.protocol.test'].includes(host))return process.env.PING_PRIVATE_V6==='1'?['fd00::1']:['2606:4700:4700::1111'];
 return v6.call(this,host);
};
const spawn=childProcess.spawn;
childProcess.spawn=function(binary,args,options){
 if(!['/sbin/ping','/sbin/ping6','/bin/ping'].includes(binary))return spawn.call(this,binary,args,options);
 const address=args.at(-1),family=address.includes(':')?6:4,packets=Number(args[args.indexOf('-c')+1]);
 assert.ok(['93.184.216.34','2606:4700:4700::1111'].includes(address));
 assert.equal(options.shell,false);
 assert.ok(packets>0);
 const mode=process.env.PING_MODE??'healthy';
 if(mode==='native')return spawn.call(this,binary,[...args.slice(0,-1),family===6?'::1':'127.0.0.1'],options);
 const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.exitCode=null;child.signalCode=null;
 let closed=false;
 const close=(code=0,signal=null)=>{if(closed)return;closed=true;child.exitCode=code;child.signalCode=signal;child.stdout.end();child.stderr.end();child.emit('close',code,signal)};
 child.kill=signal=>{queueMicrotask(()=>close(null,signal));return true};
 queueMicrotask(()=>{
  if(mode==='missing'){child.emit('error',Object.assign(Error('missing'),{code:'ENOENT'}));close(-2);return}
  if(mode==='denied'){child.stderr.write('ping: socket: Operation not permitted');close(2);return}
  if(mode==='oversize'){child.stdout.write('x'.repeat(16385));close();return}
  if(mode==='hang')return;
  if(mode==='malformed'){child.stdout.write('native output not recognized');close();return}
  const received=mode==='blocked'?0:mode==='loss'?packets-1:packets;
  child.stdout.write(`${packets} packets transmitted, ${received} packets received, ${(packets-received)*100/packets}% packet loss\n`);
  if(received)child.stdout.write(`round-trip min/avg/max/stddev = ${mode==='slow'?'1100/1200/1300/1':'1/2/3/1'} ms\n`);
  close(received?0:2);
 });
 return child;
};
syncBuiltinESMExports();

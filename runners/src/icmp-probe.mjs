import {spawn} from 'node:child_process';
import {isIP} from 'node:net';
import {resolvePublic} from './public-http.mjs';
import {publicHost} from '../../src/domain/protocol/settings.mjs';
import {ProtocolError} from '../../src/domain/protocol/protocol-error.mjs';

const unavailable=reason=>new ProtocolError('vantage',reason);
const invalid=()=>unavailable('The native ICMP utility did not return a complete, valid packet sample; this location reports Unknown');
const number='([0-9]+(?:\\.[0-9]+)?)';

// Read only the aggregate summary. Per-packet text and native errors are never
// retained. Both BSD/macOS and iputils report the same three RTT aggregates.
function sample(text,address,family,packets){
 const count=text.match(/(\d+) packets transmitted,\s*(\d+) (?:packets )?received(?:,\s*\+\d+ errors)?[,\s]/);
 if(!count)throw invalid();
 const transmitted=Number(count[1]),received=Number(count[2]);
 if(transmitted!==packets||received<0||received>transmitted)throw invalid();
 let rtt=null;
 if(received){
  const match=text.match(new RegExp(`(?:round-trip|rtt) min/avg/max/(?:stddev|mdev) = ${number}/${number}/${number}/${number} ms`));
  if(!match)throw invalid();
  const [minMs,meanMs,maxMs]=match.slice(1,4).map(Number);
  if([minMs,meanMs,maxMs].some(n=>!Number.isFinite(n)||n<0||n>60000)||minMs>meanMs||meanMs>maxMs)throw invalid();
  rtt={minMs,meanMs,maxMs};
 }
 return {address,family,transmitted,received,lossPercent:(transmitted-received)*100/transmitted,rtt};
}

// A fixed operating-system utility, argv only, numeric destination, no inherited
// environment or PATH lookup. The validated definition cannot supply flags,
// executables, packet sizes, interfaces, source addresses or authority.
export async function icmpFacts(settings,signal){
 if(!signal||signal.aborted)throw unavailable('The ICMP sample was interrupted before completion; this location reports Unknown');
 const {host,family,packets}=settings??{};
 if(![4,6].includes(family)||!Number.isInteger(packets)||packets<1||packets>5)throw new ProtocolError('runner','Invalid ICMP sample settings');
 publicHost(host);
 const pin=await resolvePublic(new URL(`https://${host.includes(':')?`[${host}]`:host}/`),signal,{family});
 if(isIP(pin.address)!==family)throw new ProtocolError('runner','The resolved ICMP address has the wrong IP family');
 const darwin=process.platform==='darwin';
 if(!darwin&&process.platform!=='linux')throw unavailable('ICMP checks require the native macOS or Linux ping utility; this location reports Unknown');
 const binary=darwin?(family===6?'/sbin/ping6':'/sbin/ping'):'/bin/ping';
 const args=darwin?['-n','-q','-c',String(packets),'-i','1',...(family===4?['-W','1000','-t',String(packets+1)]:[]),pin.address]:[`-${family}`,'-n','-q','-c',String(packets),'-i','1','-W','1','-w',String(packets+1),pin.address];
 return await new Promise((resolve,reject)=>{
  let child,finished=false,text='',bytes=0,summaryTimer,killTimer;
  const stop=()=>{if(child&&child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL')};
  const finish=(error,facts)=>{
   if(finished)return;finished=true;
   clearTimeout(summaryTimer);clearTimeout(killTimer);signal.removeEventListener('abort',aborted);
   if(error){stop();reject(error)}else resolve(facts);
  };
  const aborted=()=>finish(unavailable('The ICMP sample was interrupted before completion; this location reports Unknown'));
  const failed=error=>finish(unavailable(error?.code==='ENOENT'?'The native ping utility is missing on this runner; this location reports Unknown':error?.code==='EACCES'||error?.code==='EPERM'?'This runner is not permitted to send ICMP echo requests; this location reports Unknown':'The runner could not start its native ping utility; this location reports Unknown'));
  const data=chunk=>{bytes+=chunk.length;if(bytes>16384){finish(unavailable('The native ping output exceeded its 16 KiB limit; this location reports Unknown'));return}text+=chunk.toString('utf8')};
  try{
   if(signal.aborted){aborted();return}
   child=spawn(binary,args,{shell:false,env:{LC_ALL:'C',LANG:'C'},stdio:['ignore','pipe','pipe']});
   child.once('error',failed);child.stdout.on('data',data);child.stderr.on('data',data);
   child.once('close',(code,exitSignal)=>{
    if(finished)return;
    if(/operation not permitted|permission denied|not permitted|must be root|cap_net_raw/i.test(text)){finish(unavailable('This runner is not permitted to send ICMP echo requests; this location reports Unknown'));return}
    if(![0,1,2].includes(code)&&exitSignal!=='SIGINT'){finish(invalid());return}
    try{finish(undefined,sample(text,pin.address,family,packets))}catch(error){finish(error)}
   });
   signal.addEventListener('abort',aborted,{once:true});
   if(signal.aborted){aborted();return}
   // BSD ping6 has no wall deadline. SIGINT prints its summary after every
   // configured packet has had at least one second to answer. All platforms
   // still have a hard stop, independent of the monitor's abort signal.
   summaryTimer=setTimeout(()=>{
    if(finished)return;
    child.kill('SIGINT');
    killTimer=setTimeout(()=>finish(invalid()),250);
   },(packets+1)*1000);
  }catch(error){failed(error)}
 });
}

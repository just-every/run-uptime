import {spawn} from 'node:child_process';
import {isIP} from 'node:net';
import {publicAddress} from '../../src/domain/public-target.mjs';
import {normalizeNetworkDiagnostics} from '../../src/domain/network-diagnostics.mjs';

const DEADLINE_MS=3000,MAX_OUTPUT_BYTES=16384;
const blocked=text=>/operation not permitted|permission denied|not permitted|must be root|cap_net_raw|administratively prohibited|!X\b|!A\b/i.test(text);

// -n forbids reverse DNS. One probe at each TTL gives at most five packets.
// Only numeric response addresses, loss and RTT survive parsing.
function hopsFrom(text){
 const hops=[];
 for(const line of text.split(/\r?\n/)){
  const match=line.match(/^\s*(\d+)\s+(.+)$/);
  if(!match)continue;
  const hop=Number(match[1]);
  if(hop<1||hop>5||hops.some(value=>value.hop===hop))throw Error('Invalid trace');
  const body=match[2].trim();
  if(/^\*\s*$/.test(body)){hops.push({hop,address:null,lossPercent:100,rttMs:null});continue}
  const answer=body.match(/^(\S+)\s+(<?\d+(?:\.\d+)?)\s+ms(?:\s+![A-Za-z0-9<>-]+)?\s*$/);
  if(!answer||!isIP(answer[1]))throw Error('Invalid trace');
  const rttMs=Number(answer[2].replace(/^</,''));
  if(!Number.isFinite(rttMs)||rttMs<0||rttMs>60000)throw Error('Invalid trace');
  hops.push({hop,address:answer[1],lossPercent:0,rttMs});
 }
 return hops.sort((a,b)=>a.hop-b.hop);
}

// The caller supplies the pin approved for the original failed transport. This
// collector never resolves a name, retries a route or opens a TCP/TLS socket.
export async function collectNetworkDiagnostics({category,phases,pin,signal,privateNetwork=false}){
 const result=(tool,reason,hops=[])=>normalizeNetworkDiagnostics({version:1,category,phases,route:{tool,reason,hops}});
 const unavailable=(reason,hops=[])=>result('unavailable',reason,hops);
 // Validate the evidence before doing any native work.
 unavailable('missing-pin');
 if(privateNetwork)return unavailable('private-network');
 if(!pin)return unavailable('missing-pin');
 if(typeof pin.address!=='string'||![4,6].includes(pin.family)||isIP(pin.address)!==pin.family||!publicAddress(pin.address))return unavailable('invalid-pin');
 if(signal?.aborted)return unavailable('aborted');
 const darwin=process.platform==='darwin';
 if(!darwin&&process.platform!=='linux')return unavailable('unsupported-platform');
 // BSD traceroute6's probe-count semantics vary. Report its absence explicitly
 // rather than risk exceeding this collector's five-packet contract.
 if(darwin&&pin.family===6)return unavailable('unsupported-family');
 const binary=darwin?'/usr/sbin/traceroute':'traceroute';
 const args=darwin?['-n','-m','5','-q','1','-w','1',pin.address]:[`-${pin.family}`,'-n','-m','5','-q','1','-N','1','-w','0.4',pin.address];
 return await new Promise(resolve=>{
  let child,finished=false,stdout='',stderr='',bytes=0,timer;
  const stop=()=>{if(child&&child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL')};
  const partial=()=>{try{return hopsFrom(stdout)}catch{return []}};
  const finish=(reason=null,hops=partial())=>{
   if(finished)return;
   finished=true;clearTimeout(timer);signal?.removeEventListener('abort',aborted);
   stop();
   resolve(reason?unavailable(reason,hops):result('traceroute',null,hops));
  };
  const aborted=()=>finish('aborted');
  const failed=error=>finish(error?.code==='ENOENT'?'tool-missing':['EACCES','EPERM'].includes(error?.code)?'blocked':'tool-failed');
  const data=(kind,chunk)=>{
   if(finished)return;
   bytes+=chunk.length;
   if(bytes>MAX_OUTPUT_BYTES){finish('output-limit');return}
   if(kind==='stdout')stdout+=chunk.toString('utf8');else stderr+=chunk.toString('utf8');
  };
  try{
   if(signal?.aborted){aborted();return}
   // This environment excludes caller PATH, proxies, loader variables and
   // credentials. No executable, flags or environment comes from the task.
   timer=setTimeout(()=>finish('timeout'),DEADLINE_MS);
   child=spawn(binary,args,{shell:false,env:{LC_ALL:'C',LANG:'C',PATH:'/usr/bin:/bin:/usr/sbin:/sbin'},stdio:['ignore','pipe','pipe']});
   child.once('error',failed);
   child.stdout.on('data',chunk=>data('stdout',chunk));
   child.stderr.on('data',chunk=>data('stderr',chunk));
   child.once('close',(code,exitSignal)=>{
    if(finished)return;
    if(blocked(stdout+'\n'+stderr)){finish('blocked');return}
    if(code!==0||exitSignal){finish('tool-failed');return}
    try{const hops=hopsFrom(stdout);finish(hops.length?null:'invalid-output',hops)}catch{finish('invalid-output',[])}
   });
   signal?.addEventListener('abort',aborted,{once:true});
   if(signal?.aborted)aborted();
  }catch(error){failed(error)}
 });
}

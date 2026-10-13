import {HOST_GAP_MS,MAX_HOSTS} from './constants.mjs';
// Why a request was not sent. Stages treat these as "skip", never as a failure of discovery.
export class DiscoveryStop extends Error {constructor(reason,detail=''){super(reason);this.reason=reason;this.detail=detail}}
const sleep=(ms,signal)=>new Promise((resolve,reject)=>{
  if(ms<=0)return resolve();
  const timer=setTimeout(()=>{signal?.removeEventListener('abort',stop);resolve()},ms);
  const stop=()=>{clearTimeout(timer);reject(signal.reason)};
  signal?.addEventListener('abort',stop,{once:true});
});
// One shared budget for a run: total requests, requests in flight, wall clock, one request per host at a time spacing,
// the number of hosts touched, and hosts that asked us to back off.
export function createBudget({requests,concurrency,totalMs,signal}){
  const deadline=AbortSignal.timeout(totalMs),combined=AbortSignal.any([...(signal?[signal]:[]),deadline]);
  const hosts=new Set(),halted=new Map(),nextAt=new Map(),queue=[];
  let used=0,active=0;
  const release=()=>{active--;queue.shift()?.()};
  return {
    signal:combined,
    get used(){return used},
    get hosts(){return [...hosts]},
    get remaining(){return Math.max(0,requests-used)},
    get exhausted(){return used>=requests},
    get timedOut(){return deadline.aborted&&!signal?.aborted},
    get cancelled(){return Boolean(signal?.aborted)},
    isHalted:host=>halted.get(host),
    halt:(host,why)=>{if(!halted.has(host))halted.set(host,why)},
    // Runs one fetch chain with at most `concurrency` chains in flight.
    async run(task){
      combined.throwIfAborted();
      if(active>=concurrency)await new Promise(resolve=>queue.push(resolve));
      active++;
      try{combined.throwIfAborted();return await task()}finally{release()}
    },
    // Called once per request actually about to be sent; throws DiscoveryStop when the request must not go out.
    async admit(url){
      combined.throwIfAborted();
      const host=url.hostname.replace(/^\[|\]$/g,'').toLowerCase();
      if(halted.has(host))throw new DiscoveryStop('halted',host);
      if(!hosts.has(host)&&hosts.size>=MAX_HOSTS)throw new DiscoveryStop('hosts',host);
      if(used>=requests)throw new DiscoveryStop('budget');
      used++;hosts.add(host);
      const now=Date.now(),slot=Math.max(now,nextAt.get(host)??0);
      nextAt.set(host,slot+HOST_GAP_MS);
      await sleep(slot-now,combined);
    },
  };
}

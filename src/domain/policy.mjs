import {publicTarget} from './public-target.mjs';
export const RUNNER_VERSION = 'uptime-node/0.1.0';
export const MAX_BODY = 65536;
const integer = (v, min, max, label) => { if (!Number.isInteger(v) || v < min || v > max) throw Error(`Invalid ${label}`); return v; };
export function validateDefinition(input, grants) {
  if (!input || typeof input !== 'object') throw Error('Definition required');
  const { name, url } = input;
  if (typeof name !== 'string' || !name.trim() || name.length > 100) throw Error('Name required (100 characters max)');
  const type=input.type??'http';
  if(!['http','keyword','heartbeat'].includes(type))throw Error('Unsupported monitor type');
  const network=input.network??(typeof url==='string'&&/^http:\/\/127\.0\.0\.1:[0-9]+\//.test(url)?'synthetic':'public');
  if(!['public','synthetic'].includes(network))throw Error('Invalid network scope');
  let u;
  if(type!=='heartbeat'){
    if(network==='synthetic'){
      if(typeof url!=='string'||url.length>2048||!/^http:\/\/127\.0\.0\.1:[0-9]+\//.test(url))throw Error('Invalid URL');
      u=new URL(url);
      if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||u.username||u.password||u.hash||u.search||!grants.includes(Number(u.port)))throw Error('Target outside local synthetic grants');
    }else u=publicTarget(url);
  }else if(url!==undefined&&url!=='')throw Error('Heartbeat has no outgoing URL');
  const method=input.method??'GET';
  if(!(network==='synthetic'?['GET','HEAD']:['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS']).includes(method))throw Error('Invalid request method');
  if(['headers','body','auth'].some(k=>input[k]!==undefined))throw Error('Request secrets require an installation-local credential reference');
  let request;
  if(input.request!==undefined){
    if(type==='heartbeat'||network==='synthetic'||!input.request||Object.keys(input.request).join(',')!=='credentialRef'||typeof input.request.credentialRef!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(input.request.credentialRef))throw Error('Invalid request credential reference');
    request={credentialRef:input.request.credentialRef};
  }
  let heartbeat;
  if(type==='heartbeat'){
    if(input.heartbeat!==undefined&&(!input.heartbeat||Object.keys(input.heartbeat).some(k=>k!=='maxAgeMs')))throw Error('Invalid heartbeat configuration');
    heartbeat={maxAgeMs:integer(input.heartbeat?.maxAgeMs??180000,5000,86400000,'heartbeat age')};
  }else if(input.heartbeat!==undefined)throw Error('Heartbeat settings require heartbeat type');
  const probes = input.probes ?? ['local-a'];
  if (!Array.isArray(probes) || probes.length < 1 || probes.length > 3 || new Set(probes).size !== probes.length || probes.some(p => !['local-a','local-b','local-c'].includes(p))) throw Error('Invalid local probes');
  const assertions = input.assertions ?? { status: 200 };
  if (!assertions || typeof assertions !== 'object' || Array.isArray(assertions) || Object.keys(assertions).some(k => !['status','bodyIncludes','header','json','latencyMs'].includes(k))) throw Error('Invalid assertions');
  integer(assertions.status ?? 200, 100, 599, 'expected status');
  if(type==='keyword'&&(typeof assertions.bodyIncludes!=='string'||!assertions.bodyIncludes.length))throw Error('Keyword requires bodyIncludes');
  if(type==='heartbeat'&&Object.keys(assertions).some(k=>k!=='status'))throw Error('Heartbeat cannot have HTTP assertions');
  if (assertions.bodyIncludes !== undefined && (typeof assertions.bodyIncludes !== 'string' || assertions.bodyIncludes.length > 200)) throw Error('Invalid body assertion');
  if (assertions.header !== undefined && (!assertions.header || !/^[a-zA-Z0-9-]{1,80}$/.test(assertions.header.name) || typeof assertions.header.equals !== 'string' || assertions.header.equals.length > 200)) throw Error('Invalid header assertion');
  if (assertions.json !== undefined && (!assertions.json || !/^[a-zA-Z0-9_.-]{1,120}$/.test(assertions.json.path) || !['string','number','boolean'].includes(typeof assertions.json.equals))) throw Error('Invalid JSON assertion');
  if (assertions.latencyMs !== undefined) integer(assertions.latencyMs, 1, 10000, 'latency assertion');
  return { name:name.trim(), type, network, url:u?.href??'', method, ...(request?{request}:{}), ...(heartbeat?{heartbeat}:{}), probes, assertions:{...assertions,status:assertions.status??200}, intervalMs:integer(input.intervalMs??60000,5000,86400000,'interval'), timeoutMs:integer(input.timeoutMs??2000,50,10000,'timeout'), retries:integer(input.retries??1,0,2,'retries'), failureQuorum:integer(input.failureQuorum??probes.length,1,probes.length,'failure quorum'), confirmSlots:integer(input.confirmSlots??2,1,10,'confirmation'), recoverSlots:integer(input.recoverSlots??2,1,10,'recovery'), freshnessMs:integer(input.freshnessMs??180000,5000,86400000,'freshness'), enabled:input.enabled === undefined ? true : (()=>{if(typeof input.enabled!=='boolean')throw Error('Invalid enabled flag');return input.enabled;})(), maintenanceUntil:integer(input.maintenanceUntil??0,0,Number.MAX_SAFE_INTEGER,'maintenance end') };
}
export function evaluate(def, observations, previous = {}, now = Date.now(), advance = true) {
  const regions = def.probes.map(probe => {
    const observation = observations.find(o => o.probe === probe);
    const fresh = observation && (def.type!=='heartbeat'||observation.outcome!=='pass'||(Number.isFinite(observation.heartbeatReceivedAt)&&observation.heartbeatReceivedAt<=now&&now-observation.heartbeatReceivedAt<=def.heartbeat.maxAgeMs)) && now - observation.completedAt <= def.freshnessMs && observation.completedAt <= now && !['runner_error','interrupted'].includes(observation.outcome);
    return { probe, state:!fresh?'Unknown':observation.outcome==='pass'?'Healthy':'Failing', observationId:observation?.id??null,observedAt:observation?.completedAt??null };
  });
  const fails=regions.filter(r=>r.state==='Failing').length,unknown=regions.filter(r=>r.state==='Unknown').length;
  const coverageState=unknown?'Incomplete':'Complete';
  const candidate=fails>=def.failureQuorum?'Failing':fails?'Degraded':unknown?'Unknown':'Healthy';
  const failureStreak=advance?(candidate==='Failing'?(previous.failureStreak??0)+1:0):(previous.failureStreak??0);
  const recoveryStreak=advance?(candidate==='Healthy'?(previous.recoveryStreak??0)+1:0):(previous.recoveryStreak??0);
  let targetState=candidate;
  if(candidate==='Failing'&&failureStreak<def.confirmSlots)targetState='Degraded';
  if(candidate==='Healthy'&&previous.confirmedFailure&&recoveryStreak<def.recoverSlots)targetState='Recovering';
  const confirmedFailure=targetState==='Failing'||(previous.confirmedFailure&&targetState!=='Healthy');
  const maintenance=def.maintenanceUntil>now;
  return {state:maintenance?'Maintenance':targetState,targetState,underlyingState:targetState,evidenceState:candidate,coverageState,candidate,regions,denominator:def.probes.length,fails,unknown,failureStreak,recoveryStreak,confirmedFailure,notificationOpen:previous.notificationOpen??false,maintenance,reason:`${fails}/${def.probes.length} selected probes failed; ${unknown} unknown; coverage ${coverageState.toLowerCase()}. Failure quorum ${def.failureQuorum}; scheduled-slot confirmation ${failureStreak}/${def.confirmSlots}; recovery ${recoveryStreak}/${def.recoverSlots}.`,evaluatedAt:now};
}

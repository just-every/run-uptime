import {heartbeatSettings,heartbeatEvaluation} from './heartbeat-job.mjs'
import {validateMonitorMetadata} from './monitor-metadata.mjs';
import {validateMaintenanceWindows,activeMaintenance} from './planned-maintenance.mjs';
import {publicTarget} from './public-target.mjs';
import {FLOW_LIMITS,validateFlow} from './flow.mjs';
import {policyReason} from './policy-reason.mjs';
import {PROTOCOL_TYPES,PROTOCOL_TIMING,isProtocol,protocolSettings} from './protocol/settings.mjs';
import {HTTP_ASSERTIONS,assertionObject} from './http-assertions/config.mjs';
import {validateStatus} from './http-assertions/status.mjs';
import {compileBodyRegex} from './http-assertions/regex.mjs';
import {validateJsonPath} from './http-assertions/json.mjs';
export {ASSERTION_FIELDS} from './http-assertions/config.mjs';
export const RUNNER_VERSION = 'uptime-node/0.1.0';
export const MAX_BODY = 65536;
const integer = (v, min, max, label) => { if (!Number.isInteger(v) || v < min || v > max) throw Error(`Invalid ${label}`); return v; };
export function validateDefinition(input, grants) {
  if (!input || typeof input !== 'object') throw Error('Definition required');
  const { name, url } = input;
  if (typeof name !== 'string' || !name.trim() || name.length > 100) throw Error('Name required (100 characters max)');
  const type=input.type??'http';
  if(!['http','keyword','heartbeat','flow',...PROTOCOL_TYPES].includes(type))throw Error('Unsupported monitor type');
  // TCP, DNS, TLS and domain monitors check public targets with their own settings; they send no HTTP request.
  const protocol=isProtocol(type);
  for(const other of PROTOCOL_TYPES)if(other!==type&&input[other]!==undefined)throw Error(`${other.toUpperCase()} settings require the ${other} type`);
  let settings;
  if(protocol){
   if(input.network!==undefined&&input.network!=='public')throw Error('TCP, DNS, TLS and domain monitors check public targets');
   if(input.method!==undefined)throw Error('A TCP, DNS, TLS or domain monitor sends no HTTP request method');
   if(input.flow!==undefined||input.heartbeat!==undefined)throw Error('Unsupported settings for this monitor type');
   settings=protocolSettings(type,input);
   if(url!==undefined&&url!==''&&url!==settings.url)throw Error(`This monitor's address is ${settings.url}, from its ${type.toUpperCase()} settings`);
  }
  if(type==='flow'){if(input.method!==undefined&&input.method!=='GET')throw Error('A flow starts with GET');if(input.request!==undefined)throw Error('A flow names its credentials in its fill steps');if(input.assertions!==undefined&&JSON.stringify(input.assertions)!=='{"status":200}')throw Error('A flow has required outcomes, not HTTP assertions')}else if(input.flow!==undefined)throw Error('Flow settings require the flow type');
  const network=protocol?'public':input.network??(typeof url==='string'&&/^http:\/\/127\.0\.0\.1:[0-9]+\//.test(url)?'synthetic':'public');
  if(!['public','synthetic'].includes(network))throw Error('Invalid network scope');
  let u;
  if(type!=='heartbeat'&&!protocol){
    if(network==='synthetic'){
      if(typeof url!=='string'||url.length>2048||!/^http:\/\/127\.0\.0\.1:[0-9]+\//.test(url))throw Error('Invalid URL');
      u=new URL(url);
      if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||u.username||u.password||u.hash||u.search||!grants.includes(Number(u.port)))throw Error('Target outside local synthetic grants');
    }else u=publicTarget(url);
  }else if(type==='heartbeat'&&url!==undefined&&url!=='')throw Error('Heartbeat has no outgoing URL');
  const method=input.method??'GET';
  if(!(network==='synthetic'?['GET','HEAD']:['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS']).includes(method))throw Error('Invalid request method');
  if(['headers','body','auth'].some(k=>input[k]!==undefined))throw Error('Request secrets require an installation-local credential reference');
  if(protocol&&input.request!==undefined)throw Error('A TCP, DNS, TLS or domain monitor takes no request credential');
  let request;
  if(input.request!==undefined){
    if(type==='heartbeat'||network==='synthetic'||!input.request||Object.keys(input.request).join(',')!=='credentialRef'||typeof input.request.credentialRef!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(input.request.credentialRef))throw Error('Invalid request credential reference');
    request={credentialRef:input.request.credentialRef};
  }
  let heartbeat;
  if(type==='heartbeat'){
    heartbeat=heartbeatSettings(input.heartbeat);
  }else if(input.heartbeat!==undefined)throw Error('Heartbeat settings require heartbeat type');
  const probes = input.probes ?? ['local-a'];
  if (!Array.isArray(probes) || probes.length < 1 || probes.length > 3 || new Set(probes).size !== probes.length || probes.some(p => !['local-a','local-b','local-c'].includes(p))) throw Error('Invalid local probes');
  let assignments;
  if(input.assignments!==undefined){
    if(!input.assignments||typeof input.assignments!=='object'||Array.isArray(input.assignments)||Object.keys(input.assignments).some(p=>!probes.includes(p)))throw Error('Invalid assignments');
    assignments=Object.fromEntries(probes.map(p=>{const a=input.assignments[p];if(typeof a==='string'){if(!/^self-[0-9a-f-]{36}$/.test(a))throw Error('Invalid runner assignment');return [p,{runnerId:a}];}if(!a||typeof a.runnerId!=='string'||!/^self-[0-9a-f-]{36}$/.test(a.runnerId)||(a.networkLabel!==undefined&&(typeof a.networkLabel!=='string'||!a.networkLabel.trim()||a.networkLabel.length>80||/[\x00-\x1f\x7f]/.test(a.networkLabel)))||Object.keys(a).some(k=>!['runnerId','networkLabel','canaryUrl'].includes(k)))throw Error('Invalid runner assignment');return [p,{runnerId:a.runnerId,...(a.networkLabel?{networkLabel:a.networkLabel}:{}),...(a.canaryUrl?{canaryUrl:publicTarget(a.canaryUrl).href}:{})}]}));
  }
  if(protocol&&input.assertions!==undefined&&(!input.assertions||typeof input.assertions!=='object'||Array.isArray(input.assertions)||Object.keys(input.assertions).some(k=>k!=='latencyMs')))throw Error('A TCP, DNS, TLS or domain monitor takes only a latencyMs assertion');
  const assertions = input.assertions ?? (protocol?{}:{ status: 200 });
  if (!assertions || typeof assertions !== 'object' || Array.isArray(assertions) || Object.keys(assertions).some(k => !Object.hasOwn(HTTP_ASSERTIONS,k))) throw Error('Invalid assertions');
  if(!protocol)validateStatus(assertions.status ?? 200);
  if(type==='keyword'&&![assertions.bodyIncludes,assertions.bodyExcludes].some(value=>typeof value==='string'&&value.length))throw Error('Keyword requires bodyIncludes or bodyExcludes');
  if(type==='heartbeat'&&Object.keys(assertions).some(k=>k!=='status'))throw Error('Heartbeat cannot have HTTP assertions');
  if (assertions.bodyIncludes !== undefined && (typeof assertions.bodyIncludes !== 'string' || assertions.bodyIncludes.length > 200)) throw Error('Invalid body assertion');
  if (assertions.bodyExcludes !== undefined && (typeof assertions.bodyExcludes !== 'string' || assertions.bodyExcludes.length > 200)) throw Error('Invalid body absence assertion');
  if (assertions.bodyRegex !== undefined) compileBodyRegex(assertionObject(assertions.bodyRegex,'bodyRegex'));
  if (assertions.header !== undefined && (!assertionObject(assertions.header, 'header') || !/^[a-zA-Z0-9-]{1,80}$/.test(assertions.header.name) || typeof assertions.header.equals !== 'string' || assertions.header.equals.length > 200)) throw Error('Invalid header assertion');
  if (assertions.json !== undefined) {
    const json=assertionObject(assertions.json, 'json');
    validateJsonPath(json.path);
    if(!['string','number','boolean'].includes(typeof json.equals)||typeof json.equals==='number'&&!Number.isFinite(json.equals))throw Error('Invalid JSON assertion: equals must be a string, number or boolean.');
  }
  if (assertions.latencyMs !== undefined) integer(assertions.latencyMs, 1, 10000, 'latency assertion');
  let flow;
  if(type==='flow'){
    if(input.flow===undefined)throw Error('A flow monitor needs its flow: intent, steps and required outcomes');
    // A synthetic flow may only visit granted local addresses; a public flow only public targets.
    const synthetic=value=>{if(typeof value!=='string'||value.length>2048||!/^http:\/\/127\.0\.0\.1:[0-9]+\//.test(value))throw Error('Invalid URL');const v=new URL(value);if(v.hostname!=='127.0.0.1'||v.username||v.password||v.hash||v.search||!grants.includes(Number(v.port)))throw Error('Target outside local synthetic grants');return v.href};
    flow=validateFlow(input.flow,{network,startUrl:u.href,synthetic});
    if(probes.length>2)throw Error('A flow runs on at most two probes');
  }
  const maintenanceWindows=validateMaintenanceWindows(input.maintenanceWindows);
  const timing=PROTOCOL_TIMING[type];
  return { ...validateMonitorMetadata(input), name:name.trim(), type, network, url:protocol?settings.url:u?.href??'', ...(protocol?{[type]:settings.settings}:{method}), ...(request?{request}:{}), ...(heartbeat?{heartbeat}:{}), ...(flow?{flow}:{}), probes, ...(assignments?{assignments}:{}), assertions:protocol?{...assertions}:{...assertions,status:assertions.status??200}, intervalMs:timing?integer(input.intervalMs??timing.interval[2],timing.interval[0],timing.interval[1],`interval (${type.toUpperCase()} checks run every ${timing.interval[0]/1000} seconds to ${timing.interval[1]/60000} minutes)`):type==='flow'?integer(input.intervalMs??FLOW_LIMITS.minIntervalMs,FLOW_LIMITS.minIntervalMs,86400000,'interval (a flow runs at most every 5 minutes)'):integer(input.intervalMs??60000,5000,86400000,'interval'), timeoutMs:timing?integer(input.timeoutMs??timing.timeout[2],timing.timeout[0],timing.timeout[1],'timeout'):type==='flow'?integer(input.timeoutMs??FLOW_LIMITS.wallMs,FLOW_LIMITS.minTimeoutMs,FLOW_LIMITS.wallMs,'flow time limit'):integer(input.timeoutMs??2000,50,10000,'timeout'), retries:type==='flow'?integer(input.retries??0,0,1,'flow retries'):integer(input.retries??1,0,2,'retries'), failureQuorum:integer(input.failureQuorum??probes.length,1,probes.length,'failure quorum'), confirmSlots:integer(input.confirmSlots??2,1,10,'confirmation'), recoverSlots:integer(input.recoverSlots??2,1,10,'recovery'), freshnessMs:integer(input.freshnessMs??(timing?Math.min(86400000,Math.max(180000,(input.intervalMs??timing.interval[2])*2)):type==='flow'?Math.min(86400000,Math.max(180000,integer(input.intervalMs??FLOW_LIMITS.minIntervalMs,0,86400000,'interval')*3)):180000),5000,86400000,'freshness'), enabled:input.enabled === undefined ? true : (()=>{if(typeof input.enabled!=='boolean')throw Error('Invalid enabled flag');return input.enabled;})(), maintenanceUntil:integer(input.maintenanceUntil??0,0,Number.MAX_SAFE_INTEGER,'maintenance end'), ...(input.maintenanceWindows!==undefined?{maintenanceWindows}:{}) };
}
// evidenceThrough only admits already accepted target/canary timestamps; it
// never advances freshness ages, heartbeat receipt validity or maintenance.
export function evaluate(def, observations, previous = {}, now = Date.now(), advance = true, evidenceThrough = now) {
  const regions = def.probes.map(probe => {
    const observation = observations.find(o => o.probe === probe);
    const retryComplete=observation?.retryComplete!==false;
    const canary=observation?.canary;
    const canaryFresh=canary?(canary.outcome==='pass'&&canary.completedAt<=evidenceThrough&&now-canary.completedAt<=def.freshnessMs):!def.assignments?.[probe]?.canaryUrl;
    const fresh = canaryFresh && observation && (observation.outcome!=='pass'||retryComplete) && (def.type!=='heartbeat'||observation.outcome!=='pass'||(Number.isFinite(observation.heartbeatReceivedAt)&&observation.heartbeatReceivedAt<=now&&now-observation.heartbeatReceivedAt<=def.heartbeat.maxAgeMs+(def.heartbeat.graceMs??0)&&(!observation.heartbeatJob||heartbeatEvaluation(def,observation.heartbeatJob,now).outcome==='pass'))) && now - observation.completedAt <= def.freshnessMs && observation.completedAt <= evidenceThrough && !['runner_error','interrupted'].includes(observation.outcome);
    return { probe, networkLabel:def.assignments?.[probe]?.networkLabel??'owner-network', canaryPassed:Boolean(canary&&canaryFresh),terminal:Boolean(observation)&&retryComplete&&(observation.outcome!=='target_failure'||observation.attempt===def.retries), state:!fresh?'Unknown':observation.outcome==='pass'?'Healthy':'Failing', observationId:observation?.id??null,observedAt:observation?.completedAt??null };
  });
  const fails=regions.filter(r=>r.state==='Failing').length,unknown=regions.filter(r=>r.state==='Unknown').length;
  const coverageState=unknown?'Incomplete':'Complete';
  const absentLabels=new Set(observations.filter(o=>o.canary&&o.canary.outcome!=='pass').map(o=>def.assignments?.[o.probe]?.networkLabel??'owner-network'));
  // A canary belongs to its whole network label, not just its probe or key.
  // Until every configured-canary peer has a contiguous terminal chain, a
  // missing attempt or a later retry can still exclude that label. Unconfigured
  // probes cannot invalidate a settled witness and need not hold it back.
  const pendingLabels=new Set(regions.filter(r=>def.assignments?.[r.probe]?.canaryUrl&&!r.terminal).map(r=>r.networkLabel));
  const failures=regions.filter(r=>r.state==='Failing'&&r.terminal&&!absentLabels.has(r.networkLabel)&&!pendingLabels.has(r.networkLabel));
  const failingVantages=new Set(failures.map(r=>r.networkLabel)).size;
  const witnessed=failures.some(r=>r.canaryPassed);
  const failedCanary=observations.some(o=>o.canary&&o.canary.outcome!=='pass'&&o.outcome==='target_failure');
  // Assignment-free revisions retain their historical quorum until an owner saves
  // a new revision. New saves always pass assignDefinition's network boundary.
  const legacy=!def.assignments;
  const agreement=legacy?failures.length>=def.failureQuorum:failingVantages>=2||witnessed;
  const candidate=agreement?'Failing':fails||failedCanary?'Degraded':unknown?'Unknown':'Healthy';
  const failureStreak=advance?(candidate==='Failing'?(previous.failureStreak??0)+1:0):(previous.failureStreak??0);
  const recoveryStreak=advance?(candidate==='Healthy'?(previous.recoveryStreak??0)+1:0):(previous.recoveryStreak??0);
  let targetState=candidate;
  if(candidate==='Failing'&&failureStreak<def.confirmSlots)targetState='Degraded';
  if(candidate==='Healthy'&&previous.confirmedFailure&&recoveryStreak<def.recoverSlots)targetState='Recovering';
  const confirmedFailure=targetState==='Failing'||(previous.confirmedFailure&&targetState!=='Healthy');
  const maintenance=Boolean(activeMaintenance(def,now));
  const explanation=policyReason(def,observations,{candidate,targetState,agreement,failureStreak,recoveryStreak,now,evidenceThrough});
  return {state:maintenance?'Maintenance':targetState,targetState,underlyingState:targetState,evidenceState:candidate,coverageState,candidate,regions,denominator:def.probes.length,fails,unknown,failingVantages,failureStreak,recoveryStreak,confirmedFailure,notificationOpen:previous.notificationOpen??false,maintenance,reason:`${explanation}${explanation?' ':''}${fails}/${def.probes.length} selected probes failed; ${unknown} unknown; coverage ${coverageState.toLowerCase()}. ${failingVantages} independent failing vantages; passing external check ${regions.some(r=>r.canaryPassed)?'present':'absent'}; scheduled-slot confirmation ${Math.min(failureStreak,def.confirmSlots)}/${def.confirmSlots}; recovery ${Math.min(recoveryStreak,def.recoverSlots)}/${def.recoverSlots}.`,evaluatedAt:now};
}

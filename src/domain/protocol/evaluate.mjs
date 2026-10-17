import {heartbeatEvaluation} from '../heartbeat-job.mjs';
import {RESOLVERS,normalizeValue} from './dns.mjs';
// One evaluation for protocol evidence: the Worker and the runner produce their checks with it, and the control plane runs
// it again on the retained facts and refuses evidence whose checks or outcome differ. Facts are bounded (see evidence.server.ts).
const DAY=86400000;
const day=at=>new Date(at).toISOString().slice(0,10);
const clip=text=>text.length>300?text.slice(0,299)+'…':text;
const check=(assertion,pass,reason)=>({assertion,pass,reason:clip(reason)});
const daysLeft=(until,at)=>Math.floor((until-at)/DAY);
const plural=(n,word)=>`${n} ${word}${n===1?'':'s'}`;
function tcp(definition,facts){
 const s=definition.tcp,checks=[check('connect',true,`Connected to ${facts.address}:${s.port} in ${facts.connectMs} ms`)];
 if(s.readBanner){
  const shown=facts.banner?`“${facts.banner.slice(0,80)}”`:facts.bannerNote??'no banner';
  checks.push(s.bannerIncludes===undefined?check('banner',true,`Banner: ${shown}`):check('banner',Boolean(facts.banner?.includes(s.bannerIncludes)),`Banner ${facts.banner?.includes(s.bannerIncludes)?'contains':'does not contain'} “${s.bannerIncludes}”: ${shown}`));
 }
 if(definition.assertions.latencyMs!==undefined)checks.push(check('latency',facts.connectMs<=definition.assertions.latencyMs,`Connected in ${facts.connectMs} ms (limit ${definition.assertions.latencyMs} ms)`));
 return checks;
}
function tls(definition,facts,at){
 const cert=facts.certificate,issuer=cert.issuer.cn??cert.issuer.o??'an unnamed issuer',checks=[];
 if(facts.trusted!==null)checks.push(check('trust',facts.trusted,facts.trusted?`Chain trusted: ${plural(facts.chainLength,'certificate')}, issued by ${issuer}`:`Chain not trusted${facts.verifyError?` (${facts.verifyError})`:''}; issued by ${issuer}`));
 const names=cert.dnsNames.length?cert.dnsNames.join(', '):cert.subject.cn??'no names';
 checks.push(check('hostname',facts.hostnameMatch,`Certificate for ${names} ${facts.hostnameMatch?'covers':'does not cover'} ${definition.tls.host}`));
 const left=daysLeft(cert.notAfter,at);
 checks.push(check('validity',cert.notBefore<=at&&at<=cert.notAfter,at<cert.notBefore?`Certificate not valid until ${day(cert.notBefore)}`:at>cert.notAfter?`Certificate expired on ${day(cert.notAfter)}`:`Valid until ${day(cert.notAfter)} (${plural(left,'day')} left)`));
 if(definition.assertions.latencyMs!==undefined)checks.push(check('latency',facts.handshakeMs<=definition.assertions.latencyMs,`TLS handshake in ${facts.handshakeMs} ms (limit ${definition.assertions.latencyMs} ms)`));
 return checks;
}
const shownValues=values=>values.length?values.map(v=>v.length>60?v.slice(0,59)+'…':v).join(', '):'no records';
function sameSet(a,b){return a.length===b.length&&a.every(v=>b.includes(v))}
function matches(values,answers,match){return match==='includes'?values.every(v=>answers.includes(v)):sameSet(values,answers)}
// A resolver's verdict on the owner's expectation. `approved` values pass only the value condition they describe.
function resolverVerdict(s,r){
 const name=RESOLVERS[r.id].name,type=s.recordType;
 if(r.status==='unavailable')return {pass:false,infrastructure:true,reason:`${name}: monitor infrastructure fault, ${r.detail} (${r.ms} ms); this is not evidence about the record`};
 const answered=r.status==='answer'&&r.answers.length>0;
 if(s.expect?.absent){
  const absent=r.status==='nxdomain'||(r.status==='answer'&&!r.answers.length);
  return {pass:absent,reason:`${name}: ${absent?`no ${type} record, as expected`:r.status==='answer'?`${type} ${shownValues(r.answers)} present; expected none`:failure(r,type)}`};
 }
 if(!answered)return {pass:false,reason:`${name}: ${r.status==='answer'?`no ${type} records (a missing answer is not success)`:failure(r,type)}`};
 if(!s.expect)return {pass:true,reason:`${name}: ${type} ${shownValues(r.answers)} in ${r.ms} ms`};
 const expected=s.expect.values.map(v=>normalizeValue(type,v)),approved=s.approved?.values.map(v=>normalizeValue(type,v));
 if(matches(expected,r.answers,s.expect.match))return {pass:true,reason:`${name}: ${type} ${shownValues(r.answers)} matches the expected values (${r.ms} ms)`};
 if(approved&&matches(approved,r.answers,s.expect.match))return {pass:true,reason:`${name}: ${type} ${shownValues(r.answers)} matches the owner-approved change (${r.ms} ms)`};
 return {pass:false,reason:`${name}: ${type} changed: ${shownValues(r.answers)}; expected ${s.expect.match==='includes'?'to include ':''}${shownValues(expected)}`};
}
function failure(r,type){
 if(r.status==='nxdomain')return 'NXDOMAIN: the name does not exist';
 if(r.status==='servfail')return 'SERVFAIL: the resolver could not get an answer from the name’s servers';
 if(r.status==='refused')return 'REFUSED: the resolver refused the query';
 return `answer code ${r.rcode} for ${type}`;
}
function dns(definition,facts){
 const s=definition.dns,checks=[];let infrastructure=false;
 for(const r of facts.resolvers){const v=resolverVerdict(s,r);infrastructure||=Boolean(v.infrastructure);checks.push(check(`resolver:${r.id}`,v.pass,v.reason))}
 const answering=facts.resolvers.filter(r=>r.status!=='unavailable');
 if(facts.resolvers.length>1&&answering.length>1){
  // Resolvers can legitimately return different records (geographic answers); that differs from disagreeing about the
  // outcome. Different answer codes, or different values where exact values are expected, is a propagation difference.
  const [a,...others]=answering,codes=others.some(b=>a.status!==b.status),values=others.some(b=>!sameSet(a.answers,b.answers)),exact=s.expect?.match==='exact';
  const shown=answering.map(r=>`${RESOLVERS[r.id].name} ${r.status==='answer'?shownValues(r.answers):r.status.toUpperCase()}`).join('; ');
  checks.push(check('agreement',!(codes||(values&&exact)),codes||values?`Resolvers disagree: ${shown}`:'Resolvers agree'));
 }
 if(definition.assertions.latencyMs!==undefined){const slowest=Math.max(...facts.resolvers.map(r=>r.ms));checks.push(check('latency',slowest<=definition.assertions.latencyMs,`Slowest resolver answered in ${slowest} ms (limit ${definition.assertions.latencyMs} ms)`))}
 return {checks,infrastructure};
}
function domain(definition,facts,at){
 const host=url=>{try{return new URL(url).hostname}catch{return 'the registry'}};
 if(!facts.registered)return {checks:[check('registration',false,`The registry (${host(facts.source)}) has no record of ${facts.name}`)]};
 const updated=facts.sourceUpdatedAt?`registry data updated ${day(facts.sourceUpdatedAt)}`:'registry update time not published';
 if(facts.redacted||facts.expiresAt===null)return {checks:[check('registration',false,`Unknown: ${host(facts.source)} ${facts.redacted?'redacts':'does not publish'} the expiry date for ${facts.name}; an unknown date is never treated as registered`)],unknown:true};
 if(facts.conflict)return {checks:[check('registration',false,`Unknown: sources disagree on the expiry date (registry ${day(facts.expiresAt)}, registrar ${day(facts.registrar.expiresAt)})`)],unknown:true};
 if(facts.expiresAt<=at)return {checks:[check('registration',false,`Registration expired on ${day(facts.expiresAt)} (${host(facts.source)}, ${updated})`)]};
 return {checks:[check('registration',true,`Registered until ${day(facts.expiresAt)} (${plural(daysLeft(facts.expiresAt,at),'day')} left; ${host(facts.source)}, ${updated}${facts.registrar?.expiresAt!=null?'; registrar agrees':facts.registrar?'; registrar record unavailable':''})`)]};
}
/** {checks, outcome} for one protocol attempt's facts at completion time `at`. */
export function protocolChecks(definition,facts,at){
 const type=definition.type;
 if(type==='tcp'||type==='tls'){const checks=type==='tcp'?tcp(definition,facts):tls(definition,facts,at);return {checks,outcome:checks.every(c=>c.pass)?'pass':'target_failure'}}
 if(type==='dns'){const {checks,infrastructure}=dns(definition,facts);return {checks,outcome:infrastructure?'runner_error':checks.every(c=>c.pass)?'pass':'target_failure'}}
 if(type==='domain'){const {checks,unknown}=domain(definition,facts,at);return {checks,outcome:unknown?'runner_error':checks.every(c=>c.pass)?'pass':'target_failure'}}
 throw Error('Not a protocol monitor');
}
/** What an observation says expires and when (TLS-001's certificate or DOMAIN-001's registration), or null. */
export function expiryOf(definition,observation){
 const facts=observation?.protocol;
 if(!facts||observation.outcome==='runner_error')return null;
 if(definition.type==='tls'&&facts.certificate){
  const c=facts.certificate;
  return {subject:c.fingerprint256.replace(/:/g,'').toLowerCase(),expiresAt:c.notAfter,valid:observation.checks.every(x=>x.pass),
   label:`the certificate for ${(c.dnsNames.length?c.dnsNames:[c.subject.cn??definition.tls.host]).slice(0,3).join(', ')} issued by ${c.issuer.cn??c.issuer.o??'an unnamed issuer'} (SHA-256 ${c.fingerprint256.slice(0,23)}…)`};
 }
 if(definition.type==='domain'&&facts.registered&&facts.expiresAt!==null&&!facts.redacted&&!facts.conflict)
  return {subject:`${facts.name}:${facts.expiresAt}`,expiresAt:facts.expiresAt,valid:observation.checks.every(x=>x.pass),label:`the registration of ${facts.name}`};
 return null;
}
/** An observation's checks and outcome evaluated at its own completion time: a runner re-evaluates after moving its
 * timestamps into the control plane's clock, because a validity or day boundary can fall between the two clocks. */
export const evaluatedAt=(definition,o)=>o.heartbeatJob?(({outcome,checks})=>({...o,outcome,checks}))(heartbeatEvaluation(definition,o.heartbeatJob,o.completedAt)):o.protocol===undefined?o:{...o,...protocolChecks(definition,o.protocol,o.completedAt)};

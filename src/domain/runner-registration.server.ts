import {HOSTED_RUNNER_ID,hostedHttp,hostedInstallation,ownOrigin,SELF_CHECK_REFUSAL} from './hosted-runner.ts'
import {same,sign,type Bindings} from './control.server.ts'
import {externalCheckUrl,EXTERNAL_CHECK_ABSENT} from './external-check.server.ts'
// @ts-expect-error Base authenticated encryption; separate product purpose.
import {keyedHash,seal,unseal} from '../base/modules/operator-auth/identity/oidc/crypto.mjs'
// @ts-ignore Edition URL validation is JavaScript.
import {publicTarget} from './public-target.mjs'
// @ts-ignore Shared bounded runner capability vocabulary.
import {validRunnerCapabilities,runnerCapabilities} from './runner-capabilities.mjs'
export type Runner={runner_id:string;registered_at:number;network_label:string;key_ciphertext:string|null;legacy_key:number;revoked_at:number|null;last_contact_at:number|null;capabilities?:string}
const runnerOrder=`CASE runner_id WHEN '${HOSTED_RUNNER_ID}' THEN 0 ELSE 1 END,registered_at,runner_id`
const label=(value:unknown)=>{if(typeof value!=='string'||!value.trim()||value.length>80||/[\x00-\x1f\x7f]/.test(value))throw Error('Network label required (80 characters max)');return value.trim()}
async function custody(env:Bindings){if(!env.SESSION_SECRET||env.SESSION_SECRET.length<32)throw Error('Runner key custody unavailable');return keyedHash(env.SESSION_SECRET,'uptime-runner-keys','aes-gcm-v1')}
export async function runnerIdentity(env:Bindings){return env.DB.prepare('SELECT * FROM runners WHERE legacy_key=1').first<Runner>()}
export function firstRunnerStatements(env:Bindings){
 return [
  ...(hostedInstallation(env)?[env.DB.prepare("INSERT OR IGNORE INTO runners(runner_id,registered_at,network_label,legacy_key) VALUES(?,?,'Cloudflare Worker',0)").bind(HOSTED_RUNNER_ID,Date.now())]:[]),
  env.DB.prepare("INSERT INTO runners(runner_id,registered_at,network_label,legacy_key) SELECT ?,?,'owner-network',1 WHERE NOT EXISTS(SELECT 1 FROM runners WHERE legacy_key=1)").bind(`self-${crypto.randomUUID()}`,Date.now()),
 ]
}
export async function ensureFirstRunner(env:Bindings){
 const rows=await env.DB.batch([...firstRunnerStatements(env),env.DB.prepare('SELECT * FROM runners WHERE legacy_key=1')]);
 return rows.at(-1)!.results[0] as Runner
}
export async function runnerKey(env:Bindings,row:Runner){
 if(row.runner_id===HOSTED_RUNNER_ID||row.revoked_at!==null)return null;
 if(row.legacy_key)return env.UPTIME_RUNNER_KEY?.length>=24?env.UPTIME_RUNNER_KEY:null;
 try{const value=await unseal(await custody(env),JSON.stringify(['uptime-runner-key-v1',row.runner_id,row.registered_at]),row.key_ciphertext);return typeof value.key==='string'?value.key:null}catch{return null}
}
export async function authenticateRunner(env:Bindings,id:string|undefined,key:string){
 const row=id?await env.DB.prepare('SELECT * FROM runners WHERE runner_id=?').bind(id).first<Runner>():await runnerIdentity(env);
 if(!row){if(!id&&env.UPTIME_RUNNER_KEY?.length>=24&&await same(key,env.UPTIME_RUNNER_KEY))return {runner_id:'',registered_at:0,network_label:'owner-network',key_ciphertext:null,legacy_key:1,revoked_at:null,last_contact_at:null};return null}
 const expected=await runnerKey(env,row);return expected&&await same(key,expected)?row:null
}
export async function enrollRunner(env:Bindings,text:string,timestamp:string,signature:string,row:Runner){
 const key=await runnerKey(env,row);
 if(!key||text.length>512||!/^\d{13}$/.test(timestamp)||Math.abs(Date.now()-Number(timestamp))>60000||!await same(signature,await sign(key,`${timestamp}.runner-enrolment.${text}`)))return null;
 let input;try{input=JSON.parse(text)}catch{return null}
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['version','networkLabel','capabilities'].includes(k))||input.version!==1)return null;
 if(input.capabilities!==undefined&&!validRunnerCapabilities(input.capabilities))return null;
 // Provisioned labels cannot be rewritten by a compromised runner key.
 if(input.networkLabel!==undefined&&label(input.networkLabel)!==row.network_label)return null;
 if(!row.runner_id)row=await ensureFirstRunner(env);
 // A runner reports what it can run each time it enrols; a flow assigned to one without a browser stays Unknown (see docs/runner.md).
 if(input.capabilities!==undefined)await env.DB.prepare('UPDATE runners SET capabilities=? WHERE runner_id=?').bind(JSON.stringify(input.capabilities),row.runner_id).run();
 return {runnerId:row.runner_id,registeredAt:row.registered_at,networkLabel:row.network_label,scope:'self-runner'}
}
export async function createRunner(env:Bindings,input:any){
 if(!input||Object.keys(input).some(k=>k!=='networkLabel'))throw Error('Invalid runner settings');
 await ensureFirstRunner(env);
 const networkLabel=label(input.networkLabel),runnerId=`self-${crypto.randomUUID()}`,registeredAt=Date.now(),key=crypto.randomUUID()+crypto.randomUUID();
 const ciphertext=await seal(await custody(env),JSON.stringify(['uptime-runner-key-v1',runnerId,registeredAt]),{key});
 await env.DB.prepare('INSERT INTO runners(runner_id,registered_at,network_label,key_ciphertext) VALUES(?,?,?,?)').bind(runnerId,registeredAt,networkLabel,ciphertext).run();
 return {runnerId,networkLabel,key}
}
export async function revokeRunner(env:Bindings,id:string){if(id===HOSTED_RUNNER_ID)throw Error('The hosted Worker has no runner key to revoke');const result=await env.DB.prepare('UPDATE runners SET revoked_at=?,key_ciphertext=NULL WHERE runner_id=? AND revoked_at IS NULL').bind(Date.now(),id).run();if(!result.meta.changes)throw Error('Active runner not found');return {revoked:true}}
export const runnerListQuery=`SELECT runner_id AS runnerId,network_label AS networkLabel,registered_at AS registeredAt,revoked_at AS revokedAt,last_contact_at AS lastContactAt,capabilities FROM runners ORDER BY ${runnerOrder}`
export const describeRunners=(rows:any[])=>rows.map(r=>({...r,hosted:r.runnerId===HOSTED_RUNNER_ID,capabilities:runnerCapabilities(r.capabilities)}))
export async function listRunners(env:Bindings){return describeRunners((await env.DB.prepare(runnerListQuery).all()).results)}
export async function assignDefinition(env:Bindings,definition:any,input:any){
 const first=await ensureFirstRunner(env),rows=(await env.DB.prepare(`SELECT * FROM runners ORDER BY ${runnerOrder}`).all<Runner>()).results;
 return assignRunners(rows,first.runner_id,definition,input,await externalCheckUrl(env),env.RER_DEMO!=='1',env.UPTIME_ORIGIN);
}
// The pure assignment step, shared by saving and by a definition-file preview that must not write. `external` is the
// installation's External check URL: an enabled public monitor or local HTTP practice monitor on one network takes it.
// Ephemeral demo mode never adds a public request to its closed synthetic fixture.
// Two addresses are the same site when their hostnames match exactly, ignoring case, a leading `www.` and a trailing dot:
// example.com and www.example.com are one site, while status.example.com and example.com are not. Ports and paths do not
// matter: an outage on the host takes every page and port on it down for the owner's purposes.
const site=(value:string)=>new URL(value).hostname.toLowerCase().replace(/\.$/,'').replace(/^www\./,'')
export const sameSite=(a:string,b:string)=>site(a)===site(b)
// A check on the monitored site fails whenever the monitor does, so the monitor could never be confirmed as Failing.
function sameSiteRefusal(url:string,own:boolean){
 return Error(`The external check URL ${url} is the same site as this monitor, so an outage there could never be confirmed. ${own?'Choose an external check URL on a different site for this check.':'Choose a different external check URL on Runner / archive, or set one for this check.'}`)
}
export function assignRunners(rows:Runner[],firstRunnerId:string,definition:any,input:any,external:string|null=null,syntheticCanary=true,appOrigin?:string){
 const assignments:Record<string,any>={};
 const available=rows.filter(r=>r.revoked_at===null&&(r.runner_id!==HOSTED_RUNNER_ID||hostedHttp(definition)));
 const hosted=hostedHttp(definition)?available.find(r=>r.runner_id===HOSTED_RUNNER_ID):undefined;
 if(input.assignments!==undefined&&(!input.assignments||Array.isArray(input.assignments)||Object.keys(input.assignments).some(k=>!definition.probes.includes(k))))throw Error('Invalid probe assignments');
 for(const [i,probe] of definition.probes.entries()){
  const requested=input.assignments?.[probe],runnerId=typeof requested==='string'?requested:requested?.runnerId??hosted?.runner_id??available[i%available.length]?.runner_id??firstRunnerId;
  const row=rows.find(r=>r.runner_id===runnerId);if(runnerId===HOSTED_RUNNER_ID&&(!hostedHttp(definition)||definition.intervalMs<60000))throw Error('Worker checks require supported public checks, default certificate trust, no runner-local credentials, and an interval of at least one minute. Choose a private runner for other checks');if(!row||(definition.enabled&&row.revoked_at!==null))throw Error('Probe requires an active assigned runner');
  if(definition.enabled&&definition.network==='private'&&capabilitiesOf(row.capabilities).privateNetwork!==true)throw Error('Private checks require an enrolled runner with private-network grants. Update and restart that runner, then save again');
  if(definition.enabled&&runnerId===HOSTED_RUNNER_ID&&ownOrigin(definition.url,appOrigin))throw Error(SELF_CHECK_REFUSAL);
  const canaryUrl=requested?.canaryUrl??input.canaryUrl;
  const href=canaryUrl?publicTarget(canaryUrl).href:null;
  if(href&&definition.enabled&&definition.url&&sameSite(href,definition.url))throw sameSiteRefusal(href,true);
  assignments[probe]={runnerId,networkLabel:row.network_label,...(href?{canaryUrl:href}:{})};
 }
 const labels=new Set(Object.values(assignments).map((a:any)=>a.networkLabel));
 const needsCanary=['public','private'].includes(definition.network)||(syntheticCanary&&definition.network==='synthetic'&&['http','keyword'].includes(definition.type));
 if(definition.enabled&&needsCanary&&labels.size<2&&!Object.values(assignments).some((a:any)=>a.canaryUrl)){
  if(!external)throw Error(`Production monitor requires two network vantages or an external check URL. ${EXTERNAL_CHECK_ABSENT}`);
  const href=publicTarget(external).href;
  if(definition.url&&sameSite(href,definition.url))throw sameSiteRefusal(href,false);
  for(const assignment of Object.values(assignments) as any[])assignment.canaryUrl=href;
 }
 for(const assignment of Object.values(assignments) as any[])if(definition.enabled&&assignment.runnerId===HOSTED_RUNNER_ID&&assignment.canaryUrl&&ownOrigin(assignment.canaryUrl,appOrigin))throw Error(SELF_CHECK_REFUSAL);
 return {...definition,assignments}
}

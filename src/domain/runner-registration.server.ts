import {same,sign,type Bindings} from './control.server.ts'
// @ts-expect-error Base authenticated encryption; separate product purpose.
import {keyedHash,seal,unseal} from '../base/modules/operator-auth/identity/oidc/crypto.mjs'
// @ts-ignore Edition URL validation is JavaScript.
import {publicTarget} from './public-target.mjs'
export type Runner={runner_id:string;registered_at:number;network_label:string;key_ciphertext:string|null;legacy_key:number;revoked_at:number|null;last_contact_at:number|null}
const label=(value:unknown)=>{if(typeof value!=='string'||!value.trim()||value.length>80||/[\x00-\x1f\x7f]/.test(value))throw Error('Network label required (80 characters max)');return value.trim()}
async function custody(env:Bindings){if(!env.SESSION_SECRET||env.SESSION_SECRET.length<32)throw Error('Runner key custody unavailable');return keyedHash(env.SESSION_SECRET,'uptime-runner-keys','aes-gcm-v1')}
export async function runnerIdentity(env:Bindings){return env.DB.prepare('SELECT * FROM runners WHERE legacy_key=1').first<Runner>()}
export async function ensureFirstRunner(env:Bindings){
 await env.DB.prepare("INSERT INTO runners(runner_id,registered_at,network_label,legacy_key) SELECT ?,?,'owner-network',1 WHERE NOT EXISTS(SELECT 1 FROM runners WHERE legacy_key=1)").bind(`self-${crypto.randomUUID()}`,Date.now()).run();return (await runnerIdentity(env))!
}
export async function runnerKey(env:Bindings,row:Runner){
 if(row.revoked_at!==null)return null;
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
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['version','networkLabel'].includes(k))||input.version!==1)return null;
 // Provisioned labels cannot be rewritten by a compromised runner key.
 if(input.networkLabel!==undefined&&label(input.networkLabel)!==row.network_label)return null;
 if(!row.runner_id)row=await ensureFirstRunner(env);
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
export async function revokeRunner(env:Bindings,id:string){const result=await env.DB.prepare('UPDATE runners SET revoked_at=?,key_ciphertext=NULL WHERE runner_id=? AND revoked_at IS NULL').bind(Date.now(),id).run();if(!result.meta.changes)throw Error('Active runner not found');return {revoked:true}}
export async function listRunners(env:Bindings){return (await env.DB.prepare('SELECT runner_id AS runnerId,network_label AS networkLabel,registered_at AS registeredAt,revoked_at AS revokedAt,last_contact_at AS lastContactAt FROM runners ORDER BY registered_at,runner_id').all()).results}
export async function assignDefinition(env:Bindings,definition:any,input:any){
 const first=await ensureFirstRunner(env),rows=(await env.DB.prepare('SELECT * FROM runners ORDER BY registered_at,runner_id').all<Runner>()).results;
 const assignments:Record<string,any>={};
 if(input.assignments!==undefined&&(!input.assignments||Array.isArray(input.assignments)||Object.keys(input.assignments).some(k=>!definition.probes.includes(k))))throw Error('Invalid probe assignments');
 for(const [i,probe] of definition.probes.entries()){
  const requested=input.assignments?.[probe],runnerId=typeof requested==='string'?requested:requested?.runnerId??rows.filter(r=>r.revoked_at===null)[i%rows.filter(r=>r.revoked_at===null).length]?.runner_id??first.runner_id;
  const row=rows.find(r=>r.runner_id===runnerId);if(!row||(definition.enabled&&row.revoked_at!==null))throw Error('Probe requires an active assigned runner');
  const canaryUrl=requested?.canaryUrl??input.canaryUrl;
  assignments[probe]={runnerId,networkLabel:row.network_label,...(canaryUrl?{canaryUrl:publicTarget(canaryUrl).href}:{})};
 }
 const labels=new Set(Object.values(assignments).map((a:any)=>a.networkLabel));
 if(definition.enabled&&definition.network==='public'&&labels.size<2&&!Object.values(assignments).some((a:any)=>a.canaryUrl))throw Error('Production monitor requires two network vantages or a canary URL');
 return {...definition,assignments}
}

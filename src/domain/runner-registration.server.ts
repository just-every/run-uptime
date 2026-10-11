import {same,sign,type Bindings} from './control.server.ts'

export async function runnerIdentity(env:Bindings){
 return env.DB.prepare('SELECT runner_id,registered_at FROM runner_registration WHERE id=1').first<{runner_id:string;registered_at:number}>();
}

export async function validRunnerIdentity(env:Bindings,id:string){
 if(!/^self-[0-9a-f-]{36}$/.test(id))return false;
 const registered=await runnerIdentity(env);
 return Boolean(registered&&await same(id,registered.runner_id));
}

export async function enrollRunner(env:Bindings,text:string,timestamp:string,signature:string){
 // Purpose separation prevents a result signature from becoming enrolment authority.
 if(text.length>256||!/^\d{13}$/.test(timestamp)||Math.abs(Date.now()-Number(timestamp))>60000||
  !await same(signature,await sign(env.UPTIME_RUNNER_KEY,`${timestamp}.runner-enrolment.${text}`)))return null;
 let input;try{input=JSON.parse(text)}catch{return null}
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==1||input.version!==1)return null;
 await env.DB.prepare('INSERT OR IGNORE INTO runner_registration(id,runner_id,registered_at) VALUES(1,?,?)').bind(`self-${crypto.randomUUID()}`,Date.now()).run();
 const row=await runnerIdentity(env);
 if(!row)throw Error('Runner registration unavailable');
 return {runnerId:row.runner_id,registeredAt:row.registered_at,scope:'self-runner'};
}

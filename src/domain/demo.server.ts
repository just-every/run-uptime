import type {Bindings} from './control.server.ts'

/** Demo authority comes only from container bindings, never from a request. */
export async function demoBindings(env:Bindings):Promise<Bindings>{
 if(env.RER_DEMO!=='1')return env
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.SESSION_SECRET!),{name:'HMAC',hash:'SHA-256'},false,['sign'])
 const signature=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('uptime-demo-runner-v1'))
 return {...env,UPTIME_RUNNER_KEY:env.UPTIME_RUNNER_KEY??Array.from(new Uint8Array(signature),v=>v.toString(16).padStart(2,'0')).join(''),
  // The front supplies the exact originVar; keep production's explicit claim binding mandatory.
  ...(env.RER_OWNER_CLAIM_PUBLIC_KEYS?{RER_OWNER_CLAIM_APP_ORIGIN:env.RER_OWNER_CLAIM_APP_ORIGIN??env.UPTIME_ORIGIN}:{}),
  MAIL_PROVIDER:'development',MAIL_FROM:env.MAIL_FROM??'Uptime demo <demo@demo.invalid>'}
}

/** Authenticated runner reports contain only method and host, never URL paths or credentials. */
export async function recordDemoBlocked(env:Bindings,input:any){
 if(env.RER_DEMO!=='1')throw Object.assign(Error('Not found'),{status:404})
 if(!input||Object.keys(input).some(k=>!['method','host'].includes(k))||!['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS','CONNECT','WEBSOCKET'].includes(input.method)||typeof input.host!=='string'||input.host.length>255||!/^[a-zA-Z0-9.\-:[\]]+$/.test(input.host))throw Error('Invalid demo refusal')
 await env.DB.prepare('INSERT INTO rer_demo_outbound(at,method,host) VALUES(?,?,?)').bind(Date.now(),input.method,input.host).run()
 return {blocked:true}
}

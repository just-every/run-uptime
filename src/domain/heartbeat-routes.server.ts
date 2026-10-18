import {receiveHeartbeat} from './heartbeat.server.ts'

/** Receipt bodies are bounded by the ingress middleware; URL capability paths
 * deliberately work with schedulers that can send only GET or HEAD. */
export function registerHeartbeatReceipts(api:any){
 for(const base of ['/api/heartbeats/:id','/api/heartbeats/:id/url/:token']){
  for(const [suffix,state] of [['','success'],['/success','success'],['/start','start'],['/fail','fail'],['/fail/:exitCode','fail']] as const){
   for(const method of ['get','post'] as const)api[method](base+suffix,async(c:any)=>{
    const text=c.get('requestText')??'';
    if(new TextEncoder().encode(text).byteLength>10240)return c.json({error:'Heartbeat body exceeds 10 KiB'},413);
    let body:any={};
    if(text){
     if(c.req.header('content-type')==='application/json'){
      try{body=JSON.parse(text)}catch{return c.json({error:'Invalid heartbeat JSON'},400)}
     }else if(state==='fail')body={output:text};
     else return c.json({error:'Start and success pings take an empty body or JSON object'},400);
    }
    const result=await receiveHeartbeat(c.env,c.req.param('id'),c.req.header('authorization')??'',c.req.header('x-heartbeat-sequence')??'',state,c.req.param('exitCode')===undefined?null:Number(c.req.param('exitCode')),body,c.req.param('token'));
    c.header('referrer-policy','no-referrer');return c.json(result);
   });
  }
 }
}

import script from 'virtual:uptime-runner'
// The location runner, the same open-source script for every installation (scripts/build/runner-script.ts). The console's Add
// location command downloads it and starts it with this installation's address and a one-time join key.
export function runnerScriptResponse(request:Request){
 if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{allow:'GET, HEAD'}})
 return new Response(request.method==='HEAD'?null:script,{headers:{'content-type':'text/javascript; charset=utf-8','cache-control':'no-cache','x-content-type-options':'nosniff'}})
}

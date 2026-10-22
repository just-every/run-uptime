// Local dev only: distinguish time inside the Worker/D1 from Vite and proxy queues.
// Request-scoped proxies retain no rows, SQL, parameters or credentials.
type Timing = {calls:number;ms:number}
export async function developmentTiming(env:any,operation:(bindings:any)=>Promise<Response>){
 const started=performance.now(),groups=new Map<string,Timing>(),originals=new WeakMap<object,D1PreparedStatement>();
 const label=(sql:string)=>{
  const tables=[...sql.matchAll(/\b(?:FROM|JOIN|UPDATE|INTO)\s+([a-z_][a-z0-9_]*)/gi)].map(match=>match[1].toLowerCase());
  return tables.find(table=>table.startsWith('oa_'))??tables[0]??'other';
 };
 const timed=async<T>(name:string,calls:number,read:()=>Promise<T>)=>{
  const before=performance.now();try{return await read()}finally{const group=groups.get(name)??{calls:0,ms:0};group.calls+=calls;group.ms+=performance.now()-before;groups.set(name,group)}
 };
 const wrap=(statement:D1PreparedStatement,name:string):D1PreparedStatement=>{
  const proxy=new Proxy(statement,{get(target,key){
   if(key==='bind')return (...values:any[])=>wrap(target.bind(...values),name);
   const value=Reflect.get(target,key);
   if(['first','all','run','raw'].includes(String(key)))return (...args:any[])=>timed(name,1,()=>value.apply(target,args));
   return typeof value==='function'?value.bind(target):value;
  }});originals.set(proxy,statement);return proxy;
 };
 const db=new Proxy(env.DB,{get(target,key){
  if(key==='prepare')return (sql:string)=>wrap(target.prepare(sql),label(sql));
  if(key==='batch')return (statements:D1PreparedStatement[])=>timed('batch',statements.length,()=>target.batch(statements.map(statement=>originals.get(statement)??statement)));
  const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
 }});
 const response=await operation({...env,DB:db}),headers=new Headers(response.headers);
 const timing=[`worker;dur=${(performance.now()-started).toFixed(1)}`,...[...groups].map(([name,value])=>`d1_${name};dur=${value.ms.toFixed(1)};desc="${value.calls} statements"`)];
 headers.append('server-timing',timing.join(', '));
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

import {invocation,notTools,protocolVersion,tools} from './registry.ts'

const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)
const only=(value:Record<string,unknown>,keys:string[])=>Object.keys(value).every(key=>keys.includes(key))
const empty=(value:unknown)=>value===undefined||object(value)&&Object.keys(value).length===0
const clientInfo=(value:unknown)=>object(value)&&typeof value.name==='string'&&value.name.length>0&&typeof value.version==='string'&&value.version.length>0
const method=(group:string,verb:string)=>[group,verb].join('/')

// The native request boundary authenticates each message before this stateless
// discovery handler runs. No tool adapter or product operation is dispatched here.
export function discovery(request:Request,input:unknown):Response{
 const headers={'cache-control':'no-store, private'}
 if(request.method!=='POST')return new Response(null,{status:405,headers:{...headers,allow:'POST'}})
 const version=request.headers.get('mcp-protocol-version')
 if(version&&version!==protocolVersion)return Response.json({error:'Unsupported MCP protocol version'},{status:400,headers})
 const accept=request.headers.get('accept')??'*/*'
 if(!accept.split(',').some(type=>['application/json','*/*'].includes(type.trim().split(';')[0])))return Response.json({error:'JSON response acceptance required'},{status:406,headers})
 const id=object(input)&&(typeof input.id==='string'||typeof input.id==='number'&&Number.isSafeInteger(input.id))?input.id:null
 const error=(code:number,message:string)=>Response.json({jsonrpc:'2.0',id,error:{code,message}},{headers})
 const result=(result:unknown)=>Response.json({jsonrpc:'2.0',id,result},{headers})
 if(!object(input)||!only(input,['jsonrpc','id','method','params'])||input.jsonrpc!=='2.0'||typeof input.method!=='string'||('id'in input&&id===null))return error(-32600,'Invalid JSON-RPC request')
 if(input.method===method('notifications','initialized')){
  if('id'in input||!empty(input.params))return error(-32600,'Invalid initialized notification')
  return new Response(null,{status:202,headers})
 }
 if(!('id'in input))return error(-32600,'A request id is required')
 if(input.method==='initialize'){
  const params=input.params
  if(!object(params)||!only(params,['protocolVersion','capabilities','clientInfo'])||typeof params.protocolVersion!=='string'||!params.protocolVersion||!object(params.capabilities)||!clientInfo(params.clientInfo))return error(-32602,'Invalid initialization parameters')
  return result({protocolVersion,capabilities:{tools:{listChanged:false}},serverInfo:{name:'Uptime',version:'1'},instructions:'Discovery only. Every tool invocation is refused until native adapters and company-policy enforcement exist.',_meta:{discoveryOnly:true,invocation,notTools}})
 }
 if(input.method===method('tools','list')){
  if(!empty(input.params))return error(-32602,'This registry has no pagination parameters')
  return result({tools,_meta:{discoveryOnly:true,invocation,notTools}})
 }
 if(input.method===method('tools','call')){
  const params=input.params
  if(!object(params)||!only(params,['name','arguments','_meta'])||typeof params.name!=='string'||!tools.some(tool=>tool.name===params.name)||(params.arguments!==undefined&&!object(params.arguments)))return error(-32602,'Invalid tool invocation parameters')
  return result({isError:true,content:[{type:'text',text:invocation.reason}],_meta:{invocation}})
 }
 if(input.method==='ping'&&empty(input.params))return result({})
 return error(-32601,'Method not available')
}

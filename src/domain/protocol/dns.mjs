// DNS-001 lookups over DNS over HTTPS against named public recursive resolvers. The Worker and the runner run the same
// code with their own `get` transport, so both report the same bounded evidence: each resolver's answer code, its
// normalised records and its response time.
export const RESOLVERS={
 cloudflare:{name:'Cloudflare',url:'https://cloudflare-dns.com/dns-query'},
 google:{name:'Google',url:'https://dns.google/resolve'},
};
export const RECORD_TYPES=['A','AAAA','CNAME','MX','TXT','NS','SOA','SRV','CAA'];
const CODES={A:1,AAAA:28,CNAME:5,MX:15,TXT:16,NS:2,SOA:6,SRV:33,CAA:257};
export const MAX_ANSWERS=10,MAX_VALUE=255;
const host=v=>v.toLowerCase().replace(/\.$/,'');
const unquote=v=>{const parts=[...v.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(m=>m[1].replace(/\\(.)/g,'$1'));return parts.length?parts.join(''):v};
/** One record (or an owner's expected value) in the form both resolvers and the owner's settings compare in. SOA compares
 * its primary name server and responsible mailbox; the serial and timers change on every zone edit. */
export function normalizeValue(type,value){
 const v=String(value).trim().replace(/\s+/g,' ');
 const fieldsOf=n=>v.split(' ').slice(0,n);
 switch(type){
  case 'A':return v;
  case 'AAAA':return v.toLowerCase();
  case 'CNAME':case 'NS':return host(v);
  case 'MX':{const [pref,target]=fieldsOf(2);return target===undefined?host(v):`${pref} ${host(target)}`}
  case 'TXT':return unquote(v);
  case 'SRV':{const [p,w,port,target]=fieldsOf(4);return target===undefined?host(v):`${p} ${w} ${port} ${host(target)}`}
  case 'CAA':{const m=/^(\d+)\s+(\S+)\s+(.*)$/.exec(v);return m?`${m[1]} ${m[2].toLowerCase()} ${unquote(m[3])}`:v}
  case 'SOA':{const [mname,rname]=fieldsOf(2);return rname===undefined?host(v):`${host(mname)} ${host(rname)}`}
 }
 return v;
}
const bound=value=>value.length>MAX_VALUE?value.slice(0,MAX_VALUE-1)+'…':value;
/** One resolver's answer: status answer, nxdomain, servfail, refused, rcode (another code) or unavailable (the resolver
 * itself could not be read: monitor infrastructure, not the target). `get(url,{accept})` returns {status,text}. */
export async function queryResolver(get,id,name,type){
 const resolver=RESOLVERS[id],started=Date.now();
 const unavailable=detail=>({id,status:'unavailable',answers:[],ms:Date.now()-started,detail});
 let response;
 try{response=await get(`${resolver.url}?name=${encodeURIComponent(name)}&type=${type}`,{accept:'application/dns-json',maxBytes:65536})}
 catch(error){return unavailable(error?.name==='TimeoutError'||error?.category==='timeout'?'the resolver did not answer in time':'the resolver could not be reached')}
 const ms=Date.now()-started;
 if(response.status!==200)return {...unavailable(`the resolver answered HTTP ${response.status}`),ms};
 let data;try{data=JSON.parse(response.text)}catch{return {...unavailable('the resolver sent an unreadable answer'),ms}}
 if(!data||!Number.isInteger(data.Status))return {...unavailable('the resolver sent an unreadable answer'),ms};
 if(data.TC)return {...unavailable('the resolver truncated its answer'),ms};
 if(data.Status===3)return {id,status:'nxdomain',rcode:3,answers:[],ms};
 if(data.Status===2)return {id,status:'servfail',rcode:2,answers:[],ms};
 if(data.Status===5)return {id,status:'refused',rcode:5,answers:[],ms};
 if(data.Status!==0)return {id,status:'rcode',rcode:data.Status,answers:[],ms};
 const answers=[...new Set((Array.isArray(data.Answer)?data.Answer:[]).filter(row=>row?.type===CODES[type]&&typeof row.data==='string').map(row=>bound(normalizeValue(type,row.data))))].sort();
 return {id,status:'answer',rcode:0,answers:answers.slice(0,MAX_ANSWERS),...(answers.length>MAX_ANSWERS?{more:answers.length-MAX_ANSWERS}:{}),ms};
}
/** DNS facts for one attempt: every selected resolver, queried together. */
export async function dnsFacts(get,settings){
 return {name:settings.name,type:settings.recordType,resolvers:await Promise.all(settings.resolvers.map(id=>queryResolver(get,id,settings.name,settings.recordType)))};
}

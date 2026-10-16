import {publicAddress} from '../public-target.mjs';
import {MAX_ANSWERS,MAX_VALUE} from './dns.mjs';
// The bounded shape of each protocol type's retained facts. Signed evidence that does not fit is refused before its
// checks are recomputed (evaluate.mjs), so stored evidence never carries response content beyond these bounds.
const fail=()=>{throw Error('Invalid protocol evidence')};
const object=(v,keys,optional=[])=>{if(!v||typeof v!=='object'||Array.isArray(v)||keys.some(k=>!Object.hasOwn(v,k))||Object.keys(v).some(k=>!keys.includes(k)&&!optional.includes(k)))fail();return v};
const int=(v,min,max)=>{if(!Number.isSafeInteger(v)||v<min||v>max)fail();return v};
const str=(v,max)=>{if(typeof v!=='string'||v.length>max)fail();return v};
const time=v=>v===null?v:int(v,0,8640000000000000);
const names=v=>{object(v,[],['cn','o']);for(const k of Object.keys(v))str(v[k],200)};
function tcp(f){
 object(f,['address','connectMs'],['banner','bannerNote']);
 if(!publicAddress(str(f.address,45)))fail();int(f.connectMs,0,60000);
 if(f.banner!==undefined&&(str(f.banner,256)===''||/[\x00-\x1f\x7f]/.test(f.banner)))fail();
 if(f.bannerNote!==undefined)str(f.bannerNote,80);
}
function tls(f){
 object(f,['handshakeMs','certificate','chainLength','trusted','hostnameMatch'],['address','verifyError']);
 if(f.address!==undefined&&!publicAddress(str(f.address,45)))fail();
 int(f.handshakeMs,0,60000);int(f.chainLength,1,10);
 if(![true,false,null].includes(f.trusted)||typeof f.hostnameMatch!=='boolean')fail();
 if(f.verifyError!==undefined)str(f.verifyError,120);
 const c=object(f.certificate,['subject','issuer','notBefore','notAfter','dnsNames','fingerprint256']);
 names(c.subject);names(c.issuer);int(c.notBefore,0,8640000000000000);int(c.notAfter,0,8640000000000000);
 if(!Array.isArray(c.dnsNames)||c.dnsNames.length>20)fail();c.dnsNames.forEach(n=>str(n,253));
 if(!/^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(str(c.fingerprint256,95)))fail();
}
function dns(f,s){
 object(f,['name','type','resolvers']);
 if(f.name!==s.name||f.type!==s.recordType||!Array.isArray(f.resolvers)||f.resolvers.map(r=>r?.id).join()!==s.resolvers.join())fail();
 for(const r of f.resolvers){
  object(r,['id','status','answers','ms'],['rcode','more','detail']);
  if(!['answer','nxdomain','servfail','refused','rcode','unavailable'].includes(r.status))fail();
  if(r.rcode!==undefined)int(r.rcode,0,65535);if(r.more!==undefined)int(r.more,1,1000);if(r.detail!==undefined)str(r.detail,120);
  if((r.status==='unavailable')!==(r.detail!==undefined))fail();
  int(r.ms,0,60000);
  if(!Array.isArray(r.answers)||r.answers.length>MAX_ANSWERS||(r.status!=='answer'&&r.answers.length))fail();
  r.answers.forEach(a=>str(a,MAX_VALUE));
 }
}
function domain(f,s){
 if(f?.registered===false){object(f,['name','registered','source']);if(f.name!==s.name)fail();str(f.source,300);return}
 object(f,['name','registered','source','sourceUpdatedAt','expiresAt','redacted','statuses','conflict'],['registrar']);
 if(f.name!==s.name||f.registered!==true||typeof f.redacted!=='boolean'||typeof f.conflict!=='boolean')fail();
 str(f.source,300);time(f.sourceUpdatedAt);time(f.expiresAt);
 if(!Array.isArray(f.statuses)||f.statuses.length>10)fail();f.statuses.forEach(x=>str(x,60));
 if(f.registrar!==undefined){object(f.registrar,['source'],['expiresAt','sourceUpdatedAt','unavailable']);str(f.registrar.source,300);if(f.registrar.expiresAt!==undefined)time(f.registrar.expiresAt);if(f.registrar.sourceUpdatedAt!==undefined)time(f.registrar.sourceUpdatedAt);if(f.registrar.unavailable!==undefined)str(f.registrar.unavailable,60)}
 if(f.conflict!==Boolean(f.expiresAt!==null&&f.registrar?.expiresAt!=null&&Math.abs(f.expiresAt-f.registrar.expiresAt)>86400000))fail();
}
export function validateFacts(definition,facts){
 ({tcp,tls,dns,domain})[definition.type](facts,definition[definition.type]);
}

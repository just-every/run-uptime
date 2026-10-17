// NETWORK-002 configuration and evidence vocabulary shared by the editor, Worker and Node runner.
// Certificates are public trust material; client certificates, keys and credential grants never belong here.
export const TLS_EVIDENCE_MAX_BYTES=16384;
export const TLS_ERROR_CODES=Object.freeze([
 'UNABLE_TO_GET_ISSUER_CERT','UNABLE_TO_GET_CRL','UNABLE_TO_DECRYPT_CERT_SIGNATURE',
 'UNABLE_TO_DECRYPT_CRL_SIGNATURE','UNABLE_TO_DECODE_ISSUER_PUBLIC_KEY','CERT_SIGNATURE_FAILURE',
 'CRL_SIGNATURE_FAILURE','CERT_NOT_YET_VALID','CERT_HAS_EXPIRED','CRL_NOT_YET_VALID','CRL_HAS_EXPIRED',
 'ERROR_IN_CERT_NOT_BEFORE_FIELD','ERROR_IN_CERT_NOT_AFTER_FIELD','ERROR_IN_CRL_LAST_UPDATE_FIELD',
 'ERROR_IN_CRL_NEXT_UPDATE_FIELD','DEPTH_ZERO_SELF_SIGNED_CERT','SELF_SIGNED_CERT_IN_CHAIN',
 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY','UNABLE_TO_VERIFY_LEAF_SIGNATURE','CERT_CHAIN_TOO_LONG',
 'CERT_REVOKED','INVALID_CA','PATH_LENGTH_EXCEEDED','INVALID_PURPOSE','CERT_UNTRUSTED',
 'CERT_REJECTED','HOSTNAME_MISMATCH','INVALID_EXTENSION','INVALID_POLICY_EXTENSION',
 'NO_EXPLICIT_POLICY','UNSUPPORTED_CONSTRAINT_TYPE','UNSUPPORTED_CONSTRAINT_SYNTAX',
 'UNSUPPORTED_NAME_SYNTAX','PERMITTED_VIOLATION','EXCLUDED_VIOLATION','SUBTREE_MINMAX',
 'APPLICATION_VERIFICATION','EE_KEY_TOO_SMALL','CA_KEY_TOO_SMALL','CA_MD_TOO_WEAK',
 'ERR_TLS_CERT_ALTNAME_INVALID','ERR_TLS_CERT_SIGNATURE_ALGORITHM_UNSUPPORTED',
 'TLS_CERTIFICATE_MISSING','TLS_FINGERPRINT_MISMATCH','TLS_CERTIFICATE_CHANGED','TLS_HANDSHAKE_FAILED',
]);
const knownErrors=new Set(TLS_ERROR_CODES),hex=/^[0-9a-f]{64}$/;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const fields=(value,names)=>object(value)&&Object.keys(value).length===names.length&&names.every(name=>Object.hasOwn(value,name));
const invalid=()=>{throw Error('Invalid TLS trust settings')};
function fingerprint(value){
 if(typeof value!=='string')return invalid();
 const text=value.trim();
 if(!/^(?:[0-9a-fA-F]{64}|(?:[0-9a-fA-F]{2}:){31}[0-9a-fA-F]{2})$/.test(text))return invalid();
 return text.replace(/:/g,'').toLowerCase();
}
// Only a bounded DER Certificate envelope is accepted. Cryptographic CA/chain verification belongs to TLS itself.
function certificate(value){
 if(typeof value!=='string'||value.length>16384)return invalid();
 const match=/^-----BEGIN CERTIFICATE-----\s+([A-Za-z0-9+/=\r\n\t ]+)\s+-----END CERTIFICATE-----$/.exec(value.trim());
 if(!match)return invalid();
 const base64=match[1].replace(/\s/g,'');
 if(!base64||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64))return invalid();
 let bytes;try{const decoded=atob(base64);if(btoa(decoded)!==base64)return invalid();bytes=Uint8Array.from(decoded,c=>c.charCodeAt(0))}catch{return invalid()}
 function read(offset,limit){
  if(offset+2>limit)return invalid();
  const tag=bytes[offset];let length=bytes[offset+1],start=offset+2;
  if(length&128){const count=length&127;if(!count||count>3||start+count>limit||bytes[start]===0)return invalid();length=0;for(let i=0;i<count;i++)length=length*256+bytes[start++];if(length<128)return invalid()}
  const end=start+length;if(end>limit)return invalid();return {tag,start,end};
 }
 const root=read(0,bytes.length);if(root.tag!==48||root.end!==bytes.length)return invalid();
 const tbs=read(root.start,root.end),algorithm=read(tbs.end,root.end),signature=read(algorithm.end,root.end);
 if(tbs.tag!==48||algorithm.tag!==48||signature.tag!==3||signature.end!==root.end||signature.end-signature.start<2||bytes[signature.start]!==0)return invalid();
 const tbsFields=[];for(let offset=tbs.start;offset<tbs.end;){const part=read(offset,tbs.end);tbsFields.push(part);offset=part.end}
 if(tbsFields[0]?.tag===160)tbsFields.shift();
 // Certificate TBSCertificate: serial, signature algorithm, issuer, validity, subject and public key.
 if(tbsFields.length<6||tbsFields[0].tag!==2||tbsFields.slice(1,6).some(part=>part.tag!==48))return invalid();
 const validity=tbsFields[3],before=read(validity.start,validity.end),after=read(before.end,validity.end);
 if(![23,24].includes(before.tag)||![23,24].includes(after.tag)||after.end!==validity.end)return invalid();
 const key=tbsFields[5],keyAlgorithm=read(key.start,key.end),keyBits=read(keyAlgorithm.end,key.end);
 if(keyAlgorithm.tag!==48||keyBits.tag!==3||keyBits.end!==key.end||keyBits.end-keyBits.start<2)return invalid();
 const lines=base64.match(/.{1,64}/g),normalized=`-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----\n`;
 if(normalized.length>16384)return invalid();return normalized;
}
/** Undefined is the default verified-TLS policy. A supplied context also checks the monitor's scope. */
export function normalizeTlsTrust(input,context){
 if(input===undefined)return undefined;
 if(context!==undefined){
  let url;try{url=new URL(context.url)}catch{return invalid()}
  if(!['http','keyword'].includes(context.type??'http')||(context.network??'public')!=='public'||url.protocol!=='https:'||url.username||url.password)return invalid();
 }
 if(input?.mode==='fingerprint'&&fields(input,['mode','sha256']))return {mode:'fingerprint',sha256:fingerprint(input.sha256)};
 if(input?.mode==='ca'&&fields(input,['mode','certificate']))return {mode:'ca',certificate:certificate(input.certificate)};
 if(input?.mode==='ignore'&&fields(input,['mode','acknowledged'])&&input.acknowledged===true)return {mode:'ignore',acknowledged:true};
 return invalid();
}
/** Validate retained per-hop facts without trusting application check booleans or copying certificate/secret material. */
export function validateTlsTrustEvidence(facts,definition){
 if(facts===undefined)return undefined;
 const fail=()=>{throw Error('Invalid TLS trust evidence')};
 if(!Array.isArray(facts)||facts.length>18||JSON.stringify(facts).length>TLS_EVIDENCE_MAX_BYTES)return fail();
 let target;try{target=new URL(definition.url)}catch{return fail()}
 const initial=target.origin;
 if(facts.length&&(!['http','keyword'].includes(definition.type??'http')||(definition.network??'public')!=='public'))return fail();
 const trust=normalizeTlsTrust(definition.tlsTrust,{type:definition.type,network:definition.network,url:definition.url});
 let crossedOrigin=false;
 for(const fact of facts){
  if(!fields(fact,['origin','mode','sha256','errors','bypassed','credentialsAllowed'])||
   typeof fact.origin!=='string'||fact.origin.length>2048||typeof fact.sha256!=='string'||!hex.test(fact.sha256)||
   !['default','fingerprint','ca','ignore'].includes(fact.mode)||!Array.isArray(fact.errors)||fact.errors.length>8||
   fact.errors.some(code=>typeof code!=='string'||!knownErrors.has(code))||new Set(fact.errors).size!==fact.errors.length||
   typeof fact.bypassed!=='boolean'||typeof fact.credentialsAllowed!=='boolean')return fail();
  let url;try{url=new URL(fact.origin)}catch{return fail()}
  if(url.protocol!=='https:'||url.origin!==fact.origin||url.username||url.password)return fail();
  if((fact.errors.includes('TLS_FINGERPRINT_MISMATCH')&&fact.mode!=='fingerprint')||
   (fact.errors.includes('TLS_CERTIFICATE_CHANGED')&&fact.mode!=='ca')||
   (fact.bypassed&&fact.errors.some(code=>['TLS_HANDSHAKE_FAILED','TLS_CERTIFICATE_MISSING','TLS_CERTIFICATE_CHANGED','TLS_FINGERPRINT_MISMATCH'].includes(code))))return fail();
  crossedOrigin||=fact.origin!==initial;
  if(fact.mode==='default'){
   if(fact.bypassed||!fact.credentialsAllowed||(!crossedOrigin&&trust))return fail();
  }else{
   if(!trust||fact.mode!==trust.mode||crossedOrigin||fact.origin!==initial)return fail();
   if(fact.bypassed&&!fact.errors.length)return fail();
   if(fact.mode==='fingerprint'){
    const mismatch=fact.sha256!==trust.sha256;
    if(mismatch!==fact.errors.includes('TLS_FINGERPRINT_MISMATCH')||(mismatch&&fact.bypassed))return fail();
   }
  }
 }
 return facts;
}

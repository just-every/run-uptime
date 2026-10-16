// A minimal, bounded DER reader for the certificate facts a TLS check reports: subject and issuer common names and
// organisations, validity, DNS names and the SHA-256 fingerprint. It never trusts lengths past the buffer and reads
// nothing it does not report. Chain trust is decided by the TLS stack that made the connection, not here.
const OID={cn:'2.5.4.3',o:'2.5.4.10',san:'2.5.29.17'};
function read(bytes,offset){
 if(offset+2>bytes.length)throw Error('Truncated certificate');
 const tag=bytes[offset];let length=bytes[offset+1],start=offset+2;
 if(length&0x80){const count=length&0x7f;if(count<1||count>4||start+count>bytes.length)throw Error('Invalid certificate length');length=0;for(let i=0;i<count;i++)length=length*256+bytes[start+i];start+=count}
 if(start+length>bytes.length)throw Error('Truncated certificate');
 return {tag,start,end:start+length,next:start+length};
}
function children(bytes,node){const list=[];for(let at=node.start;at<node.end;){const child=read(bytes,at);list.push(child);at=child.next}return list}
function oid(bytes,node){
 const values=[];let value=0;
 for(let i=node.start;i<node.end;i++){value=value*128+(bytes[i]&0x7f);if(!(bytes[i]&0x80)){values.push(value);value=0}}
 const [first,...rest]=values;return [Math.min(2,Math.floor(first/40)),first-Math.min(2,Math.floor(first/40))*40,...rest].join('.');
}
const text=(bytes,node)=>new TextDecoder().decode(bytes.subarray(node.start,node.end)).replace(/[\x00-\x1f\x7f]/g,' ').slice(0,200);
function names(bytes,node){
 const out={};
 for(const set of children(bytes,node))for(const pair of children(bytes,set)){
  const [type,value]=children(bytes,pair),id=oid(bytes,type);
  if(id===OID.cn&&out.cn===undefined)out.cn=text(bytes,value);
  if(id===OID.o&&out.o===undefined)out.o=text(bytes,value);
 }
 return out;
}
function time(bytes,node){
 const value=text(bytes,node),utc=node.tag===0x17;
 const match=(utc?/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/:/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/).exec(value);
 if(!match)throw Error('Invalid certificate time');
 let year=Number(match[1]);if(utc)year+=year<50?2000:1900;
 return Date.UTC(year,Number(match[2])-1,Number(match[3]),Number(match[4]),Number(match[5]),Number(match[6]));
}
function altNames(bytes,extensions){
 for(const extension of children(bytes,extensions)){
  const parts=children(bytes,extension);if(oid(bytes,parts[0])!==OID.san)continue;
  const sequence=read(bytes,parts.at(-1).start);
  // DNS names, and IP addresses as text (an address host is matched against these).
  return children(bytes,sequence).flatMap(n=>n.tag===0x82?[text(bytes,n).toLowerCase()]:n.tag===0x87&&n.end-n.start===4?[[...bytes.subarray(n.start,n.end)].join('.')]:n.tag===0x87&&n.end-n.start===16?[[...Array(8)].map((_,i)=>((bytes[n.start+2*i]<<8)|bytes[n.start+2*i+1]).toString(16)).join(':')]:[]).slice(0,20);
 }
 return [];
}
/** Facts from one DER certificate. */
export async function certificateFacts(der){
 const bytes=der instanceof Uint8Array?der:new Uint8Array(der);
 const certificate=read(bytes,0),[tbs]=children(bytes,certificate);
 let fields=children(bytes,tbs);if(fields[0].tag===0xa0)fields=fields.slice(1);
 const [,,issuer,validity,subject]=fields,[notBefore,notAfter]=children(bytes,validity);
 const extensions=fields.find(n=>n.tag===0xa3),digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes.subarray(0,certificate.end)));
 return {subject:names(bytes,subject),issuer:names(bytes,issuer),notBefore:time(bytes,notBefore),notAfter:time(bytes,notAfter),dnsNames:extensions?altNames(bytes,read(bytes,extensions.start)):[],fingerprint256:[...digest].map(b=>b.toString(16).padStart(2,'0').toUpperCase()).join(':')};
}

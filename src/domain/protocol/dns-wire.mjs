// DNS messages over TCP (RFC 1035 with RFC 7766 framing) for asking a zone's authoritative server directly. The Worker
// and the runner each supply only the socket; building the query and reading the answer are shared.
const TYPES={A:1,AAAA:28,CNAME:5,MX:15,TXT:16,NS:2,SOA:6,SRV:33,CAA:257};
/** A framed, non-recursive query for one name and type. */
export function encodeQuery(name,type){
 const labels=name.split('.').flatMap(label=>{const bytes=new TextEncoder().encode(label);return [bytes.length,...bytes]});
 const id=crypto.getRandomValues(new Uint8Array(2));
 const message=[id[0],id[1],0,0,0,1,0,0,0,0,0,0,...labels,0,TYPES[type]>>8,TYPES[type]&255,0,1];
 return {id:(id[0]<<8)|id[1],bytes:new Uint8Array([message.length>>8,message.length&255,...message])};
}
function readName(bytes,offset){
 const labels=[];let at=offset,end=null,jumps=0;
 for(;;){
  if(at>=bytes.length)throw Error('Truncated DNS name');
  const length=bytes[at];
  if(length===0){at++;break}
  if((length&0xc0)===0xc0){if(++jumps>20)throw Error('DNS name loop');if(end===null)end=at+2;at=((length&0x3f)<<8)|bytes[at+1];continue}
  labels.push(new TextDecoder().decode(bytes.subarray(at+1,at+1+length)));at+=1+length;
 }
 return {name:labels.join('.')+'.',next:end??at};
}
const u16=(b,i)=>(b[i]<<8)|b[i+1],u32=(b,i)=>((b[i]<<24)>>>0)+(b[i+1]<<16)+(b[i+2]<<8)+b[i+3];
function ipv6(b){
 const groups=[...Array(8)].map((_,i)=>u16(b,2*i).toString(16));
 let best=[-1,0];for(let i=0;i<8;){if(groups[i]!=='0'){i++;continue}let j=i;while(j<8&&groups[j]==='0')j++;if(j-i>best[1]&&j-i>1)best=[i,j-i];i=j}
 if(best[0]<0)return groups.join(':');
 return `${groups.slice(0,best[0]).join(':')}::${groups.slice(best[0]+best[1]).join(':')}`;
}
const quoted=text=>`"${text.replace(/["\\]/g,c=>'\\'+c)}"`;
// Record data as presentation text, the form DNS over HTTPS answers use, so the shared normalisation applies to both.
function rdata(type,bytes,start,length){
 const d=bytes.subarray(start,start+length);
 switch(type){
  case 1:return [...d].join('.');
  case 28:return ipv6(d);
  case 5:case 2:return readName(bytes,start).name;
  case 15:return `${u16(d,0)} ${readName(bytes,start+2).name}`;
  case 16:{const parts=[];for(let i=0;i<d.length;){parts.push(quoted(new TextDecoder().decode(d.subarray(i+1,i+1+d[i]))));i+=1+d[i]}return parts.join(' ')}
  case 6:{const m=readName(bytes,start),r=readName(bytes,m.next),n=r.next;return `${m.name} ${r.name} ${u32(bytes,n)} ${u32(bytes,n+4)} ${u32(bytes,n+8)} ${u32(bytes,n+12)} ${u32(bytes,n+16)}`}
  case 33:return `${u16(d,0)} ${u16(d,2)} ${u16(d,4)} ${readName(bytes,start+6).name}`;
  case 257:{const tag=new TextDecoder().decode(d.subarray(2,2+d[1]));return `${d[0]} ${tag} ${quoted(new TextDecoder().decode(d.subarray(2+d[1])))}`}
 }
 return '';
}
/** {rcode, authoritative, answers} from an unframed response to the query `id` for `type`. */
export function decodeResponse(bytes,id,type){
 if(bytes.length<12||u16(bytes,0)!==id)throw Error('Unexpected DNS response');
 if(bytes[2]&0x02)throw Error('Truncated DNS response');
 const rcode=bytes[3]&0x0f,authoritative=Boolean(bytes[2]&0x04),questions=u16(bytes,4),count=u16(bytes,6);
 let at=12;for(let i=0;i<questions;i++)at=readName(bytes,at).next+4;
 const answers=[];
 for(let i=0;i<count;i++){
  at=readName(bytes,at).next;const rtype=u16(bytes,at),length=u16(bytes,at+8);at+=10;
  if(at+length>bytes.length)throw Error('Truncated DNS record');
  if(rtype===TYPES[type])answers.push(rdata(rtype,bytes,at,length));
  at+=length;
 }
 return {rcode,authoritative,answers};
}
/** Reads one length-framed message from a byte reader ({read():Promise<{value,done}>}), at most 65,535 bytes. */
export async function readFramed(read){
 let buffer=new Uint8Array(0);
 for(;;){
  if(buffer.length>=2&&buffer.length>=2+u16(buffer,0))return buffer.subarray(2,2+u16(buffer,0));
  const {value,done}=await read();if(done)throw Error('The name server closed the connection');
  const next=new Uint8Array(buffer.length+value.length);next.set(buffer);next.set(value,buffer.length);buffer=next;
 }
}

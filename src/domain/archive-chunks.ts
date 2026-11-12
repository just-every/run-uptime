import {archiveLines} from '@runeditrun/rer/modules/portability'
import {TABLES,LEGACY_TABLES,shape,object,digest,type Tables} from './archive-schema.ts'
import {validateArchive} from './archive-validation.ts'

export {TRANSFER_BYTES,TRANSFER_ROWS,CHUNK_BYTES} from './archive-transfer-limits.ts'
import {TRANSFER_BYTES,TRANSFER_ROWS,CHUNK_BYTES} from './archive-transfer-limits.ts'
const bytes=(value:any)=>new TextEncoder().encode(JSON.stringify(value));
const fail=():never=>{throw Error('Invalid archive chunk manifest or digest')};
function base64(bytes:Uint8Array){let text='';for(let offset=0;offset<bytes.length;offset+=8192)text+=String.fromCharCode(...bytes.subarray(offset,offset+8192));return btoa(text)}
function unbase64(value:unknown){if(typeof value!=='string'||value.length%4!==0||!value.length||!/^[A-Za-z0-9+/]*={0,2}$/.test(value))return fail();const text=atob(value),bytes=Uint8Array.from(text,char=>char.charCodeAt(0));if(base64(bytes)!==value)return fail();return bytes}

/** Independently verifiable records; the outer Base archive also binds all bytes.
 * Emit each chunk again from the validated graph rather than retain encoded copies. */
export async function chunkedArchive(input:any){
 const t:Tables=await validateArchive(input,{transfer:true}),descriptors:any[]=[];
 async function* chunks(){
  let index=0;
  const journal=input.payload.erasureFence?.journal??[];
  for(let offset=0;offset<journal.length;offset+=1500)yield {kind:'journal',index:index++,table:'erasure-journal',hashes:journal.slice(offset,offset+1500)};
  for(const table of TABLES){
   let rows:any[]=[],size=128,rowIndex=0;
   for(const row of t[table]){
    const encoded=bytes(row),length=encoded.length+1;
    if(length+128>CHUNK_BYTES){
     if(rows.length){yield {kind:'chunk',index:index++,table,rows};rows=[];size=128}
     for(let offset=0;offset<encoded.length;offset+=90000){const end=Math.min(encoded.length,offset+90000);yield {kind:'fragment',index:index++,table,rowIndex,offset,last:end===encoded.length,data:base64(encoded.subarray(offset,end))}}
     rowIndex++;continue;
    }
    if(size+length>CHUNK_BYTES){yield {kind:'chunk',index:index++,table,rows};rows=[];size=128}
    rows.push(row);size+=length;rowIndex++;
   }
   if(rows.length)yield {kind:'chunk',index:index++,table,rows};
  }
 }
 let total=0;
 for await(const chunk of chunks()){const size=bytes(chunk).length;total+=size+1;descriptors.push({index:chunk.index,table:chunk.table,rows:chunk.kind==='chunk'?chunk.rows!.length:chunk.kind==='journal'?chunk.hashes!.length:chunk.last?1:0,bytes:size,sha256:await digest(JSON.stringify(chunk))})}
 const {tables,productTables,...metadata}=input.payload;
 const journalCount=metadata.erasureFence?.journal.length??0;
 if(metadata.erasureFence)metadata.erasureFence={...metadata.erasureFence,journal:[]};
 const manifest={kind:'uptime-chunks',version:1,metadata,journalCount,counts:Object.fromEntries(TABLES.map(name=>[name,t[name].length])),chunks:descriptors};
 const manifestBytes=bytes(manifest).length;
 if(manifestBytes>CHUNK_BYTES)throw Error(`Archive manifest exceeds chunk byte bound: ${manifestBytes} bytes, limit ${CHUNK_BYTES}`);
 total+=manifestBytes+1;if(total>TRANSFER_BYTES)throw Error(`Archive transfer exceeds byte bound: ${total} bytes, limit ${TRANSFER_BYTES}`);
 const iterator=(async function*(){yield bytes(manifest);yield new Uint8Array([10]);for await(const chunk of chunks()){yield bytes(chunk);yield new Uint8Array([10])}})();
 return new ReadableStream<Uint8Array>({async pull(controller){try{const value=await iterator.next();if(value.done)controller.close();else controller.enqueue(value.value)}catch(error){controller.error(error)}},async cancel(){await iterator.return(undefined)}});
}

/** Decode bounded lines, verify every descriptor and the complete graph before
 * restore can write any product row. Retained validation still has a finite working set. */
export async function readChunkedArchive(stream:ReadableStream<Uint8Array>){
 let manifest:any,index=0,total=0,pending:{table:string;rowIndex:number;offset:number;parts:Uint8Array[]}|undefined;
 const t:Tables=Object.fromEntries(TABLES.map(name=>[name,[]])),journal:string[]=[];
 for await(const line of archiveLines(stream,CHUNK_BYTES)){
  total+=new TextEncoder().encode(line).length+1;
  if(total>TRANSFER_BYTES)throw Error(`Archive transfer exceeds byte bound: ${total} bytes, limit ${TRANSFER_BYTES}`);
  let value;try{value=JSON.parse(line)}catch{fail()}
  if(!manifest){
   shape(value,['kind','version','metadata','counts','chunks',...(Object.hasOwn(value,'journalCount')?['journalCount']:[])],'chunk manifest');
   if(value.kind!=='uptime-chunks'||value.version!==1||!object(value.metadata)||!object(value.counts)||!Array.isArray(value.chunks)||Object.keys(value.counts).sort().join(',')!==TABLES.slice().sort().join(','))fail();
   if(value.journalCount!==undefined&&(!Number.isSafeInteger(value.journalCount)||value.journalCount<0||value.journalCount>100000||value.journalCount>0&&!value.metadata.erasureFence||value.metadata.erasureFence&&(!Array.isArray(value.metadata.erasureFence.journal)||value.metadata.erasureFence.journal.length)))fail();
   for(const count of Object.values(value.counts))if(!Number.isSafeInteger(count)||Number(count)<0||Number(count)>TRANSFER_ROWS)fail();
   manifest=value;continue;
  }
  const expected=manifest.chunks[index];
  if(!expected)fail();shape(expected,['index','table','rows','bytes','sha256'],'chunk descriptor');
  if(value.index!==index||expected.index!==index||!(TABLES.includes(value.table)||value.kind==='journal'&&value.table==='erasure-journal')||expected.table!==value.table||bytes(value).length!==expected.bytes||await digest(JSON.stringify(value))!==expected.sha256)fail();
  if(value.kind==='journal'){
   shape(value,['kind','index','table','hashes'],'journal chunk');
   if(pending||manifest.journalCount===undefined||!Array.isArray(value.hashes)||!value.hashes.length||expected.rows!==value.hashes.length||journal.length+value.hashes.length>manifest.journalCount||value.hashes.some((hash:unknown)=>typeof hash!=='string'||!/^[a-f0-9]{64}$/.test(hash)))fail();
   journal.push(...value.hashes);
  }else if(value.kind==='fragment'){
   shape(value,['kind','index','table','rowIndex','offset','last','data'],'row fragment');
   if(!Number.isSafeInteger(value.rowIndex)||value.rowIndex!==t[value.table].length||!Number.isSafeInteger(value.offset)||value.offset<0||typeof value.last!=='boolean'||expected.rows!==(value.last?1:0))fail();
   if(!pending)pending={table:value.table,rowIndex:value.rowIndex,offset:0,parts:[]};
   if(pending.table!==value.table||pending.rowIndex!==value.rowIndex||pending.offset!==value.offset)fail();
   let fragment:Uint8Array;try{fragment=unbase64(value.data)}catch{fail()}
   if(!fragment!.length||pending.offset+fragment!.length>TRANSFER_BYTES)fail();
   pending.parts.push(fragment!);pending.offset+=fragment!.length;
   if(value.last){
    const joined=new Uint8Array(pending.offset);let offset=0;for(const fragment of pending.parts){joined.set(fragment,offset);offset+=fragment.length}
    let row;try{row=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(joined))}catch{fail()}
    if(t[value.table].length+1>manifest.counts[value.table])fail();
    t[value.table].push(row);pending=undefined;
   }
  }else{
   shape(value,['kind','index','table','rows'],'chunk');
   if(pending||value.kind!=='chunk'||!Array.isArray(value.rows)||!value.rows.length||value.rows.length!==expected.rows||t[value.table].length+value.rows.length>manifest.counts[value.table])fail();
   t[value.table].push(...value.rows);
  }
  index++;
 }
 if(pending||!manifest||manifest.journalCount!==undefined&&journal.length!==manifest.journalCount||index!==manifest.chunks.length||TABLES.some(name=>t[name].length!==manifest.counts[name]))fail();
 if(manifest.journalCount!==undefined&&manifest.metadata.erasureFence)manifest.metadata.erasureFence.journal=journal;
 const payload={...manifest.metadata,tables:Object.fromEntries(LEGACY_TABLES.map(name=>[name,t[name]])),productTables:Object.fromEntries(TABLES.filter(name=>!LEGACY_TABLES.includes(name)).map(name=>[name,t[name]]))};
 const input={payload,sha256:await digest(JSON.stringify(payload))};
 await validateArchive(input,{transfer:true});return input;
}

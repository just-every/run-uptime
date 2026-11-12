import {archiveLines} from '@runeditrun/rer/modules/portability'
import {TABLES,LEGACY_TABLES,shape,object,digest,type Tables} from './archive-schema.ts'
import {validateArchive} from './archive-validation.ts'

export {TRANSFER_BYTES,TRANSFER_ROWS,CHUNK_BYTES} from './archive-transfer-limits.ts'
import {TRANSFER_BYTES,TRANSFER_ROWS,CHUNK_BYTES} from './archive-transfer-limits.ts'
const bytes=(value:any)=>new TextEncoder().encode(JSON.stringify(value));
const fail=():never=>{throw Error('Invalid archive chunk manifest or digest')};

/** Independently verifiable records; the outer Base archive also binds all bytes.
 * Emit each chunk again from the validated graph rather than retain encoded copies. */
export async function chunkedArchive(input:any){
 const t:Tables=await validateArchive(input,{transfer:true}),descriptors:any[]=[];
 async function* chunks(){
  let index=0;
  for(const table of TABLES){
   let rows:any[]=[],size=128;
   for(const row of t[table]){
    const length=bytes(row).length+1;
    if(length+128>CHUNK_BYTES)throw Error(`Archive row exceeds chunk byte bound: ${table} (${length} bytes, limit ${CHUNK_BYTES})`);
    if(size+length>CHUNK_BYTES){yield {kind:'chunk',index:index++,table,rows};rows=[];size=128}
    rows.push(row);size+=length;
   }
   if(rows.length)yield {kind:'chunk',index:index++,table,rows};
  }
 }
 let total=0;
 for await(const chunk of chunks()){const size=bytes(chunk).length;total+=size+1;descriptors.push({index:chunk.index,table:chunk.table,rows:chunk.rows.length,bytes:size,sha256:await digest(JSON.stringify(chunk))})}
 const {tables,productTables,...metadata}=input.payload;
 const manifest={kind:'uptime-chunks',version:1,metadata,counts:Object.fromEntries(TABLES.map(name=>[name,t[name].length])),chunks:descriptors};
 const manifestBytes=bytes(manifest).length;
 if(manifestBytes>CHUNK_BYTES)throw Error(`Archive manifest exceeds chunk byte bound: ${manifestBytes} bytes, limit ${CHUNK_BYTES}`);
 total+=manifestBytes+1;if(total>TRANSFER_BYTES)throw Error(`Archive transfer exceeds byte bound: ${total} bytes, limit ${TRANSFER_BYTES}`);
 const iterator=(async function*(){yield bytes(manifest);yield new Uint8Array([10]);for await(const chunk of chunks()){yield bytes(chunk);yield new Uint8Array([10])}})();
 return new ReadableStream<Uint8Array>({async pull(controller){try{const value=await iterator.next();if(value.done)controller.close();else controller.enqueue(value.value)}catch(error){controller.error(error)}},async cancel(){await iterator.return(undefined)}});
}

/** Decode bounded lines, verify every descriptor and the complete graph before
 * restore can write any product row. Retained validation still has a finite working set. */
export async function readChunkedArchive(stream:ReadableStream<Uint8Array>){
 let manifest:any,index=0,total=0;
 const t:Tables=Object.fromEntries(TABLES.map(name=>[name,[]]));
 for await(const line of archiveLines(stream,CHUNK_BYTES)){
  total+=new TextEncoder().encode(line).length+1;
  if(total>TRANSFER_BYTES)throw Error(`Archive transfer exceeds byte bound: ${total} bytes, limit ${TRANSFER_BYTES}`);
  let value;try{value=JSON.parse(line)}catch{fail()}
  if(!manifest){
   shape(value,['kind','version','metadata','counts','chunks'],'chunk manifest');
   if(value.kind!=='uptime-chunks'||value.version!==1||!object(value.metadata)||!object(value.counts)||!Array.isArray(value.chunks)||Object.keys(value.counts).sort().join(',')!==TABLES.slice().sort().join(','))fail();
   for(const count of Object.values(value.counts))if(!Number.isSafeInteger(count)||Number(count)<0||Number(count)>TRANSFER_ROWS)fail();
   manifest=value;continue;
  }
  shape(value,['kind','index','table','rows'],'chunk');
  const expected=manifest.chunks[index];
  if(!expected)fail();shape(expected,['index','table','rows','bytes','sha256'],'chunk descriptor');
  if(value.kind!=='chunk'||value.index!==index||expected.index!==index||!TABLES.includes(value.table)||expected.table!==value.table||!Array.isArray(value.rows)||!value.rows.length||value.rows.length!==expected.rows||bytes(value).length!==expected.bytes||await digest(JSON.stringify(value))!==expected.sha256)fail();
  if(t[value.table].length+value.rows.length>manifest.counts[value.table])fail();
  t[value.table].push(...value.rows);index++;
 }
 if(!manifest||index!==manifest.chunks.length||TABLES.some(name=>t[name].length!==manifest.counts[name]))fail();
 const payload={...manifest.metadata,tables:Object.fromEntries(LEGACY_TABLES.map(name=>[name,t[name]])),productTables:Object.fromEntries(TABLES.filter(name=>!LEGACY_TABLES.includes(name)).map(name=>[name,t[name]]))};
 const input={payload,sha256:await digest(JSON.stringify(payload))};
 await validateArchive(input,{transfer:true});return input;
}

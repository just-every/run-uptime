import {archive,restore} from './archive.server.ts'
import {TABLES,ARCHIVE_BYTES,type ArchiveSelection} from './archive-schema.ts'
import {chunkedArchive,readChunkedArchive,TRANSFER_BYTES} from './archive-chunks.ts'
import {installationLocalTables} from './archive-inventory.ts'
import {productFence} from './archive-fence.server.ts'
import {validateArchive} from './archive-validation.ts'
import type {Bindings} from './control.server.ts'

export function archiveTransferPolicy(env:Bindings,importJob:()=>string|undefined,importContext:()=>any=()=>({}),authorize:()=>Promise<unknown>=async()=>{},selection:()=>ArchiveSelection|undefined=()=>undefined){
 return {
  product:'just-every/uptime-monitor',partBytes:16*1024*1024,
  excludeTables:[...TABLES,...Object.keys(installationLocalTables)],
  requiredConfiguration:['OWNER_EMAIL','SESSION_SECRET','SETUP_TOKEN','UPTIME_RUNNER_KEY','MAIL_FROM','MAIL_PROVIDER'],
  extraPayloads:{uptime:{
   async produce(){await authorize();return chunkedArchive(await archive(env,selection(),{transfer:true}))},
   async consume(stream:ReadableStream<Uint8Array>,descriptor:{size:number;sha256:string}){
    await authorize();const id=importJob(),context=importContext();
    if(!id)throw Error('Restore job required');
    const prior=await env.DB.prepare('SELECT sha256 FROM rer_portability_product_restore WHERE id=?').bind(id).first<{sha256:string}>();
    if(prior&&prior.sha256!==descriptor.sha256)throw Error('Restore receipt mismatch');
    if(descriptor.size>TRANSFER_BYTES)throw Error(`Archive transfer exceeds byte bound: ${descriptor.size} bytes, limit ${TRANSFER_BYTES}`);
    // A legacy JSON payload remains readable, with its original 2 MiB bound.
    const reader=stream.getReader();let first:Uint8Array|undefined;
    try{const prefix:Uint8Array[]=[];let length=0;while(length<64){const item=await reader.read();if(item.done)break;prefix.push(item.value);length+=item.value.length}first=new Uint8Array(length);let offset=0;for(const bytes of prefix){first.set(bytes,offset);offset+=bytes.length}}catch(error){await reader.cancel();reader.releaseLock();throw error}
    const joined=new ReadableStream<Uint8Array>({start(controller){if(first)controller.enqueue(first)},async pull(controller){try{await authorize();const next=await reader.read();if(next.done){reader.releaseLock();controller.close()}else controller.enqueue(next.value)}catch(error){controller.error(error);await reader.cancel();reader.releaseLock()}},async cancel(){await reader.cancel();reader.releaseLock()}});
    // The first property in both supported JSON encodings distinguishes formats.
    const prefix=new TextDecoder().decode(first??new Uint8Array());
    let value:any;
    if(/^\s*\{\s*"(?:payload|sha256)"\s*:/.test(prefix)){
     const chunks:Uint8Array[]=[],legacy=joined.getReader();let size=0;
     try{for(;;){const {done,value}=await legacy.read();if(done)break;size+=value.length;if(size>ARCHIVE_BYTES)throw Error('Archive exceeds legacy product byte bound');chunks.push(value)}}finally{await legacy.cancel();legacy.releaseLock()}
     const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
     value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));await validateArchive(value);
    }else value=await readChunkedArchive(joined);
    const metadata=context.manifest?{sourceIdentity:context.manifest.sourceIdentity,epoch:context.manifest.epoch,journal:context.manifest.journal}:value.payload.erasureFence;
    const tables=await validateArchive(value,{transfer:true}),guards=await productFence(env,tables,metadata,context.laterJournal);
    await authorize();
    if(prior){if(guards.length)await env.DB.batch(guards);return}
    await restore(env,value,{id,sha256:descriptor.sha256},{manifest:metadata,laterJournal:context.laterJournal,actor:context.actor,transfer:true});
   },
  }},
 };
}

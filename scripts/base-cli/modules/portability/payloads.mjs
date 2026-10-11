import { stream, run, all, insist } from './storage.mjs';
import { base64, unbase64, StreamHash } from './hash.mjs';
export async function* byteChunks(source,limit) {
  const reader=(source instanceof ReadableStream?source:new Response(source).body).getReader();
  let pending=new Uint8Array(limit),used=0;
  try {
    for(;;) {
      const {value,done}=await reader.read();if(done)break;
      let offset=0;
      while(offset<value.length) {
        const n=Math.min(limit-used,value.length-offset);pending.set(value.subarray(offset,offset+n),used);offset+=n;used+=n;
        if(used===limit){yield pending;pending=new Uint8Array(limit);used=0;}
      }
    }
    if(used)yield pending.subarray(0,used);
  } finally {await reader.cancel();reader.releaseLock();}
}
export async function capturePayload(db,id,number,source) {
  const hash=new StreamHash();let size=0,segment=0;
  for await(const bytes of byteChunks(source,16000)) {
    hash.update(bytes);size+=bytes.length;
    await run(db,'INSERT INTO rer_portability_segments VALUES(?,?,?,?)',id,-1-number,segment++,base64(bytes));
  }
  return {size,sha256:hash.digest()};
}
export async function payloadRange(db,id,number,offset,length) {
  const rows=await all(db,'SELECT segment,data FROM rer_portability_segments WHERE job=? AND part=? AND segment>=? AND segment<=? ORDER BY segment',id,-1-number,Math.floor(offset/16000),Math.floor((offset+length-1)/16000));
  const result=new Uint8Array(length);let used=0;
  for(const row of rows) {
    const bytes=unbase64(row.data),start=Math.max(0,offset-row.segment*16000),n=Math.min(bytes.length-start,length-used);
    result.set(bytes.subarray(start,start+n),used);used+=n;
  }
  insist(used===length,'payload_changed');return result;
}
export async function writeObject(bucket,descriptor,source) {
  const metadata={httpMetadata:descriptor.httpMetadata?{...descriptor.httpMetadata}:undefined,customMetadata:descriptor.customMetadata};
  if(metadata.httpMetadata?.cacheExpiry)metadata.httpMetadata.cacheExpiry=new Date(metadata.httpMetadata.cacheExpiry);
  const hash=new StreamHash();let size=0;
  if(descriptor.size<=5*1024*1024) {
    const bytes=new Uint8Array(descriptor.size);
    for await(const chunk of byteChunks(source,65536)) {insist(size+chunk.length<=bytes.length,'binary_size');bytes.set(chunk,size);hash.update(chunk);size+=chunk.length;}
    insist(size===descriptor.size && hash.digest()===descriptor.sha256,'binary_checksum');
    await bucket.put(descriptor.key,bytes,metadata);return;
  }
  const upload=await bucket.createMultipartUpload(descriptor.key,metadata),parts=[];
  try {
    for await(const chunk of byteChunks(source,5*1024*1024)) {
      hash.update(chunk);size+=chunk.length;parts.push(await upload.uploadPart(parts.length+1,chunk));
    }
    insist(size===descriptor.size && hash.digest()===descriptor.sha256,'binary_checksum');await upload.complete(parts);
  } catch(e) {await upload.abort();throw e;}
}

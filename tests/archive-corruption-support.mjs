import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {makePart,ContentVerifier,ArchiveVerifier} from '@runeditrun/rer/modules/portability/format';
const hash=value=>createHash('sha256').update(value).digest('hex');

/** Recompute transport digests so the dangerous path reaches product graph
 * validation: a checksum alone must never authorize a bad archive. */
export async function invalidReferenceArchive(manifest,payloadBytes,mode='reference'){
 const lines=payloadBytes.toString('utf8').trimEnd().split('\n').map(line=>JSON.parse(line)),inner=lines.shift();
 const monitors=lines.find(chunk=>chunk.table==='monitors');assert.ok(monitors);
 if(mode==='reference')monitors.rows[0].revision=900000;
 else{const fragment=lines.find(chunk=>chunk.kind==='fragment');assert.ok(fragment);fragment.offset=1}
 const encoded=lines.map(chunk=>JSON.stringify(chunk));
 inner.chunks=encoded.map((line,index)=>({index,table:lines[index].table,rows:lines[index].kind==='chunk'?lines[index].rows.length:lines[index].kind==='journal'?lines[index].hashes.length:lines[index].last?1:0,bytes:Buffer.byteLength(line),sha256:hash(line)}));
 const payload=Buffer.from([JSON.stringify(inner),...encoded,''].join('\n')),outer=structuredClone(manifest),parts=[];
 // Public-door request bounds stay small even for a malicious but well-framed payload.
 for(let offset=0;offset<payload.length;offset+=90000)parts.push(await makePart(parts.length,[{kind:'payload',name:'uptime',offset,data:payload.subarray(offset,offset+90000).toString('base64')}]));
 outer.payloads=[{name:'uptime',size:payload.length,sha256:hash(payload)}];outer.partCount=parts.length;
 const content=new ContentVerifier(outer),archive=new ArchiveVerifier(outer);
 for(const part of parts){archive.add(part);for(const item of part.items)content.add(item)}
 return {manifest:outer,parts,closing:{contentHash:content.digest(),archiveHash:archive.digest()}};
}

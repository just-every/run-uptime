import {createHash} from 'node:crypto'
import {deflateRawSync} from 'node:zlib'

export const seed='ct-import-plan-uptime-1'
export const clock='2026-11-01T00:00:00Z'
export const epoch=Date.parse(clock)/1000
export const day=86400
export const seconds=value=>Date.parse(value)/1000
export const copy=value=>structuredClone(value)
export const sha256=value=>createHash('sha256').update(value).digest('hex')
const ordered=value=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered(value[key])])):value
export const json=value=>Buffer.from(`${JSON.stringify(ordered(value),null,2)}\n`)
export const get=(path,query={})=>({method:'GET',path,query})

// These are Uptime transport descriptors. The response object is never augmented
// with source IDs, pagination, schema notes or adapter-only settings.
export function corpus(source,scope,schemaNotes=[]){
 const files=new Map(),entries=[],records=[]
 const put=(path,value)=>{const bytes=Buffer.isBuffer(value)?value:json(value);if(files.has(path))throw Error(`Duplicate fixture path ${path}`);files.set(path,bytes);return bytes}
 const add=(path,kind,response,{sourceId,request=get('/'),recordCount=1,pagination,id=path.replace(/\.json$/,'')}={})=>{
  const bytes=put(path,response)
  const record={id,kind,...(sourceId===undefined?{}:{sourceId:String(sourceId)}),request,response}
  records.push(record)
  entries.push({id,kind,path,sha256:sha256(bytes),bytes:bytes.length,recordCount,request,...(sourceId===undefined?{}:{sourceId:String(sourceId)}),...(pagination?{pagination}:{})})
  return record
 }
 const envelope=items=>({format:'uptime.incumbent-capture.v1',source,synthetic:true,seed,capturedAt:clock,scope,schemaNotes,records:items})
 const finish=(counts)=>{
  put('capture.json',envelope(records))
  put('manifest.json',{format:'uptime.incumbent-capture-manifest.v1',source,synthetic:true,seed,capturedAt:clock,scope,schemaNotes,counts,entries,capture:{path:'capture.json',bytes:files.get('capture.json').length,sha256:sha256(files.get('capture.json'))}})
  return {files,records,entries,envelope,counts}
 }
 return {files,entries,records,put,add,envelope,finish}
}

// ZIP generation uses fixed DOS time, UTF-8, stable order, no current-time or
// platform extra fields. unixMode also permits inert symlink attack fixtures.
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}return (crc^0xffffffff)>>>0}
export function zip(members){
 const locals=[],central=[];let offset=0
 for(const member of members){
  const name=Buffer.from(member.name),body=Buffer.isBuffer(member.body)?member.body:Buffer.from(member.body),method=member.deflate?8:0,packed=method?deflateRawSync(body,{level:9}):body,crc=crc32(body)
  const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(method,8);header.writeUInt16LE(((2026-1980)<<9)|(11<<5)|1,12);header.writeUInt32LE(crc,14);header.writeUInt32LE(packed.length,18);header.writeUInt32LE(body.length,22);header.writeUInt16LE(name.length,26)
  locals.push(header,name,packed)
  const dir=Buffer.alloc(46);dir.writeUInt32LE(0x02014b50);dir.writeUInt16LE(0x0314,4);dir.writeUInt16LE(20,6);dir.writeUInt16LE(0x800,8);dir.writeUInt16LE(method,10);dir.writeUInt16LE(((2026-1980)<<9)|(11<<5)|1,14);dir.writeUInt32LE(crc,16);dir.writeUInt32LE(packed.length,20);dir.writeUInt32LE(body.length,24);dir.writeUInt16LE(name.length,28);dir.writeUInt32LE(((member.unixMode??0o100644)<<16)>>>0,38);dir.writeUInt32LE(offset,42)
  central.push(dir,name);offset+=header.length+name.length+packed.length
 }
 const index=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(members.length,8);end.writeUInt16LE(members.length,10);end.writeUInt32LE(index.length,12);end.writeUInt32LE(offset,16)
 return Buffer.concat([...locals,index,end])
}

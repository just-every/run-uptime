// Keep native Playwright action/timing records, never its network payloads,
// DOM snapshots, source files or unredacted screencast resources.
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
const require=createRequire(import.meta.resolve('playwright'));
const {yauzl,yazl}=require('playwright-core/lib/utilsBundle');
export async function traceEntries(path){
 const zip=await new Promise((resolve,reject)=>yauzl.fromBuffer(Buffer.isBuffer(path)?path:Buffer.from(path),{lazyEntries:true},(error,value)=>error?reject(error):resolve(value)));
 const entries=[];
 await new Promise((resolve,reject)=>{zip.on('error',reject);zip.on('end',resolve);zip.on('entry',entry=>{
  if(entry.uncompressedSize>2*1024*1024){zip.close();reject(Error('Trace resource exceeds capture limit'));return}
  zip.openReadStream(entry,(error,stream)=>{if(error){reject(error);return}const chunks=[];stream.on('error',reject);stream.on('data',chunk=>chunks.push(chunk));stream.on('end',()=>{entries.push({name:entry.fileName,data:Buffer.concat(chunks)});zip.readEntry()})});
 });zip.readEntry()});return entries;
}
const actionFields=new Set(['type','version','origin','browserName','channel','platform','wallTime','monotonicTime','sdkLanguage','contextId','pageId','callId','parentId','startTime','endTime','apiName','class','method','beforeSnapshot','afterSnapshot','point','message']);
export async function sanitizedTrace(path,redact){
 const entries=await traceEntries(await readFile(path)),zip=new yazl.ZipFile(),chunks=[];
 const done=new Promise((resolve,reject)=>{zip.outputStream.on('data',chunk=>chunks.push(chunk));zip.outputStream.on('error',reject);zip.outputStream.on('end',()=>resolve(Buffer.concat(chunks)))});
 for(const entry of entries){if(!entry.name.endsWith('.trace'))continue;
  const lines=[];for(const line of entry.data.toString('utf8').split('\n').filter(Boolean)){
   const event=JSON.parse(line);if(!['context-options','before','after','log','event'].includes(event.type))continue;
   // An allowlist keeps future trace formats from silently adding bodies,
   // cookie jars, returned values, locators or credential-bearing parameters.
   const safe=Object.fromEntries(Object.entries(event).filter(([key])=>actionFields.has(key)).map(([key,value])=>[key,typeof value==='string'?redact(value):typeof value==='number'?value:undefined]).filter(([,value])=>value!==undefined));
   if(event.type==='before')safe.params={};
   if(event.type==='after'&&event.error)safe.error={name:'Error',message:redact(String(event.error.message??'Browser action failed'))};
   if(event.type==='context-options')safe.options={viewport:{width:1000,height:700}};
   lines.push(JSON.stringify(safe));
  }
  zip.addBuffer(Buffer.from(lines.join('\n')+'\n'),entry.name);
 }
 zip.end();const result=await done;if(result.length>65536)throw Error('Trace capture limit');return {format:'zip',data:result.toString('base64')};
}

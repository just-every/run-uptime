// Private CLI child: imports buyer code on the buyer's machine. Keep this out
// of Worker imports. stdout/stderr are discarded by the parent.
import {registerHooks} from 'node:module';
import {createWriteStream} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {decodeDefinitionBytes,DEFINITION_BYTES} from '../src/domain/definitions/format.ts';

let hook;
try{
 const chunks=[];let size=0;
 for await(const chunk of process.stdin){
  size+=chunk.byteLength;
  if(size>DEFINITION_BYTES)throw Error();
  chunks.push(chunk);
 }
 const source=decodeDefinitionBytes(Buffer.concat(chunks));
 const entry=pathToFileURL(process.argv[2]).href;
 // Supplying the opened bytes avoids reopening the selected path, including a
 // symlink/replacement race. Its original URL preserves normal relative imports.
 hook=registerHooks({
  resolve(specifier,context,next){return specifier===entry?{url:entry,shortCircuit:true}:next(specifier,context)},
  load(url,context,next){return url===entry?{format:'module-typescript',source,shortCircuit:true}:next(url,context)},
 });
 const value=(await import(entry)).default;
 const text=JSON.stringify(value);
 if(typeof text!=='string'||Buffer.byteLength(text)>DEFINITION_BYTES)throw Error();
 const result=createWriteStream(null,{fd:3});
 result.once('error',()=>process.exit(1));
 result.end(text,()=>process.exit(0));
}catch{
 // Deliberately do not emit the source, path, exception, stack or returned value.
 process.exitCode=1;
}finally{
 hook?.deregister();
}
// Even failed buyer modules can have installed timers; no child survives a result.
if(process.exitCode)process.exit(1);

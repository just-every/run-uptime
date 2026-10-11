#!/usr/bin/env node
import { createReadStream,existsSync,realpathSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { options, cookieFile, absent, privateFile, checkpoint, promote } from './cli-options.mjs';
import { readArchive } from './format.mjs';
import { canonicalJson } from './hash.mjs';
export async function main(args) {
  const opts=options([...args]),cookie=await cookieFile(opts['session-file']);
  const endpoint=opts.origin+opts.basePath;
  async function request(path,method='GET',body) {
    let response;
    try{response=await fetch(endpoint+'/'+path,{method,redirect:'error',headers:{Cookie:cookie,Origin:opts.origin,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});}
    catch{throw new Error('The transfer request failed.');}
    if(!response.ok) {await response.body?.cancel();throw new Error('The transfer was refused (HTTP '+response.status+').');}
    return response;
  }
  const get=async(...args)=>(await request(...args)).json();
  const shell=value=>"'"+value.replaceAll("'","'\\''")+"'";
  const resumeCommand=(id)=>'node '+shell(fileURLToPath(import.meta.url))+' '+opts.command+' --origin '+shell(opts.origin)+' --session-file '+shell(opts['session-file'])+' '+(opts.command==='export'?'--out '+shell(opts.out):'--from '+shell(opts.from))+' --resume '+id;
  if(opts.command==='export') {
    await absent(opts.out);
    const id=opts.resume??(await get('exports','POST',{})).id;
    await checkpoint(opts.out+'.transfer.json',{version:1,kind:'export',id,origin:opts.origin});
    process.stdout.write('Job '+id+'\nResume: '+resumeCommand(id)+'\n');
    let status=await get('exports/'+id);
    while(status.phase==='building')status=await get('exports/'+id+'/advance','POST',{expectedPart:status.completed,maxParts:16});
    if(status.phase!=='complete')throw new Error('The export is not complete.');
    const response=await request('exports/'+id+'/download'),file=await privateFile(opts.out+'.partial',Boolean(opts.resume));
    try{for await(const record of readArchive(response.body))await file.writeFile(canonicalJson(record)+'\n');await file.sync();}
    finally{await file.close();}
    await promote(opts.out+'.partial',opts.out);process.stdout.write('Export complete.\n');return;
  }
  if(opts.command==='import') {
    const source=Readable.toWeb(createReadStream(opts.from));let id=opts.resume,closing;
    // Verify every record even when earlier uploads are already acknowledged.
    for await(const record of readArchive(source)) {
      if(record.kind==='manifest') {
        id??=(await get('imports','POST',{confirmed:true,manifest:record})).id;
        await checkpoint(opts.from+'.transfer.json',{version:1,kind:'import',id,origin:opts.origin});
        process.stdout.write('Job '+id+'\nResume: '+resumeCommand(id)+'\n');
      }else if(record.kind==='part')await get('imports/'+id+'/parts/'+record.index,'PUT',record);
      else closing=record;
    }
    const result=await get('imports/'+id+'/finalize','POST',{contentHash:closing.contentHash});
    process.stdout.write('Import '+result.phase+'.\nRequired configuration: '+result.requiredConfiguration.join(', ')+'\n');return;
  }
  let collection='exports';
  let status;try{status=await get(collection+'/'+opts.resume);}catch{collection='imports';status=await get(collection+'/'+opts.resume);}
  if(opts.command==='abort')status=await get(collection+'/'+opts.resume+'/abort','POST',{});
  process.stdout.write(JSON.stringify(status)+'\n');
}
if(process.argv[1] && existsSync(process.argv[1]) && import.meta.url===pathToFileURL(realpathSync(process.argv[1])).href)main(process.argv.slice(2)).catch(()=>{
  // Errors may contain server diagnostics or filesystem paths. Do not echo them.
  process.stderr.write('Transfer failed: check the origin, absolute paths, output, session file and job status.\n');process.exitCode=1;
});

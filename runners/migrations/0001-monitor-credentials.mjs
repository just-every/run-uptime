// Explicit owner-selected transition from unbound runner files. Run with the runner stopped.
import {open,realpath,rename,rm} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';

const args=process.argv.slice(2),options={};
try {
  for(let i=0;i<args.length;i+=2){
    if(!['--directory','--reference','--monitor-id'].includes(args[i])||!args[i+1]||options[args[i]])throw Error();
    options[args[i]]=args[i+1];
  }
  const {'--directory':directory,'--reference':reference,'--monitor-id':monitorId}=options;
  if(!directory||!/^[a-zA-Z0-9_-]{1,80}$/.test(reference??'')||!monitorId||monitorId.length>200||/[\x00-\x20]/.test(monitorId))throw Error();
  const root=await realpath(directory),path=join(root,`${reference}.json`),temporary=join(root,`.credential-${randomUUID()}.tmp`);
  let source,destination;
  try {
    source=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
    const stat=await source.stat();
    if(!stat.isFile()||(stat.mode&0o077)||stat.uid!==process.getuid()||stat.size>32768)throw Error();
    const input=JSON.parse(await source.readFile('utf8'));
    if(!input||Array.isArray(input)||typeof input!=='object'||Object.keys(input).some(key=>!['monitorId','origin','headers','body','auth','value'].includes(key)))throw Error();
    if(input.monitorId!==undefined&&input.monitorId!==monitorId)throw Error();
    const origin=new URL(input.origin);
    if(!['http:','https:'].includes(origin.protocol)||origin.origin!==input.origin)throw Error();
    if('value' in input&&(Object.keys(input).some(key=>!['monitorId','origin','value'].includes(key))||typeof input.value!=='string'||!input.value))throw Error();
    destination=await open(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
    await destination.writeFile(JSON.stringify({...input,monitorId})+'\n');await destination.sync();await destination.close();destination=undefined;
    await rename(temporary,path);
    console.log('Credential bound to the selected monitor. No credential value was printed.');
  }finally{await source?.close();await destination?.close();await rm(temporary,{force:true})}
}catch{
  console.error('Credential binding refused. Stop the runner; supply --directory, --reference and --monitor-id for an owner-only regular credential file. A file bound to another monitor must be reviewed and re-entered explicitly.');
  process.exitCode=1;
}

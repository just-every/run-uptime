// The runner the console's Add location command downloads: GET /uptime-runner.mjs serves this file built into one script, so a
// machine needs Node 22.13 or later (node:sqlite) and network access to Uptime, and no Uptime checkout. `node uptime-runner.mjs
// <Uptime address> <join key>` exchanges the one-time join key for this location's own runner key, keeps that key in
// uptime-runner/ beside the script (owner-only), and runs. The same command run again finds the key and runs as the same location.
import {chmod,mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {controlOrigin} from './control-origin.mjs';
import {readControlResponse} from './control-response.mjs';
import {runRunner} from './runner.mjs';
const fail=message=>{console.error(message);process.exit(1)};
const [origin,joinKey]=process.argv.slice(2);
if(!origin||!joinKey)fail('Use the command from Uptime: node uptime-runner.mjs <Uptime address> <join key>');
// Plain HTTP only to this same machine (an Uptime started with rer dev); anywhere else the address must be HTTPS.
const loopback=/^http:\/\/127\.0\.0\.1:\d+$/.test(origin);
try{controlOrigin(origin,{localReview:loopback})}catch{fail(`${origin} is not an Uptime address this runner can use: it must be https://, or http://127.0.0.1 on this machine.`)}
const home=join(dirname(fileURLToPath(import.meta.url)),'uptime-runner'),saved=join(home,'location.json');
let location=await readFile(saved,'utf8').then(JSON.parse,()=>null);
if(location?.origin!==origin){
 let response;
 try{response=await fetch(origin+'/api/runner/join',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({joinKey}),redirect:'error',signal:AbortSignal.timeout(30000)})}
 catch{fail(`Could not reach ${origin} from this machine. Check the address and that this machine can open it.`)}
 if(response.status===403)fail('This join key was used already, or its location was removed. In Uptime, add the location again and copy the new command.');
 if(!response.ok)fail(`Uptime refused to join (HTTP ${response.status}). Copy the command again from Locations.`);
 const joined=await readControlResponse(response,AbortSignal.timeout(30000));
 location={origin,runnerId:joined.runnerId,key:joined.key};
 await mkdir(home,{recursive:true,mode:0o700});await chmod(home,0o700);
 await writeFile(saved,JSON.stringify(location),{mode:0o600});await chmod(saved,0o600);
 console.log(`Joined ${new URL(origin).host}. Checking from here; keep this running (Ctrl-C stops it).`);
}else console.log(`Checking from here for ${new URL(origin).host}; keep this running (Ctrl-C stops it).`);
const controller=new AbortController();process.once('SIGTERM',()=>controller.abort());process.once('SIGINT',()=>controller.abort());
await runRunner({origin,key:location.key,runnerId:location.runnerId,localReview:loopback,grantPath:join(home,'synthetic-grant.json'),signal:controller.signal});

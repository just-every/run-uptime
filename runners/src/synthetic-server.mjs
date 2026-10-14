import http from 'node:http';
import {portValue} from '../../scripts/local-ports.mjs';
import {open,mkdir,rename,rm} from 'node:fs/promises';import {constants} from 'node:fs';import {randomUUID} from 'node:crypto';import {resolve,dirname} from 'node:path';
export async function startSynthetic({grantPath=resolve(process.env.UPTIME_GRANT_FILE??'data/synthetic-grant.json'),port=portValue(process.env.UPTIME_SYNTHETIC_PORT??0,{zero:true})}={}) {
const identity=randomUUID();
await mkdir(dirname(grantPath),{recursive:true,mode:0o700});

let mode='healthy', requests=0;
const server=http.createServer((req,res)=>{
  requests++;res.setHeader('x-uptime-fixture',identity);
  if(req.url==='/control'&&req.method==='POST'){let body='';req.on('data',c=>body+=c);req.on('end',()=>{try{const input=JSON.parse(body);if(!['healthy','failing','slow','flaky'].includes(input.mode))throw Error();mode=input.mode;res.end(JSON.stringify({mode}));}catch{res.writeHead(400);res.end();}});return;}
  if(req.url==='/demo'){res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><html><head><title>Uptime demo sample</title></head><body><h1>Bundled demo service</h1><p>This synthetic page is sample data, not a customer website.</p><button onclick="document.querySelector(\'#result\').textContent=\'Demo service checked\'">Check service</button><p id="result"></p></body></html>');return;}
  if(req.url==='/redirect'){res.writeHead(302,{location:'http://169.254.169.254/latest/meta-data/'});res.end();return;}
  if(req.url==='/large'){res.end('x'.repeat(100000));return;}
  if(req.url==='/health'||req.url==='/api/status'){
    const send=()=>{res.writeHead(mode==='failing'||(mode==='flaky'&&requests%2)?503:200,{'content-type':'application/json','x-synthetic':'local-review'});res.end(JSON.stringify({ok:mode!=='failing',mode}));};if(mode==='slow')setTimeout(send,3000);else send();return;
  }
  res.writeHead(404);res.end();
});
// The grant is rewritten whole, then renamed into place, so a runner reading it
// mid-renewal sees either the previous or the renewed grant, never a partial file.
// Renewal follows the wall clock, not a long timer: timers stop while the host
// sleeps, so a check every minute renews as soon as the grant has less than
// renewBelowMs left, including straight after a wake that outlasted the grant.
const grantLifetimeMs=12*60*60*1000,renewBelowMs=11*60*60*1000,renewalCheckMs=60*1000;
let grantExpiresAt=0;
async function writeGrant(actualPort){
  const expiresAt=Date.now()+grantLifetimeMs,temporary=`${grantPath}.${process.pid}.tmp`;await rm(temporary,{force:true});
  const file=await open(temporary,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
  try{const info=await file.stat();if(!info.isFile()||info.uid!==process.getuid())throw Error('Invalid synthetic grant file');await file.chmod(0o600);await file.writeFile(JSON.stringify({schemaVersion:1,custody:'local-uptime-synthetic',host:'127.0.0.1',port:actualPort,pid:process.pid,identity,expiresAt,paths:['/health','/api/status','/redirect','/large','/demo']}))}finally{await file.close()}
  await rename(temporary,grantPath);grantExpiresAt=expiresAt;
}
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)});
const actualPort=server.address().port;await writeGrant(actualPort);
const renewal=setInterval(()=>{if(grantExpiresAt-Date.now()<renewBelowMs)writeGrant(actualPort).catch(()=>console.error('Synthetic grant renewal failed'));},renewalCheckMs);
return {port:actualPort,async close(){clearInterval(renewal);server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(grantPath,{force:true});}};
}

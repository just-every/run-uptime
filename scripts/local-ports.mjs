import net from 'node:net';
import {readFile} from 'node:fs/promises';
export function portValue(value,{zero=false}={}){const port=Number(value);if(!/^\d+$/.test(String(value))||!Number.isInteger(port)||port<(zero?0:1)||port>65535)throw Error('Invalid local port');return port}
export async function freePort(value){
 const port=value===undefined||value===''?0:portValue(value);
 const server=net.createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)});
 const chosen=server.address().port;await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));return chosen;
}
// Synthetic monitors name the synthetic port, so a relaunch keeps the port recorded in the
// existing grant unless one is requested. A taken recorded port stops the launch instead of moving.
export async function syntheticPortFor(requested,grantPath){
 if(requested!==undefined&&requested!=='')return freePort(requested);
 let text;try{text=await readFile(grantPath,'utf8')}catch(error){if(error.code==='ENOENT')return freePort();throw error}
 let recorded;try{recorded=portValue(JSON.parse(text).port)}catch{throw Error(`The synthetic grant ${grantPath} does not record a valid port. Set UPTIME_SYNTHETIC_PORT to the port your synthetic monitors use.`)}
 try{return await freePort(recorded)}catch(error){if(error.code==='EADDRINUSE')throw Error(`Synthetic port ${recorded} recorded in ${grantPath} is in use. Stop the process using it, or set UPTIME_SYNTHETIC_PORT to move the synthetic target (synthetic monitors on port ${recorded} would then need editing).`);throw error}
}

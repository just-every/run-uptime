import { lstat, readFile, mkdir, open, rename } from 'node:fs/promises';
import { isAbsolute, dirname } from 'node:path';
import { constants } from 'node:fs';
export function options(args) {
  const command=args.shift(),result={command};
  if(!['export','import','status','abort'].includes(command))throw new Error('Choose export, import, status or abort.');
  const allowed=['origin','session-file','out','from','resume','base-path'];
  while(args.length){const key=args.shift();if(!key?.startsWith('--') || !allowed.includes(key.slice(2)) || result[key.slice(2)]!==undefined || !args.length)throw new Error('Invalid command options.');result[key.slice(2)]=args.shift();}
  let url;try{url=new URL(result.origin);}catch{throw new Error('Supply a valid origin.');}
  if(url.username || url.password || url.pathname!=='/' || url.search || url.hash)throw new Error('The origin must have no credentials, path, query or fragment.');
  if(url.protocol!=='https:' && !(url.protocol==='http:' && /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\/?$/.test(result.origin)))throw new Error('Use HTTPS or an exact loopback HTTP origin.');
  result.origin=url.origin;
  for(const key of ['session-file',...(command==='export'?['out']:command==='import'?['from']:[])])if(!isAbsolute(result[key]??''))throw new Error('File paths must be absolute.');
  if(['status','abort'].includes(command) && !result.resume)throw new Error('Supply --resume with the job id.');
  if(result.resume && !/^[a-zA-Z0-9-]{1,100}$/.test(result.resume))throw new Error('Invalid job id.');
  result.basePath=result['base-path']??'/api/portability';
  if(!/^\/[A-Za-z0-9/_-]+$/.test(result.basePath) || result.basePath.endsWith('/'))throw new Error('Invalid API base path.');
  return result;
}
export async function cookieFile(path) {
  const info=await lstat(path);if(!info.isFile() || info.size>4096)throw new Error('The session file must be a small regular file.');
  const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  let value;try{value=(await file.readFile('utf8')).trim();}finally{await file.close();}
  if(!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+=[!#-:<-~]+$/.test(value) || value.includes(';'))throw new Error('The session file must hold one cookie.');
  return value;
}
export async function absent(path) {
  try{await lstat(path);}catch(e){if(e.code==='ENOENT')return;throw e;}throw new Error('The output already exists.');
}
export async function privateFile(path,resume=false) {
  await mkdir(dirname(path),{recursive:true,mode:0o700});
  const file=await open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_NOFOLLOW|(resume?constants.O_TRUNC:constants.O_EXCL),0o600);
  await file.chmod(0o600);return file;
}
export async function checkpoint(path,value) {
  const file=await privateFile(path,true);try{await file.writeFile(JSON.stringify(value)+'\n');await file.sync();}finally{await file.close();}
}
export async function promote(partial,path) {await rename(partial,path);}

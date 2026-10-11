import { constants, linkSync, unlinkSync, writeSync, openSync, closeSync, fstatSync, fchmodSync, ftruncateSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { mkdir, open, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';

function requireOwner(stat, path, directory = false) {
 if (!(directory ? stat.isDirectory() : stat.isFile()) || (!directory && stat.nlink > 1 && (stat.mode & 0o7777) !== 0o600) || (process.getuid && stat.uid !== process.getuid())) {
  throw Error(`Installer private storage must be an owned ${directory ? 'directory' : 'regular private file (no permissive hard links)'}: ${path}`);
 }
}

// Refuse links and foreign-owned storage before changing permissions or bytes.
export async function privateDirectory(root, parts) {
 let path = root;
 for (const part of parts) {
  path = join(path, part);
  try { await mkdir(path, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  const handle = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { const stat = await handle.stat(); requireOwner(stat, path, true); if ((stat.mode & 0o7777) !== 0o700) await handle.chmod(0o700); } finally { await handle.close(); }
  // Self-ignore on both creation and resume. Atomic private-file replacement
  // validates existing ownership/links before changing any bytes.
  if (part === '.seed') await writePrivateFile(join(path, '.gitignore'), '*\n');
 }
 return path;
}

async function privateFile(path, flags, action) {
 const handle = await open(path, flags | constants.O_NOFOLLOW, 0o600);
 try {
  const stat = await handle.stat();
  requireOwner(stat, path);
  // Already-private hard links are safe to read or replace. Never chmod their
  // shared inode; this also permits a complete exclusive publication in flight.
  if (stat.nlink <= 1 && (stat.mode & 0o7777) !== 0o600) await handle.chmod(0o600);
  return await action(handle);
 } finally { await handle.close(); }
}
export const readPrivateFile = path => privateFile(path, constants.O_RDONLY, handle => handle.readFile('utf8'));
export async function writePrivateFile(path, content, exclusive = false) {
 if (!exclusive) {
  try { await privateFile(path, constants.O_RDONLY, () => {}); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
 }
 const temporary = `${path}.${randomBytes(16).toString('hex')}.tmp`;
 try {
  await privateFile(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
   async handle => { await handle.writeFile(content); });
  if (exclusive) {
   // Publish complete bytes without replacing another process's credential.
   // Readers can safely use the fully written, already-private linked inode.
   // A process interruption before unlink does not invalidate the receipt.
   linkSync(temporary, path);
   unlinkSync(temporary);
  } else await rename(temporary, path);
 } finally {
  try { await unlink(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
 }
}

// Validate each append, so replacement with a link is refused as well. Short
// synchronous writes cannot queue unbounded command output or leak descriptors.
export const PRIVATE_LOG_LIMIT = 16 * 1024 * 1024;
const TRUNCATED = Buffer.from('\n[log truncated]\n');

export async function openPrivateLog(path) {
 let written=0, truncated=false, closed=false;
 const withFile = action => {
  const fd=openSync(path,constants.O_WRONLY|constants.O_APPEND|constants.O_CREAT|constants.O_NOFOLLOW,0o600);
  try {
   const stat=fstatSync(fd);requireOwner(stat,path);
   if(stat.nlink!==1)throw Error('Installer append logs must not have hard links.');
   if((stat.mode&0o7777)!==0o600)fchmodSync(fd,0o600);
   action(fd,stat);
  } finally {closeSync(fd);}
 };
 const writeAll = (fd,bytes) => { let offset=0;while(offset<bytes.length)offset+=writeSync(fd,bytes,offset,bytes.length-offset); };
 // O_TRUNC would destroy linked targets before validation. Truncate only after
 // the opened inode passes the same ownership/link checks as every append.
 withFile(fd=>ftruncateSync(fd,0));
 const append = text => {
  if(closed||truncated||!text)return;
  withFile((fd,stat)=>{
   written=Math.max(written,stat.size);
   const available=Math.max(0,PRIVATE_LOG_LIMIT-TRUNCATED.length-written);
   // The caller normally emits small chunks. Bound conversion here too so a
   // direct huge write cannot allocate a second copy of the entire input.
   const source=String(text), length=Buffer.byteLength(source);
   const bytes=Buffer.from(source.slice(0,available));
   let end=Math.min(bytes.length,available);
   // Do not leave half of a UTF-8 code point before the truncation marker.
   if(end<bytes.length)while(end>0&&(bytes[end]&0xc0)===0x80)end--;
   writeAll(fd,bytes.subarray(0,end));written+=end;
   if(length>available){writeAll(fd,TRUNCATED);written+=TRUNCATED.length;truncated=true;}
  });
 };
 return {write:append,close:async()=>{closed=true;}};
}

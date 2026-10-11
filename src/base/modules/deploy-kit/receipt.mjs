import { writeFile, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { regularBytes } from './artifact.mjs';
import { assert, stable } from './validation.mjs';

/** Preserve the identity written before health; replace only health evidence. */
export async function writeHealthReceipt(path, receipt) {
  const previous = JSON.parse(await regularBytes(path,1024*1024));
  const identity = ({health,...value}) => value;
  assert(stable(identity(previous)) === stable(identity(receipt)),'health-receipt-identity-mismatch');
  const temporary = `${path}.health-${randomUUID()}`;
  try {
    await writeFile(temporary,JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});
    await rename(temporary,path);
  } finally { await rm(temporary,{force:true}); }
}

import { policy, catalogue } from './catalogue.mjs';
import { insist, job } from './storage.mjs';
import { createExport, advanceExport, exportStatus, downloadExport, abortExport } from './export.mjs';
import { createImport, uploadPart, finalizeImport, importStatus, abortImport } from './import.mjs';
import { erasureStatements, invalidateTransfersStatements } from './journal.mjs';
export { archiveLines } from './lines.mjs';
export { readArchive, makePart, MAX_LINE_BYTES, MAX_PART_BYTES } from './format.mjs';
export { canonicalJson, sha256 } from './hash.mjs';
export { PortabilityError } from './storage.mjs';
export { createPortabilityHandler } from './http.mjs';
export async function createPortability({db,buckets={},policy:input}) {
  const config=policy(input);await catalogue(db,config);
  for(const name of Object.keys(config.buckets))insist(buckets[name] && typeof buckets[name].get==='function','missing_bucket:'+name);
  const context={db,buckets,config};
  return {
    exports:{create:actor=>createExport(context,actor),advance:(id,options)=>advanceExport(context,id,options),status:id=>exportStatus(context,id),download:id=>downloadExport(context,id),abort:id=>abortExport(context,id)},
    imports:{create:(manifest,actor)=>createImport(context,manifest,actor),uploadPart:(id,index,part)=>uploadPart(context,id,index,part),finalize:(id,options)=>finalizeImport(context,id,options),status:id=>importStatus(context,id),abort:id=>abortImport(context,id)},
    status:async id=>(await job(db,id)).kind==='export'?exportStatus(context,id):importStatus(context,id),
    actor:async id=>(await job(db,id)).actor,
    erasureStatements:(table,key)=>erasureStatements(db,table,key),invalidateTransfersStatements:()=>invalidateTransfersStatements(db),
  };
}

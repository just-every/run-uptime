// Catalog labels describe a monitor. In particular, `owner` never grants operator authority.
export const MONITOR_METADATA_FIELDS=Object.freeze(['project','environment','service','group','tags','owner','outcome','dependencies']);
const bounds={project:100,environment:80,service:100,group:100,owner:100,outcome:500};
const text=(value,field,max)=>{
 if(typeof value!=='string'||value.length>max||/[\x00-\x1f\x7f]/.test(value))throw Error(`Invalid monitor ${field} (${max} characters max)`);
 return value.trim();
};
/** Returns only present metadata fields; older definitions acquire no invented defaults. */
export function validateMonitorMetadata(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Monitor metadata must be an object');
 const result={};
 for(const [field,max] of Object.entries(bounds))if(Object.hasOwn(input,field))result[field]=text(input[field],field,max);
 for(const [field,maxItems,maxLength] of [['tags',30,80],['dependencies',100,512]])if(Object.hasOwn(input,field)){
  const values=input[field];
  if(!Array.isArray(values)||values.length>maxItems)throw Error(`Invalid monitor ${field} (${maxItems} entries max)`);
  const normalized=values.map(value=>{const clean=text(value,field,maxLength);return field==='dependencies'?value:clean});
  if(normalized.some(value=>!value)||new Set(normalized).size!==normalized.length)throw Error(`Invalid monitor ${field}: use distinct, nonempty ${field==='dependencies'?'monitor IDs':'labels'}`);
  result[field]=normalized;
 }
 return result;
}

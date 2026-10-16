// Whether a certificate's names cover a host (RFC 6125): an exact DNS name, or a wildcard standing for exactly one
// leftmost label. An address is covered only by the same address among the names. Used where the Worker reads the
// certificate itself; a runner reports Node's own verification.
export function certificateCovers(names,host){
 const target=host.toLowerCase().replace(/\.$/,'');
 return names.some(name=>{
  const n=name.toLowerCase().replace(/\.$/,'');
  if(n===target)return true;
  if(!n.startsWith('*.')||/^[0-9.]+$|:/.test(target))return false;
  const rest=n.slice(2),dot=target.indexOf('.');
  return dot>0&&target.slice(dot+1)===rest&&rest.includes('.');
 });
}

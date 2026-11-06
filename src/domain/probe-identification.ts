import seed from '../../seed.json' with {type:'json'}

// Public correlation only: never derive identification from names or installation authority.
export async function hostedProbeUserAgent(monitorId:string,appOrigin?:string){
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`uptime:hosted-monitor:v1:${monitorId}`));
 const reference=[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
 const documentation=new URL('/docs/monitors#probe-identification',appOrigin).href;
 return `Uptime/${seed.version} (+${documentation}; monitor=${reference})`;
}

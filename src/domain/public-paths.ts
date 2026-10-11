import seed from '../../seed.json' with {type:'json'}

export interface PublicPath {
 path:string
 match:'exact'|'prefix'
 kind:string
 class:string
 authentication:string
 environment:'all'|'local'
 withinDirectory?:string
}
export const publicPaths=seed.deploy.publicPaths as PublicPath[]
export const publicLimits:Readonly<Record<string,number>>=seed.limits.publicRequestsPerMinutePerIp

// Prefixes must end at a path boundary: /assets/ never admits /assets-private.
// No public declaration grants authority; credential checks still run downstream.
for(const item of publicPaths){
 if(!item.path.startsWith('/')||(item.match==='prefix'&&!item.path.endsWith('/'))||!item.authentication||!Number.isSafeInteger(publicLimits[item.class])||publicLimits[item.class]<1)throw Error('Invalid public path declaration or rate limit')
}
export function publicPath(path:string,local=false):PublicPath|undefined {
 return publicPaths.find(item=>(item.environment==='all'||local)&&(item.match==='exact'?path===item.path:path.startsWith(item.path))&&
  // Vite emits absolute dependency imports. This admits only node_modules
  // transport, never arbitrary absolute files. Vite's filesystem boundary
  // still checks the actual allowed source directories and private-file denies.
  (!item.withinDirectory||(!/[\\]|%(?:2f|5c|25)/i.test(path)&&path.split('/').includes(item.withinDirectory))))
}
export function isPublicDocument(path:string){return publicPath(path)?.kind==='document'}

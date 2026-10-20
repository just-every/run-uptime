import {publicPath} from './public-paths.ts'

// The manifest is the same declaration used by the Worker admission boundary.
// ASSETS still decides whether a declared resource actually exists.
export function isPublicAsset(path:string){return publicPath(path)?.kind==='asset'}

// Reusing public resources across document navigations keeps an ordinary
// console journey from spending the public asset budget on the same modules
// and styles over and over. Unversioned assets revalidate after one minute.
// Vite keeps its development revalidation/HMR behaviour.
export async function publicAssetResponse(request:Request,assets?:{fetch(request:Request):Promise<Response>}){
 if(!assets)return new Response('Not found',{status:404});
 const response=await assets.fetch(request);
 if(import.meta.env.DEV||response.status!==200||!['GET','HEAD'].includes(request.method))return response;
 const headers=new Headers(response.headers);
 headers.set('cache-control','public, max-age=60, must-revalidate');
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

// Document recognition and redirects stay separate from the API and the route components.
// @ts-ignore Shared edition browser path helpers.
import {legacyEditorPath} from './monitor-editor-path.mjs'
const sections=['monitors','locations','notifications','archive','settings','signout']
export const isMonitorPage=(path:string)=>/^\/app\/monitors\/(?!new(?:\/|$))[^/]+\/?$/.test(path)
export const isConsoleDocument=(path:string)=>['/app','/app/','/app/monitor','/app/monitor/'].includes(path)||sections.some(section=>path===`/app/${section}`||path===`/app/${section}/`)||isMonitorPage(path)||/^\/app\/monitors\/[^/]+\/edit\/?$/.test(path)||/^\/app\/monitors\/new(?:\/(?:discovery\/[^/]+|manual(?:\/(?:public|private)(?:\/[^/]+)?)?))?\/?$/.test(path)
export function canonicalConsolePath(url:URL){
 const path=url.pathname.replace(/\/$/,'');
 if(path==='/app/monitor'||path==='/monitor')return legacyEditorPath(url.searchParams)
 if(path==='/app')return url.searchParams.get('monitor')?`/app/monitors/${encodeURIComponent(url.searchParams.get('monitor')!)}`:'/app/monitors'
 if(path!==url.pathname)return path+url.search
 return null
}
export const consoleRedirect=(location:string)=>new Response(null,{status:308,headers:{location,'cache-control':'no-store'}})

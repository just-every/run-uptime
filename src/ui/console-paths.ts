// Document recognition and redirects stay separate from the API and the route components.
// @ts-ignore Shared edition browser path helpers.
import {legacyEditorPath} from './monitor-editor-path.mjs'
// The Settings areas, in the order of the Settings menu (src/ui/console.html); /app/settings opens the first.
export const SETTINGS_AREAS=['alerts','general','people','integrations','backup']
// Each console section's own path, and the old sections a bookmark still names: Notifications is Settings › Alerts and
// Archive is Settings › Backup and files. Each old link reaches its final path in one hop (console.html does the same for
// an old hash link, /app#archive).
const SECTION_PATHS:Record<string,string>={monitors:'/app/monitors',locations:'/app/locations',signout:'/app/signout',settings:'/app/settings/alerts',notifications:'/app/settings/alerts',archive:'/app/settings/backup'}
export const isMonitorPage=(path:string)=>/^\/app\/monitors\/(?!new(?:\/|$))[^/]+\/?$/.test(path)
export const isConsoleDocument=(path:string)=>['/app','/app/','/app/monitor','/app/monitor/'].includes(path)||Object.keys(SECTION_PATHS).some(section=>path===`/app/${section}`||path===`/app/${section}/`)||/^\/app\/settings\/[^/]+\/?$/.test(path)||isMonitorPage(path)||/^\/app\/monitors\/[^/]+\/edit\/?$/.test(path)||/^\/app\/monitors\/new(?:\/(?:discovery\/[^/]+|manual(?:\/(?:public|private)(?:\/[^/]+)?)?))?\/?$/.test(path)
export function canonicalConsolePath(url:URL){
 const path=url.pathname.replace(/\/$/,'');
 if(path==='/app/monitor'||path==='/monitor')return legacyEditorPath(url.searchParams)
 if(path==='/app'){
  if(url.searchParams.get('monitor'))return `/app/monitors/${encodeURIComponent(url.searchParams.get('monitor')!)}`
  // An old filtered-list bookmark keeps the list's own search, filters and selection (public/catalog.js).
  const list=new URLSearchParams([...url.searchParams].filter(([key])=>key.startsWith('catalog-'))).toString()
  return '/app/monitors'+(list?'?'+list:'')
 }
 const name=path.slice('/app/'.length),section=Object.hasOwn(SECTION_PATHS,name)?SECTION_PATHS[name]:null
 if(section&&section!==path)return section
 // An area Settings does not have opens Alerts, as /app/settings does.
 const area=/^\/app\/settings\/([^/]+)$/.exec(path)?.[1]
 if(area&&!SETTINGS_AREAS.includes(area))return '/app/settings/alerts'
 if(path!==url.pathname)return path+url.search
 return null
}
export const consoleRedirect=(location:string)=>new Response(null,{status:308,headers:{location,'cache-control':'no-store'}})

// The console document, served for the console's sections (src/routes/_console.tsx) and each monitor's page
// (/app/monitors/<id>). public/app.js reads the path and renders the view, and switches sections in place; the markup is
// edition-owned trusted static markup, and all runtime data is escaped.
// @ts-ignore Vite raw asset import
import markup from './console.html?raw'
import {useEffect} from 'react'
import {useRouter} from '@tanstack/react-router'
import {useEditorLeafReady} from '../base/modules/editor/react.tsx'
import {consolePrefetchScript,CONSOLE_MODULES} from './console-prefetch.ts'
export function ConsoleDocument(){
 const router=useRouter()
 useEditorLeafReady('/app')
 // The markup's own script sets the requested section's title before React hydrates, hence suppressHydrationWarning.
 // The console mutates this markup. Start it after React hydrates the document,
 // just as the monitor form does, so it cannot race hydration on the save return.
 useEffect(()=>{
  let mounted=true
  const openMonitor=()=>{void router.navigate({to:'/app/monitors/new'})}
  window.addEventListener('uptime:new-monitor',openMonitor)
  // Warm only the editor's static route code. Its configuration stays fresh.
  void router.preloadRoute({to:'/app/monitors/new'}).catch(()=>{})
  const script=document.createElement('script');script.type='module';script.src='/app.js';script.dataset.uptime='true'
  script.onload=()=>{if(mounted)window.dispatchEvent(new Event('uptime:console-mount'))}
  document.body.appendChild(script)
  return()=>{mounted=false;window.removeEventListener('uptime:new-monitor',openMonitor);window.dispatchEvent(new Event('uptime:console-unmount'));script.remove()}
 },[router])
 return <><script dangerouslySetInnerHTML={{__html:consolePrefetchScript}}/><link rel="stylesheet" href="/app-theme.css" precedence="default"/><link rel="stylesheet" href="/style.css"/><link rel="stylesheet" href="/notifications.css"/><link rel="stylesheet" href="/sections.css"/><div suppressHydrationWarning dangerouslySetInnerHTML={{__html:markup}}/></>
}
export const consoleHead=()=>({meta:[{title:'Uptime'}],links:[{rel:'icon',href:'/favicon.svg',type:'image/svg+xml'},{rel:'preload',href:'/design-assets/fonts/plus-jakarta-sans-latin-wght-normal.woff2',as:'font',type:'font/woff2',crossOrigin:'anonymous' as const},...CONSOLE_MODULES.map(name=>({rel:'modulepreload',href:`/${name}`}))]})
